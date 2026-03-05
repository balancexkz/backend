// src/liquidity-bot/services/optimal-range.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { LiquidityBotService } from 'src/liquidity-bot/liquidity-bot.service';
import { VolatilityService } from 'src/volatility/volatility.service';
import { OptimalRangeVolumeDto } from './dto/optimal-range.dto';
import { TickUtils, TickMath } from '@raydium-io/raydium-sdk-v2';
import Decimal from 'decimal.js';
import { ApiV3PoolInfoBaseItem, ApiV3PoolInfoConcentratedItem } from '@raydium-io/raydium-sdk-v2';
import { CommonRaydiumService } from '../common/common-raydium.service';
import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PositionConfigService } from 'src/position/position.config.service';
import { PositionAnalyticsService } from 'src/analytic/analytic.service';

@Injectable()
export class OptimalRangeVolumeService extends CommonRaydiumService implements OnModuleInit {
    readonly logger = new Logger(OptimalRangeVolumeService.name);
  
    constructor(
      protected readonly configService: ConfigService,
      private liquidityBotService: LiquidityBotService,
      private volatilityService: VolatilityService,
      private positionConfigService: PositionConfigService,
      private analyticService: PositionAnalyticsService
    ) {
      super(configService);
    }
  
   // src/liquidity-bot/services/optimal-range-volume.service.ts
   async onModuleInit(): Promise<void> {
    await this.initializeRaydium(); // Вызов shared метода из базового класса
    this.logger.log('SwapService initialized successfully');
  }

async calculateOptimalRangeForPosition(
  positionId: string,
  volatilityPeriod: number = 14,
): Promise<OptimalRangeVolumeDto> {
  try {
    this.logger.log('');
    this.logger.log('🎯 CALCULATING OPTIMAL RANGE FOR POSITION');
    this.logger.log(`Position: ${positionId.slice(0, 8)}...`);
    this.logger.log('');

    // 1. Получить позицию
    const positions = await this.liquidityBotService.getCLMMPositions();
    const positionData = positions.find(
      (p) => p.position.positionId === positionId,
    );

    if (!positionData) {
      throw new Error(`Position not found: ${positionId}`);
    }

    const { position, pool } = positionData;

    // 2. Рассчитать deposit
    const baseValueUSD = Number(position.baseAmount) * pool.currentPrice;
    const quoteValueUSD = Number(position.quoteAmount);
    const myDeposit = baseValueUSD + quoteValueUSD;

    this.logger.log(`💰 Position Value:`);
    this.logger.log(
      `├─ Base: ${position.baseAmount} × $${pool.currentPrice.toFixed(2)} = $${baseValueUSD.toFixed(2)}`,
    );
    this.logger.log(`├─ Quote: $${quoteValueUSD.toFixed(2)}`);
    this.logger.log(`└─ Total (deposit): $${myDeposit.toFixed(2)}`);
    this.logger.log('');

    // 3. Получить рыночные данные
    const poolId = pool.poolId;
    const currentPrice = pool.currentPrice;
    const poolInfo = await this.liquidityBotService.getPoolInfo(poolId);

    const volume24h = poolInfo.day?.volume || 0;
    const tvl = poolInfo.tvl || 0;

    let feeTier = 0.0025;
    if (poolInfo.config && poolInfo.config.tradeFeeRate !== undefined) {
      feeTier = poolInfo.config.tradeFeeRate / 1000000;
    } else if (poolInfo.feeRate && poolInfo.feeRate > 0) {
      feeTier = poolInfo.feeRate;
    }

    this.logger.log(`📊 Pool Market Data:`);
    this.logger.log(`├─ Pool: ${poolId.slice(0, 8)}...`);
    this.logger.log(`├─ Current Price: $${currentPrice.toFixed(2)}`);
    this.logger.log(`├─ Volume 24h: $${volume24h.toLocaleString()}`);
    this.logger.log(`├─ TVL: $${tvl.toLocaleString()}`);
    this.logger.log(`└─ Fee Tier: ${(feeTier * 100).toFixed(2)}%`);
    this.logger.log('');

    // 4. Волатильность
    const volatilityData = await this.volatilityService.getVolatility(
      poolId,
      volatilityPeriod,
    );

    let σ_day = volatilityData.volatilityDaily / 100;
    let σ = σ_day * Math.sqrt(365);

    this.logger.log(`📈 Volatility:`);
    this.logger.log(`├─ Period: ${volatilityPeriod} days`);
    this.logger.log(`├─ σ_day: ${(σ_day * 100).toFixed(2)}%`);
    this.logger.log(`├─ σ (annual): ${(σ * 100).toFixed(2)}%`);
    this.logger.log(`├─ Data points: ${volatilityData.dataPoints}`);
    this.logger.log('');

    // ✅ 5. ИСПРАВЛЕНИЕ: Правильная λ с учетом доли в пуле
    const your_share = myDeposit / tvl;
    const effective_volume = volume24h * your_share;
    const λ = effective_volume / myDeposit;

    let η = feeTier * λ * 365;
    const r = 0.0;

    this.logger.log(`🧮 Position Share Calculation:`);
    this.logger.log(`├─ Your deposit: $${myDeposit.toLocaleString()}`);
    this.logger.log(`├─ Pool TVL: $${tvl.toLocaleString()}`);
    this.logger.log(`├─ Your share: ${(your_share * 100).toFixed(4)}%`);
    this.logger.log(`├─ Total volume: $${volume24h.toLocaleString()}`);
    this.logger.log(`└─ Effective volume: $${effective_volume.toLocaleString()}`);
    this.logger.log('');

    // ✅ ОГРАНИЧЕНИЕ η для реалистичности
    const MAX_ETA = 3.0; // 300% годовых максимум
    const originalEta = η;

    if (η > MAX_ETA) {
      this.logger.warn('⚠️ WARNING: Capping unrealistic yield');
      this.logger.warn(`   Original η: ${(η * 100).toFixed(0)}%`);
      this.logger.warn(`   Capped η: ${(MAX_ETA * 100).toFixed(0)}%`);
      η = MAX_ETA;
    }

    this.logger.log(`🧮 Calculations:`);
    this.logger.log(`├─ λ (swap intensity): ${λ.toFixed(4)} swaps/day`);
    this.logger.log(`├─ η (annual yield): ${(η * 100).toFixed(2)}%`);
    if (originalEta !== η) {
      this.logger.log(`   (original: ${(originalEta * 100).toFixed(0)}%, capped)`);
    }

    // Проверка параметров
    if (σ === 0 || feeTier === 0 || volume24h === 0) {
      throw new Error(
        `Invalid parameters: σ=${σ}, feeTier=${feeTier}, volume24h=${volume24h}`,
      );
    }

    // ✅ 6. ИСПРАВЛЕНИЕ: Δ в ДОЛЯХ, не процентах
    let Δ = σ * Math.sqrt((η - r) / (0.5 * σ ** 2));

    // ✅ ОГРАНИЧЕНИЕ Δ для безопасности
    const MAX_DELTA = 5.0;
    if (Δ > MAX_DELTA) {
      this.logger.warn(`⚠️ Δ = ${Δ.toFixed(2)} too large, capping at ${MAX_DELTA}`);
      Δ = MAX_DELTA;
    }

    this.logger.log(`└─ Δ (log-width): ${Δ.toFixed(4)} (${(Δ * 100).toFixed(2)}%)`);
    this.logger.log('');

    // Проверка результата
    if (isNaN(Δ) || !isFinite(Δ)) {
      throw new Error(`Invalid Δ: σ=${σ}, η=${η}, Δ=${Δ}`);
    }

    // ✅ 7. ИСПРАВЛЕНИЕ: Δ УЖЕ в долях, используем напрямую
    const optimalLowerPrice = currentPrice * Math.exp(-Δ / 2);
    const optimalUpperPrice = currentPrice * Math.exp(Δ / 2);

    const optimalLowerPercent = (1 - optimalLowerPrice / currentPrice) * 100;
    const optimalUpperPercent = (optimalUpperPrice / currentPrice - 1) * 100;

    this.logger.log(`✅ Optimal Range:`);
    this.logger.log(
      `├─ Lower: $${optimalLowerPrice.toFixed(2)} (-${optimalLowerPercent.toFixed(2)}%)`,
    );
    this.logger.log(
      `├─ Upper: $${optimalUpperPrice.toFixed(2)} (+${optimalUpperPercent.toFixed(2)}%)`,
    );
    this.logger.log(`└─ Width: ±${((Δ / 2) * 100).toFixed(2)}%`);
    this.logger.log('');

    // 8. Текущий диапазон
    const currentLower = position.priceRange?.lower || 0;
    const currentUpper = position.priceRange?.upper || 0;
    const currentLowerPercent =
      ((currentPrice - currentLower) / currentPrice) * 100;
    const currentUpperPercent =
      ((currentUpper - currentPrice) / currentPrice) * 100;

    this.logger.log(`📊 Current vs Optimal:`);
    this.logger.log(
      `Current: $${currentLower.toFixed(2)} - $${currentUpper.toFixed(2)} (-${currentLowerPercent.toFixed(1)}% / +${currentUpperPercent.toFixed(1)}%)`,
    );
    this.logger.log(
      `Optimal: $${optimalLowerPrice.toFixed(2)} - $${optimalUpperPrice.toFixed(2)} (-${optimalLowerPercent.toFixed(1)}% / +${optimalUpperPercent.toFixed(1)}%)`,
    );
    this.logger.log('');

    // 9. Рекомендация
    const recommendation = this.getRecommendation(
      currentLowerPercent,
      currentUpperPercent,
      optimalLowerPercent,
      optimalUpperPercent,
    );

    this.logger.log(
      `💡 Recommendation: ${recommendation.action.toUpperCase()}`,
    );
    this.logger.log(`   ${recommendation.reason}`);
    this.logger.log('');

    // 10. Результат
    return {
      apr: λ,
      positionId,
      poolId,
      currentPrice,

      myDeposit,
      baseValueUSD,
      quoteValueUSD,

      volume24h,
      tvl,
      feeTier,

      // ✅ Добавить your_share
      positionShare: your_share * 100, // % от пула

      volatility: σ * 100,
      volatilityPeriod,

      lambda: λ,
      eta: η,
      deltaLog: Δ,

      optimalLowerPrice,
      optimalUpperPrice,
      optimalLowerPercent,
      optimalUpperPercent,

      currentRange: {
        lowerPrice: currentLower,
        upperPrice: currentUpper,
        lowerPercent: currentLowerPercent,
        upperPercent: currentUpperPercent,
      },

      recommendation: recommendation.action,
      reasoning: recommendation.reason,

      estimatedAPY: η * 100,

      calculatedAt: new Date(),
    };
  } catch (error) {
    this.logger.error(`Failed to calculate: ${error.message}`);
    throw error;
  }
}

async calculateOptimalRangeCorrect(
  positionId: string,
  volatilityPeriod: number = 365,
): Promise<OptimalRangeVolumeDto> {
  try {
    this.logger.log('');
    this.logger.log('✅ METHOD 1: CORRECT IMPLEMENTATION');
    this.logger.log(`Position: ${positionId.slice(0, 8)}...`);
    this.logger.log('');

    // 1. Получить позицию
    const positions = await this.liquidityBotService.getCLMMPositions();
    const positionData = positions.find(
      (p) => p.position.positionId === positionId,
    );

    if (!positionData) {
      throw new Error(`Position not found: ${positionId}`);
    }

    const { position, pool } = positionData;

    // 2. Рассчитать deposit
    const baseValueUSD = Number(position.baseAmount) * pool.currentPrice;
    const quoteValueUSD = Number(position.quoteAmount);
    const myDeposit = baseValueUSD + quoteValueUSD;
    const priceRange = await this.positionConfigService.getConfig(pool.poolId)
    // 5. Рассчитываем price range
    const lowerPercent = Number(priceRange?.lowerRangePercent) / 100;
    const upperPercent = Number(priceRange?.upperRangePercent) / 100;
    const { fullRange, yourRange, concentrationFactor } = 
    await this.calculateConcentrationFactor(pool.poolId, lowerPercent, upperPercent);

    this.logger.log(`💰 Position Value:`);
    this.logger.log(
      `├─ Base: ${position.baseAmount} × $${pool.currentPrice.toFixed(2)} = $${baseValueUSD.toFixed(2)}`,
    );
    this.logger.log(`├─ Quote: $${quoteValueUSD.toFixed(2)}`);
    this.logger.log(`└─ Total: $${myDeposit.toFixed(2)}`);
    this.logger.log('');

    // 3. Получить рыночные данные
    const poolId = pool.poolId;
    const currentPrice = pool.currentPrice;
    const poolInfo = await this.liquidityBotService.getPoolInfo(poolId);
    const volume24h = poolInfo.day?.volume || 0;
    const tvl = poolInfo.tvl || 0;

    let feeTier = 0.0025;
    if (poolInfo.config && poolInfo.config.tradeFeeRate !== undefined) {
      feeTier = poolInfo.config.tradeFeeRate / 1000000;
    } else if (poolInfo.feeRate && poolInfo.feeRate > 0) {
      feeTier = poolInfo.feeRate;
    }

    this.logger.log(`📊 Pool Data:`);
    this.logger.log(`├─ Volume 24h: $${volume24h.toLocaleString()}`);
    this.logger.log(`├─ TVL: $${tvl.toLocaleString()}`);
    this.logger.log(`└─ Fee: ${(feeTier * 100).toFixed(4)}%`);
    this.logger.log('');

    // 4. Волатильность
    const volatilityData = await this.volatilityService.getVolatility(
      poolId,
      365,
    );
    console.log('VOLATILITY DATA', volatilityData)
    const σ_day = volatilityData.volatilityDaily / 100;
    const σ = σ_day * Math.sqrt(365);

    this.logger.log(`📈 Volatility:`);
    this.logger.log(`├─ σ_day: ${(σ_day * 100).toFixed(2)}%`);
    this.logger.log(`└─ σ_annual: ${(σ * 100).toFixed(2)}%`);
    this.logger.log('');

    // ✅ 5. ПРАВИЛЬНАЯ ФОРМУЛА
    const your_share = myDeposit / tvl;
    const effective_volume = volume24h * your_share * concentrationFactor;
   
    
    const feeRegexA = /Collected Fees: ([\d.]+) \w+ \(([\d.]+) USD\)/;
    const matchA = position.actionHistory[0]?.match(feeRegexA);
    const matchB = position.actionHistory[1]?.match(feeRegexA);
    const feeAmountA = matchA ? parseFloat(matchA[1]) : 0;
    const feeValueA_USD = matchA ? parseFloat(matchA[2]) : 0;
    const feeAmountB = matchB ? parseFloat(matchB[1]) : 0;
    const feeValueB_USD = matchB ? parseFloat(matchB[2]) : 0;
    const totalFeesUSD = feeValueA_USD + feeValueB_USD;
    console.log('TOTAK FEES', totalFeesUSD)
    const percentPool = (totalFeesUSD * 100) / myDeposit
    console.log('percent pool', percentPool)
    const analytic = await this.analyticService.getAnalyticByPosition(position.positionId)
    const durationSeconds = Math.floor(
      (new Date().getTime() - analytic.createdAt.getTime()) / 1000
    );
    const durationDays = durationSeconds / (24 * 60 * 60);
    const durationYear =  365 / durationDays 
    //const apr = durationYear * percentPool
    const apr = poolInfo.day.feeApr

    console.log('fee apr ', apr)
    const η = apr / 100;

    const r = 0.0;
    const λ = η / (feeTier * 365);
    this.logger.log(`🧮 Correct Calculation:`);
    this.logger.log('concentrationFactor', concentrationFactor, 'n', η, 'feeapr', poolInfo.day.feeApr, poolInfo.day.apr)
    this.logger.log(`├─ Your share: ${(your_share * 100).toFixed(4)}%`);
    this.logger.log(`├─ Effective volume: $${effective_volume.toLocaleString()}`);
    this.logger.log(`├─ λ = effective_volume / deposit`);
    this.logger.log(`├─ λ = ${effective_volume.toFixed(2)} / ${myDeposit.toFixed(2)}`);
    this.logger.log(`├─ λ = ${λ.toFixed(4)} swaps/day`);
    this.logger.log(`├─ η = ${(feeTier * 100).toFixed(4)}% × ${λ.toFixed(4)} × 365`);
    this.logger.log(`└─ η = ${(η * 100).toFixed(2)}%`);
    this.logger.log('');
    let Δ: number
    const threshold = 0.5 * σ ** 2;
    if(η > threshold){
      console.log('aaa')
      Δ = σ * Math.sqrt((η - r) / (0.5 * σ ** 2));
    } else {
      console.log('BBB')
      // ✅ Минимальная ширина
      Δ = σ * Math.sqrt(2);
    }

    // 6. Формула Cartea
    this.logger.log(`📐 Cartea Formula:`);
    this.logger.log(`├─ Δ = σ × √[(η - r) / (0.5 × σ²)]`);
    this.logger.log(`├─ Δ = ${σ.toFixed(4)} × √[(${η.toFixed(4)} - ${r}) / (0.5 × ${σ.toFixed(4)}²)]`);
    this.logger.log(`└─ Δ = ${Δ.toFixed(4)} (${(Δ * 100).toFixed(2)}%)`);
    this.logger.log('');

    // 7. Границы
    const optimalLowerPrice = currentPrice * Math.exp(-Δ / 2);
    const optimalUpperPrice = currentPrice * Math.exp(Δ / 2);

    const optimalLowerPercent = (1 - optimalLowerPrice / currentPrice) * 100;
    const optimalUpperPercent = (optimalUpperPrice / currentPrice - 1) * 100;

    this.logger.log(`✅ Optimal Range:`);
    this.logger.log(`├─ Lower: $${optimalLowerPrice.toFixed(2)} (-${optimalLowerPercent.toFixed(2)}%)`);
    this.logger.log(`├─ Upper: $${optimalUpperPrice.toFixed(2)} (+${optimalUpperPercent.toFixed(2)}%)`);
    this.logger.log(`└─ Width: $${(optimalUpperPrice - optimalLowerPrice).toFixed(2)}`);
    this.logger.log('');

    // 8. Текущий диапазон
    const currentLower = position.priceRange?.lower || 0;
    const currentUpper = position.priceRange?.upper || 0;
    const currentLowerPercent = ((currentPrice - currentLower) / currentPrice) * 100;
    const currentUpperPercent = ((currentUpper - currentPrice) / currentPrice) * 100;

    // 9. Рекомендация
    const recommendation = this.getRecommendation(
      currentLowerPercent,
      currentUpperPercent,
      optimalLowerPercent,
      optimalUpperPercent,
    );

    return {
      positionId,
      apr,
      poolId,
      currentPrice,
      myDeposit,
      baseValueUSD,
      quoteValueUSD,
      volume24h,
      tvl,
      feeTier,
      positionShare: your_share * 100,
      volatility: σ * 100,
      volatilityPeriod,
      lambda: λ,
      eta: η,
      deltaLog: Δ,
      optimalLowerPrice,
      optimalUpperPrice,
      optimalLowerPercent,
      optimalUpperPercent,
      currentRange: {
        lowerPrice: currentLower,
        upperPrice: currentUpper,
        lowerPercent: currentLowerPercent,
        upperPercent: currentUpperPercent,
      },
      recommendation: recommendation.action,
      reasoning: recommendation.reason,
      estimatedAPY: η * 100,
      calculatedAt: new Date(),
    };
  } catch (error) {
    this.logger.error(`Failed: ${error.message}`);
    throw error;
  }
}



async calculateConcentrationFactor(
  poolId: string,
  lowerPercent: number,  // твоя нижняя граница (например, 0.1 = -10%)
  upperPercent: number,  // твоя верхняя граница (например, 0.15 = +15%)
): Promise<{
  fullRange: number;
  yourRange: number;
  concentrationFactor: number;
}> {
  // 1. Получить данные пула
  const poolInfo = await this.liquidityBotService.getPoolInfo(poolId);
  const rpcData = await this.raydium.clmm.getRpcClmmPoolInfo({ 
    poolId:poolId
  });

  const currentPrice = rpcData.currentPrice;

  // 2. ✅ FULL RANGE из конфига пула
  // Raydium CLMM использует tick spacing и max/min ticks
  const PRACTICAL_RANGE_MULTIPLIER = 10; // ±400% (типично для активных пулов)

  const fullRange = PRACTICAL_RANGE_MULTIPLIER


  this.logger.log(`📊 Full Range Calculation:`);
  this.logger.log(`└─ Full range: ${fullRange.toFixed(0)}x`);

  // 3. ✅ YOUR RANGE (твой диапазон)
  const lowerPrice = currentPrice * (1 - lowerPercent);
  const upperPrice = currentPrice * (1 + upperPercent);
  const yourRange = upperPrice / lowerPrice;

  this.logger.log(`📏 Your Range:`);
  this.logger.log(`├─ Current: $${currentPrice.toFixed(2)}`);
  this.logger.log(`├─ Lower: $${lowerPrice.toFixed(2)} (-${(lowerPercent * 100).toFixed(1)}%)`);
  this.logger.log(`├─ Upper: $${upperPrice.toFixed(2)} (+${(upperPercent * 100).toFixed(1)}%)`);
  this.logger.log(`└─ Your range: ${yourRange.toFixed(2)}x`);

  // 4. ✅ CONCENTRATION FACTOR
  const concentrationFactor = fullRange / yourRange;

  this.logger.log(`🎯 Concentration:`);
  this.logger.log(`├─ Full range: ${fullRange.toFixed(0)}x`);
  this.logger.log(`├─ Your range: ${yourRange.toFixed(2)}x`);
  this.logger.log(`└─ Concentration factor: ${concentrationFactor.toFixed(2)}x`);

  return {
    fullRange,
    yourRange,
    concentrationFactor,
  };
}

  
    /**
     * 💡 Получить рекомендацию
     */
    private getRecommendation(
      currentLower: number,
      currentUpper: number,
      optimalLower: number,
      optimalUpper: number,
    ): {
      action: 'rebalance' | 'hold' | 'widen' | 'narrow';
      reason: string;
    } {
      const currentWidth = (currentLower + currentUpper) / 2;
      const optimalWidth = (optimalLower + optimalUpper) / 2;
      const diff = Math.abs(currentWidth - optimalWidth);
  
      // Порог 2%
      if (diff < 2) {
        return {
          action: 'hold',
          reason: 'Current range is near optimal. No action needed.',
        };
      }
  
      // Текущий диапазон уже оптимального
      if (currentWidth < optimalWidth - 5) {
        return {
          action: 'widen',
          reason: `Current range is ${diff.toFixed(1)}% narrower than optimal. Consider widening to reduce rebalancing frequency.`,
        };
      }
  
      // Текущий диапазон шире оптимального
      if (currentWidth > optimalWidth + 5) {
        return {
          action: 'narrow',
          reason: `Current range is ${diff.toFixed(1)}% wider than optimal. Consider narrowing to capture more fees.`,
        };
      }
  
      return {
        action: 'rebalance',
        reason: `Current range differs from optimal by ${diff.toFixed(1)}%. Consider rebalancing.`,
      };
    }
  
    /**
     * 📊 Для всех позиций
     */
    async calculateForAllPositions(
      volatilityPeriod: number = 14,
    ): Promise<OptimalRangeVolumeDto[]> {
      this.logger.log('📊 Calculating for all positions...');
  
      const positions = await this.liquidityBotService.getCLMMPositions();
  
      if (positions.length === 0) {
        return [];
      }
  
      const results: OptimalRangeVolumeDto[] = [];
  
      for (const { position } of positions) {
        try {
          const result = await this.calculateOptimalRangeForPosition(
            position.positionId,
            volatilityPeriod,
          );
          results.push(result);
        } catch (error) {
          this.logger.warn(
            `Failed for ${position.positionId.slice(0, 8)}: ${error.message}`,
          );
        }
      }
  
      this.logger.log(
        `✅ Calculated for ${results.length}/${positions.length} positions`,
      );
  
      return results;
    }
  }