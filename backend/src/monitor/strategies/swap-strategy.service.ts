// src/position-monitor/strategies/swap-strategy.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { LiquidityBotService } from '../../liquidity-bot/liquidity-bot.service';
import { SwapService } from '../../swap/swap.service';
import { MonitorConfig } from '../types/monitor.types';

@Injectable()
export class SwapStrategyService {
  private readonly logger = new Logger(SwapStrategyService.name);

  constructor(
    private readonly liquidityBotService: LiquidityBotService,
    private readonly swapService: SwapService,
  ) {}

  // ========================================
  // REBALANCE SWAP
  // ========================================

  async executeRebalanceSwap(pool: any, config: MonitorConfig): Promise<boolean> {
    const baseSymbol = this.normalizeSymbol(pool.baseMint);
    const quoteSymbol = this.normalizeSymbol(pool.quoteMint);

    // Get balances
    const balances = await this.liquidityBotService.getBalanceByPool(pool.poolId);
    const baseBalance = balances[baseSymbol]?.amount || 0;
    const quoteBalance = balances[quoteSymbol]?.amount || 0;

    // Get prices
    const prices = await this.liquidityBotService.getTokenPrices(`${baseSymbol},${quoteSymbol}`);
    const basePriceUSD = prices[baseSymbol] || 0;
    const quotePriceUSD = prices[quoteSymbol] || 1;

    if (basePriceUSD === 0) {
      throw new Error(`Cannot get price for ${baseSymbol}`);
    }

    // Calculate values
    const baseValueUSD = baseBalance * basePriceUSD;
    const quoteValueUSD = quoteBalance * quotePriceUSD;
    const totalValueUSD = baseValueUSD + quoteValueUSD;

    if (totalValueUSD < 1) {
      this.logger.warn('   Total value too low for swap');
      return false;
    }

    const basePercent = (baseValueUSD / totalValueUSD) * 100;

    this.logger.log(`   Distribution: ${basePercent.toFixed(1)}% ${baseSymbol} / ${(100 - basePercent).toFixed(1)}% ${quoteSymbol}`);

    // Check if balanced
    if (Math.abs(basePercent - 50) <= 10) {
      this.logger.log('   ✅ Already balanced');
      return true;
    }

    // Calculate swap
    const swapParams = this.calculateSwapParams(
      basePercent,
      baseBalance,
      quoteBalance,
      basePriceUSD,
      quotePriceUSD,
      totalValueUSD,
      pool,
      config
    );

    // Execute swap
    return await this.executeSwap(swapParams);
  }

  // ========================================
  // PRE-OPEN BALANCE
  // ========================================

  async preOpenBalance(pool: any, config: MonitorConfig): Promise<void> {
    const baseSymbol = this.normalizeSymbol(pool.baseMint);
    const quoteSymbol = this.normalizeSymbol(pool.quoteMint);

    const balances = await this.liquidityBotService.getBalanceByPool(pool.poolId);
    const baseBalance = balances[baseSymbol]?.amount || 0;
    const quoteBalance = balances[quoteSymbol]?.amount || 0;

    const prices = await this.liquidityBotService.getTokenPrices(`${baseSymbol},${quoteSymbol}`);
    const basePriceUSD = prices[baseSymbol] || 0;

    if (basePriceUSD === 0) return;

    const baseValueUSD = baseBalance * basePriceUSD;
    const quoteValueUSD = quoteBalance;
    const totalValueUSD = baseValueUSD + quoteValueUSD;

    if (totalValueUSD === 0) return;

    const basePercent = (baseValueUSD / totalValueUSD) * 100;

    // Only rebalance if heavily imbalanced (70/30)
    if (basePercent > 70 || basePercent < 30) {
      this.logger.log('   ⚖️ Pre-opening balance adjustment');
      await this.executeRebalanceSwap(pool, config);
      await this.sleep(5000);
    }
  }

  // ========================================
  // HELPERS
  // ========================================

  private calculateSwapParams(
    basePercent: number,
    baseBalance: number,
    quoteBalance: number,
    basePriceUSD: number,
    quotePriceUSD: number,
    totalValueUSD: number,
    pool: any,
    config: MonitorConfig
  ) {
    let swapAmount: number;
    let inputMint: string;
    let tokenName: string;

    if (basePercent > 60) {
      const excessUSD = (baseBalance * basePriceUSD) - (totalValueUSD * 0.5);
      swapAmount = (excessUSD / basePriceUSD) * 0.90;
      inputMint = pool.baseMintPublicKey;
      tokenName = this.normalizeSymbol(pool.baseMint);
    } else {
      const excessUSD = (quoteBalance * quotePriceUSD) - (totalValueUSD * 0.5);
      swapAmount = (excessUSD / quotePriceUSD) * 0.90;
      inputMint = pool.quoteMintPublicKey;
      tokenName = this.normalizeSymbol(pool.quoteMint);
    }

    const swapValueUSD = swapAmount * (inputMint === pool.baseMintPublicKey ? basePriceUSD : quotePriceUSD);
    const slippage = this.calculateDynamicSlippage(swapValueUSD, config);

    this.logger.log(`   ⚖️ Swap: ${swapAmount.toFixed(4)} ${tokenName} (~$${swapValueUSD.toFixed(2)})`);
    this.logger.log(`   Slippage: ${(slippage * 100).toFixed(2)}%`);

    return {
      poolId: pool.poolId,
      inputMint,
      inputAmount: swapAmount,
      slippage,
    };
  }

  private calculateDynamicSlippage(swapValueUSD: number, config: MonitorConfig): number {
    const dynamicSlippage = config.maxLossUSD / swapValueUSD;
    return Math.max(
      config.minSlippage,
      Math.min(config.maxSlippage, dynamicSlippage)
    );
  }

  private async executeSwap(params: any): Promise<boolean> {
    try {
      const result = await this.swapService.executeSwap(params);
      this.logger.log(`   ✅ Swapped, output: ${result.amountOut}`);
      return true;
    } catch (error) {
      this.logger.error(`   ❌ Swap failed: ${error.message}`);
      return false;
    }
  }

  private normalizeSymbol(symbol: string): string {
    return symbol === 'WSOL' ? 'SOL' : symbol;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}