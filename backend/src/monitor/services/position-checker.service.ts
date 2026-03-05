// src/position-monitor/services/position-checker.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PositionInfo, PoolInfo } from '../../liquidity-bot/interfaces/pool-info.interface';
import { MonitorResult, MonitorConfig } from '../types/monitor.types';

@Injectable()
export class PositionCheckerService {
  private readonly logger = new Logger(PositionCheckerService.name);

  /**
   * Проверить позицию на выход из range
   */
  checkPosition(
    position: PositionInfo,
    pool: PoolInfo,
    config: MonitorConfig,
  ): MonitorResult {
    
    const { currentPrice } = pool;
    const { lower: rangeMin, upper: rangeMax } = position.priceRange;

    let priceOutOfRange = 0;
    let tokenToSwap: 'A' | 'B' | undefined;
    let shouldClose = false;
    let reason = '';

    const distanceToLowerUSD = currentPrice - rangeMin;
    const distanceToUpperUSD = rangeMax - currentPrice;

    // Проверка выхода из range
    if (currentPrice < rangeMin) {
      // Цена ниже range
      priceOutOfRange = rangeMin - currentPrice;
      tokenToSwap = 'A';

      if (priceOutOfRange >= config.outOfRangeThreshold) {
        shouldClose = true;
        reason = `Price $${currentPrice.toFixed(2)} dropped $${priceOutOfRange.toFixed(2)} below range ($${rangeMin.toFixed(2)})`;
      } else {
        reason = `Price slightly below range ($${priceOutOfRange.toFixed(2)} < threshold $${config.outOfRangeThreshold})`;
      }

    } else if (currentPrice > rangeMax) {
      // Цена выше range
      priceOutOfRange = currentPrice - rangeMax;
      tokenToSwap = 'B';

      if (priceOutOfRange >= config.outOfRangeThreshold) {
        shouldClose = true;
        reason = `Price $${currentPrice.toFixed(2)} rose $${priceOutOfRange.toFixed(2)} above range ($${rangeMax.toFixed(2)})`;
      } else {
        reason = `Price slightly above range ($${priceOutOfRange.toFixed(2)} < threshold $${config.outOfRangeThreshold})`;
      }

    } else {
      // В range
      reason = `In range ($${rangeMin.toFixed(2)} - $${rangeMax.toFixed(2)})`;
    }

    return {
      positionId: position.positionId,
      shouldClose,
      reason,
      priceOutOfRange,
      currentPrice,
      rangeMin,
      rangeMax,
      tokenToSwap,
      distanceToLowerUSD,
      distanceToUpperUSD,
    };
  }

  /**
   * Проверить нужна ли балансировка перед операцией
   */
  needsBalancing(
    solPercent: number,
    threshold: number = 70,
  ): boolean {
    return solPercent > threshold || solPercent < (100 - threshold);
  }

  /**
   * Рассчитать расстояние до границ range
   */
  calculateRangeDistances(
    currentPrice: number,
    lowerPrice: number,
    upperPrice: number,
  ): {
    toLower: number;
    toUpper: number;
    percentToLower: number;
    percentToUpper: number;
  } {
    const toLower = currentPrice - lowerPrice;
    const toUpper = upperPrice - currentPrice;
    const percentToLower = (toLower / currentPrice) * 100;
    const percentToUpper = (toUpper / currentPrice) * 100;

    return {
      toLower,
      toUpper,
      percentToLower,
      percentToUpper,
    };
  }

  /**
   * Определить здоровье позиции
   */
  assessPositionHealth(result: MonitorResult): 'healthy' | 'warning' | 'critical' {
    if (result.shouldClose) {
      return 'critical';
    }

    if (result.priceOutOfRange > 0) {
      return 'warning';
    }

    return 'healthy';
  }

  /**
   * Логировать статус позиции
   */
  logPositionStatus(result: MonitorResult): void {
    const health = this.assessPositionHealth(result);
    const emoji = health === 'healthy' ? '✓' : health === 'warning' ? '⚠️' : '❌';

    this.logger.log(`${emoji} ${result.positionId.slice(0, 8)}... - ${result.reason}`);

    if (result.distanceToLowerUSD !== undefined && result.distanceToUpperUSD !== undefined) {
      this.logger.debug(
        `   Distance: $${result.distanceToLowerUSD.toFixed(2)} from lower, ` +
        `$${result.distanceToUpperUSD.toFixed(2)} from upper`
      );
    }
  }
}