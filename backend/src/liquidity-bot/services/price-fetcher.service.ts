// src/liquidity-bot/services/price-fetcher.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface TokenPrice {
  symbol: string;
  price: number;
  timestamp: number;
}

export interface PriceCache {
  [symbol: string]: {
    price: number;
    timestamp: number;
  };
}

@Injectable()
export class PriceFetcherService {
  private readonly logger = new Logger(PriceFetcherService.name);
  private readonly coinMarketCapApiKey: string;
  private readonly priceCache: PriceCache = {};
  private readonly CACHE_TTL = 60 * 1000; // 1 минута

  // Маппинг символов на CoinGecko ID
  private readonly symbolToCoinGeckoId: { [key: string]: string } = {
    'SOL': 'solana',
    'WSOL': 'solana',
    'USDC': 'usd-coin',
    'USDT': 'tether',
    'RAY': 'raydium',
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'BNB': 'binancecoin',
    'BONK': 'bonk',
    'JUP': 'jupiter-exchange-solana',
    'WIF': 'dogwifcoin',
    'ORCA': 'orca',
    'MNGO': 'mango-markets',
    'SRM': 'serum',
    'STEP': 'step-finance',
  };

  constructor(private readonly configService: ConfigService) {
    this.coinMarketCapApiKey = this.configService.get<string>('COINMARKETCAP_API_KEY');
  }

  // ========================================
  // PUBLIC METHODS
  // ========================================

  /**
   * Получить цены токенов (с кэшированием)
   */
  async getTokenPrices(symbols: string): Promise<Record<string, number>> {
    const symbolArray = symbols.split(',').map(s => s.trim());
    const prices: Record<string, number> = {};
    const symbolsToFetch: string[] = [];

    // Проверяем кэш
    for (const symbol of symbolArray) {
      const cached = this.getCachedPrice(symbol);
      
      if (cached !== null) {
        prices[symbol] = cached;
        this.logger.log(`[CACHE HIT] ${symbol}: $${cached.toFixed(2)}`);
      } else {
        symbolsToFetch.push(symbol);
      }
    }

    // Если все цены в кэше
    if (symbolsToFetch.length === 0) {
      return prices;
    }

    // Получаем свежие цены для оставшихся символов
    this.logger.log(`Fetching prices for: ${symbolsToFetch.join(', ')}`);

    try {
      const freshPrices = await this.fetchPricesFromCoinMarketCap(symbolsToFetch);
      
      // Кэшируем и добавляем в результат
      for (const symbol of symbolsToFetch) {
        const price = freshPrices[symbol] || 0;
        this.setCachedPrice(symbol, price);
        prices[symbol] = price;
      }

      return prices;

    } catch (error) {
      this.logger.error(`Failed to fetch prices: ${error.message}`);
      
      // Возвращаем 0 для символов без цены
      for (const symbol of symbolsToFetch) {
        prices[symbol] = 0;
      }

      return prices;
    }
  }

  /**
   * Получить цену одного токена
   */
  async getTokenPrice(symbol: string): Promise<number> {
    const prices = await this.getTokenPrices(symbol);
    return prices[symbol] || 0;
  }

  /**
   * Очистить кэш
   */
  clearCache(): void {
    Object.keys(this.priceCache).forEach(key => {
      delete this.priceCache[key];
    });
    this.logger.log('Price cache cleared');
  }

  /**
   * Получить статистику кэша
   */
  getCacheStats(): {
    size: number;
    symbols: string[];
    oldestEntry: number | null;
  } {
    const symbols = Object.keys(this.priceCache);
    const timestamps = symbols.map(s => this.priceCache[s].timestamp);
    const oldestEntry = timestamps.length > 0 ? Math.min(...timestamps) : null;

    return {
      size: symbols.length,
      symbols,
      oldestEntry,
    };
  }

  // ========================================
  // CACHE MANAGEMENT
  // ========================================

  /**
   * Получить цену из кэша (если не устарела)
   */
  private getCachedPrice(symbol: string): number | null {
    const cached = this.priceCache[symbol];

    if (!cached) {
      return null;
    }

    const now = Date.now();
    const age = now - cached.timestamp;

    // Проверяем не устарел ли кэш
    if (age > this.CACHE_TTL) {
      delete this.priceCache[symbol];
      return null;
    }

    return cached.price;
  }

  /**
   * Сохранить цену в кэш
   */
  private setCachedPrice(symbol: string, price: number): void {
    this.priceCache[symbol] = {
      price,
      timestamp: Date.now(),
    };
  }

  // ========================================
  // API METHODS
  // ========================================

  /**
   * Получить цены через CoinMarketCap API
   */
  private async fetchPricesFromCoinMarketCap(
    symbols: string[]
  ): Promise<Record<string, number>> {
    
    const prices: Record<string, number> = {};
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.get(
          'https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest',
          {
            params: {
              symbol: symbols.join(','),
            },
            headers: {
              'X-CMC_PRO_API_KEY': this.coinMarketCapApiKey,
            },
            timeout: 5000,
          }
        );

        // Парсим ответ
        for (const symbol of symbols) {
          const data = response.data?.data?.[symbol]?.[0];
          const price = data?.quote?.USD?.price;

          if (price) {
            prices[symbol] = parseFloat(price);
            this.logger.log(`${symbol}: $${prices[symbol].toFixed(2)}`);
          } else {
            this.logger.warn(`Price not found for ${symbol}`);
            prices[symbol] = 0;
          }
        }

        return prices;

      } catch (error) {
        if (error.response?.status === 429 && attempt < maxRetries) {
          // Rate limit - ждем и повторяем
          const delay = 1000 * attempt;
          this.logger.warn(
            `Rate limit hit, retrying in ${delay}ms (${attempt}/${maxRetries})`
          );
          await this.sleep(delay);
          continue;
        }

        this.logger.error(
          `CoinMarketCap API error (attempt ${attempt}/${maxRetries}): ${error.message}`
        );

        if (attempt >= maxRetries) {
          throw error;
        }
      }
    }

    // Если все попытки провалились
    throw new Error('Failed to fetch prices after all retries');
  }

  /**
   * Получить цены через CoinGecko API (альтернатива)
   */
  private async fetchPricesFromCoinGecko(
    symbols: string[]
  ): Promise<Record<string, number>> {
    
    const prices: Record<string, number> = {};

    // Конвертируем символы в CoinGecko IDs
    const ids = symbols
      .map(symbol => this.symbolToCoinGeckoId[symbol])
      .filter(Boolean);

    if (ids.length === 0) {
      this.logger.warn('No valid CoinGecko IDs found for symbols');
      return prices;
    }

    try {
      const response = await axios.get(
        'https://api.coingecko.com/api/v3/simple/price',
        {
          params: {
            ids: ids.join(','),
            vs_currencies: 'usd',
          },
          timeout: 5000,
        }
      );

      // Парсим ответ
      for (const symbol of symbols) {
        const coinGeckoId = this.symbolToCoinGeckoId[symbol];
        
        if (coinGeckoId) {
          const price = response.data?.[coinGeckoId]?.usd;
          
          if (price) {
            prices[symbol] = price;
            this.logger.log(`${symbol}: $${price.toFixed(2)}`);
          } else {
            prices[symbol] = 0;
          }
        } else {
          prices[symbol] = 0;
        }
      }

      return prices;

    } catch (error) {
      this.logger.error(`CoinGecko API error: ${error.message}`);
      throw error;
    }
  }

  // ========================================
  // UTILITIES
  // ========================================

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Добавить маппинг символа на CoinGecko ID
   */
  addSymbolMapping(symbol: string, coinGeckoId: string): void {
    this.symbolToCoinGeckoId[symbol] = coinGeckoId;
    this.logger.log(`Added mapping: ${symbol} -> ${coinGeckoId}`);
  }

  /**
   * Получить все доступные маппинги
   */
  getSymbolMappings(): Record<string, string> {
    return { ...this.symbolToCoinGeckoId };
  }
}