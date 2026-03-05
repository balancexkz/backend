// src/liquidity-bot/services/liquidity-manager.service.ts

import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { 
  Raydium,
  ApiV3PoolInfoConcentratedItem,
  ClmmKeys,
  CLMM_PROGRAM_ID
} from '@raydium-io/raydium-sdk-v2';
import { BN } from 'bn.js';
import { txVersion } from '../config';

// Services
import { PoolInfoService } from './pool-info.service';
import { LiquidityCalculatorService } from './calculator.service';
import { BalanceValidatorService } from '../validators/balance.validator';
import { PositionValidatorService } from '../validators/position.validator';
import { SlippageStrategy } from './slippage.service';
import { RetryStrategy } from './retry-strategy.service';
// Types
import { UserParams } from '../interfaces/user-params.interface';

export interface OpenPositionResult {
  status: 'success';
  mint: string;
  txId: string;
  poolId: string;
}

export interface ClosePositionResult {
  txId: string;
  success: boolean;
  baseAmount: number;
  quoteAmount: number;
  feesCollected: number;
}

export interface IncreaseLiquidityResult {
  txId: string;
  success: boolean;
  addedAmount: number;
}

@Injectable()
export class LiquidityManagerService {
  private readonly logger = new Logger(LiquidityManagerService.name);

  constructor(
    private readonly raydium: Raydium,
    private readonly poolInfoService: PoolInfoService,
    private readonly liquidityCalculator: LiquidityCalculatorService,
    private readonly balanceValidator: BalanceValidatorService,
    private readonly positionValidator: PositionValidatorService,
    private readonly retryStrategy: RetryStrategy,
    private readonly slippageStrategy: SlippageStrategy,
  ) {}

  // ========================================
  // OPEN POSITION
  // ========================================

  /**
   * Открыть позицию ликвидности
   */
  async openPosition(params: UserParams, walletAddress: string): Promise<OpenPositionResult> {
    this.logger.log('');
    this.logger.log('═'.repeat(80));
    this.logger.log('🚀 OPENING LIQUIDITY POSITION');
    this.logger.log('═'.repeat(80));

    try {
      // 1. Валидация входных параметров
      this.positionValidator.validatePoolId(params.poolId);
      this.positionValidator.validateInputAmount(params.inputAmount);
      this.positionValidator.validatePriceRangePercent(params.priceRangePercent);

      // 2. Получаем данные пула
      const poolData = await this.poolInfoService.getPoolData(params.poolId);

      this.logger.log(`Pool: ${poolData.poolInfo.mintA.symbol}/${poolData.poolInfo.mintB.symbol}`);
      this.logger.log(`Current price: ${poolData.currentPrice.toFixed(2)}`);
      this.logger.log(`Input amount: ${params.inputAmount} ${poolData.poolInfo.mintA.symbol}`);
      this.logger.log(`Price range: ±${params.priceRangePercent}%`);

      // 3. Рассчитываем price range
      const priceRange = this.liquidityCalculator.calculatePriceRange({
        poolInfo: poolData.poolInfo,
        currentPrice: poolData.currentPrice,
        rangePercent: params.priceRangePercent,
      });

      // 4. Получаем slippage config
      const slippageConfig = this.slippageStrategy.getDefaultConfig();
      const slippage = slippageConfig.initial;

      // 5. Рассчитываем параметры ликвидности
      const liquidityParams = await this.liquidityCalculator.calculateLiquidityParams({
        poolInfo: poolData.poolInfo,
        inputAmount: params.inputAmount,
        tickLower: priceRange.lowerTick,
        tickUpper: priceRange.upperTick,
        slippage,
      });

      // 6. Валидируем балансы
      await this.balanceValidator.validateBalances({
        walletAddress,
        requiredSolLamports: liquidityParams.amountMaxA.add(new BN(50_000_000)), // + fees
        requiredUsdcRaw: liquidityParams.amountMaxB,
        usdcMint: poolData.poolInfo.mintB.address,
        usdcDecimals: poolData.poolInfo.mintB.decimals,
        operation: 'open position',
      });

      // 7. Выполняем транзакцию с retry
      const result = await this.executeOpenPositionWithRetry({
        poolData,
        priceRange,
        liquidityParams,
        slippageConfig,
      });

      this.logger.log('');
      this.logger.log('✅ Position opened successfully!');
      this.logger.log(`   NFT Mint: ${result.mint}`);
      this.logger.log(`   TX: https://solscan.io/tx/${result.txId}`);
      this.logger.log('═'.repeat(80));
      this.logger.log('');

      return result;

    } catch (error) {
      this.logger.error('');
      this.logger.error('❌ Failed to open position');
      this.logger.error(`   Error: ${error.message}`);
      this.logger.error('═'.repeat(80));
      this.logger.error('');
      throw error;
    }
  }

  /**
   * Выполнить открытие позиции с retry
   */
  private async executeOpenPositionWithRetry(params: {
    poolData: any;
    priceRange: any;
    liquidityParams: any;
    slippageConfig: any;
  }): Promise<OpenPositionResult> {
    
    const { poolData, priceRange, liquidityParams, slippageConfig } = params;

    return await this.retryStrategy.execute(
      async () => {
        const { execute, extInfo } = await this.raydium.clmm.openPositionFromLiquidity({
          poolInfo: poolData.poolInfo,
          poolKeys: poolData.poolKeys,
          tickUpper: Math.max(priceRange.lowerTick, priceRange.upperTick),
          tickLower: Math.min(priceRange.lowerTick, priceRange.upperTick),
          liquidity: liquidityParams.liquidity,
          amountMaxA: liquidityParams.amountMaxA,
          amountMaxB: liquidityParams.amountMaxB,
          ownerInfo: {
            useSOLBalance: true,
          },
          txVersion,
          computeBudgetConfig: {
            units: 1400000,
            microLamports: 5000000,
          },
        });

        const result = await execute({
          sendAndConfirm: true,
          skipPreflight: true,
        });

        if (!result.txId) {
          throw new Error('Transaction failed - no txId returned');
        }

        return {
          status: 'success' as const,
          mint: extInfo.address.nftMint.toBase58(),
          txId: result.txId,
          poolId: poolData.poolInfo.id,
        };
      },
      {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 8000,
        operation: 'Open Position',
      }
    );
  }

  // ========================================
  // INCREASE LIQUIDITY
  // ========================================

  /**
   * Увеличить ликвидность позиции
   */
  async increaseLiquidity(params: {
    positionMint: string;
    inputAmount: number;
    walletAddress: string;
  }): Promise<string> {
    
    this.logger.log('');
    this.logger.log('💧 Increasing liquidity...');
    this.logger.log(`   Position: ${params.positionMint.slice(0, 8)}...`);
    this.logger.log(`   Amount: ${params.inputAmount}`);

    try {
      // 1. Валидация
      this.positionValidator.validatePositionMint(params.positionMint);
      this.positionValidator.validateInputAmount(params.inputAmount, 0.5);

      // 2. Получаем позицию из blockchain
      const allPositions = await this.raydium.clmm.getOwnerPositionInfo({
        programId: CLMM_PROGRAM_ID.toBase58(),
      });

      const ownerPosition = allPositions.find(
        p => p.nftMint.toBase58() === params.positionMint
      );

      if (!ownerPosition) {
        throw new Error(`Position ${params.positionMint} not found in blockchain`);
      }

      // 3. Получаем данные пула
      const poolData = await this.poolInfoService.getPoolData(
        ownerPosition.poolId.toBase58()
      );

      // 4. Рассчитываем параметры
      const slippageConfig = this.slippageStrategy.getDefaultConfig();
      
      const liquidityParams = await this.liquidityCalculator.calculateLiquidityParams({
        poolInfo: poolData.poolInfo,
        inputAmount: params.inputAmount,
        tickLower: ownerPosition.tickLower,
        tickUpper: ownerPosition.tickUpper,
        slippage: slippageConfig.initial,
      });

      // 5. Валидируем балансы
      await this.balanceValidator.validateBalances({
        walletAddress: params.walletAddress,
        requiredSolLamports: liquidityParams.amountMaxA.add(new BN(30_000_000)),
        requiredUsdcRaw: liquidityParams.amountMaxB,
        usdcMint: poolData.poolInfo.mintB.address,
        usdcDecimals: poolData.poolInfo.mintB.decimals,
        operation: 'increase liquidity',
      });

      // 6. Выполняем транзакцию
      const txId = await this.executeIncreaseLiquidity({
        poolData,
        ownerPosition,
        liquidityParams,
      });

      this.logger.log(`✅ Liquidity increased: ${txId.slice(0, 8)}...`);

      return txId;

    } catch (error) {
      this.logger.error(`Failed to increase liquidity: ${error.message}`);
      throw error;
    }
  }

  /**
   * Выполнить увеличение ликвидности
   */
  private async executeIncreaseLiquidity(params: {
    poolData: any;
    ownerPosition: any;
    liquidityParams: any;
  }): Promise<string> {
    
    const { poolData, ownerPosition, liquidityParams } = params;

    const { execute } = await this.raydium.clmm.increasePositionFromLiquidity({
      poolInfo: poolData.poolInfo,
      poolKeys: poolData.poolKeys,
      ownerPosition,
      ownerInfo: {
        useSOLBalance: true,
      },
      liquidity: liquidityParams.liquidity,
      amountMaxA: liquidityParams.amountMaxA,
      amountMaxB: liquidityParams.amountMaxB,
      checkCreateATAOwner: true,
      txVersion,
      computeBudgetConfig: {
        units: 600000,
        microLamports: 100000,
      },
    });

    const { txId } = await execute({ sendAndConfirm: true });

    return txId;
  }
}