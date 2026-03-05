// src/liquidity-bot/utils/liquidity-density-calculator.ts

import {
    CLMM_PROGRAM_ID,
    TickUtils,
    TickArrayLayout,
    Raydium,
    ApiV3PoolInfoConcentratedItem,
  } from '@raydium-io/raydium-sdk-v2';
  import { PublicKey } from '@solana/web3.js';
  import Decimal from 'decimal.js';
  import BN from 'bn.js';
  import { Logger } from '@nestjs/common';
  
  const logger = new Logger('LiquidityDensityCalculator');
  
  export interface TickData {
    tick: number;
    liquidityGross: BN;
    liquidityNet: BN;
    liquidityUSD: number;
  }
  
  export interface DensityResult {
    totalLiquidityUSD: number;
    tickRange: number;
    densityPerTick: number; // a(0)
    tickCount: number;
    ticks: TickData[];
  }
  
  /**
   * 🎯 ГЛАВНАЯ ФУНКЦИЯ: Точный расчет плотности ликвидности
   */
  export async function calculatePreciseLiquidityDensity({
    raydium,
    poolId,
    tickLower,
    tickUpper,
    programId = CLMM_PROGRAM_ID,
  }: {
    raydium: Raydium;
    poolId: string;
    tickLower: number;
    tickUpper: number;
    programId?: PublicKey;
  }): Promise<DensityResult> {
    logger.log('');
    logger.log('🎯 PRECISE LIQUIDITY DENSITY CALCULATION');
    logger.log(`Pool: ${poolId.slice(0, 8)}...`);
    logger.log(`Range: ${tickLower} - ${tickUpper}`);
    logger.log('');
  
    // ✅ Шаг 1: Получить полную информацию о пуле (API + RPC)
    const poolData = await fetchCompletePoolInfo(raydium, poolId);
    const { poolInfo, currentTick } = poolData;
    const tickSpacing = poolInfo.config.tickSpacing;
  
    logger.log(`📊 Pool Info:`);
    logger.log(`├─ ${poolInfo.mintA.symbol}/${poolInfo.mintB.symbol}`);
    logger.log(`├─ Current Price: $${poolInfo.price}`);
    logger.log(`├─ Current Tick: ${currentTick}`);
    logger.log(`└─ Tick Spacing: ${tickSpacing}`);
    logger.log('');
  
    // ✅ Шаг 2: Найти все tick arrays в диапазоне
    const tickArrayAddresses = getTickArrayAddresses({
      programId,
      poolId: new PublicKey(poolId),
      tickLower,
      tickUpper,
      tickSpacing,
    });
  
    logger.log(`📡 Fetching ${tickArrayAddresses.length} tick arrays...`);
  
    // ✅ Шаг 3: Получить все tick arrays за один RPC вызов
    const tickArraysData = await raydium.connection.getMultipleAccountsInfo(
      tickArrayAddresses.map(t => t.address)
    );
  
    logger.log(`✅ Received ${tickArraysData.filter(Boolean).length} tick arrays`);
    logger.log('');
  
    // ✅ Шаг 4: Декодировать и собрать все тики
    const allTicks = extractTicksFromArrays({
      tickArraysData,
      tickArrayAddresses,
      tickLower,
      tickUpper,
      tickSpacing,
    });
  
    logger.log(`📊 Found ${allTicks.length} initialized ticks`);
    logger.log('');
  
    // ✅ Шаг 5: Рассчитать USD стоимость каждого тика
    const ticksWithValue = await calculateTicksValue({
      poolInfo,
      currentTick, // ✅ ИСПРАВЛЕНО: передаем currentTick из RPC
      ticks: allTicks,
    });
  
    // ✅ Шаг 6: Суммировать и вычислить плотность
    const totalLiquidityUSD = ticksWithValue.reduce(
      (sum, t) => sum + t.liquidityUSD,
      0
    );
  
    const tickRange = tickUpper - tickLower;
    const densityPerTick = totalLiquidityUSD / tickRange;
  
    logger.log('📊 RESULTS:');
    logger.log(`├─ Total Liquidity: $${totalLiquidityUSD.toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
    logger.log(`├─ Initialized Ticks: ${allTicks.length}`);
    logger.log(`├─ Tick Range: ${tickRange} ticks`);
    logger.log(`└─ Density a(0): $${densityPerTick.toFixed(2)}/tick`);
    logger.log('');
  
    return {
      totalLiquidityUSD,
      tickRange,
      densityPerTick,
      tickCount: allTicks.length,
      ticks: ticksWithValue,
    };
  }
  
  /**
   * 📊 Получить полную информацию о пуле (API + RPC)
   * ✅ ИСПРАВЛЕНО: теперь получает currentTick из RPC
   */
  async function fetchCompletePoolInfo(
    raydium: Raydium,
    poolId: string,
  ): Promise<{
    poolInfo: ApiV3PoolInfoConcentratedItem;
    currentTick: number;
  }> {
    // 1. Получить базовые данные из API (цена, TVL, volume)
    let poolInfo: ApiV3PoolInfoConcentratedItem;
    
  
    const pools = await raydium.api.fetchPoolById({ ids: poolId });
    poolInfo = pools[0] as ApiV3PoolInfoConcentratedItem;
   
    // 2. ✅ Получить currentTick из RPC (API его не возвращает!)
    const rpcData = await raydium.clmm.getRpcClmmPoolInfo({
      poolId: new PublicKey(poolId),
    });
  
    return {
      poolInfo,
      currentTick: rpcData.tickCurrent,
    };
  }
  
  /**
   * 🔍 Найти все tick array адреса в диапазоне
   */
  function getTickArrayAddresses({
    programId,
    poolId,
    tickLower,
    tickUpper,
    tickSpacing,
  }: {
    programId: PublicKey;
    poolId: PublicKey;
    tickLower: number;
    tickUpper: number;
    tickSpacing: number;
  }): Array<{ address: PublicKey; startIndex: number }> {
    const addresses: Array<{ address: PublicKey; startIndex: number }> = [];
  
    // Получить начальный индекс для нижней границы
    let currentStartIndex = TickUtils.getTickArrayStartIndexByTick(
      tickLower,
      tickSpacing
    );
  
    // Получить конечный индекс для верхней границы
    const upperStartIndex = TickUtils.getTickArrayStartIndexByTick(
      tickUpper,
      tickSpacing
    );
  
    // Пройти по всем tick arrays
    while (currentStartIndex <= upperStartIndex) {
      const address = TickUtils.getTickArrayAddressByTick(
        programId,
        poolId,
        currentStartIndex,
        tickSpacing
      );
  
      addresses.push({
        address,
        startIndex: currentStartIndex,
      });
  
      // Следующий tick array
      // Каждый tick array содержит 60 тиков (TICK_ARRAY_SIZE)
      currentStartIndex += tickSpacing * 60;
    }
  
    return addresses;
  }
  
  /**
   * 📦 Извлечь тики из tick arrays
   */
  function extractTicksFromArrays({
    tickArraysData,
    tickArrayAddresses,
    tickLower,
    tickUpper,
    tickSpacing,
  }: {
    tickArraysData: any[];
    tickArrayAddresses: Array<{ address: PublicKey; startIndex: number }>;
    tickLower: number;
    tickUpper: number;
    tickSpacing: number;
  }): Array<{
    tick: number;
    liquidityGross: BN;
    liquidityNet: BN;
  }> {
    const ticks: Array<{
      tick: number;
      liquidityGross: BN;
      liquidityNet: BN;
    }> = [];
  
    for (let i = 0; i < tickArraysData.length; i++) {
      const accountInfo = tickArraysData[i];
  
      if (!accountInfo) {
        logger.debug(`Tick array ${i} not initialized`);
        continue;
      }
  
      // Декодировать tick array
      const tickArray = TickArrayLayout.decode(accountInfo.data);
      const startIndex = tickArrayAddresses[i].startIndex;
  
      // Обработать все тики в массиве
      for (let j = 0; j < tickArray.ticks.length; j++) {
        const tickState = tickArray.ticks[j];
        const tick = startIndex + j * tickSpacing;
  
        // Пропустить тики вне диапазона
        if (tick < tickLower || tick > tickUpper) {
          continue;
        }
  
        // Пропустить неинициализированные тики
        if (tickState.liquidityGross.isZero()) {
          continue;
        }
  
        ticks.push({
          tick,
          liquidityGross: tickState.liquidityGross,
          liquidityNet: tickState.liquidityNet,
        });
      }
    }
  
    return ticks;
  }
  
  /**
   * 💰 Рассчитать USD стоимость для каждого тика
   * ✅ ИСПРАВЛЕНО: currentTick теперь параметр
   */
  async function calculateTicksValue({
    poolInfo,
    currentTick, // ✅ ИСПРАВЛЕНО: принимаем как параметр
    ticks,
  }: {
    poolInfo: ApiV3PoolInfoConcentratedItem;
    currentTick: number; // ✅ ИСПРАВЛЕНО: добавили параметр
    ticks: Array<{
      tick: number;
      liquidityGross: BN;
      liquidityNet: BN;
    }>;
  }): Promise<TickData[]> {
    const currentPrice = new Decimal(poolInfo.price);
    const ticksWithValue: TickData[] = [];
  
    for (const tickData of ticks) {
      const tick = tickData.tick;
      const liquidityGross = tickData.liquidityGross;
  
      // Рассчитать количество токенов используя формулу Uniswap v3
      const amounts = liquidityToTokenAmounts({
        tick,
        currentTick,
        liquidityGross,
        tickSpacing: poolInfo.config.tickSpacing,
        mintADecimals: poolInfo.mintA.decimals,
        mintBDecimals: poolInfo.mintB.decimals,
      });
  
      // Перевести в USD
      // amount0 = USDC (уже в USD)
      // amount1 = SOL (нужно умножить на цену)
      const liquidityUSD = amounts.amount0.add(
        amounts.amount1.mul(currentPrice)
      ).toNumber();
  
      ticksWithValue.push({
        tick,
        liquidityGross,
        liquidityNet: tickData.liquidityNet,
        liquidityUSD,
      });
    }
  
    return ticksWithValue;
  }
  
  /**
   * 🧮 Перевести liquidity в количество токенов (формула Uniswap v3)
   */
  function liquidityToTokenAmounts({
    tick,
    currentTick,
    liquidityGross,
    tickSpacing,
    mintADecimals,
    mintBDecimals,
  }: {
    tick: number;
    currentTick: number;
    liquidityGross: BN;
    tickSpacing: number;
    mintADecimals: number;
    mintBDecimals: number;
  }): { amount0: Decimal; amount1: Decimal } {
    // Упрощенная формула для одного тика
    // Предполагаем что ликвидность распределена в пределах tickSpacing
  
    const tickLower = tick;
    const tickUpper = tick + tickSpacing;
  
    // Рассчитать sqrt цены
    const sqrtPriceLower = new Decimal(Math.pow(1.0001, tickLower / 2));
    const sqrtPriceUpper = new Decimal(Math.pow(1.0001, tickUpper / 2));
    const sqrtPriceCurrent = new Decimal(Math.pow(1.0001, currentTick / 2));
  
    const liquidity = new Decimal(liquidityGross.toString());
  
    let amount0: Decimal;
    let amount1: Decimal;
  
    if (currentTick < tickLower) {
      // Ниже текущей цены = только token0 (USDC)
      amount0 = liquidity
        .mul(sqrtPriceUpper.sub(sqrtPriceLower))
        .div(sqrtPriceLower.mul(sqrtPriceUpper))
        .div(10 ** mintADecimals);
  
      amount1 = new Decimal(0);
  
    } else if (currentTick >= tickUpper) {
      // Выше текущей цены = только token1 (SOL)
      amount0 = new Decimal(0);
  
      amount1 = liquidity
        .mul(sqrtPriceUpper.sub(sqrtPriceLower))
        .div(10 ** mintBDecimals);
  
    } else {
      // Текущий тик находится внутри диапазона = оба токена
      amount0 = liquidity
        .mul(sqrtPriceUpper.sub(sqrtPriceCurrent))
        .div(sqrtPriceCurrent.mul(sqrtPriceUpper))
        .div(10 ** mintADecimals);
  
      amount1 = liquidity
        .mul(sqrtPriceCurrent.sub(sqrtPriceLower))
        .div(10 ** mintBDecimals);
    }
  
    return { amount0, amount1 };
  }