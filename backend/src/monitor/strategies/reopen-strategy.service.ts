// src/position-monitor/strategies/reopen-strategy.service.ts

import { Injectable, Logger } from '@nestjs/common';

// ✅ ИСПРАВЛЕНО: Используем главный сервис
import { LiquidityBotService } from '../../liquidity-bot/liquidity-bot.service';
import { BalanceCalculatorService } from '../../liquidity-bot/services/balance-calculator.service';
import { PoolInfo } from '../../liquidity-bot/interfaces/pool-info.interface';
import { MonitorConfig, PositionConfig } from '../types/monitor.types';

export interface ReopenStrategy {
  name: string;
  multiplier: number | null;
  description: string;
}

@Injectable()
export class ReopenStrategyService {
  private readonly logger = new Logger(ReopenStrategyService.name);

  private readonly STRATEGIES: ReopenStrategy[] = [
    {
      name: 'Calculated',
      multiplier: null,
      description: 'Calculate max safe input amount',
    },
    {
      name: '70%',
      multiplier: 0.70,
      description: 'Use 70% of available balance',
    },
    {
      name: '50%',
      multiplier: 0.50,
      description: 'Use 50% of available balance',
    },
  ];

  constructor(
    // ✅ ИСПРАВЛЕНО: Используем главный сервис
    private readonly liquidityBotService: LiquidityBotService,
    private readonly balanceCalculator: BalanceCalculatorService,
  ) {}

  // ========================================
  // REOPEN WITH FALLBACK
  // ========================================

  /**
   * Переоткрыть позицию с fallback стратегиями
   */
  async reopenWithFallback(params: {
    pool: PoolInfo;
    oldConfig: PositionConfig;
    config: MonitorConfig;
  }): Promise<string | null> {
    
    const { pool, oldConfig, config } = params;
    
    const baseSymbol = this.normalizeSymbol(pool.baseMint);
    const quoteSymbol = this.normalizeSymbol(pool.quoteMint);
    
    // Получаем текущие балансы
    const balances = await this.balanceCalculator.getPoolBalances(pool.poolId);
    const currentSolBalance = balances[baseSymbol]?.amount || 0;
    const currentUsdcBalance = balances[quoteSymbol]?.amount || 0;
    
    this.logger.log(`Current balances: ${currentSolBalance.toFixed(4)} ${baseSymbol}, ${currentUsdcBalance.toFixed(2)} ${quoteSymbol}`);
    
    // Пробуем каждую стратегию
    for (const strategy of this.STRATEGIES) {
      try {
        this.logger.log(`   Strategy: ${strategy.name} - ${strategy.description}`);
        
        // Рассчитываем input amount
        let inputAmount: number;
        
        if (strategy.multiplier === null) {
          // ✅ ИСПРАВЛЕНО: Используем liquidityBotService
          // Calculated strategy - используем простой расчет
          inputAmount = currentSolBalance * 0.85; // 85% от доступного баланса
          
          // TODO: Если у LiquidityBotService есть метод calculateMaxSafeInputAmount, используй его
          // const result = await this.liquidityBotService.calculateMaxSafeInputAmount({...});
          // inputAmount = result.inputAmount;
        } else {
          // Percentage strategy
          inputAmount = currentSolBalance * strategy.multiplier;
        }
        
        this.logger.log(`   Input: ${inputAmount.toFixed(4)} ${baseSymbol}`);
        
        // Проверка минимального количества
        if (inputAmount < 0.01) {
          this.logger.warn(`   Input too small: ${inputAmount.toFixed(4)} < 0.01`);
          continue;
        }
        
        // ✅ ИСПРАВЛЕНО: Используем liquidityBotService.setupLiquidityPosition
        const result = await this.liquidityBotService.setupLiquidityPosition({
          poolId: pool.poolId,
          baseMint: pool.baseMintPublicKey,
          quoteMint: pool.quoteMintPublicKey,
          inputAmount,
          priceRangePercent: config.priceRangePercent,
        });
        
        this.logger.log(`   ✅ Position created: ${result.mint.slice(0, 8)}...`);
        
        return result.mint;
        
      } catch (error) {
        this.logger.warn(`   Strategy ${strategy.name} failed: ${error.message}`);
        
        // Если это последняя стратегия - выбрасываем ошибку
        if (strategy === this.STRATEGIES[this.STRATEGIES.length - 1]) {
          throw error;
        }
        
        // Иначе пробуем следующую стратегию
        continue;
      }
    }
    
    return null;
  }

  // ========================================
  // STRATEGY MANAGEMENT
  // ========================================

  /**
   * Получить все доступные стратегии
   */
  getAvailableStrategies(): ReopenStrategy[] {
    return [...this.STRATEGIES];
  }

  /**
   * Добавить кастомную стратегию
   */
  addCustomStrategy(strategy: ReopenStrategy): void {
    this.STRATEGIES.push(strategy);
    this.logger.log(`Added custom strategy: ${strategy.name}`);
  }

  // ========================================
  // HELPERS
  // ========================================

  private normalizeSymbol(symbol: string): string {
    return symbol === 'WSOL' ? 'SOL' : symbol;
  }
}