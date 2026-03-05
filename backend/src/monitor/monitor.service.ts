import { Injectable, Logger } from '@nestjs/common';
import { LiquidityBotService } from '../liquidity-bot/liquidity-bot.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SwapService } from '../swap/swap.service';
import { PoolInfo, PositionInfo } from '../liquidity-bot/interfaces/pool-info.interface';
import { PositionConfig, MonitorResult } from './interfaces/monitor.interface';

@Injectable()
export class PositionMonitorService {
  private readonly logger = new Logger(PositionMonitorService.name);
  private isMonitoring = false;
  private positionConfigs = new Map<string, PositionConfig>();
  
  // ✅ Трекинг попыток добавления ликвидности для каждой позиции
  private liquidityAttempts = new Map<string, {
    successfulAdds: number;
    lastAttempt: Date;
    shouldRetry: boolean;
  }>();
  
  private readonly CONFIG = {
    // Мониторинг
    OUT_OF_RANGE_THRESHOLD: 0.1,  // $0.1 за пределами range
    PRICE_RANGE_PERCENT: 5,
    
    // Свапы
    MIN_SLIPPAGE: 0.001,
    MAX_SLIPPAGE: 0.05,
    MAX_SWAP_ATTEMPTS: 5,
    RETRY_DELAY_MS: 10000,
    MAX_LOSS_USD: 10,                    // Максимум $9 потерь
    MAX_SWAP_WAIT_TIME_MS: 800000,      // ✅ Ждем максимум 5 минут
    PRICE_CHECK_INTERVAL_MS: 5000,     // ✅ Проверяем цену каждые 10 секунд
   ACCEPTABLE_LOSS_USD: 10,             // ✅ Если потери < $7 - свапаем сразу
  
  // Балансировка
  BALANCE_TOLERANCE: 5,   
    
    // ✅ Добавление ликвидности с умной логикой
    TARGET_RESERVE_SOL: 0.13,      // ~$30 при цене $130
  TARGET_RESERVE_USDC: 30,       // $30 в USDC
  MIN_RESERVE_SOL: 0.1,         // Минимум SOL (не трогаем)
  MIN_RESERVE_USDC: 20,          // Минимум USDC (не трогаем)
  
  // Добавление ликвидности
  MIN_ADD_AMOUNT_SOL: 0.3,       // Минимум для добавления
  MAX_ADD_ITERATIONS: 5,         // ✅ 5 итераций (было 3)
  ADD_LIQUIDITY_PERCENT: 0.75,   // ✅ 60% от excess (было 85%)
  CRITICAL_IMBALANCE_THRESHOLD: 70, // ✅ Swap только если баланс >70% или <30%
    CONFIRM_DELAY_MS: 3000,
  };
  
  private monitoringStats = {
    lastCheck: null as Date | null,
    positionsChecked: 0,
    positionsClosed: 0,
    swapsExecuted: 0,
    positionsReopened: 0,
    liquidityAdded: 0,
    liquidityRetries: 0,
    errors: 0,
  };

  constructor(
    private readonly liquidityBotService: LiquidityBotService,
    private readonly swapService: SwapService
  ) {}

  async startMonitoring() {
    if (this.isMonitoring) {
      this.logger.warn('Monitoring is already active');
      return;
    }

    this.isMonitoring = true;
    this.logger.log('🚀 Position monitoring started');
    
    await this.loadExistingPositions();
    await this.checkAllPositions();
  }

  stopMonitoring() {
    this.isMonitoring = false;
    this.logger.log('⏸️ Monitoring stopped');
  }

  // ========================================
  // ЗАГРУЗКА СУЩЕСТВУЮЩИХ ПОЗИЦИЙ
  // ========================================

  private async loadExistingPositions() {
    try {
      const positions = await this.liquidityBotService.getCLMMPositions();
      
      for (const { position, pool } of positions) {
        const currentPrice = pool.currentPrice;
        const lowerDiff = Math.abs((currentPrice - position.priceRange.lower) / currentPrice);
        const upperDiff = Math.abs((position.priceRange.upper - currentPrice) / currentPrice);
        const avgPercent = ((lowerDiff + upperDiff) / 2) * 100;
        
        this.positionConfigs.set(position.positionId, {
          poolId: pool.poolId,
          priceRangePercent: Math.round(avgPercent),
          initialInputAmount: parseFloat(position.baseAmount),
        });
        
        this.logger.log(`Loaded: ${position.positionId.slice(0, 8)}... range ${avgPercent.toFixed(0)}%`);
      }
    } catch (error) {
      this.logger.error('Failed to load positions:', error.message);
    }
  }

  // ========================================
  // ОСНОВНОЙ ЦИКЛ МОНИТОРИНГА
  // ========================================

  @Cron(CronExpression.EVERY_MINUTE)
  async checkAllPositions() {
    if (!this.isMonitoring) return;

    this.monitoringStats.lastCheck = new Date();
    
    try {
      this.logger.log('='.repeat(70));
      this.logger.log(`🔍 MONITORING - ${new Date().toISOString()}`);
      this.logger.log('='.repeat(70));
      
      const positions = await this.liquidityBotService.getCLMMPositions();
      
      if (positions.length === 0) {
        this.logger.log('No positions to monitor');
        return;
      }

      this.logger.log(`Found ${positions.length} positions`);
      this.monitoringStats.positionsChecked += positions.length;

      for (const { position, pool } of positions) {
        try {
          // ✅ Проверяем нужно ли добавить ликвидность (даже если позиция здорова)
          await this.checkAndAddLiquidityIfNeeded(position.positionId, pool);
          
          // Проверяем выход из range
          const result = this.checkPosition(position, pool);

          if (result.shouldClose) {
            this.logger.warn(`⚠️ ${position.positionId.slice(0, 8)}... OUT OF RANGE`);
            this.logger.warn(`   ${result.reason}`);
            await this.handlePositionRebalance(result, pool);
          } else {
            this.logger.log(`✓ ${position.positionId.slice(0, 8)}... HEALTHY`);
            
            if (result.distanceToLowerUSD !== undefined && result.distanceToUpperUSD !== undefined) {
              this.logger.debug(`   Distance: $${result.distanceToLowerUSD.toFixed(2)} from lower, $${result.distanceToUpperUSD.toFixed(2)} from upper`);
            }
          }
        } catch (error) {
          this.logger.error(`Error checking position: ${error.message}`);
          this.monitoringStats.errors++;
        }
      }

      this.logStats(positions.length);
      
    } catch (error) {
      this.logger.error('Monitoring cycle error:', error);
      this.monitoringStats.errors++;
    }
  }

  // ========================================
  // ПРОВЕРКА ПОЗИЦИИ (ПОРОГ $0.1)
  // ========================================

  private checkPosition(position: PositionInfo, pool: PoolInfo): MonitorResult {
    const { currentPrice } = pool;
    const { lower: rangeMin, upper: rangeMax } = position.priceRange;

    let priceOutOfRange = 0;
    let tokenToSwap: 'A' | 'B' | undefined;
    let shouldClose = false;
    let reason = '';

    const distanceToLowerUSD = currentPrice - rangeMin;
    const distanceToUpperUSD = rangeMax - currentPrice;

    if (currentPrice < rangeMin) {
      priceOutOfRange = rangeMin - currentPrice;
      tokenToSwap = 'A';
      
      if (priceOutOfRange >= this.CONFIG.OUT_OF_RANGE_THRESHOLD) {
        shouldClose = true;
        reason = `Price $${currentPrice.toFixed(2)} dropped $${priceOutOfRange.toFixed(2)} below range ($${rangeMin.toFixed(2)})`;
      } else {
        reason = `Price slightly below range ($${priceOutOfRange.toFixed(2)} < threshold $${this.CONFIG.OUT_OF_RANGE_THRESHOLD})`;
      }
    } else if (currentPrice > rangeMax) {
      priceOutOfRange = currentPrice - rangeMax;
      tokenToSwap = 'B';
      
      if (priceOutOfRange >= this.CONFIG.OUT_OF_RANGE_THRESHOLD) {
        shouldClose = true;
        reason = `Price $${currentPrice.toFixed(2)} rose $${priceOutOfRange.toFixed(2)} above range ($${rangeMax.toFixed(2)})`;
      } else {
        reason = `Price slightly above range ($${priceOutOfRange.toFixed(2)} < threshold $${this.CONFIG.OUT_OF_RANGE_THRESHOLD})`;
      }
    } else {
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

  // ========================================
  // ✅ УМНАЯ ПРОВЕРКА И ДОБАВЛЕНИЕ ЛИКВИДНОСТИ
  // ========================================

  private async checkAndAddLiquidityIfNeeded(positionId: string, pool: PoolInfo) {
    const attemptData = this.liquidityAttempts.get(positionId);
    
    // Если нет данных о попытках - позиция только что создана, пропускаем
    if (!attemptData) {
      return;
    }
    
    // ✅ Если первая попытка была неудачной - пробуем агрессивно добавить
    if (attemptData.shouldRetry && attemptData.successfulAdds === 0) {
      const timeSinceLastAttempt = Date.now() - attemptData.lastAttempt.getTime();
      
      // Ждем минимум 1 минуту между попытками
      if (timeSinceLastAttempt < 60000) {
        return;
      }
      
      this.logger.log('');
      this.logger.log('💰 RETRY: Adding remaining liquidity (aggressive mode)');
      this.logger.log(`   Position: ${positionId.slice(0, 8)}...`);
      
      const baseSymbol = this.normalizeSymbol(pool.baseMint);
      const quoteSymbol = this.normalizeSymbol(pool.quoteMint);
      
      await this.addRemainingLiquidityIteratively(
        positionId,
        pool,
        baseSymbol,
        quoteSymbol,
        true // ✅ Агрессивный режим
      );
    }
  }

  // ========================================
  // ЦИКЛ РЕБАЛАНСИРОВКИ
  // ========================================

  // ========================================
  // БАЛАНСИРОВКА ТОКЕНОВ
  // ========================================

  private calculateDynamicSlippage(swapValueUSD: number): number {
    const dynamicSlippage = this.CONFIG.MAX_LOSS_USD / swapValueUSD;
    return Math.max(
      this.CONFIG.MIN_SLIPPAGE,
      Math.min(this.CONFIG.MAX_SLIPPAGE, dynamicSlippage)
    );
  }

  private async performRebalanceSwapWithRetry(pool: PoolInfo): Promise<boolean> {
    for (let attempt = 1; attempt <= this.CONFIG.MAX_SWAP_ATTEMPTS; attempt++) {
      try {
        this.logger.log(`Swap attempt ${attempt}/${this.CONFIG.MAX_SWAP_ATTEMPTS}`);
        
        const result = await this.performRebalanceSwap(pool);
        
        if (result) {
          return true;
        }
        
        if (attempt < this.CONFIG.MAX_SWAP_ATTEMPTS) {
          this.logger.log(`⏳ Waiting ${this.CONFIG.RETRY_DELAY_MS / 1000}s...`);
          await this.sleep(this.CONFIG.RETRY_DELAY_MS);
        }
        
      } catch (error) {
        this.logger.warn(`Attempt ${attempt} failed: ${error.message}`);
        
        if (error.message?.toLowerCase().includes('slippage')) {
          if (attempt < this.CONFIG.MAX_SWAP_ATTEMPTS) {
            await this.sleep(this.CONFIG.RETRY_DELAY_MS);
            continue;
          }
        }
        
        break;
      }
    }
    
    this.logger.warn(`⚠️ Swap incomplete after ${this.CONFIG.MAX_SWAP_ATTEMPTS} attempts`);
    return false;
  }

  private async performRebalanceSwapWithPriceWaiting(pool: PoolInfo): Promise<boolean> {
  this.logger.log('');
  this.logger.log('💱 SMART SWAP WITH PRICE WAITING');
  this.logger.log('');
  
  const baseSymbol = this.normalizeSymbol(pool.baseMint);
  const quoteSymbol = this.normalizeSymbol(pool.quoteMint);
  
  // 1. Получаем текущие балансы
  const balances = await this.liquidityBotService.getBalanceByPool(pool.poolId);
  const baseBalance = balances[baseSymbol]?.amount || 0;
  const quoteBalance = balances[quoteSymbol]?.amount || 0;
  
  const prices = await this.liquidityBotService.getTokenPrices(`${baseSymbol},${quoteSymbol}`);
  const basePriceUSD = prices[baseSymbol] || 0;
  const quotePriceUSD = prices[quoteSymbol] || 1;
  
  if (basePriceUSD === 0) {
    throw new Error(`Cannot get price for ${baseSymbol}`);
  }
  
  const baseValueUSD = baseBalance * basePriceUSD;
  const quoteValueUSD = quoteBalance * quotePriceUSD;
  const totalValueUSD = baseValueUSD + quoteValueUSD;
  
  const basePercent = (baseValueUSD / totalValueUSD) * 100;
  
  this.logger.log(`📊 Current distribution: ${basePercent.toFixed(1)}% ${baseSymbol} / ${(100 - basePercent).toFixed(1)}% ${quoteSymbol}`);
  this.logger.log(`   Total: $${totalValueUSD.toFixed(2)}`);
  
  // ✅ Проверяем нужна ли балансировка (с толерантностью 5%)
  if (basePercent >= 45 && basePercent <= 55) {
    this.logger.log('✅ Balance acceptable (45-55%), no swap needed');
    return true;
  }
  
  // 2. Рассчитываем параметры swap
  let inputMint: string;
  let swapAmount: number;
  let tokenName: string;
  let direction: 'SOL→USDC' | 'USDC→SOL';
  
  if (basePercent > 55) {
    // Избыток SOL → свапаем SOL → USDC
    const excessUSD = baseValueUSD - (totalValueUSD * 0.5);
    swapAmount = (excessUSD / basePriceUSD) * 0.95; // 95% от excess
    inputMint = pool.baseMintPublicKey;
    tokenName = baseSymbol;
    direction = 'SOL→USDC';
  } else {
    // Избыток USDC → свапаем USDC → SOL
    const excessUSD = quoteValueUSD - (totalValueUSD * 0.5);
    swapAmount = (excessUSD / quotePriceUSD) * 0.95;
    inputMint = pool.quoteMintPublicKey;
    tokenName = quoteSymbol;
    direction = 'USDC→SOL';
  }
  
  const swapValueUSD = swapAmount * (tokenName === baseSymbol ? basePriceUSD : quotePriceUSD);
  
  this.logger.log('');
  this.logger.log(`⚖️ Need to swap: ${swapAmount.toFixed(4)} ${tokenName} ($${swapValueUSD.toFixed(2)})`);
  this.logger.log(`   Direction: ${direction}`);
  this.logger.log('');
  
  // 3. ✅ ЖДЕМ ЛУЧШЕЙ ЦЕНЫ
  const startTime = Date.now();
  const maxWaitTime = this.CONFIG.MAX_SWAP_WAIT_TIME_MS;
  let bestQuote: {
    lossUSD: number;
    slippage: number;
    timestamp: number;
  } | null = null;
  
  let attempt = 0;
  
  while (Date.now() - startTime < maxWaitTime) {
    attempt++;
    
    try {
      // Получаем quote (всегда БЕЗ slippage)
      const quote = await this.swapService.getSwapQuote({
        poolId: pool.poolId,
        inputMint,
        inputAmount: swapAmount,
      });

      // Рассчитываем в USD
      const inputValueUSD = swapAmount * (tokenName === baseSymbol ? basePriceUSD : quotePriceUSD);
      const expectedOutputValueUSD = parseFloat(quote.expectedOutput) *
        (tokenName === baseSymbol ? quotePriceUSD : basePriceUSD);

      const lossUSD = inputValueUSD - expectedOutputValueUSD;
      const lossPercent = (lossUSD / inputValueUSD) * 100;

      this.logger.log(`[${attempt}] Quote check:`);
      this.logger.log(`   Input: $${inputValueUSD.toFixed(2)}`);
      this.logger.log(`   Expected output: $${expectedOutputValueUSD.toFixed(2)} (${quote.expectedOutput} ${tokenName === baseSymbol ? quoteSymbol : baseSymbol})`);
      this.logger.log(`   Loss: $${lossUSD.toFixed(2)} (${lossPercent.toFixed(2)}%)`);
      this.logger.log(`   Price impact: ${quote.priceImpact.toFixed(3)}%`);
      
      
      // Сохраняем лучший результат
      if (!bestQuote || lossUSD < bestQuote.lossUSD) {
        bestQuote = {
          lossUSD,
          slippage: this.calculateDynamicSlippage(swapValueUSD),
          timestamp: Date.now(),
        };
        this.logger.log(`   ✅ New best: $${lossUSD.toFixed(2)}`);
      }
      
      // ✅ Если потери приемлемые - свапаем СРАЗУ
      if (lossUSD <= this.CONFIG.ACCEPTABLE_LOSS_USD) {
        this.logger.log('');
        this.logger.log(`✅ ACCEPTABLE LOSS: $${lossUSD.toFixed(2)} <= $${this.CONFIG.ACCEPTABLE_LOSS_USD}`);
        this.logger.log(`   Executing swap immediately`);
        this.logger.log('');
        
        return await this.executeSwap({
          poolId: pool.poolId,
          inputMint,
          inputAmount: swapAmount,
          slippage: bestQuote.slippage,
        });
      }
      
      // ✅ Если потери > MAX - ждем дальше
      if (lossUSD > this.CONFIG.MAX_LOSS_USD) {
        const timeLeft = maxWaitTime - (Date.now() - startTime);
        this.logger.log(`   ⏳ Loss too high, waiting... (${Math.round(timeLeft / 1000)}s left)`);
      } else {
        // Потери между ACCEPTABLE и MAX - можно свапнуть но ждем еще
        this.logger.log(`   🤔 Loss acceptable but not optimal, checking again...`);
      }
      
      // Ждем перед следующей проверкой
      await this.sleep(this.CONFIG.PRICE_CHECK_INTERVAL_MS);
      
    } catch (error) {
      this.logger.warn(`Quote check failed: ${error.message}`);
      await this.sleep(this.CONFIG.PRICE_CHECK_INTERVAL_MS);
    }
  }
  
  // 4. Время вышло - используем лучший найденный результат
  this.logger.log('');
  this.logger.log('⏰ Wait time expired');
  
  if (bestQuote && bestQuote.lossUSD <= this.CONFIG.MAX_LOSS_USD) {
    this.logger.log(`✅ Using best quote: $${bestQuote.lossUSD.toFixed(2)} loss`);
    this.logger.log('');
    
    return await this.executeSwap({
      poolId: pool.poolId,
      inputMint,
      inputAmount: swapAmount,
      slippage: bestQuote.slippage,
    });
  } else {
    this.logger.error(`❌ No acceptable price found within ${maxWaitTime / 1000}s`);
    if (bestQuote) {
      this.logger.error(`   Best loss: $${bestQuote.lossUSD.toFixed(2)} > max $${this.CONFIG.MAX_LOSS_USD}`);
    }
    this.logger.log('');
    this.logger.log('⚠️ SKIPPING SWAP - будем работать с небалансированными токенами');
    
    return false;
  }
}

// 3. ОБНОВЛЕННЫЙ rebalance цикл
private async handlePositionRebalance(monitorResult: MonitorResult, pool: PoolInfo) {
  const { positionId } = monitorResult;
  
  this.logger.log('');
  this.logger.log('🔄 REBALANCE CYCLE');
  this.logger.log(`Position: ${positionId.slice(0, 8)}...`);
  
  const config = this.positionConfigs.get(positionId);
  if (!config) {
    this.logger.error('No config found');
    return;
  }
  
  try {
    // Шаг 1: Закрыть
    this.logger.log('📍 STEP 1/3: Closing position');
    const closeResult = await this.liquidityBotService.closePositionWithRetry(positionId);
    
    if (!closeResult.success) {
      throw new Error('Failed to close position');
    }

    this.logger.log(`✅ Closed: ${closeResult.txId || 'done'}`);
    this.monitoringStats.positionsClosed++;
    this.positionConfigs.delete(positionId);
    this.liquidityAttempts.delete(positionId);
    await this.sleep(this.CONFIG.CONFIRM_DELAY_MS);

    // Шаг 2: ✅ НОВОЕ - Балансировка с ожиданием лучшей цены
    this.logger.log('📍 STEP 2/3: Balancing tokens (waiting for good price)');
    let swapSuccess = await this.performRebalanceSwapWithPriceWaiting(pool);

    // Если первая попытка failed - пробуем еще раз
    if (!swapSuccess) {
      this.logger.warn('⚠️ First swap attempt failed - retrying...');
      await this.sleep(2000); // Небольшая задержка перед повтором
      swapSuccess = await this.performRebalanceSwapWithPriceWaiting(pool);

      if (!swapSuccess) {
        this.logger.warn('⚠️ Second swap attempt also failed - continuing with unbalanced tokens');
      }
    }

    await this.sleep(this.CONFIG.CONFIRM_DELAY_MS);

    // Шаг 3: Открыть новую (с любым балансом)
    this.logger.log('📍 STEP 3/3: Opening new position');
    await this.reopenPositionWithFallback(pool, config);

    this.logger.log('✅ REBALANCE COMPLETE');

  } catch (error) {
    this.logger.error('❌ REBALANCE FAILED');
    this.logger.error(`Error: ${error.message}`);
    this.monitoringStats.errors++;
  }
}

  private async performRebalanceSwap(pool: PoolInfo): Promise<boolean> {
    const baseSymbol = this.normalizeSymbol(pool.baseMint);
    const quoteSymbol = this.normalizeSymbol(pool.quoteMint);
    
    const balances = await this.liquidityBotService.getBalanceByPool(pool.poolId);
    const baseBalance = balances[baseSymbol]?.amount || 0;
    const quoteBalance = balances[quoteSymbol]?.amount || 0;
    
    const prices = await this.liquidityBotService.getTokenPrices(`${baseSymbol},${quoteSymbol}`);
    const basePriceUSD = prices[baseSymbol] || 0;
    const quotePriceUSD = prices[quoteSymbol] || 1;
    
    if (basePriceUSD === 0) {
      throw new Error(`Cannot get price for ${baseSymbol}`);
    }
    
    const baseValueUSD = baseBalance * basePriceUSD;
    const quoteValueUSD = quoteBalance * quotePriceUSD;
    const totalValueUSD = baseValueUSD + quoteValueUSD;
    
    if (totalValueUSD < 1) {
      this.logger.warn('Total value too low');
      return false;
    }
    
    const basePercent = (baseValueUSD / totalValueUSD) * 100;
    
    this.logger.log(`📊 Distribution: ${basePercent.toFixed(1)}% ${baseSymbol} / ${(100 - basePercent).toFixed(1)}% ${quoteSymbol}`);
    this.logger.log(`   Total: $${totalValueUSD.toFixed(2)}`);
    
    if (Math.abs(basePercent - 50) <= 10) {
      this.logger.log('✅ Balance optimal');
      return true;
    }
    
    let swapValueUSD: number;
    let inputMint: string;
    let swapAmount: number;
    let tokenName: string;
    
    if (basePercent > 60) {
      const excessUSD = baseValueUSD - (totalValueUSD * 0.5);
      swapAmount = (excessUSD / basePriceUSD) * 0.90;
      swapValueUSD = swapAmount * basePriceUSD;
      inputMint = pool.baseMintPublicKey;
      tokenName = baseSymbol;
    } else {
      const excessUSD = quoteValueUSD - (totalValueUSD * 0.5);
      swapAmount = (excessUSD / quotePriceUSD) * 0.90;
      swapValueUSD = swapAmount * quotePriceUSD;
      inputMint = pool.quoteMintPublicKey;
      tokenName = quoteSymbol;
    }
    
    const slippage = this.calculateDynamicSlippage(swapValueUSD);
    
    this.logger.log('');
    this.logger.log(`⚖️ Swap: ${swapAmount.toFixed(4)} ${tokenName}`);
    this.logger.log(`   Value: $${swapValueUSD.toFixed(2)}, Slippage: ${(slippage * 100).toFixed(2)}%`);
    
    return await this.executeSwap({
      poolId: pool.poolId,
      inputMint,
      inputAmount: swapAmount,
      slippage,
    });
  }

  private async balanceTokensForIncrease(
    pool: PoolInfo,
    solBalance: number,
    usdcBalance: number,
    solValueUSD: number,
    usdcValueUSD: number,
    solPriceUSD: number,
    usdcPriceUSD: number
  ): Promise<boolean> {
    try {
      const totalValueUSD = solValueUSD + usdcValueUSD;
      const solPercent = (solValueUSD / totalValueUSD) * 100;
      
      if (solPercent > 60) {
        const excessUSD = solValueUSD - (totalValueUSD * 0.5);
        const swapAmount = (excessUSD / solPriceUSD) * 0.95;
        const swapValueUSD = swapAmount * solPriceUSD;
        const slippage = this.calculateDynamicSlippage(swapValueUSD);
        
        this.logger.log(`    Swap ${swapAmount.toFixed(4)} SOL → USDC (${(slippage * 100).toFixed(2)}%)`);
        
        return await this.executeSwap({
          poolId: pool.poolId,
          inputMint: pool.baseMintPublicKey,
          inputAmount: swapAmount,
          slippage,
        });
      } else {
        const excessUSD = usdcValueUSD - (totalValueUSD * 0.5);
        const swapAmount = (excessUSD / usdcPriceUSD) * 0.95;
        const swapValueUSD = swapAmount * usdcPriceUSD;
        const slippage = this.calculateDynamicSlippage(swapValueUSD);
        
        this.logger.log(`    Swap ${swapAmount.toFixed(2)} USDC → SOL (${(slippage * 100).toFixed(2)}%)`);
        
        return await this.executeSwap({
          poolId: pool.poolId,
          inputMint: pool.quoteMintPublicKey,
          inputAmount: swapAmount,
          slippage,
        });
      }
    } catch (error) {
      this.logger.error(`    Swap failed: ${error.message}`);
      return false;
    }
  }

  // ========================================
  // ПЕРЕОТКРЫТИЕ ПОЗИЦИИ
  // ========================================

  private async reopenPositionWithFallback(pool: PoolInfo, oldConfig: PositionConfig) {
    const baseSymbol = this.normalizeSymbol(pool.baseMint);
    const quoteSymbol = this.normalizeSymbol(pool.quoteMint);
    
    const balances = await this.liquidityBotService.getBalanceByPool(pool.poolId);
    const solBalance = balances[baseSymbol]?.amount || 0;
    const usdcBalance = balances[quoteSymbol]?.amount || 0;
    
    this.logger.log(`Balance: ${solBalance.toFixed(4)} ${baseSymbol}, ${usdcBalance.toFixed(2)} ${quoteSymbol}`);

    // ✅ УБРАЛИ SWAP ЗДЕСЬ - он уже был сделан в handlePositionRebalance
    // Балансировка происходит только ОДИН РАЗ перед открытием позиции

    // Создание позиции
    let positionMint: string | null = null;
    
    const strategies = [
      { name: 'Calculated', multiplier: null },
      { name: '70%', multiplier: 0.70 },
      { name: '50%', multiplier: 0.50 },
    ];
    
    const freshBalances = await this.liquidityBotService.getBalanceByPool(pool.poolId);
    const currentSolBalance = freshBalances[baseSymbol]?.amount || 0;
    const currentUsdcBalance = freshBalances[quoteSymbol]?.amount || 0;
    
    for (const strategy of strategies) {
      if (positionMint !== null) break;
      
      try {
        this.logger.log(`Strategy: ${strategy.name}`);
        
        let inputAmount: number;
        
        if (strategy.multiplier === null) {
          const result = await this.liquidityBotService.calculateMaxSafeInputAmount(
            pool.poolId, currentSolBalance, currentUsdcBalance, 1
          );
          inputAmount = result.inputAmount;
        } else {
          inputAmount = currentSolBalance * strategy.multiplier;
        }
        
        this.logger.log(`Input: ${inputAmount.toFixed(4)} ${baseSymbol}`);
        
        const result = await this.liquidityBotService.setupLiquidityPositionWithFallback({
          poolId: pool.poolId,
          baseMint: pool.baseMintPublicKey,
          quoteMint: pool.quoteMintPublicKey,
          inputAmount,
          priceRangePercent: this.CONFIG.PRICE_RANGE_PERCENT
        });
        
        this.logger.log(`✅ Position created: ${result.mint.slice(0, 8)}...`);
        
        positionMint = result.mint;
        
        this.positionConfigs.set(result.mint, {
          poolId: pool.poolId,
          priceRangePercent: this.CONFIG.PRICE_RANGE_PERCENT,
          initialInputAmount: inputAmount,
        });
        
        this.monitoringStats.positionsReopened++;
        break;
        
      } catch (error) {
        this.logger.warn(`Strategy ${strategy.name} failed: ${error.message}`);
      }
    }
    
    if (!positionMint) {
      throw new Error('All strategies failed');
    }
    
    this.logger.log('⏳ Waiting 5s for indexing...');
    await this.sleep(5000);
    
    // ✅ Добавление остатков (обычный режим)
    await this.addRemainingLiquidityIteratively(
      positionMint,
      pool,
      baseSymbol,
      quoteSymbol,
      false // Не агрессивный режим
    );
  }

  // ========================================
  // ✅ УМНОЕ ДОБАВЛЕНИЕ ЛИКВИДНОСТИ
  // ========================================
private async addLiquidityWithRetry(
  positionMint: string,
  solAmount: number,
  iteration: number
): Promise<boolean> {
  this.logger.log(`  ➕ Attempting to add: ${solAmount.toFixed(4)} SOL`);
  
  const MAX_RETRIES = 3;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      this.logger.log(`     Attempt ${attempt}/${MAX_RETRIES}`);
      
      // ✅ ПЕРЕДАЕМ SLIPPAGE В МЕТОД
      const txId = await this.liquidityBotService.increaseLiquidity(
        positionMint,
        solAmount,
      );
      
      if (!txId) {
        throw new Error('No txId returned');
      }
      
      this.logger.log(`     ✅ TX: ${txId.slice(0, 8)}...`);
      await this.sleep(3000);
      
      return true;
      
    } catch (error) {
      this.monitoringStats.liquidityRetries++;
      this.logger.error(`     ❌ Attempt ${attempt} failed: ${error.message}`);
      
      // Если slippage error - увеличиваем slippage и повторяем
      if (error.message?.toLowerCase().includes('slippage')) {
        if (attempt < MAX_RETRIES) {
       
          
          try {
            const txId = await this.liquidityBotService.increaseLiquidity(
              positionMint,
              solAmount,
            );
            
            if (txId) {
              this.logger.log(`     ✅ Success with higher slippage: ${txId.slice(0, 8)}...`);
              await this.sleep(3000);
              return true;
            }
          } catch (retryError) {
            this.logger.error(`     Retry with higher slippage failed: ${retryError.message}`);
          }
        }
      }
      
      // Критические ошибки
      if (error.message?.includes('below minimum') ||
          error.message?.includes('insufficient funds')) {
        this.logger.warn(`     Critical error, no retry`);
        return false;
      }
      
      if (attempt === MAX_RETRIES) {
        return false;
      }
      
      await this.sleep(2000 * attempt);
    }
  }
  
  return false;
}

// 3. ПРАВИЛЬНЫЙ РАСЧЕТ EXCESS
private async addRemainingLiquidityIteratively(
  positionMint: string,
  pool: PoolInfo,
  baseSymbol: string,
  quoteSymbol: string,
  aggressiveMode: boolean = false
) {
  this.logger.log('');
  this.logger.log('💰 Adding remaining liquidity');
  this.logger.log(`   Target reserves: ${this.CONFIG.TARGET_RESERVE_SOL} SOL + $${this.CONFIG.TARGET_RESERVE_USDC} USDC`);
  this.logger.log('');
  
  let totalAdded = 0;
  let successfulAdds = 0;
  let consecutiveFailures = 0;
  const MAX_CONSECUTIVE_FAILURES = 2;
  
  for (let iteration = 1; iteration <= this.CONFIG.MAX_ADD_ITERATIONS; iteration++) {
    try {
      const balances = await this.liquidityBotService.getBalanceByPool(pool.poolId);
      const solBalance = balances[baseSymbol]?.amount || 0;
      const usdcBalance = balances[quoteSymbol]?.amount || 0;
      
      const prices = await this.liquidityBotService.getTokenPrices(`${baseSymbol},${quoteSymbol}`);
      const solPriceUSD = prices[baseSymbol] || 0;
      
      if (solPriceUSD === 0) {
        this.logger.warn('Cannot get prices');
        break;
      }
      
      // ✅ ПРАВИЛЬНЫЙ РАСЧЕТ EXCESS для ОБОИХ токенов
      const excessSOL = Math.max(0, solBalance - this.CONFIG.TARGET_RESERVE_SOL);
      const excessUSDC = Math.max(0, usdcBalance - this.CONFIG.TARGET_RESERVE_USDC);
      
      const excessSOL_USD = excessSOL * solPriceUSD;
      const totalExcessUSD = excessSOL_USD + excessUSDC;
      
      this.logger.log(`Iteration ${iteration}:`);
      this.logger.log(`  SOL: ${solBalance.toFixed(4)} (excess: ${excessSOL.toFixed(4)} = $${excessSOL_USD.toFixed(2)})`);
      this.logger.log(`  USDC: ${usdcBalance.toFixed(2)} (excess: $${excessUSDC.toFixed(2)})`);
      this.logger.log(`  Total excess: $${totalExcessUSD.toFixed(2)}`);
      
      // ✅ СТОП если достигли целевых резервов
      if (totalExcessUSD < 10) {
        this.logger.log(`✅ Target reserves reached`);
        break;
      }
      
      if (solBalance < this.CONFIG.MIN_RESERVE_SOL) {
        this.logger.warn(`⚠️ SOL below minimum reserve`);
        break;
      }
      
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        this.logger.error(`❌ Too many failures, stopping`);
        break;
      }
      
      // ✅ Проверка баланса между токенами
      const solValueUSD = solBalance * solPriceUSD;
      const totalValueUSD = solValueUSD + usdcBalance;
      const solPercent = totalValueUSD > 0 ? (solValueUSD / totalValueUSD) * 100 : 0;
      
      this.logger.log(`  Distribution: ${solPercent.toFixed(1)}% SOL / ${(100 - solPercent).toFixed(1)}% USDC`);

      // ✅ БАЛАНСИРОВКА только при критичном дисбалансе
      // Обычная балансировка уже была сделана перед открытием позиции
      const minThreshold = 100 - this.CONFIG.CRITICAL_IMBALANCE_THRESHOLD;
      if (solPercent > this.CONFIG.CRITICAL_IMBALANCE_THRESHOLD || solPercent < minThreshold) {
        this.logger.log(`  ⚖️ Critical imbalance detected, rebalancing...`);

        const swapSuccess = await this.balanceTokensForIncrease(
          pool, solBalance, usdcBalance,
          solValueUSD, usdcBalance, solPriceUSD, 1
        );

        if (swapSuccess) {
          await this.sleep(this.CONFIG.CONFIRM_DELAY_MS);
          continue;
        } else {
          // ✅ Если swap не удался - НЕ считаем это failure, продолжаем добавлять
          this.logger.warn(`  Rebalance swap failed, continuing with current balance`);
          await this.sleep(2000);
        }
      }
      
      // ✅ РАСЧЕТ БЕЗОПАСНОГО КОЛИЧЕСТВА для добавления
      // Берем 60% от excess и проверяем что не превысим минимальные резервы
      let solToAdd = excessSOL * this.CONFIG.ADD_LIQUIDITY_PERCENT;
      
      // Проверка что после добавления останутся минимальные резервы
      const solAfterAdd = solBalance - solToAdd;
      const solAfterAddUSD = solAfterAdd * solPriceUSD;
      
      // Нужно чтобы после добавления SOL осталось минимум MIN_RESERVE_SOL
      // И USDC будет потрачен пропорционально (примерно такая же сумма в USD)
      const expectedUSDCSpent = solToAdd * solPriceUSD; // Примерно столько USDC нужно
      const usdcAfterAdd = usdcBalance - expectedUSDCSpent;
      
      if (solAfterAdd < this.CONFIG.MIN_RESERVE_SOL) {
        this.logger.warn(`  Would leave ${solAfterAdd.toFixed(4)} SOL < minimum ${this.CONFIG.MIN_RESERVE_SOL}`);
        solToAdd = Math.max(0, solBalance - this.CONFIG.MIN_RESERVE_SOL - 0.05);
      }
      
      if (usdcAfterAdd < this.CONFIG.MIN_RESERVE_USDC) {
        this.logger.warn(`  Would leave $${usdcAfterAdd.toFixed(2)} USDC < minimum $${this.CONFIG.MIN_RESERVE_USDC}`);
        // Уменьшаем solToAdd чтобы не потратить слишком много USDC
        const maxUSDCToSpend = usdcBalance - this.CONFIG.MIN_RESERVE_USDC - 5;
        const maxSOLFromUSDC = maxUSDCToSpend / solPriceUSD;
        solToAdd = Math.min(solToAdd, maxSOLFromUSDC);
      }
      
      if (solToAdd < this.CONFIG.MIN_ADD_AMOUNT_SOL) {
        this.logger.log(`  Amount ${solToAdd.toFixed(4)} SOL < minimum ${this.CONFIG.MIN_ADD_AMOUNT_SOL}`);
        break;
      }
      
      this.logger.log(`  Will add: ${solToAdd.toFixed(4)} SOL (~$${(solToAdd * solPriceUSD).toFixed(2)})`);
      this.logger.log(`  Expected reserves after: ${solAfterAdd.toFixed(4)} SOL, $${usdcAfterAdd.toFixed(2)} USDC`);
      
      // ✅ Добавление с retry и slippage
      const success = await this.addLiquidityWithRetry(positionMint, solToAdd, iteration);
      
      if (success) {
        consecutiveFailures = 0;
        successfulAdds++;
        totalAdded += solToAdd;
        this.monitoringStats.liquidityAdded++;
        
        this.logger.log(`  ✅ Added: ${solToAdd.toFixed(4)} SOL`);
        await this.sleep(this.CONFIG.CONFIRM_DELAY_MS);
        
      } else {
        consecutiveFailures++;
        this.logger.error(`  ❌ Failed (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`);
        
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          break;
        }
        
        await this.sleep(2000);
      }
      
    } catch (error) {
      consecutiveFailures++;
      this.logger.error(`  Error: ${error.message}`);
      
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        break;
      }
      
      await this.sleep(2000);
    }
  }
  
  // Результаты
  this.liquidityAttempts.set(positionMint, {
    successfulAdds,
    lastAttempt: new Date(),
    shouldRetry: successfulAdds === 0,
  });
  
  this.logger.log('');
  this.logger.log('═'.repeat(70));
  this.logger.log('📊 LIQUIDITY SUMMARY');
  this.logger.log(`  Successful adds: ${successfulAdds}`);
  this.logger.log(`  Total added: ${totalAdded.toFixed(4)} SOL`);
  this.logger.log(`  Consecutive failures: ${consecutiveFailures}`);
  
  await this.logFinalBalance(pool, baseSymbol, quoteSymbol);
}


  private async logFinalBalance(pool: PoolInfo, baseSymbol: string, quoteSymbol: string) {
    try {
      const finalBalances = await this.liquidityBotService.getBalanceByPool(pool.poolId);
      const finalSol = finalBalances[baseSymbol]?.amount || 0;
      const finalUsdc = finalBalances[quoteSymbol]?.amount || 0;
      
      const prices = await this.liquidityBotService.getTokenPrices(baseSymbol);
      const finalSolValue = finalSol * (prices[baseSymbol] || 0);
      const finalTotal = finalSolValue + finalUsdc;
      
      this.logger.log('');
      this.logger.log('✅ Final balance:');
      this.logger.log(`   ${baseSymbol}: ${finalSol.toFixed(4)} ($${finalSolValue.toFixed(2)})`);
      this.logger.log(`   ${quoteSymbol}: ${finalUsdc.toFixed(2)}`);
      this.logger.log(`   Total: $${finalTotal.toFixed(2)}`);
      
      if (finalSol < this.CONFIG.MIN_RESERVE_SOL) {
        this.logger.warn(`   ⚠️ SOL below reserve!`);
      }
      
      this.logger.log('');
    } catch (error) {
      this.logger.error(`Failed to fetch final balance: ${error.message}`);
    }
  }

  // ========================================
  // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
  // ========================================

  private async executeSwap(params: {
    poolId: string;
    inputMint: string;
    inputAmount: number;
    slippage: number;
  }): Promise<boolean> {
    try {
      this.logger.log(`   Executing swap with ${(params.slippage * 100).toFixed(1)}% slippage...`);
      const result = await this.swapService.executeSwap(params);
      this.logger.log(`   ✅ Swap executed successfully`);
      this.logger.log(`   Input: ${result.inputAmount}`);
      this.logger.log(`   Output: ${result.outputAmount}`);
      this.monitoringStats.swapsExecuted++;
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

  private logStats(count: number) {
    this.logger.log('-'.repeat(70));
    this.logger.log(
      `📊 Checked ${count} | Closed ${this.monitoringStats.positionsClosed} | ` +
      `Reopened ${this.monitoringStats.positionsReopened} | ` +
      `Added ${this.monitoringStats.liquidityAdded} | ` +
      `Retries ${this.monitoringStats.liquidityRetries} | ` +
      `Errors ${this.monitoringStats.errors}`
    );
    this.logger.log('='.repeat(70));
  }

  getStats() {
    return {
      ...this.monitoringStats,
      isActive: this.isMonitoring,
      activePositions: this.positionConfigs.size,
      pendingRetries: Array.from(this.liquidityAttempts.entries())
        .filter(([_, data]) => data.shouldRetry)
        .length,
    };
  }

  resetStats() {
    this.monitoringStats = {
      lastCheck: null,
      positionsChecked: 0,
      positionsClosed: 0,
      swapsExecuted: 0,
      positionsReopened: 0,
      liquidityAdded: 0,
      liquidityRetries: 0,
      errors: 0,
    };
    
    this.liquidityAttempts.clear();
  }
}
