// src/position-monitor/strategies/balance-strategy.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PoolInfo } from '../../liquidity-bot/interfaces/pool-info.interface';
import { SwapService } from '../../swap/swap.service';
import { MonitorConfig, SwapParams } from '../types/monitor.types';

export interface BalanceInfo {
  solBalance: number;
  usdcBalance: number;
  solValueUSD: number;
  usdcValueUSD: number;
  totalValueUSD: number;
  solPercent: number;
  usdcPercent: number;
}

@Injectable()
export class BalanceStrategyService {
  private readonly logger = new Logger(BalanceStrategyService.name);

  constructor(private readonly swapService: SwapService) {}

  /**
   * Рассчитать баланс и соотношение токенов
   */
  calculateBalance(
    solBalance: number,
    usdcBalance: number,
    solPrice: number,
    usdcPrice: number = 1,
  ): BalanceInfo {
    
    const solValueUSD = solBalance * solPrice;
    const usdcValueUSD = usdcBalance * usdcPrice;
    const totalValueUSD = solValueUSD + usdcValueUSD;

    const solPercent = totalValueUSD > 0 ? (solValueUSD / totalValueUSD) * 100 : 0;
    const usdcPercent = 100 - solPercent;

    return {
      solBalance,
      usdcBalance,
      solValueUSD,
      usdcValueUSD,
      totalValueUSD,
      solPercent,
      usdcPercent,
    };
  }

  /**
   * Определить нужна ли балансировка
   */
  needsRebalancing(balance: BalanceInfo, threshold: number = 60): boolean {
    return balance.solPercent > threshold || balance.solPercent < (100 - threshold);
  }

  /**
   * Рассчитать параметры swap для балансировки
   */
  calculateSwapParams(
    balance: BalanceInfo,
    pool: PoolInfo,
    config: MonitorConfig,
  ): SwapParams | null {
    
    const { solPercent, totalValueUSD, solValueUSD, usdcValueUSD } = balance;

    // Проверка нужна ли балансировка
    if (!this.needsRebalancing(balance, config.balanceThreshold)) {
      return null;
    }

    let inputMint: string;
    let swapAmount: number;
    let swapValueUSD: number;

    if (solPercent > 60) {
      // Слишком много SOL - свапаем в USDC
      const excessUSD = solValueUSD - (totalValueUSD * 0.5);
      const solPrice = solValueUSD / balance.solBalance;
      swapAmount = (excessUSD / solPrice) * 0.90; // 90% от excess
      swapValueUSD = swapAmount * solPrice;
      inputMint = pool.baseMintPublicKey;

    } else {
      // Слишком много USDC - свапаем в SOL
      const excessUSD = usdcValueUSD - (totalValueUSD * 0.5);
      swapAmount = excessUSD * 0.90; // 90% от excess
      swapValueUSD = swapAmount;
      inputMint = pool.quoteMintPublicKey;
    }

    const slippage = this.calculateDynamicSlippage(swapValueUSD, config);

    return {
      poolId: pool.poolId,
      inputMint,
      inputAmount: swapAmount,
      slippage,
    };
  }

  /**
   * Выполнить балансировку
   */
  async executeRebalance(
    balance: BalanceInfo,
    pool: PoolInfo,
    config: MonitorConfig,
  ): Promise<boolean> {
    
    const swapParams = this.calculateSwapParams(balance, pool, config);

    if (!swapParams) {
      this.logger.log('✅ Balance optimal, no swap needed');
      return true;
    }

    const tokenName = swapParams.inputMint === pool.baseMintPublicKey ? 'SOL' : 'USDC';

    this.logger.log('');
    this.logger.log(`⚖️ Rebalancing: ${swapParams.inputAmount.toFixed(4)} ${tokenName}`);
    this.logger.log(`   Slippage: ${(swapParams.slippage * 100).toFixed(2)}%`);

    try {
      const result = await this.swapService.executeSwap(swapParams);
      
      this.logger.log(`   ✅ Swapped: ${result.amountOut}`);
      return true;

    } catch (error) {
      this.logger.error(`   ❌ Swap failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Рассчитать динамический slippage
   */
  private calculateDynamicSlippage(swapValueUSD: number, config: MonitorConfig): number {
    const dynamicSlippage = config.maxLossUSD / swapValueUSD;
    
    return Math.max(
      config.minSlippage,
      Math.min(config.maxSlippage, dynamicSlippage)
    );
  }

  /**
   * Логировать текущий баланс
   */
  logBalance(balance: BalanceInfo): void {
    this.logger.log('📊 Current balance:');
    this.logger.log(`   SOL:  ${balance.solBalance.toFixed(4)} ($${balance.solValueUSD.toFixed(2)}) - ${balance.solPercent.toFixed(1)}%`);
    this.logger.log(`   USDC: ${balance.usdcBalance.toFixed(2)} ($${balance.usdcValueUSD.toFixed(2)}) - ${balance.usdcPercent.toFixed(1)}%`);
    this.logger.log(`   Total: $${balance.totalValueUSD.toFixed(2)}`);
  }
}