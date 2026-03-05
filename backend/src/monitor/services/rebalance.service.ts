// src/position-monitor/services/rebalance-executor.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { LiquidityBotService } from '../../liquidity-bot/liquidity-bot.service';
import { SwapService } from '../../swap/swap.service';
import { LiquidityAdderService } from './liquidity-adder.service';
import { ReopenStrategyService } from '../strategies/reopen-strategy.service';
import { SwapStrategyService } from '../strategies/swap-strategy.service';
import { MonitorConfig, PositionConfig, RebalanceResult } from '../types/monitor.types';

@Injectable()
export class RebalanceExecutorService {
  private readonly logger = new Logger(RebalanceExecutorService.name);

  constructor(
    private readonly liquidityBotService: LiquidityBotService,
    private readonly swapService: SwapService,
    private readonly liquidityAdder: LiquidityAdderService,
    private readonly reopenStrategy: ReopenStrategyService,
    private readonly swapStrategy: SwapStrategyService,
  ) {}

  async executeRebalance(params: {
    positionId: string;
    pool: any;
    config: MonitorConfig;
    oldConfig: PositionConfig;
  }): Promise<RebalanceResult> {
    const { positionId, pool, config, oldConfig } = params;

    this.logger.log('');
    this.logger.log('🔄 REBALANCE CYCLE');
    this.logger.log(`   Position: ${positionId.slice(0, 8)}...`);

    try {
      // Step 1: Close
      this.logger.log('   📍 STEP 1/3: Closing position');
      const closeTxId = await this.closePosition(positionId);
      await this.sleep(config.confirmDelayMs);

      // Step 2: Swap
      this.logger.log('   📍 STEP 2/3: Rebalancing tokens');
      const swapsExecuted = await this.rebalanceTokens(pool, config);
      await this.sleep(config.confirmDelayMs);

      // Step 3: Reopen
      this.logger.log('   📍 STEP 3/3: Opening new position');
      const { newPositionMint, liquidityAdded } = await this.reopenPosition(pool, oldConfig, config);

      this.logger.log('   ✅ REBALANCE COMPLETE');

      return {
        success: true,
        closeTxId,
        newPositionMint,
        swapsExecuted,
        liquidityAdded,
      };

    } catch (error) {
      this.logger.error('   ❌ REBALANCE FAILED');
      this.logger.error(`   Error: ${error.message}`);
      
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // ========================================
  // STEP 1: CLOSE
  // ========================================

  private async closePosition(positionId: string): Promise<string> {
    const result = await this.liquidityBotService.closePosition(positionId);
    
    if (!result.txId) {
      throw new Error('Failed to close position');
    }

    this.logger.log(`   ✅ Closed: ${result.txId.slice(0, 8)}...`);
    return result.txId;
  }

  // ========================================
  // STEP 2: SWAP
  // ========================================

  private async rebalanceTokens(pool: any, config: MonitorConfig): Promise<number> {
    let swapsExecuted = 0;

    for (let attempt = 1; attempt <= config.maxSwapAttempts; attempt++) {
      try {
        const swapped = await this.swapStrategy.executeRebalanceSwap(pool, config);
        
        if (swapped) {
          swapsExecuted++;
          return swapsExecuted;
        }

        if (attempt < config.maxSwapAttempts) {
          await this.sleep(config.retryDelayMs);
        }

      } catch (error) {
        this.logger.warn(`   Swap attempt ${attempt} failed: ${error.message}`);
        
        if (attempt < config.maxSwapAttempts) {
          await this.sleep(config.retryDelayMs);
        }
      }
    }

    this.logger.warn(`   ⚠️ Swap incomplete after ${config.maxSwapAttempts} attempts`);
    return swapsExecuted;
  }

  // ========================================
  // STEP 3: REOPEN
  // ========================================

  private async reopenPosition(
    pool: any,
    oldConfig: PositionConfig,
    config: MonitorConfig
  ): Promise<{ newPositionMint: string; liquidityAdded: number }> {
    
    // Pre-balance if needed
    await this.swapStrategy.preOpenBalance(pool, config);

    // Open position with fallback strategies
    const positionMint = await this.reopenStrategy.reopenWithFallback({
      pool,
      oldConfig,
      config,
    });

    if (!positionMint) {
      throw new Error('All reopen strategies failed');
    }

    this.logger.log(`   ✅ New position: ${positionMint.slice(0, 8)}...`);

    // Wait for indexing
    this.logger.log('   ⏳ Waiting 5s for indexing...');
    await this.sleep(5000);

    // Add remaining liquidity
    const result = await this.liquidityAdder.addRemainingLiquidity({
      positionMint,
      pool,
      config,
      aggressiveMode: false,
    });

    return {
      newPositionMint: positionMint,
      liquidityAdded: result.successfulAdds,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}