// src/volatility/volatility.service.ts - ФИНАЛЬНАЯ ВЕРСИЯ

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import axios from 'axios';
import { PriceHistory } from './price-history.entity';
import { RangeSuggestionDto, VolatilityHistoryDto } from './dto/range-suggestion.dto';
import { LiquidityBotService } from '../liquidity-bot/liquidity-bot.service';
import { log } from 'console';

@Injectable()
export class VolatilityService {
  private readonly logger = new Logger(VolatilityService.name);
  private readonly COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;
  private readonly COINGECKO_API_URL = 'https://pro-api.coingecko.com/api/v3';

  // Маппинг токенов Solana → CoinGecko ID (только SOL)
  private readonly TOKEN_TO_COINGECKO_ID: Record<string, string> = {
    'So11111111111111111111111111111111111111112': 'solana', // SOL
  };

  constructor(
    @InjectRepository(PriceHistory)
    private readonly priceHistoryRepo: Repository<PriceHistory>,
    private readonly liquidityBotService: LiquidityBotService,
  ) {}

  /**
   * 🦎 COINGECKO: Получить исторические цены (ТОЛЬКО ДЛЯ SOL)
   */
  async fetchHistoricalPricesFromCoinGecko(
    tokenAddress: string,
    days: number = 30,
  ): Promise<Array<{ price: number; timestamp: Date }>> {
    if (!this.COINGECKO_API_KEY) {
      this.logger.warn('COINGECKO_API_KEY not set, cannot fetch historical data');
      return [];
    }

    // ⚠️ ТОЛЬКО SOL
    if (tokenAddress !== 'So11111111111111111111111111111111111111112') {
      this.logger.warn(`Only SOL is supported for historical data. Token ${tokenAddress} skipped.`);
      return [];
    }

    const coinGeckoId = this.TOKEN_TO_COINGECKO_ID[tokenAddress];

    if (!coinGeckoId) {
      this.logger.warn(`No CoinGecko ID mapping for token ${tokenAddress}`);
      return [];
    }

    try {
      this.logger.log(`Fetching ${days} days of historical data for ${coinGeckoId}...`);

      // ✅ УПРОЩЕННЫЙ ENDPOINT - просто указываем days!
      const response = await axios.get(
        `${this.COINGECKO_API_URL}/coins/solana/market_chart`,
        {
          params: {
            vs_currency: 'usd',
            days: days.toString(),
            'x-cg-pro-api-key': this.COINGECKO_API_KEY
          }
        }
      );

      if (!response.data?.prices) {
        this.logger.warn(`No price data returned for ${coinGeckoId}`);
        return [];
      }

      // CoinGecko возвращает: [[timestamp_ms, price], ...]
      const historicalData = response.data.prices.map(([timestampMs, price]: [number, number]) => ({
        price,
        timestamp: new Date(timestampMs),
      }));

      this.logger.log(`✅ Fetched ${historicalData.length} historical price points for ${coinGeckoId}`);

      return historicalData;
    } catch (error) {
      this.logger.error(`Error fetching from CoinGecko: ${error.message}`);
      if (error.response) {
        this.logger.error(`Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`);
      }
      return [];
    }
  }

  // src/volatility/volatility.service.ts

// src/volatility/volatility.service.ts

async getVolatility(
  poolId: string,
  days: number = 365,
): Promise<{
  volatilityDaily: number;
  volatilityAnnual: number;
  period: number;
  dataPoints: number;
}> {
  try {
    // ✅ 1. СНАЧАЛА попробовать из БД
    let prices;

      // Получить tokenAddress для пула
      const positions = await this.liquidityBotService.getCLMMPositions();
      const poolData = positions.find((p) => p.pool.poolId === poolId);

      if (!poolData) {
        throw new Error(`Pool not found: ${poolId}`);
      }

      const tokenAddress = poolData.pool.baseMintPublicKey;
      console.log('SOL TOKEN ADDRESS', tokenAddress)

      // ✅ Получить из CoinGecko напрямую
      const historicalData = await this.fetchHistoricalPricesFromCoinGecko(
        tokenAddress,
        days,
      );

      if (historicalData.length === 0) {
        throw new Error(
          `Could not fetch historical data from CoinGecko for ${tokenAddress}`
        );
      }

      // Извлечь только цены
      prices = historicalData.map(d => d.price);


      this.logger.log(
        `✅ Fetched ${prices.length} prices from CoinGecko for volatility calculation`
      );

      // // ✅ ОПЦИОНАЛЬНО: Сохранить в БД для следующего раза
      // await this.saveHistoricalData(poolId, tokenAddress, historicalData);
    

    // ✅ 3. Проверить что данных достаточно
    if (prices.length < 10) {
      throw new Error(
        `Not enough data points: ${prices.length} (need at least 10)`
      );
    }


    // ✅ 4. Рассчитать волатильность
    return this.calculateVolatilityFromPrices(prices, days);

  } catch (error) {
    this.logger.error(`Failed to get volatility: ${error.message}`);
    
    // ✅ FALLBACK: Вернуть дефолтные значения для SOL
    this.logger.warn('Using default volatility for SOL');
  
  }
}

/**
 * 📊 Рассчитать волатильность из массива цен
 */
private calculateVolatilityFromPrices(
  prices: number[],
  days: number,
): {
  volatilityDaily: number;
  volatilityAnnual: number;
  period: number;
  dataPoints: number;
} {
  // 1. Рассчитать log returns
  const logReturns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const logReturn = Math.log(prices[i] / prices[i - 1]);
    console.log('RRETIRN LOG', logReturn, 'INFO',prices[0])
    logReturns.push(logReturn);
  }

  // 2. Дневная волатильность (std)
  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const variance =
    logReturns.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) /
    logReturns.length;
  const σ_day = Math.sqrt(variance);

  // 3. Аннуализировать
  const σ_annual = σ_day * Math.sqrt(365);

  this.logger.log(
    `📊 Volatility: Daily ${(σ_day * 100).toFixed(2)}%, ` +
    `Annual ${(σ_annual * 100).toFixed(2)}%, ` +
    `Data points: ${prices.length}`
  );

  return {
    volatilityDaily: Number((σ_day * 100).toFixed(2)),
    volatilityAnnual: Number((σ_annual * 100).toFixed(2)),
    period: days,
    dataPoints: prices.length,
  };
}

/**
 * 💾 Сохранить исторические данные в БД (опционально)
 */
private async saveHistoricalData(
  poolId: string,
  tokenAddress: string,
  historicalData: Array<{ price: number; timestamp: Date }>,
): Promise<void> {
  try {
    // Удалить старые записи
    await this.priceHistoryRepo.delete({ poolId });

    // Создать новые
    const records = historicalData.map((data) =>
      this.priceHistoryRepo.create({
        poolId,
        tokenSymbol: this.getTokenSymbol(tokenAddress),
        price: data.price,
        timestamp: data.timestamp,
      }),
    );

    // Сохранить
    await this.priceHistoryRepo.save(records);

    this.logger.log(
      `💾 Saved ${records.length} historical records to DB for future use`
    );
  } catch (error) {
    this.logger.warn(`Failed to save historical data: ${error.message}`);
    // Не критично, продолжаем без сохранения
  }
}



  /**
   * 🔄 BACKFILL: Загрузить исторические данные в базу
   */
  async backfillHistoricalData(
    poolId: string,
    tokenAddress: string,
    days: number = 30,
  ): Promise<void> {
    this.logger.log(`🔄 Starting backfill for pool ${poolId} (${days} days)...`);

    try {
      // Проверить, есть ли уже данные
      const existingCount = await this.priceHistoryRepo.count({
        where: { poolId },
      });

      if (existingCount > 0) {
        this.logger.log(`Pool ${poolId} already has ${existingCount} records, skipping backfill`);
        return;
      }

      // Получить исторические данные с CoinGecko
      const historicalPrices = await this.fetchHistoricalPricesFromCoinGecko(tokenAddress, days);

      if (historicalPrices.length === 0) {
        this.logger.warn(`No historical data to backfill for pool ${poolId}`);
        return;
      }

      // Сохранить в базу
      const priceRecords = historicalPrices.map((data) =>
        this.priceHistoryRepo.create({
          poolId,
          tokenSymbol: this.getTokenSymbol(tokenAddress),
          price: data.price,
          timestamp: data.timestamp,
        }),
      );

      await this.priceHistoryRepo.save(priceRecords);

      this.logger.log(`✅ Backfilled ${priceRecords.length} historical records for pool ${poolId}`);
    } catch (error) {
      this.logger.error(`Error during backfill: ${error.message}`);
    }
  }

  /**
   * 🚀 BACKFILL ALL: Загрузить исторические данные для всех активных пулов (ТОЛЬКО SOL)
   */
  async backfillAllPools(days: number = 30): Promise<void> {
    this.logger.log('🚀 Starting backfill for all active pools (SOL only)...');

    try {
      const positions = await this.liquidityBotService.getCLMMPositions();

      if (positions.length === 0) {
        this.logger.log('No active positions to backfill');
        return;
      }

      const uniquePools = new Map<string, string>();

      for (const { pool } of positions) {
        // ⚠️ ТОЛЬКО SOL
        if (pool.baseMintPublicKey !== 'So11111111111111111111111111111111111111112') {
          continue; // Пропускаем не-SOL пулы
        }

        if (!uniquePools.has(pool.poolId)) {
          uniquePools.set(pool.poolId, pool.baseMintPublicKey);
        }
      }

      this.logger.log(`Found ${uniquePools.size} unique SOL pools to backfill`);

      if (uniquePools.size === 0) {
        this.logger.log('⚠️ No SOL pools found to backfill');
        return;
      }

      for (const [poolId, tokenAddress] of uniquePools) {
        await this.backfillHistoricalData(poolId, tokenAddress, days);
        // Задержка между запросами (CoinGecko rate limit)
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      this.logger.log('✅ Backfill completed for all SOL pools');
    } catch (error) {
      this.logger.error(`Error during backfill all: ${error.message}`);
    }
  }

  /**
   * 🕐 CRON: Собирать текущие цены каждые 12 часов (00:00 и 12:00) - ТОЛЬКО SOL
   */
  @Cron('0 0,12 * * *', {
    name: 'collect-prices',
    timeZone: 'Asia/Almaty',
  })
  async collectCurrentPrices(): Promise<void> {
    this.logger.log('🕐 Starting price collection (every 12 hours) - SOL only...');

    try {
      const positions = await this.liquidityBotService.getCLMMPositions();

      if (positions.length === 0) {
        this.logger.log('No active positions to collect prices from');
        return;
      }

      const uniqueTokens = new Map<string, { poolId: string; price: number }>();

      for (const { position, pool } of positions) {
        // ⚠️ ТОЛЬКО SOL
        if (pool.baseMintPublicKey !== 'So11111111111111111111111111111111111111112') {
          continue; // Пропускаем не-SOL токены
        }

        const tokenKey = `${pool.poolId}-${pool.baseMintPublicKey}`;
        if (!uniqueTokens.has(tokenKey)) {
          uniqueTokens.set(tokenKey, {
            poolId: pool.poolId,
            price: pool.currentPrice,
          });
        }
      }

      const priceRecords: PriceHistory[] = [];

      for (const [tokenKey, data] of uniqueTokens) {
        const [poolId, tokenSymbol] = tokenKey.split('-');

        const priceRecord = this.priceHistoryRepo.create({
          poolId,
          tokenSymbol: this.getTokenSymbol(tokenSymbol),
          price: data.price,
          timestamp: new Date(),
        });

        priceRecords.push(priceRecord);
      }

      if (priceRecords.length > 0) {
        await this.priceHistoryRepo.save(priceRecords);
        this.logger.log(`✅ Collected ${priceRecords.length} SOL price records`);
      } else {
        this.logger.log('⚠️ No SOL positions found to collect prices');
      }
    } catch (error) {
      this.logger.error(`Error collecting prices: ${error.message}`);
    }
  }

  /**
   * 🗑️ CRON: Удалять старые данные (старше 90 дней)
   */
  @Cron('0 0 * * *', {
    name: 'cleanup-old-prices',
    timeZone: 'Asia/Almaty',
  })
  async cleanupOldPrices(): Promise<void> {
    this.logger.log('🗑️ Cleaning up old price data...');

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);

      const result = await this.priceHistoryRepo.delete({
        timestamp: LessThan(cutoffDate),
      });

      this.logger.log(`✅ Deleted ${result.affected || 0} old price records`);
    } catch (error) {
      this.logger.error(`Error cleaning up old prices: ${error.message}`);
    }
  }

  /**
   * 📊 Получить историю цен за N дней (с автоматическим backfill)
   */
  async getPriceHistory(poolId: string, days: number = 30): Promise<number[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const priceRecords = await this.priceHistoryRepo.find({
      where: {
        poolId,
        timestamp: MoreThan(startDate),
      },
      order: {
        timestamp: 'ASC',
      },
    });

    // Если данных мало, попробовать backfill
    if (priceRecords.length < 10) {
      this.logger.warn(`Only ${priceRecords.length} records for pool ${poolId}, attempting backfill...`);

      // Получить tokenAddress для этого пула
      const positions = await this.liquidityBotService.getCLMMPositions();
      const poolData = positions.find((p) => p.pool.poolId === poolId);

      if (poolData) {
        await this.backfillHistoricalData(poolId, poolData.pool.baseMintPublicKey, days);

        // Попробовать снова
        const newRecords = await this.priceHistoryRepo.find({
          where: {
            poolId,
            timestamp: MoreThan(startDate),
          },
          order: {
            timestamp: 'ASC',
          },
        });

        return newRecords.map((record) => Number(record.price));
      }
    }

    return priceRecords.map((record) => Number(record.price));
  }

  /**
   * 📈 Рассчитать процентные изменения цен
   */
  calculatePriceChanges(prices: number[]): number[] {
    if (prices.length < 2) {
      return [];
    }

    const changes: number[] = [];

    for (let i = 1; i < prices.length; i++) {
      const previousPrice = prices[i - 1];
      const currentPrice = prices[i];

      if (previousPrice > 0) {
        const change = ((currentPrice - previousPrice) / previousPrice) * 100;
        changes.push(change);
      }
    }

    return changes;
  }

  /**
   * 📊 Рассчитать волатильность (σ - среднеквадратичное отклонение)
   */
  calculateVolatility(priceChanges: number[]): number {
    if (priceChanges.length < 2) {
      return 0;
    }

    // Шаг 1: Среднее изменение
    const mean =
      priceChanges.reduce((sum, change) => sum + change, 0) / priceChanges.length;

    // Шаг 2: Разница от среднего и квадрат
    const squaredDiffs = priceChanges.map((change) => Math.pow(change - mean, 2));

    // Шаг 3: Среднее квадратов (дисперсия)
    const variance =
      squaredDiffs.reduce((sum, diff) => sum + diff, 0) / squaredDiffs.length;

    // Шаг 4: Корень (стандартное отклонение)
    const volatility = Math.sqrt(variance);

    return volatility;
  }

  /**
   * 🎯 Предложить диапазон на основе волатильности
   */
  suggestRange(
    currentPrice: number,
    volatility: number,
    sigmas: number = 2,
  ): {
    lower: number;
    upper: number;
    lowerPercent: number;
    upperPercent: number;
  } {
    // Диапазон = текущая цена ± (sigmas × σ)
    const rangePercent = sigmas * volatility;

    const lower = currentPrice * (1 - rangePercent / 100);
    const upper = currentPrice * (1 + rangePercent / 100);

    // Процент от текущей цены
    const lowerPercent = ((currentPrice - lower) / currentPrice) * 100;
    const upperPercent = ((upper - currentPrice) / currentPrice) * 100;

    return {
      lower,
      upper,
      lowerPercent,
      upperPercent,
    };
  }

  /**
   * 🔍 Получить рекомендацию диапазона для пула
   */
  async getRangeSuggestion(
    poolId: string,
    days: number = 30,
    sigmas: number = 2,
  ): Promise<RangeSuggestionDto> {
    // Получить историю цен (с автоматическим backfill если нужно)
    const prices = await this.getPriceHistory(poolId, days);

    if (prices.length < 10) {
      throw new Error(
        `Not enough price data for pool ${poolId}. Need at least 10 data points, got ${prices.length}. Try running backfill first.`,
      );
    }

    // Получить информацию о пуле
    const positions = await this.liquidityBotService.getCLMMPositions();
    const poolData = positions.find((p) => p.pool.poolId === poolId);

    if (!poolData) {
      throw new Error(`Pool ${poolId} not found`);
    }

    const { pool } = poolData;

    // Рассчитать волатильность
    const priceChanges = this.calculatePriceChanges(prices);
    const volatility = this.calculateVolatility(priceChanges);

    // Предложить диапазон
    const suggestedRange = this.suggestRange(pool.currentPrice, volatility, sigmas);

    // Определить уровень уверенности
    const confidence = sigmas === 2 ? '95%' : sigmas === 3 ? '99.7%' : `${sigmas}σ`;

    return {
      poolId,
      baseToken: pool.baseMintPublicKey,
      quoteToken: pool.quoteMint,
      currentPrice: pool.currentPrice,
      volatility: Number(volatility.toFixed(2)),
      suggestedRange: {
        lower: Number(suggestedRange.lower.toFixed(2)),
        upper: Number(suggestedRange.upper.toFixed(2)),
        lowerPercent: Number(suggestedRange.lowerPercent.toFixed(2)),
        upperPercent: Number(suggestedRange.upperPercent.toFixed(2)),
      },
      confidence,
      period: `${days} days`,
      dataPoints: prices.length,
    };
  }

  /**
   * 📜 Получить историю волатильности токена
   */
  async getVolatilityHistory(
    tokenSymbol: string,
    days: number = 30,
  ): Promise<VolatilityHistoryDto> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const priceRecords = await this.priceHistoryRepo.find({
      where: {
        tokenSymbol,
        timestamp: MoreThan(startDate),
      },
      order: {
        timestamp: 'ASC',
      },
    });

    if (priceRecords.length < 2) {
      throw new Error(
        `Not enough price data for token ${tokenSymbol}. Need at least 2 data points`,
      );
    }

    const prices = priceRecords.map((record) => Number(record.price));
    const priceChanges = this.calculatePriceChanges(prices);
    const volatility = this.calculateVolatility(priceChanges);

    return {
      tokenSymbol,
      period: `${days} days`,
      volatility: Number(volatility.toFixed(2)),
      currentPrice: prices[prices.length - 1],
      priceHistory: priceRecords.map((record) => ({
        price: Number(record.price),
        timestamp: record.timestamp.toISOString(),
      })),
      dataPoints: priceRecords.length,
    };
  }

  /**
   * 🌐 Получить все рекомендации для активных пулов
   */
  async getAllSuggestions(
    days: number = 30,
    sigmas: number = 2,
  ): Promise<RangeSuggestionDto[]> {
    const positions = await this.liquidityBotService.getCLMMPositions();

    if (positions.length === 0) {
      return [];
    }

    const uniquePoolIds = new Set(positions.map((p) => p.pool.poolId));
    const suggestions: RangeSuggestionDto[] = [];

    for (const poolId of uniquePoolIds) {
      try {
        const suggestion = await this.getRangeSuggestion(poolId, days, sigmas);
        suggestions.push(suggestion);
      } catch (error) {
        this.logger.warn(
          `Could not get suggestion for pool ${poolId}: ${error.message}`,
        );
      }
    }

    return suggestions;
  }

  /**
   * 🔧 Ручной запуск сбора цен
   */
  async collectPricesManually(): Promise<void> {
    this.logger.log('🔧 Manual price collection triggered');
    await this.collectCurrentPrices();
  }

  /**
   * 🛠️ Вспомогательная функция: получить символ токена (только SOL)
   */
  private getTokenSymbol(tokenAddress: string): string {
    // Только SOL
    if (tokenAddress === 'So11111111111111111111111111111111111111112') {
      return 'SOL';
    }
    
    return tokenAddress.slice(0, 8);
  }
}