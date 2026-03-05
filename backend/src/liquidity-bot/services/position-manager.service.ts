// src/liquidity-bot/services/position-manager.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  Raydium,
  CLMM_PROGRAM_ID,
  getPdaPersonalPositionAddress,
  PositionInfoLayout,
  TickUtils,
  TickArrayLayout,
  PositionUtils,
  ApiV3PoolInfoConcentratedItem,
  U64_IGNORE_RANGE,
} from '@raydium-io/raydium-sdk-v2';
import { BN } from 'bn.js';
import { Decimal } from 'decimal.js';

// Entities
import { Position } from '../position.entity';

// Services
import { PoolInfoService } from './pool-info.service';
import { PriceFetcherService } from './price-fetcher.service';
// Types
import { PositionInfo, PoolInfo } from '../interfaces/pool-info.interface';
import { PositionStatus, PositionRangeAnalysis } from '../types/position.types';
import { PositionRangeCalculator } from '../types/position.types';

export interface PositionData {
  position: PositionInfo;
  pool: PoolInfo;
  hasInitialValue: boolean;
}

export interface PositionFees {
  amountA: number;
  amountB: number;
  valueA: number;
  valueB: number;
  total: number;
}

@Injectable()
export class PositionManagerService {
  private readonly logger = new Logger(PositionManagerService.name);

  constructor(
    @InjectRepository(Position)
    private readonly positionRepository: Repository<Position>,
    private readonly connection: Connection,
    private readonly raydium: Raydium,
    private readonly poolInfoService: PoolInfoService,
    private readonly priceFetcherService: PriceFetcherService,
  ) {}

  async getAllPositions(walletAddress: string): Promise<PositionData[]> {
    try {
      const positionMints = await this.getPositionMints();

      if (positionMints.length === 0) {
        this.logger.log('No CLMM positions found');
        return [];
      }

      this.logger.log(`Found ${positionMints.length} CLMM positions`);

      // Параллельно загружаем информацию о каждой позиции
      const positionPromises = positionMints.map(nftMint =>
        this.getPositionInfo(nftMint, walletAddress).catch(error => {
          this.logger.error(`Error loading position ${nftMint}: ${error.message}`);
          return null;
        })
      );

      const results = await Promise.all(positionPromises);
      const validPositions = results.filter(Boolean) as PositionData[];

      this.logger.log(`Successfully loaded ${validPositions.length} positions`);

      return validPositions;

    } catch (error) {
      this.logger.error(`Error getting all positions: ${error.message}`);
      throw error;
    }
  }

  async getPositionInfo(
    nftMint: string,
    walletAddress: string,
  ): Promise<PositionData> {
    
    const positionNftMint = new PublicKey(nftMint);

    const onChainPosition = await this.fetchOnChainPosition(positionNftMint);

    const poolData = await this.poolInfoService.getPoolData(
      onChainPosition.poolId.toBase58()
    );

    const epochInfo = await this.connection.getEpochInfo();
    const priceRange = this.calculatePriceRange(poolData.poolInfo, onChainPosition);
    const amounts = this.calculateAmounts(poolData.poolInfo, onChainPosition, epochInfo);

    const rangeAnalysis = PositionRangeCalculator.analyze(
      poolData.currentPrice,
      priceRange.lower,
      priceRange.upper,
      Decimal(amounts.baseAmount),
      Decimal(amounts.quoteAmount),
      this.poolInfoService.normalizeSymbol(poolData.poolInfo.mintA.symbol),
      this.poolInfoService.normalizeSymbol(poolData.poolInfo.mintB.symbol),
    );

    const fees = await this.calculateFees(
      poolData.poolInfo,
      onChainPosition,
      poolData.currentPrice,
    );

    const dbData = await this.getPositionFromDB(nftMint, amounts, fees);

    return this.buildPositionData(
      positionNftMint,
      rangeAnalysis,
      priceRange,
      poolData.currentPrice,
      fees,
      dbData,
      onChainPosition.poolId,
      poolData.poolInfo,
    );
  }

  /**
   * Проверить существует ли позиция
   */
  async positionExists(nftMint: string): Promise<boolean> {
    try {
      const positionNftMint = new PublicKey(nftMint);
      const positionPubKey = getPdaPersonalPositionAddress(
        CLMM_PROGRAM_ID,
        positionNftMint
      ).publicKey;

      const accountInfo = await this.connection.getAccountInfo(positionPubKey);
      return accountInfo !== null;

    } catch (error) {
      return false;
    }
  }

  // ========================================
  // POSITION MINTS
  // ========================================

  /**
   * Получить NFT mints всех позиций
   */
  private async getPositionMints(): Promise<string[]> {
    try {
      // Способ 1: Через SDK
      const positions = await this.raydium.clmm.getOwnerPositionInfo({
        programId: CLMM_PROGRAM_ID,
      });

      return positions.map(pos => pos.nftMint.toBase58());

    } catch (error) {
      this.logger.warn('SDK method failed, trying NFT search...');
      // Способ 2: Через поиск NFT токенов (fallback)
      return await this.findPositionMintsViaNFT();
    }
  }

  /**
   * Найти позиции через NFT токены (fallback метод)
   */
  private async findPositionMintsViaNFT(): Promise<string[]> {
    const owner = this.raydium.owner.publicKey;

    const TOKEN_PROGRAM_ID = new PublicKey(
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
    );

    const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
      owner,
      { programId: TOKEN_PROGRAM_ID }
    );

    const positionMints: string[] = [];

    for (const { account } of tokenAccounts.value) {
      const parsedInfo = account.data.parsed.info;

      // NFT имеет amount = 1 и decimals = 0
      if (
        parsedInfo.tokenAmount.amount === '1' &&
        parsedInfo.tokenAmount.decimals === 0
      ) {
        const mint = parsedInfo.mint;

        try {
          const positionPubKey = getPdaPersonalPositionAddress(
            CLMM_PROGRAM_ID,
            new PublicKey(mint)
          ).publicKey;

          const positionAccount = await this.connection.getAccountInfo(positionPubKey);

          if (positionAccount) {
            positionMints.push(mint);
          }
        } catch {
          continue;
        }
      }
    }

    return positionMints;
  }

  // ========================================
  // ON-CHAIN DATA
  // ========================================

  /**
   * Получить on-chain данные позиции
   */
  private async fetchOnChainPosition(positionNftMint: PublicKey) {
    const positionPubKey = getPdaPersonalPositionAddress(
      CLMM_PROGRAM_ID,
      positionNftMint
    ).publicKey;

    const accountInfo = await this.connection.getAccountInfo(positionPubKey);

    if (!accountInfo) {
      throw new Error(`Position ${positionNftMint.toBase58()} not found on-chain`);
    }

    return PositionInfoLayout.decode(accountInfo.data);
  }

  // ========================================
  // CALCULATIONS
  // ========================================

  /**
   * Рассчитать price range
   */
  private calculatePriceRange(
    poolInfo: ApiV3PoolInfoConcentratedItem,
    position: any,
  ) {
    const priceLower = TickUtils.getTickPrice({
      poolInfo,
      tick: position.tickLower,
      baseIn: true,
    });

    const priceUpper = TickUtils.getTickPrice({
      poolInfo,
      tick: position.tickUpper,
      baseIn: true,
    });

    return {
      lower: Number(priceLower.price),
      upper: Number(priceUpper.price),
    };
  }

  /**
   * Рассчитать количество токенов в позиции
   */
  private calculateAmounts(
    poolInfo: ApiV3PoolInfoConcentratedItem,
    position: any,
    epochInfo: any,
  ) {
    const { amountA, amountB } = PositionUtils.getAmountsFromLiquidity({
      poolInfo,
      ownerPosition: position,
      liquidity: position.liquidity,
      slippage: 0,
      add: false,
      epochInfo,
    });

    const baseAmount = new Decimal(amountA.amount.toString())
      .div(10 ** poolInfo.mintA.decimals)
      .toString();

    const quoteAmount = new Decimal(amountB.amount.toString())
      .div(10 ** poolInfo.mintB.decimals)
      .toString();

    return { baseAmount, quoteAmount };
  }

  /**
   * Рассчитать накопленные комиссии
   */
  private async calculateFees(
    poolInfo: ApiV3PoolInfoConcentratedItem,
    position: any,
    currentPrice: number,
  ): Promise<PositionFees> {
    
    // Получаем tick arrays
    const [tickLowerArrayAddress, tickUpperArrayAddress] = [
      TickUtils.getTickArrayAddressByTick(
        new PublicKey(poolInfo.programId),
        new PublicKey(poolInfo.id),
        position.tickLower,
        poolInfo.config.tickSpacing
      ),
      TickUtils.getTickArrayAddressByTick(
        new PublicKey(poolInfo.programId),
        new PublicKey(poolInfo.id),
        position.tickUpper,
        poolInfo.config.tickSpacing
      ),
    ];

    const tickArrayRes = await this.connection.getMultipleAccountsInfo([
      tickLowerArrayAddress,
      tickUpperArrayAddress,
    ]);

    if (!tickArrayRes[0] || !tickArrayRes[1]) {
      throw new Error('Tick array data not found');
    }

    const tickArrayLower = TickArrayLayout.decode(tickArrayRes[0].data);
    const tickArrayUpper = TickArrayLayout.decode(tickArrayRes[1].data);

    const tickLowerState = tickArrayLower.ticks[
      TickUtils.getTickOffsetInArray(position.tickLower, poolInfo.config.tickSpacing)
    ];
    const tickUpperState = tickArrayUpper.ticks[
      TickUtils.getTickOffsetInArray(position.tickUpper, poolInfo.config.tickSpacing)
    ];

    // Получаем RPC данные
    const rpcPoolData = await this.raydium.clmm.getRpcClmmPoolInfo({
      poolId: position.poolId,
    });

    // Рассчитываем fees
    const tokenFees = PositionUtils.GetPositionFeesV2(
      rpcPoolData,
      position,
      tickLowerState,
      tickUpperState
    );

    const feeAmountA = this.normalizeFeeAmount(
      tokenFees.tokenFeeAmountA,
      poolInfo.mintA.decimals
    );

    const feeAmountB = this.normalizeFeeAmount(
      tokenFees.tokenFeeAmountB,
      poolInfo.mintB.decimals
    );

    // Получаем цены
    const symbolA = this.poolInfoService.normalizeSymbol(poolInfo.mintA.symbol);
    const symbolB = this.poolInfoService.normalizeSymbol(poolInfo.mintB.symbol);

    const prices = await this.priceFetcherService.getTokenPrices(`${symbolA},${symbolB}`);
    const priceA = prices[symbolA] || 0;
    const priceB = prices[symbolB] || 0;

    const valueA = feeAmountA * priceA;
    const valueB = feeAmountB * priceB;
    const total = valueA + valueB;

    return {
      amountA: feeAmountA,
      amountB: feeAmountB,
      valueA,
      valueB,
      total,
    };
  }

  /**
   * Нормализовать fee amount
   */
  private normalizeFeeAmount(feeAmount: any, decimals: number): number {
    const isValid = feeAmount.gte(new BN(0)) && feeAmount.lt(U64_IGNORE_RANGE);
    const validAmount = isValid ? feeAmount : new BN(0);

    return new Decimal(validAmount.toString())
      .div(10 ** decimals)
      .toNumber();
  }

  // ========================================
  // DATABASE
  // ========================================

  /**
   * Получить данные позиции из БД
   */
  private async getPositionFromDB(
    nftMint: string,
    amounts: { baseAmount: string; quoteAmount: string },
    fees: PositionFees,
  ) {
    try {
      const positionRecord = await this.positionRepository.findOne({
        where: { positionId: nftMint },
      });

      if (!positionRecord) {
        const currentValue = parseFloat(amounts.baseAmount) + parseFloat(amounts.quoteAmount);
        
        return {
          hasInitialValue: false,
          initialValue: currentValue,
          profitability: 0,
        };
      }

      const currentValue = parseFloat(amounts.baseAmount) + parseFloat(amounts.quoteAmount);
      const positionValueChange = currentValue - positionRecord.initialValue;
      const totalProfit = fees.total + positionValueChange;
      const profitability = positionRecord.initialValue > 0
        ? (totalProfit / positionRecord.initialValue) * 100
        : 0;

      return {
        hasInitialValue: true,
        initialValue: positionRecord.initialValue,
        profitability,
      };

    } catch (error) {
      this.logger.warn(`Could not access position DB: ${error.message}`);
      
      const currentValue = parseFloat(amounts.baseAmount) + parseFloat(amounts.quoteAmount);
      
      return {
        hasInitialValue: false,
        initialValue: currentValue,
        profitability: 0,
      };
    }
  }

  /**
   * Сохранить позицию в БД
   */
  async savePosition(params: {
    positionId: string;
    poolId: string;
    initialValue: number;
  }): Promise<void> {
    try {
      await this.positionRepository.save({
        positionId: params.positionId,
        poolId: params.poolId,
        initialValue: params.initialValue,
      });

      this.logger.log(`Position saved to DB: ${params.positionId.slice(0, 8)}...`);
    } catch (error) {
      this.logger.error(`Failed to save position to DB: ${error.message}`);
      // Не бросаем ошибку - позиция уже открыта on-chain
    }
  }

  // ========================================
  // RESPONSE BUILDER
  // ========================================

  /**
   * Собрать данные позиции в ответ
   */
  private buildPositionData(
    positionNftMint: PublicKey,
    rangeAnalysis: PositionRangeAnalysis,
    priceRange: { lower: number; upper: number },
    currentPrice: number,
    fees: PositionFees,
    dbData: any,
    poolId: PublicKey,
    poolInfo: ApiV3PoolInfoConcentratedItem,
  ): PositionData {
    
    const symbolA = this.poolInfoService.normalizeSymbol(poolInfo.mintA.symbol);
    const symbolB = this.poolInfoService.normalizeSymbol(poolInfo.mintB.symbol);

    const positionInfo: PositionInfo = {
      positionId: positionNftMint.toBase58(),
      baseAmount: rangeAnalysis.amountA,
      quoteAmount: rangeAnalysis.amountB,
      priceRange,
      currentPrice,
      profitability: dbData.profitability,
      positionStatus: rangeAnalysis.status,
      actionHistory: [
        `Collected Fees: ${fees.amountA.toFixed(6)} ${symbolA} (${fees.valueA.toFixed(2)} USD)`,
        `Collected Fees: ${fees.amountB.toFixed(6)} ${symbolB} (${fees.valueB.toFixed(2)} USD)`,
      ],
      poolKeys: { id: poolId.toBase58() },
    };

    const poolInfoResponse: PoolInfo = {
      poolId: poolId.toBase58(),
      baseMint: poolInfo.mintA.symbol,
      baseMintPublicKey: poolInfo.mintA.address,
      quoteMint: poolInfo.mintB.symbol,
      quoteMintPublicKey: poolInfo.mintB.address,
      currentPrice,
    };

    return {
      position: positionInfo,
      pool: poolInfoResponse,
      hasInitialValue: dbData.hasInitialValue,
    };
  }
}