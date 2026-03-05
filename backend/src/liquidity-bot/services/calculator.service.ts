// src/liquidity-bot/services/calculators/liquidity.calculator.ts

import { Injectable, Logger } from '@nestjs/common';
import { 
  ApiV3PoolInfoConcentratedItem, 
  PoolUtils, 
  TickUtils,
  Raydium,
} from '@raydium-io/raydium-sdk-v2';
import { BN } from 'bn.js';
import { Decimal } from 'decimal.js';

export interface LiquidityParams {
  liquidity;
  amountMaxA;
  amountMaxB;
}

export interface PriceRange {
  lower: number;
  upper: number;
  lowerTick: number;
  upperTick: number;
}

@Injectable()
export class LiquidityCalculatorService {
  private readonly logger = new Logger(LiquidityCalculatorService.name);

  constructor(private readonly raydium: Raydium) {}

  /**
   * Рассчитать параметры ликвидности
   */
  async calculateLiquidityParams(params: {
    poolInfo: ApiV3PoolInfoConcentratedItem;
    inputAmount: number;
    tickLower: number;
    tickUpper: number;
    slippage: number;
  }): Promise<LiquidityParams> {
    
    const { poolInfo, inputAmount, tickLower, tickUpper, slippage } = params;

    const decimalsA = poolInfo.mintA.decimals;
    const decimalsB = poolInfo.mintB.decimals;

    const inputAmountBN = new BN(
      new Decimal(inputAmount)
        .mul(10 ** decimalsA)
        .toFixed(0)
    );

    const epochInfo = await this.raydium.fetchEpochInfo();

    const result = await PoolUtils.getLiquidityAmountOutFromAmountIn({
      poolInfo,
      slippage: 0, // Не используем здесь
      inputA: true,
      tickUpper: Math.max(tickLower, tickUpper),
      tickLower: Math.min(tickLower, tickUpper),
      amount: inputAmountBN,
      add: true,
      amountHasFee: true,
      epochInfo,
    });

    const amountMaxB = new BN(
      new Decimal(result.amountSlippageB.amount.toString())
        .mul(1 + slippage)
        .toFixed(0)
    );

    this.logger.log('Liquidity calculation:');
    this.logger.log(`  Input: ${inputAmount.toFixed(9)} ${poolInfo.mintA.symbol}`);
    this.logger.log(`  Required: ${(amountMaxB.toNumber() / 10 ** decimalsB).toFixed(6)} ${poolInfo.mintB.symbol}`);
    this.logger.log(`  Liquidity: ${result.liquidity.toString()}`);

    return {
      liquidity: result.liquidity,
      amountMaxA: inputAmountBN,
      amountMaxB,
    };
  }

  /**
   * Рассчитать price range
   */
  calculatePriceRange(params: {
    poolInfo: ApiV3PoolInfoConcentratedItem;
    currentPrice: number;
    rangePercent: number;
  }): PriceRange {
    
    const { poolInfo, currentPrice, rangePercent } = params;

    const percent = rangePercent / 100;
    const lowerPrice = currentPrice * (1 - percent);
    const upperPrice = currentPrice * (1 + percent);

    const { tick: lowerTick } = TickUtils.getPriceAndTick({
      poolInfo,
      price: new Decimal(lowerPrice),
      baseIn: true,
    });

    const { tick: upperTick } = TickUtils.getPriceAndTick({
      poolInfo,
      price: new Decimal(upperPrice),
      baseIn: true,
    });

    this.logger.log('Price range:');
    this.logger.log(`  Current: ${currentPrice.toFixed(2)}`);
    this.logger.log(`  Range: ${rangePercent}%`);
    this.logger.log(`  Lower: ${lowerPrice.toFixed(2)} (tick ${lowerTick})`);
    this.logger.log(`  Upper: ${upperPrice.toFixed(2)} (tick ${upperTick})`);

    return {
      lower: lowerPrice,
      upper: upperPrice,
      lowerTick,
      upperTick,
    };
  }

  /**
   * Рассчитать максимальный безопасный input amount
   */
  async calculateMaxSafeAmount(params: {
    poolInfo: ApiV3PoolInfoConcentratedItem;
    availableSol: number;
    availableUsdc: number;
    tickLower: number;
    tickUpper: number;
    slippage: number;
    minAmount: number;
  }): Promise<{ inputAmount: number; requiredUsdc: number }> {
    
    const {
      poolInfo,
      availableSol,
      availableUsdc,
      tickLower,
      tickUpper,
      slippage,
      minAmount,
    } = params;

    let low = minAmount;
    let high = availableSol * 0.95; // 95% от баланса
    let optimalAmount = low;
    let requiredUsdc = 0;

    const iterations = 10;

    this.logger.log('Calculating max safe amount...');
    this.logger.log(`  Available: ${availableSol.toFixed(4)} SOL, ${availableUsdc.toFixed(2)} USDC`);

    for (let i = 0; i < iterations; i++) {
      const testAmount = (low + high) / 2;

      const liquidityParams = await this.calculateLiquidityParams({
        poolInfo,
        inputAmount: testAmount,
        tickLower,
        tickUpper,
        slippage,
      });

      const decimalsB = poolInfo.mintB.decimals;
      const neededUsdc = liquidityParams.amountMaxB.toNumber() / (10 ** decimalsB);

      if (neededUsdc <= availableUsdc) {
        optimalAmount = testAmount;
        requiredUsdc = neededUsdc;
        low = testAmount;
      } else {
        high = testAmount;
      }
    }

    const safeAmount = optimalAmount * 0.99; // 99% для запаса

    this.logger.log(`  Optimal: ${safeAmount.toFixed(4)} SOL`);
    this.logger.log(`  Required USDC: ${requiredUsdc.toFixed(2)}`);

    return {
      inputAmount: safeAmount,
      requiredUsdc,
    };
  }
}