// src/liquidity-bot/services/strategies/slippage.strategy.ts

import { Injectable, Logger } from '@nestjs/common';

export interface SlippageConfig {
  initial: number;      // Начальный slippage (например, 0.05 = 5%)
  increment: number;    // Увеличение на каждой попытке
  maximum: number;      // Максимальный slippage
}

@Injectable()
export class SlippageStrategy {
  private readonly logger = new Logger(SlippageStrategy.name);

  /**
   * Рассчитать slippage для текущей попытки
   */
  calculateSlippage(attempt: number, config: SlippageConfig): number {
    const slippage = Math.min(
      config.initial + (config.increment * (attempt - 1)),
      config.maximum,
    );

    if (attempt > 1) {
      this.logger.log(
        `Slippage adjusted for attempt ${attempt}: ${(slippage * 100).toFixed(1)}%`
      );
    }

    return slippage;
  }

  /**
   * Получить стандартную конфигурацию
   */
  getDefaultConfig(): SlippageConfig {
    return {
      initial: 0.05,    // 5%
      increment: 0.025, // +2.5% на каждой попытке
      maximum: 0.15,    // Максимум 15%
    };
  }

  /**
   * Получить агрессивную конфигурацию (для retry)
   */
  getAggressiveConfig(): SlippageConfig {
    return {
      initial: 0.08,    // 8%
      increment: 0.03,  // +3% на каждой попытке
      maximum: 0.20,    // Максимум 20%
    };
  }
}