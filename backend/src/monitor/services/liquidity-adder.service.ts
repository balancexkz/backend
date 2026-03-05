// src/position-monitor/services/liquidity-adder.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { LiquidityBotService } from '../../liquidity-bot/liquidity-bot.service';
import { SwapStrategyService } from '../strategies/swap-strategy.service';
import { MonitorConfig } from '../types/monitor.types';

export interface LiquidityAddResult {
  successfulAdds: number;
  totalAdded: number;
  consecutiveFailures: number;
}

export interface LiquidityAttemptData {
  successfulAdds: number;
  lastAttempt: Date;
  shouldRetry: boolean;
}

@Injectable()
export class LiquidityAdderService {
  private readonly logger = new Logger(LiquidityAdderService.name);
  
  private liquidityAttempts = new Map<string, LiquidityAttemptData>();
  
  private readonly MAX_CONSECUTIVE_FAILURES = 3;

  constructor(
    private readonly liquidityBotService: LiquidityBotService,
    private readonly swapStrategy: SwapStrategyService,
  ) {}

  async addRemainingLiquidity(params: {
    positionMint: string;
    pool: any;
    config: MonitorConfig;
    aggressiveMode: boolean;
  }): Promise<LiquidityAddResult> {
    
    const { positionMint, pool, config, aggressiveMode } = params;
    
    const targetReserveUSD = aggressiveMode 
      ? config.aggressiveReserveUSD 
      : config.minReserveUSD;
    
    this.logger.log('');
    this.logger.log('💰 Adding remaining liquidity');
    this.logger.log(`   Mode: ${aggressiveMode ? 'AGGRESSIVE' : 'NORMAL'}`);
    this.logger.log(`   Target reserve: $${targetReserveUSD}`);
    
    let totalAdded = 0;
    let successfulAdds = 0;
    let consecutiveFailures = 0;
    let iteration = 0;

    while (iteration < config.maxAddIterations * 2) {
      iteration++;

      try {
        // Check balances
        const { shouldContinue, availableSol, excessUSD } = await this.checkBalances(
          pool,
          config,
          targetReserveUSD,
          iteration,
          consecutiveFailures
        );

        if (!shouldContinue) break;

        // Balance tokens if needed
        const balanced = await this.balanceIfNeeded(pool, config, availableSol);
        
        if (balanced === false) {
          consecutiveFailures++;
          if (consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) break;
          await this.sleep(2000);
          continue;
        }

        if (balanced === true) {
          await this.sleep(config.confirmDelayMs);
          continue;
        }

        // Calculate amount to add
        const solNeeded = this.calculateAddAmount(
          excessUSD,
          availableSol,
          config,
          pool
        );

        if (solNeeded === null) break;

        // Add liquidity
        const success = await this.addLiquidityWithRetry(
          positionMint,
          solNeeded,
          config
        );

        if (success) {
          consecutiveFailures = 0;
          successfulAdds++;
          totalAdded += solNeeded;
          await this.sleep(config.confirmDelayMs);
        } else {
          consecutiveFailures++;
          if (consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) break;
          await this.sleep(2000);
        }

      } catch (error) {
        consecutiveFailures++;
        this.logger.error(`  Iteration ${iteration} error: ${error.message}`);
        
        if (this.isCriticalError(error)) break;
        if (consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) break;
        
        await this.sleep(2000);
      }
    }

    // Save attempt data
    this.liquidityAttempts.set(positionMint, {
      successfulAdds,
      lastAttempt: new Date(),
      shouldRetry: !aggressiveMode && successfulAdds === 0,
    });

    this.logSummary(iteration, successfulAdds, totalAdded, consecutiveFailures, aggressiveMode);
    await this.logFinalBalance(pool);

    return {
      successfulAdds,
      totalAdded,
      consecutiveFailures,
    };
  }

  // ========================================
  // CHECK & BALANCE
  // ========================================

  private async checkBalances(
    pool: any,
    config: MonitorConfig,
    targetReserveUSD: number,
    iteration: number,
    consecutiveFailures: number
  ) {
    const baseSymbol = this.normalizeSymbol(pool.baseMint);
    const balances = await this.liquidityBotService.getBalanceByPool(pool.poolId);
    const solBalance = balances[baseSymbol]?.amount || 0;
    const usdcBalance = balances['USDC']?.amount || 0;

    const prices = await this.liquidityBotService.getTokenPrices(baseSymbol);
    const solPriceUSD = prices[baseSymbol] || 0;

    if (solPriceUSD === 0) {
      this.logger.warn('  Cannot get prices');
      return { shouldContinue: false, availableSol: 0, excessUSD: 0 };
    }

    const availableSol = Math.max(0, solBalance - config.minReserveSol);
    const solValueUSD = availableSol * solPriceUSD;
    const totalBalanceUSD = solValueUSD + usdcBalance;

    this.logger.log(`Iteration ${iteration}:`);
    this.logger.log(`  SOL: ${solBalance.toFixed(4)} (available: ${availableSol.toFixed(4)}) = $${solValueUSD.toFixed(2)}`);
    this.logger.log(`  USDC: ${usdcBalance.toFixed(2)}`);
    this.logger.log(`  Total: $${totalBalanceUSD.toFixed(2)}`);
    this.logger.log(`  Failures: ${consecutiveFailures}/${this.MAX_CONSECUTIVE_FAILURES}`);

    // Check stop conditions
    if (totalBalanceUSD <= targetReserveUSD) {
      this.logger.log(`✅ Target reached`);
      return { shouldContinue: false, availableSol, excessUSD: 0 };
    }

    if (solBalance < config.minReserveSol || availableSol < config.minAddAmountSol) {
      this.logger.warn(`⚠️ Insufficient balance`);
      return { shouldContinue: false, availableSol, excessUSD: 0 };
    }

    if (consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
      this.logger.error(`❌ Too many failures`);
      return { shouldContinue: false, availableSol, excessUSD: 0 };
    }

    const excessUSD = totalBalanceUSD - targetReserveUSD;
    return { shouldContinue: true, availableSol, excessUSD };
  }

  private async balanceIfNeeded(pool: any, config: MonitorConfig, availableSol: number): Promise<boolean | null> {
    const baseSymbol = this.normalizeSymbol(pool.baseMint);
    const balances = await this.liquidityBotService.getBalanceByPool(pool.poolId);
    const usdcBalance = balances['USDC']?.amount || 0;

    const prices = await this.liquidityBotService.getTokenPrices(baseSymbol);
    const solPriceUSD = prices[baseSymbol] || 0;

    const solValueUSD = availableSol * solPriceUSD;
    const totalValueUSD = solValueUSD + usdcBalance;

    if (totalValueUSD === 0) return null;

    const solPercent = (solValueUSD / totalValueUSD) * 100;
    
    this.logger.log(`  Distribution: ${solPercent.toFixed(1)}% / ${(100 - solPercent).toFixed(1)}%`);

    if (solPercent > config.balanceThreshold || (100 - solPercent) > config.balanceThreshold) {
      this.logger.log(`  ⚖️ Rebalancing...`);
      return await this.swapStrategy.executeRebalanceSwap(pool, config);
    }

    return null;
  }

  private calculateAddAmount(
    excessUSD: number,
    availableSol: number,
    config: MonitorConfig,
    pool: any
  ): number | null {
    if (excessUSD <= 0) {
      this.logger.log(`  No excess to add`);
      return null;
    }

    const liquidityToAddUSD = excessUSD * config.addLiquidityPercent;
    
    const prices = this.liquidityBotService.getTokenPrices(this.normalizeSymbol(pool.baseMint));
    const solPriceUSD = prices[this.normalizeSymbol(pool.baseMint)] || 0;
    
    let solNeeded = (liquidityToAddUSD / 2) / solPriceUSD;

    if (solNeeded > availableSol) {
      solNeeded = availableSol * 0.85;
    }

    if (solNeeded < config.minAddAmountSol) {
      this.logger.log(`  Amount too small: ${solNeeded.toFixed(4)}`);
      return null;
    }

    return solNeeded;
  }

  // ========================================
  // ADD WITH RETRY
  // ========================================

  private async addLiquidityWithRetry(
    positionMint: string,
    amount: number,
    config: MonitorConfig
  ): Promise<boolean> {
    this.logger.log(`  ➕ Adding: ${amount.toFixed(4)} SOL`);

    for (let attempt = 1; attempt <= config.maxAddRetries; attempt++) {
      try {
        this.logger.log(`     Attempt ${attempt}/${config.maxAddRetries}`);
        
        const txId = await this.liquidityBotService.increaseLiquidity(positionMint, amount);
        
        if (!txId) throw new Error('No txId returned');

        this.logger.log(`     ✅ TX: ${txId.slice(0, 8)}...`);
        return true;

      } catch (error) {
        this.logger.error(`     ❌ Attempt ${attempt} failed: ${error.message}`);
        
        if (this.isCriticalError(error)) {
          this.logger.warn(`     Critical error, no retry`);
          return false;
        }

        if (attempt === config.maxAddRetries) {
          return false;
        }

        await this.sleep(2000 * attempt);
      }
    }

    return false;
  }

  // ========================================
  // RETRY MANAGEMENT
  // ========================================

  shouldRetryLiquidity(positionMint: string): boolean {
    const attemptData = this.liquidityAttempts.get(positionMint);
    
    if (!attemptData?.shouldRetry) return false;
    
    const timeSinceLastAttempt = Date.now() - attemptData.lastAttempt.getTime();
    return timeSinceLastAttempt >= 60000; // 1 minute
  }

  getPositionsNeedingRetry(): string[] {
    return Array.from(this.liquidityAttempts.entries())
      .filter(([_, data]) => data.shouldRetry)
      .map(([positionMint]) => positionMint);
  }

  clearAttemptData(positionMint: string): void {
    this.liquidityAttempts.delete(positionMint);
  }

  // ========================================
  // HELPERS
  // ========================================

  private isCriticalError(error: any): boolean {
    const message = error.message?.toLowerCase() || '';
    return message.includes('insufficient funds') ||
           message.includes('below minimum') ||
           message.includes('need more usdc');
  }

  private logSummary(
    iterations: number,
    successfulAdds: number,
    totalAdded: number,
    consecutiveFailures: number,
    aggressiveMode: boolean
  ) {
    this.logger.log('');
    this.logger.log('═'.repeat(70));
    this.logger.log('📊 LIQUIDITY SUMMARY');
    this.logger.log(`  Iterations: ${iterations}`);
    this.logger.log(`  Successful: ${successfulAdds}`);
    this.logger.log(`  Total added: ${totalAdded.toFixed(4)} SOL`);
    this.logger.log(`  Final failures: ${consecutiveFailures}`);

    if (successfulAdds === 0 && !aggressiveMode) {
      this.logger.warn(`  ⚠️ Will retry aggressively next cycle`);
    }
  }

  private async logFinalBalance(pool: any) {
    try {
      const baseSymbol = this.normalizeSymbol(pool.baseMint);
      const balances = await this.liquidityBotService.getBalanceByPool(pool.poolId);
      const solBalance = balances[baseSymbol]?.amount || 0;
      const usdcBalance = balances['USDC']?.amount || 0;

      const prices = await this.liquidityBotService.getTokenPrices(baseSymbol);
      const solValueUSD = solBalance * (prices[baseSymbol] || 0);

      this.logger.log('');
      this.logger.log('✅ Final balance:');
      this.logger.log(`   ${baseSymbol}: ${solBalance.toFixed(4)} ($${solValueUSD.toFixed(2)})`);
      this.logger.log(`   USDC: ${usdcBalance.toFixed(2)}`);
      this.logger.log('');
    } catch (error) {
      this.logger.error(`Failed to fetch final balance: ${error.message}`);
    }
  }

  private normalizeSymbol(symbol: string): string {
    return symbol === 'WSOL' ? 'SOL' : symbol;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}