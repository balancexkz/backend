import { Injectable, Inject, Logger, HttpException, HttpStatus, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Connection, PublicKey, SendTransactionError, Transaction, SystemProgram } from '@solana/web3.js';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Percent, TokenAmount, ClmmKeys, Raydium, ApiV3PoolInfoConcentratedItem, PoolUtils, TickUtils, getPdaPersonalPositionAddress, CLMM_PROGRAM_ID, PositionInfoLayout, PositionUtils, U64_IGNORE_RANGE, ApiV3Token, TickArrayLayout } from '@raydium-io/raydium-sdk-v2';
import { BN } from 'bn.js';
import { Decimal } from 'decimal.js';
import { PoolInfo, PositionInfo } from './interfaces/pool-info.interface';
import { UserParams } from './interfaces/user-params.interface';
import { initSdk, txVersion } from './config';
import { isValidClmm, } from './utils/raydium.utils';
import axios from 'axios';
import { getAssociatedTokenAddress, getAccount, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createTransferInstruction, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import { Position } from './position.entity';
import { DriftClient, Wallet, PerpMarkets, PositionDirection, OrderType } from '@drift-labs/sdk';
import { CommonRaydiumService } from '../common/common-raydium.service';
import { TransactionType } from '../transaction/transaction.entity';
import { TransactionService } from '../transaction/transaction.service';
import { PositionStatus, PositionRangeAnalysis, PositionRangeCalculator } from './types/position.types'
import { TelegramService } from '../telegram/telegram.service';
import { FeeRecipient, FEE_CONFIG } from './types/fee.types'
import { TransferResult, FeeDistributionResult } from './types/transfer.types'
import { PositionAnalyticsService } from '../analytic/analytic.service'
import { PositionConfigService } from '../position/position.config.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { DensityResultDto } from './dto/density-result.dto';
import { calculatePreciseLiquidityDensity } from './utils/liquidity-density-calculator';
import { RedisService } from '../redis/redis.service';




@Injectable()
export class LiquidityBotService extends CommonRaydiumService implements OnModuleInit {
  protected readonly logger = new Logger(LiquidityBotService.name);
  private readonly DENSITY_CACHE_TTL = 5 * 60; // 5 минут в секундах
  private readonly CACHE_PREFIX = 'density:';
  private readonly recipientAddress = this.configService.get<string>('RECIPIENT_ADDRESS')
  private readonly heliusApiKey = this.configService.get<string>('HELIUS_API_KEY')
  private readonly coingeckoApiKey = this.configService.get<string>('COINGECKO_API_KEY')
  private readonly feeRecipients: FeeRecipient[];
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
  };
  constructor(protected readonly configService: ConfigService, @InjectRepository(Position)
  private positionRepository: Repository<Position>,
    private transactionService: TransactionService,
    private readonly telegramService: TelegramService,
    private analyticService: PositionAnalyticsService,
    private positionConfigService: PositionConfigService,
    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,
    private redisService: RedisService
    
  ) {
    super(configService);
    this.feeRecipients = this.initializeFeeRecipients()
  }

  async onModuleInit(): Promise<void> {
    await this.initializeRaydium(); // Вызов shared метода из базового класса
    this.logger.log('SwapService initialized successfully');
  }

  private initializeFeeRecipients(): FeeRecipient[] {
    const recipients: FeeRecipient[] = [];

    const primary = this.configService.get<string>('RECIPIENT_ADDRESS');
    if (primary) {
      recipients.push({
        address: primary,
        percent: FEE_CONFIG.PRIMARY_PERCENT,
        label: 'Primary',
      });
    }

    const secondary = this.configService.get<string>('SECOND_RECIPIENT_ADDRESS');
    if (secondary) {
      recipients.push({
        address: secondary,
        percent: FEE_CONFIG.SECONDARY_PERCENT,
        label: 'Secondary',
      });
    }
    return recipients;
  }

  async getPoolInfo(poolId: string): Promise<ApiV3PoolInfoConcentratedItem> {
    // ✅ Получить из API (не RPC!)
    const poolData = await this.raydium.api.fetchPoolById({
      ids: poolId,
    });
  
    if (!poolData || poolData.length === 0) {
      throw new Error(`Pool not found: ${poolId}`);
    }
  
    const poolInfo = poolData[0] as ApiV3PoolInfoConcentratedItem;
  
    if (poolInfo.type !== 'Concentrated') {
      throw new Error(`Pool is not a CLMM pool: ${poolId}`);
    }
  
    return poolInfo;
  }
  

  // Вспомогательный метод для определения, стоит ли повторять транзакцию
  private shouldRetryTransaction(error: any): boolean {
    // Ошибки, которые имеет смысл повторить
    const retryableErrors = [
      'Blockhash not found', // Старый blockhash
      'Transaction simulation failed', // Может пройти при повторе
      '0x1', // Custom program error - может быть временным
      'block height exceeded', // Транзакция устарела
      'Node is behind', // RPC отстает
    ];

    // Ошибки, которые бесполезно повторять
    const nonRetryableErrors = [
      'Insufficient funds', // Не хватает денег
      'insufficient lamports', // То же самое
      'custom program error: 0x1775', // Invalid account (6005)
      'Account does not exist', // Аккаунт не существует
    ];

    const errorMessage = error?.message || error?.toString() || '';

    // Не повторяем fatal ошибки
    if (nonRetryableErrors.some(msg => errorMessage.includes(msg))) {
      return false;
    }

    // Повторяем known retryable ошибки
    if (retryableErrors.some(msg => errorMessage.includes(msg))) {
      return true;
    }

    // Slippage ошибки - повторяем с обновленной ценой
    if (errorMessage.includes('6021') ||
      errorMessage.includes('slippage') ||
      errorMessage.includes('PriceSlippageCheck')) {
      return true;
    }

    // По умолчанию - не повторяем неизвестные ошибки
    return false;
  }

  async setupLiquidityPosition(params: UserParams) {
    const poolId = params.poolId;
    const publicKey = new PublicKey(this.walletAddress);

    // 1. Получаем pool info
    let poolInfo: ApiV3PoolInfoConcentratedItem;
    let poolKeys: ClmmKeys | undefined;

    try {
      if (this.cluster === 'mainnet') {
        const data = await this.raydium.api.fetchPoolById({ ids: poolId });
        poolInfo = data[0] as ApiV3PoolInfoConcentratedItem;
        if (!isValidClmm(poolInfo.programId)) {
          throw new Error('Target pool is not CLMM pool');
        }
      } else {
        const data = await this.raydium.clmm.getPoolInfoFromRpc(poolId);
        poolInfo = data.poolInfo;
        poolKeys = data.poolKeys;
      }
    } catch (error) {
      throw new Error('Unable to fetch pool info');
    }

    if (params.priceRangePercent === undefined) {
      throw new Error('Price range percent is required');
    }

    const inputAmount = params.inputAmount;

    const walletBalance = await this.connection.getBalance(publicKey);
    const requiredLamports = new BN(inputAmount * 10 ** 9).add(new BN(50_000_000));

    if (walletBalance < requiredLamports.toNumber()) {
      throw new HttpException(
        `Insufficient SOL balance. Required: ${requiredLamports.toNumber() / 10 ** 9} SOL, available: ${walletBalance / 10 ** 9} SOL.`,
        HttpStatus.FORBIDDEN
      );
    }

    const mintA = poolInfo.mintA;
    const mintB = poolInfo.mintB;
    const decimalsA = mintA.decimals;
    const decimalsB = mintB.decimals;

    const tokenBAta = await getAssociatedTokenAddress(new PublicKey(mintB.address), publicKey);
    let amountB = 0;

    try {
      if (mintB.symbol === 'WSOL') {
        amountB = await this.connection.getBalance(publicKey);
      } else {
        const accountB = await getAccount(this.connection, tokenBAta);
        amountB = Number(accountB.amount);
      }
    } catch (error) {
      amountB = 0;
    }

    const rpcData = await this.raydium.clmm.getRpcClmmPoolInfo({ poolId: poolInfo.id });
    poolInfo.price = rpcData.currentPrice;
    const currentPrice = rpcData.currentPrice;
    const priceRange = await this.positionConfigService.getConfig(poolId)
    // 5. Рассчитываем price range
    const lowerPercent = Number(priceRange?.lowerRangePercent) / 100;
    const upperPercent = Number(priceRange?.upperRangePercent) / 100;
    const startPrice = currentPrice * (1 - lowerPercent);
    const endPrice = currentPrice * (1 + upperPercent);

    const { tick: lowerTick } = TickUtils.getPriceAndTick({
      poolInfo,
      price: new Decimal(startPrice),
      baseIn: true,
    });

    const { tick: upperTick } = TickUtils.getPriceAndTick({
      poolInfo,
      price: new Decimal(endPrice),
      baseIn: true,
    });

    const epochInfo = await this.raydium.fetchEpochInfo();

    const slippage = 0.05;

    const res = await PoolUtils.getLiquidityAmountOutFromAmountIn({
      poolInfo,
      slippage: 0,
      inputA: true,
      tickUpper: Math.max(lowerTick, upperTick),
      tickLower: Math.min(lowerTick, upperTick),
      amount: new BN(new Decimal(inputAmount).mul(10 ** decimalsA).toFixed(0)),
      add: true,
      amountHasFee: true,
      epochInfo,
    });

    const inputAmountRaw = new BN(new Decimal(inputAmount).mul(10 ** decimalsA).toFixed(0));

    const amountMaxA = inputAmountRaw;

    const amountMaxB = new BN(
      new Decimal(res.amountSlippageB.amount.toString())
        .mul(1 + slippage)
        .toFixed(0)
    );

    const requiredSolLamports = amountMaxA.add(new BN(50_000_000)); // + fees
    if (walletBalance < requiredSolLamports.toNumber()) {
      throw new HttpException(
        `Insufficient ${mintA.symbol}. Required: ${requiredSolLamports.toNumber() / 10 ** decimalsA} (including fees), available: ${walletBalance / 10 ** decimalsA}`,
        HttpStatus.FORBIDDEN
      );
    }

    if (amountMaxB.gt(new BN(amountB))) {
      const required = new Decimal(amountMaxB.toString()).div(10 ** decimalsB).toFixed(4);
      const available = (amountB / 10 ** decimalsB).toFixed(4);
      throw new HttpException(
        `Insufficient ${mintB.symbol}. Required: ${required} (with ${slippage * 100}% slippage buffer), available: ${available}`,
        HttpStatus.FORBIDDEN
      );
    }

    const walletBalanceUSD = await this.getWalletBalanceUSD(this.walletAddress);
    const { execute, extInfo } = await this.raydium.clmm.openPositionFromLiquidity({
      poolInfo,
      poolKeys,
      tickUpper: Math.max(lowerTick, upperTick),
      tickLower: Math.min(lowerTick, upperTick),
      liquidity: res.liquidity,
      amountMaxA,
      amountMaxB,
      ownerInfo: {
        useSOLBalance: true,
      },
      txVersion,
      computeBudgetConfig: {
        units: 1400000,
        microLamports: 5000000,
      },
    });

    try {

      let txId: string | undefined;
      let retries = 3;
      let lastError: any;

      while (retries > 0) {
        try {
          if (retries < 3) {
            this.logger.log(`Retry attempt ${4 - retries}/3 - updating price...`);
            const freshRpcData = await this.raydium.clmm.getRpcClmmPoolInfo({ poolId: poolInfo.id });
            poolInfo.price = freshRpcData.currentPrice;
          }

          const result = await execute({
            sendAndConfirm: true,
            skipPreflight: true
          });

          txId = result.txId;

          if (txId) {
            this.logger.log(`✅ Transaction successful on attempt ${4 - retries}`);
            break;
          }

        } catch (error) {
          lastError = error;
          retries--;

          // Анализируем, стоит ли повторять
          const shouldRetry = this.shouldRetryTransaction(error);

          if (!shouldRetry || retries === 0) {
            throw error;
          }

          // Экспоненциальная задержка: 1s, 2s, 4s
          const delay = 1000 * Math.pow(2, 3 - retries);
          this.logger.warn(`Transaction failed, retrying in ${delay}ms... (${retries} attempts left)`);
          await new Promise(r => setTimeout(r, delay));
        }
      }

      if (!txId) {
        throw lastError || new Error('Transaction failed after all retries');
      }

      await new Promise(resolve => setTimeout(resolve, 3000));
      const symbolA = mintA.symbol === 'WSOL' ? 'SOL' : mintA.symbol;
      const symbolB = mintB.symbol === 'WSOL' ? 'SOL' : mintB.symbol;


      const txData = await this.parseTransactionHelius(txId, 'OPEN');
      await this.transactionService.saveTransaction({
        positionId: extInfo.address.nftMint.toBase58(),
        type: TransactionType.OPEN_POSITION,
        txHash: txId,
        poolId,
        baseAmount: Number(txData.solAmount),
        baseSymbol: symbolA,
        quoteAmount: Number(txData.usdcAmount),
        quoteSymbol: symbolB,
        solPrice: currentPrice,
        walletBalanceUSD,
      });

      await this.analyticService.createOnOpen({
        positionId: extInfo.address.nftMint.toBase58(),
        poolId,
        baseAmount: txData.solAmount,
        quoteAmount: txData.usdcAmount,
        solPrice: currentPrice,
        baseSymbol: 'SOL',
        quoteSymbol: 'USDC',
      });

      return {
        status: 'success',
        mint: extInfo.address.nftMint.toBase58(),
        txId
      };

    } catch (error) {
      // Обработка ошибок
      if (error instanceof SendTransactionError) {
        const logs = error.logs;
        console.error('Transaction logs:', logs);

        const isSlippageError = logs?.some(log =>
          log.includes('slippage') ||
          log.includes('PriceSlippageCheck') ||
          log.includes('AmountSlippageError')
        );

        if (isSlippageError) {
          throw new HttpException(
            `Price moved beyond ${slippage * 100}% tolerance during transaction. Please retry with higher slippage or wait for price stability.`,
            HttpStatus.CONFLICT
          );
        }

        throw new HttpException(
          `Transaction failed: ${error.message}. Check logs for details.`,
          HttpStatus.BAD_REQUEST
        );
      }

      throw error;
    }
  }


  async setupLiquidityPositionWithFallback(params: UserParams): Promise<any> {
    let currentInputAmount = params.inputAmount;
    let currentSlippage = 0.05; // 5%
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      attempts++;

      try {
        // Пробуем открыть позицию с текущими параметрами
        const result = await this.setupLiquidityPosition({
          ...params,
          inputAmount: currentInputAmount,
          // Передаем slippage если ваша функция это поддерживает
        });

        this.logger.log('✅ Position opened successfully!');
        return result;

      } catch (error) {
        this.logger.error(`❌ Attempt ${attempts} failed: ${error.message}`);

        const errorMsg = error.message?.toLowerCase() || '';

        // СЛУЧАЙ 1: Недостаточно USDC
        if (errorMsg.includes('insufficient') && errorMsg.includes('usdc')) {
          // Уменьшаем inputAmount на 10%
          currentInputAmount *= 0.90;

          if (currentInputAmount < 0.05) {
            throw new Error('Input amount too low after reductions');
          }

          this.logger.warn(`⚠️  Insufficient USDC - reducing input to ${currentInputAmount.toFixed(4)} SOL`);
          continue;
        }

        // СЛУЧАЙ 2: Недостаточно SOL
        if (errorMsg.includes('insufficient') && errorMsg.includes('sol')) {
          // Уменьшаем inputAmount на 15%
          currentInputAmount *= 0.85;

          if (currentInputAmount < 0.05) {
            throw new Error('Input amount too low after reductions');
          }

          this.logger.warn(`⚠️  Insufficient SOL - reducing input to ${currentInputAmount.toFixed(4)} SOL`);
          continue;
        }

        // СЛУЧАЙ 3: Slippage ошибка
        if (errorMsg.includes('slippage') || errorMsg.includes('price')) {
          // Увеличиваем slippage на 50%
          currentSlippage = Math.min(currentSlippage * 1.5, 0.15); // Максимум 15%
          this.logger.warn(`⚠️  Slippage error - increasing to ${(currentSlippage * 100).toFixed(1)}%`);

          // Ждем стабилизации цены
          await this.sleep(5000);
          continue;
        }

        // СЛУЧАЙ 4: Network/RPC ошибка
        if (errorMsg.includes('network') || errorMsg.includes('timeout') || errorMsg.includes('rpc')) {
          this.logger.warn(`⚠️  Network error - retrying...`);
          await this.sleep(3000);
          continue;
        }

        // СЛУЧАЙ 5: Неизвестная ошибка - пробуем уменьшить amount
        if (attempts < maxAttempts) {
          currentInputAmount *= 0.95;
          currentSlippage = Math.min(currentSlippage * 1.2, 0.15);

          this.logger.warn(`⚠️  Unknown error - adjusting parameters`);
          await this.sleep(2000);
          continue;
        }

        // Все попытки исчерпаны
        throw error;
      }
    }

    throw new Error(`Failed to open position after ${maxAttempts} attempts`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }


  async closePosition(nftMint: string) {
    try {
      const positionNftMint = new PublicKey(nftMint);
      const allPositions = await this.raydium.clmm.getOwnerPositionInfo({
        programId: CLMM_PROGRAM_ID.toBase58()
      });

      if (!allPositions.length) throw new Error('User does not have any positions');

      const positionData = allPositions.find((p) => p.nftMint.toBase58() === positionNftMint.toBase58());
      if (!positionData) throw new Error(`Position with nftMint ${nftMint} not found`);

      const { position, pool } = await this.fetchPositionInfoEnhanced(nftMint);

      const poolId = position.poolKeys.id;
      const baseSymbol = pool.baseMint === 'WSOL' ? 'SOL' : pool.baseMint;
      const quoteSymbol = pool.quoteMint === 'WSOL' ? 'SOL' : pool.quoteMint;
      const balanceBeforeTx = await this.getWalletBalanceUSD(this.walletAddress);

      let poolInfo: ApiV3PoolInfoConcentratedItem;
      let poolKeys: ClmmKeys | undefined;

      if (this.raydium.cluster === 'mainnet') {
        const data = await this.raydium.api.fetchPoolById({ ids: poolId });
        poolInfo = data[0] as ApiV3PoolInfoConcentratedItem;
        if (!isValidClmm(poolInfo.programId)) throw new Error('Target pool is not CLMM pool');
      } else {
        const data = await this.raydium.clmm.getPoolInfoFromRpc(poolId);
        poolInfo = data.poolInfo;
        poolKeys = data.poolKeys;
      }

      const decimalsA = poolInfo.mintA.decimals;
      const decimalsB = poolInfo.mintB.decimals;

      const publicKey = new PublicKey(this.walletAddress);
      const solBalanceLamports = await this.raydium.connection.getBalance(publicKey);
      const solBalance = solBalanceLamports / 1e9;

      if (solBalance < 0.05) {
        throw new Error(`Insufficient SOL balance. Required: 0.05 SOL, Available: ${solBalance} SOL`);
      }

      // ========================================
      // ✅ СБОР ИНФОРМАЦИИ О FEES
      // ========================================

      const feeRegexA = /Collected Fees: ([\d.]+) \w+ \(([\d.]+) USD\)/;
      const matchA = position.actionHistory[0]?.match(feeRegexA);
      const matchB = position.actionHistory[1]?.match(feeRegexA);
      const feeAmountA = matchA ? parseFloat(matchA[1]) : 0;
      const feeValueA_USD = matchA ? parseFloat(matchA[2]) : 0;
      const feeAmountB = matchB ? parseFloat(matchB[1]) : 0;
      const feeValueB_USD = matchB ? parseFloat(matchB[2]) : 0;
      const totalFeesUSD = feeValueA_USD + feeValueB_USD;

      this.logger.log('📊 Accumulated fees:');
      this.logger.log(`   ${baseSymbol}: ${feeAmountA.toFixed(6)} ($${feeValueA_USD.toFixed(2)})`);
      this.logger.log(`   ${quoteSymbol}: ${feeAmountB.toFixed(6)} ($${feeValueB_USD.toFixed(2)})`);
      this.logger.log(`   Total: $${totalFeesUSD.toFixed(2)}`);

      const pooledAmountA = parseFloat(position.baseAmount);
      const pooledAmountB = parseFloat(position.quoteAmount);
      const slippageTolerance = 0.05; // 5%
      const toleranceFactor = 1 - slippageTolerance;

      let amountMinA;
      let amountMinB;

      if (pooledAmountA > 0) {
        const minPooledA = pooledAmountA * toleranceFactor;
        amountMinA = new BN(Math.floor(minPooledA * 10 ** decimalsA));
      } else {
        amountMinA = new BN(0);
      }

      if (pooledAmountB > 0) {
        const minPooledB = pooledAmountB * toleranceFactor;
        amountMinB = new BN(Math.floor(minPooledB * 10 ** decimalsB));
      } else {
        amountMinB = new BN(0);
      }

      this.logger.log('📊 Position liquidity:');
      this.logger.log(`   ${baseSymbol}: ${pooledAmountA.toFixed(6)}`);
      this.logger.log(`   ${quoteSymbol}: ${pooledAmountB.toFixed(6)}`);
      this.logger.log(`   Min ${baseSymbol}: ${(amountMinA.toNumber() / (10 ** decimalsA)).toFixed(6)} (with 5% slippage)`);
      this.logger.log(`   Min ${quoteSymbol}: ${(amountMinB.toNumber() / (10 ** decimalsB)).toFixed(6)} (with 5% slippage)`);


      const isInRange = pooledAmountA > 0 && pooledAmountB > 0;
      const isOutOfRangeSOL = pooledAmountA > 0 && pooledAmountB === 0;
      const isOutOfRangeUSDC = pooledAmountA === 0 && pooledAmountB > 0;

      if (isInRange) {
        const solValueUSD = pooledAmountA * pool.currentPrice;
        const usdcValueUSD = pooledAmountB;
        const solPercent = (solValueUSD / (solValueUSD + usdcValueUSD)) * 100;

        this.logger.log(`   ✅ Position IN RANGE`);
        this.logger.log(`   Distribution: ${solPercent.toFixed(1)}% SOL / ${(100 - solPercent).toFixed(1)}% USDC`);
      } else if (isOutOfRangeSOL) {
        this.logger.log(`   ⚠️  Position OUT OF RANGE - all liquidity in ${baseSymbol}`);
        if (feeAmountB > 0) {
          this.logger.log(`   📝 Note: ${feeAmountB.toFixed(6)} ${quoteSymbol} fees will be collected separately`);
        }
      } else if (isOutOfRangeUSDC) {
        this.logger.log(`   ⚠️  Position OUT OF RANGE - all liquidity in ${quoteSymbol}`);
        if (feeAmountA > 0) {
          this.logger.log(`   📝 Note: ${feeAmountA.toFixed(6)} ${baseSymbol} fees will be collected separately`);
        }
      }
      const { execute } = await this.raydium.clmm.decreaseLiquidity({
        poolInfo,
        poolKeys,
        ownerPosition: positionData,
        ownerInfo: {
          useSOLBalance: true,
          closePosition: true,
        },
        liquidity: positionData.liquidity,
        amountMinA,
        amountMinB,
        txVersion,
        computeBudgetConfig: {
          units: 700000,
          microLamports: 100000,
        },
      });

      try {
        const { txId } = await execute({ sendAndConfirm: true });

        this.logger.log(`✅ Position closed: ${txId}`);

        await this.sleep(3000);

        const balances = await this.getBalanceByPool(poolId);
        const baseBalance = balances[baseSymbol]?.amount || 0;
        const quoteBalance = balances[quoteSymbol]?.amount || 0;

        this.logger.log('📊 Balances after closing:');
        this.logger.log(`   ${baseSymbol}: ${baseBalance.toFixed(6)}`);
        this.logger.log(`   ${quoteSymbol}: ${quoteBalance.toFixed(6)}`);

        const txData = await this.parseTransactionHelius(txId, 'CLOSE');
        let feeTransferToken: 'SOL' | 'USDC' | null = null;
        let feeTransferAmount = 0;

        if (totalFeesUSD > 0) {
          // Рассчитываем соотношение токенов в балансе
          const baseValueUSD = baseBalance * pool.currentPrice;
          const quoteValueUSD = quoteBalance;
          const totalValueUSD = baseValueUSD + quoteValueUSD;

          if (totalValueUSD > 0) {
            const basePercent = (baseValueUSD / totalValueUSD) * 100;

            this.logger.log('');
            this.logger.log('💰 Fee distribution analysis:');
            this.logger.log(`   Balance distribution: ${basePercent.toFixed(1)}% SOL / ${(100 - basePercent).toFixed(1)}% USDC`);

            // ✅ Выбираем токен с большим балансом для отправки fees
            if (basePercent >= 50) {
              // Больше SOL - отправляем fees в SOL
              feeTransferToken = 'SOL';
              feeTransferAmount = totalFeesUSD / pool.currentPrice;

              this.logger.log(`   Strategy: Send fees in SOL (${basePercent.toFixed(1)}% > 50%)`);
              this.logger.log(`   Fee amount: ${feeTransferAmount.toFixed(6)} SOL ($${totalFeesUSD.toFixed(2)})`);

              // Проверяем хватит ли SOL
              if (feeTransferAmount > baseBalance * 0.9) {
                this.logger.warn(`   ⚠️  Fee amount ${feeTransferAmount.toFixed(6)} SOL too high (> 90% of balance)`);
                this.logger.log(`   Adjusting to 90% of SOL balance`);
                feeTransferAmount = baseBalance * 0.9;
              }
            } else {
              // Больше USDC - отправляем fees в USDC
              feeTransferToken = 'USDC';
              feeTransferAmount = totalFeesUSD;

              this.logger.log(`   Strategy: Send fees in USDC (${(100 - basePercent).toFixed(1)}% > 50%)`);
              this.logger.log(`   Fee amount: ${feeTransferAmount.toFixed(2)} USDC ($${totalFeesUSD.toFixed(2)})`);

              // Проверяем хватит ли USDC
              if (feeTransferAmount > quoteBalance * 0.9) {
                this.logger.warn(`   ⚠️  Fee amount ${feeTransferAmount.toFixed(2)} USDC too high (> 90% of balance)`);
                this.logger.log(`   Adjusting to 90% of USDC balance`);
                feeTransferAmount = quoteBalance * 0.9;
              }
            }
          } else {
            this.logger.warn(`   ⚠️  No balance available to send fees`);
            feeTransferToken = null;
          }
        } else {
          this.logger.log('');
          this.logger.log('💰 No fees to distribute ($0.00)');
        }

        let feeTransferTxId: string | null = null;

        if (feeTransferToken && feeTransferAmount > 0) {
          try {
            // await this.distributeFees({
            //   token: feeTransferToken,
            //   totalAmount: feeTransferAmount,
            //   totalAmountUSD: totalFeesUSD,
            //   pool,
            // });


            this.logger.log(`✅ Fees distributed successfully`);
          } catch (feeError) {
            this.logger.error(`❌ Failed to distribute fees: ${feeError.message}`);
            // Продолжаем работу - fees не критичны
          }
        }

        const openTransaction = await this.transactionService.getTransactionsByPosition(nftMint);

        if (!openTransaction) {
          throw new Error('Open transaction not found');
        }

        // ✅ Initial values из Transaction (с учетом всех увеличений)

        const currentSolPrice = await this.getTokenPrices('SOL')
        const solPrice = currentSolPrice['SOL']
        const currentSol = txData.solAmount * Number(solPrice)
        const poolAmount = currentSol + txData.usdcAmount
        const balanceAfterTx = balanceBeforeTx + poolAmount
  
        await this.transactionService.saveTransaction({
          positionId: nftMint,
          type: TransactionType.CLOSE_POSITION,
          txHash: txId,
          poolId,
          baseAmount: txData.solAmount,
          baseSymbol,
          quoteAmount: txData.usdcAmount,
          quoteSymbol,
          solPrice: solPrice,
          walletBalanceUSD: balanceAfterTx,
          profitUSD: totalFeesUSD
        })
        const priceRange = await this.positionConfigService.getConfig(poolId)
        const lowerPercent = Number(priceRange?.lowerRangePercent) / 100;
        const upperPercent = Number(priceRange?.upperRangePercent) / 100;
        await this.telegramService.notifyPositionClosed({
          positionId: nftMint,
          poolId: poolId,
          lowerPercent: priceRange?.lowerRangePercent,
          upperPercent: priceRange?.upperRangePercent,
          baseSymbol,
          quoteSymbol,
          walletAddress: this.walletAddress,
          baseAmount: Number(txData.solAmount),
          quoteAmount: Number(txData.usdcAmount),
          totalFeesUSD,
          walletBalanceUSD: balanceAfterTx,
          txId,
          feeTransferTxId,
          price: solPrice
        });

        const initialBaseAmount = this.toNumber(openTransaction.baseAmount);
        const initialQuoteAmount = this.toNumber(openTransaction.quoteAmount);
        const initialValueUSD = this.toNumber(openTransaction.positionBalanceUSD);

        await this.analyticService.updateOnClose({
          positionId: nftMint,
          initialBaseAmount,      // ✅ Из Transaction
          initialQuoteAmount,     // ✅ Из Transaction
          initialValueUSD,
          finalBaseAmount: txData.solAmount,
          finalQuoteAmount: txData.usdcAmount,
          finalSolPrice: pool.currentPrice,
          feesUSD: totalFeesUSD
        });


        return {
          txId: `https://explorer.solana.com/tx/${txId}`,
          success: true,
          baseAmount: baseBalance,
          quoteAmount: quoteBalance,
          feesCollected: totalFeesUSD,
        };

      } catch (error) {
        this.logger.error(`Transaction execution failed: ${error.message}`);
        throw new Error(`Failed to execute transaction: ${error.message}`);
      }

    } catch (error) {
      this.logger.error(`Error closing position ${nftMint}: ${error.message}`);
      throw new Error(`Failed to close position: ${error.message}`);
    }
  }


  async getLiquidityDensityForPosition(
  ): Promise<DensityResultDto> {
    try {
      this.logger.log('');
      this.logger.log('🎯 CALCULATING LIQUIDITY DENSITY FROM CONFIG');
      this.logger.log('');

      // 1. Получить конфигурацию из БД
      const poolId = '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv'
      const config = await this.positionConfigService.getConfig(poolId)


      this.logger.log(`📋 Config found:`);
      this.logger.log(`├─ Pool: ${config.poolId.slice(0, 8)}...`);
      this.logger.log(`├─ Lower: ${config.lowerRangePercent}%`);
      this.logger.log(`├─ Upper: ${config.upperRangePercent}%`);
      this.logger.log(`└─ Active: ${config.isActive}`);
      this.logger.log('');

      // 2. ✅ Проверить Redis кеш
      const cacheKey = this.getDensityCacheKey(
        config.poolId,
        Number(config.lowerRangePercent),
        Number(config.upperRangePercent),
      );

      const cached = await this.cacheManager.get<DensityResultDto>(cacheKey);

      if (cached) {
        this.logger.log('✅ Using cached density from Redis');
        this.logger.log(`Cache key: ${cacheKey}`);
        return cached;
      }

      // 3. Рассчитать плотность
      this.logger.log('🔄 Cache miss, calculating density...');
      const result = await this.calculateDensityFromConfig(config);

      // 4. ✅ Сохранить в Redis с TTL
      await this.cacheManager.set(
        cacheKey,
        result,
        this.DENSITY_CACHE_TTL,
      );

      this.logger.log(`💾 Cached density in Redis (TTL: ${this.DENSITY_CACHE_TTL}s)`);
      this.logger.log(`Cache key: ${cacheKey}`);

      return result;

    } catch (error) {
      this.logger.error(`Failed to get density: ${error.message}`);
      throw error;
    }
  }

  private async calculateDensityFromConfig(
    config,
  ): Promise<DensityResultDto> {
    const startTime = Date.now();

    // 1. Получить данные пула
    let poolInfo: ApiV3PoolInfoConcentratedItem;
    const data = await this.raydium.api.fetchPoolById({ ids: config.poolId });
    poolInfo = data[0] as ApiV3PoolInfoConcentratedItem;
    const rpcData = await this.raydium.clmm.getRpcClmmPoolInfo({ poolId: poolInfo.id });
    console.log('RPC DATA', rpcData)
    poolInfo.price = rpcData.currentPrice;
    const currentPrice = rpcData.currentPrice;

    

    const currentTick = rpcData.tickCurrent;

    // 2. Рассчитать границы цен
    const lowerPercent = Number(config.lowerRangePercent) / 100;
    const upperPercent = Number(config.upperRangePercent) / 100;

    const lowerPrice = currentPrice * (1 - lowerPercent);
    const upperPrice = currentPrice * (1 + upperPercent);

    this.logger.log(`💰 Price Range:`);
    this.logger.log(`├─ Current: $${currentPrice.toFixed(2)}`);
    this.logger.log(`├─ Lower: $${lowerPrice.toFixed(2)} (-${config.lowerRangePercent}%)`);
    this.logger.log(`└─ Upper: $${upperPrice.toFixed(2)} (+${config.upperRangePercent}%)`);
    this.logger.log('');
    

    // 3. Перевести цены в тики
    const lowerTick = TickUtils.getPriceAndTick({
      poolInfo,
      price: new Decimal(lowerPrice),
      baseIn: true,
    }).tick;

    const upperTick = TickUtils.getPriceAndTick({
      poolInfo,
      price: new Decimal(upperPrice),
      baseIn: true,
    }).tick;

    this.logger.log(`📊 Tick Range:`);
    this.logger.log(`├─ Current: ${currentTick}`);
    this.logger.log(`├─ Lower: ${lowerTick}`);
    this.logger.log(`└─ Upper: ${upperTick}`);
    this.logger.log('');

    // 4. Рассчитать плотность
    const densityResult = await calculatePreciseLiquidityDensity({
      raydium: this.raydium,
      poolId: config.poolId,
      tickLower: lowerTick,
      tickUpper: upperTick,
    });

    const elapsed = Date.now() - startTime;

    this.logger.log(`⏱️ Calculation completed in ${elapsed}ms`);
    this.logger.log('');

    // 5. Собрать результат
    return {
      poolId: config.poolId,
      lowerRangePercent: Number(config.lowerRangePercent),
      upperRangePercent: Number(config.upperRangePercent),

      currentPrice,
      lowerPrice,
      upperPrice,

      currentTick,
      lowerTick,
      upperTick,

      totalLiquidityUSD: densityResult.totalLiquidityUSD,
      tickRange: densityResult.tickRange,
      densityPerTick: densityResult.densityPerTick,
      tickCount: densityResult.tickCount,

      calculatedAt: new Date(),
      cacheTTL: this.DENSITY_CACHE_TTL,
    };
  }

  /**
   * 🔑 Сгенерировать ключ для кеша
   */


  /**
   * 🔄 Очистить кеш плотности
   */
  async clearDensityCache(poolId?: string): Promise<number> {
    try {
      if (poolId) {
        // ✅ Очистить для конкретного пула
        const pattern = `${this.CACHE_PREFIX}${poolId}:*`;
        const deletedCount = await this.redisService.deleteByPattern(pattern);
        
        this.logger.log(`Deleted ${deletedCount} cache entries for pool ${poolId}`);
        return deletedCount;
        
      } else {
        // ✅ Очистить весь кеш
        await this.redisService.flushAll();
        this.logger.log('All density cache cleared');
        return -1; // Неизвестно сколько удалено
      }
    } catch (error) {
      this.logger.error(`Failed to clear cache: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🔄 Очистить конкретный ключ
   */
  async clearSpecificDensityCache(
    poolId: string,
    lowerPercent: number,
    upperPercent: number,
  ): Promise<void> {
    try {
      const cacheKey = this.getDensityCacheKey(
        poolId,
        lowerPercent,
        upperPercent,
      );
      
      await this.redisService.delete(cacheKey);
      this.logger.log(`Cache cleared for key: ${cacheKey}`);
    } catch (error) {
      this.logger.error(`Failed to clear specific cache: ${error.message}`);
      throw error;
    }
  }

  /**
   * 📊 Получить статистику кеша
   */
  async getDensityCacheStats(): Promise<{
    totalKeys: number;
    keys: string[];
  }> {
    try {
      return await this.redisService.getStats(this.CACHE_PREFIX);
    } catch (error) {
      this.logger.error(`Failed to get cache stats: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🔑 Сгенерировать ключ для кеша
   */
  private getDensityCacheKey(
    poolId: string,
    lowerPercent: number,
    upperPercent: number,
  ): string {
    return `${this.CACHE_PREFIX}${poolId}:${lowerPercent}:${upperPercent}`;
  }

  

  /**
   * 📊 Получить статистику кеша
   */
  async getCacheStats(): Promise<{
    keys: string[];
    count: number;
  }> {
    try {
      // Для получения всех ключей нужен прямой доступ к Redis
      // Через cache-manager это сложно
      this.logger.warn('Cache stats require direct Redis access');

      return {
        keys: [],
        count: 0,
      };
    } catch (error) {
      this.logger.error(`Failed to get cache stats: ${error.message}`);
      throw error;
    }
  }

  private toNumber(value: any): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return parseFloat(value) || 0;
    return parseFloat(value?.toString() || '0') || 0;
  }
  async closePositionWithRetry(positionId: string): Promise<any> {
    let attempts = 0;
    const maxAttempts = 7; // Больше попыток для критичной операции
    let lastError: any;

    while (attempts < maxAttempts) {
      attempts++;

      this.logger.log('');
      this.logger.log(`🔄 Position closing attempt ${attempts}/${maxAttempts}`);
      this.logger.log(`   Position ID: ${positionId.slice(0, 8)}...`);

      try {
        // Получаем свежую информацию о позиции
        const { position } = await this.positionInfo(positionId);

        if (!position) {
          throw new Error('Position not found or already closed');
        }

        // Пробуем закрыть позицию
        const result = await this.closePosition(positionId);

        if (result.success) {
          this.logger.log('✅ Position closed successfully!');
          return result;
        }

        throw new Error('Close operation returned unsuccessful result');

      } catch (error) {
        lastError = error;
        this.logger.error(`❌ Attempt ${attempts} failed: ${error.message}`);

        const errorMsg = error.message?.toLowerCase() || '';

        // Проверяем, была ли позиция уже закрыта
        if (errorMsg.includes('not found') || errorMsg.includes('already closed')) {
          this.logger.log('✅ Position appears to be already closed');
          return { success: true, alreadyClosed: true };
        }

        if (attempts >= maxAttempts) {
          break;
        }

        // Экспоненциальная задержка: 2s, 4s, 8s, 16s, 32s...
        const delay = Math.min(2000 * Math.pow(2, attempts - 1), 32000);
        this.logger.warn(`⚠️  Retrying in ${delay / 1000}s...`);
        await this.sleep(delay);
      }
    }

    this.logger.error('');
    this.logger.error(`❌ Failed to close position after ${maxAttempts} attempts`);
    this.logger.error(`   Last error: ${lastError?.message}`);
    this.logger.error('');

    throw lastError || new Error(`Failed to close position after ${maxAttempts} attempts`);
  }



  private async distributeFees(params: {
    token: 'SOL' | 'USDC' | null;
    totalAmount: number;
    totalAmountUSD: number;
    pool: any;
  }): Promise<FeeDistributionResult> {

    const { token, totalAmount, totalAmountUSD, pool } = params;

    // Проверки
    if (!token || totalAmount <= 0 || this.feeRecipients.length === 0) {
      return {
        transfers: [],
        totalAmount: 0,
        totalAmountUSD: 0,
        success: false,
      };
    }

    this.logger.log('');
    this.logger.log('💸 Fee Distribution:');
    this.logger.log(`   Total: ${totalAmount.toFixed(6)} ${token} ($${totalAmountUSD.toFixed(2)})`);

    const transfers = await Promise.allSettled(
      this.feeRecipients.map(recipient =>
        this.executeSingleTransfer({
          recipient,
          token,
          totalAmount,
          totalAmountUSD,
          pool,
        })
      )
    );

    // Обработка результатов
    const results: TransferResult[] = transfers
      .map((result, idx) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          this.logger.error(
            `Transfer failed for ${this.feeRecipients[idx].label}: ${result.reason?.message}`
          );
          return null;
        }
      })
      .filter((r): r is TransferResult => r !== null);

    const success = results.length > 0;

    this.logger.log(success ? '✅ Fee distribution complete' : '❌ All transfers failed');
    this.logger.log('');

    return {
      transfers: results,
      totalAmount,
      totalAmountUSD,
      success,
    };
  }

  private async executeSingleTransfer(params: {
    recipient: FeeRecipient;
    token: 'SOL' | 'USDC';
    totalAmount: number;
    totalAmountUSD: number;
    pool: any;
  }): Promise<TransferResult> {

    const { recipient, token, totalAmount, totalAmountUSD, pool } = params;

    const amount = totalAmount * recipient.percent;
    const amountUSD = totalAmountUSD * recipient.percent;

    this.logger.log(
      `   ${recipient.label} (${(recipient.percent * 100).toFixed(0)}%): ` +
      `${amount.toFixed(6)} ${token} ($${amountUSD.toFixed(2)})`
    );

    let txId: string;

    if (token === 'SOL') {
      txId = await this.transferSOL(recipient.address, amount);
    } else {
      txId = await this.transferSPLToken(
        pool.quoteMintPublicKey,
        recipient.address,
        amount
      );
    }

    this.logger.log(`   ✅ TX: https://solscan.io/tx/${txId}`);

    return {
      txId,
      amount,
      amountUSD,
      recipient: recipient.address,
      token,
    };
  }


  private async getRecipientBalances(): Promise<Record<string, number>> {
    const balances = await Promise.allSettled(
      this.feeRecipients.map(async recipient => ({
        label: recipient.label,
        balance: await this.getWalletBalanceUSD(recipient.address),
      }))
    );

    return balances.reduce((acc, result, idx) => {
      const label = this.feeRecipients[idx].label;
      acc[label] = result.status === 'fulfilled' ? result.value.balance : 0;
      return acc;
    }, {} as Record<string, number>);
  }

  private async parseTransactionHelius(txId: string, type: string) {
    await this.sleep(2000);
    const response = await fetch(
      `https://api.helius.xyz/v0/transactions/?api-key=${this.heliusApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: [txId] }),
      }
    );

    const [txData] = await response.json();
    let transfers;
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    if (type === 'CLOSE') {
      transfers = txData.tokenTransfers.filter(
        (t) => t.toUserAccount === this.walletAddress
      );
      console.log('CLOSE', transfers)
    }
    else if (type === 'OPEN') {
      transfers = txData.tokenTransfers.filter(
        (t) => t.fromUserAccount === this.walletAddress
      );
      console.log('OPEN', transfers)
    }
    console.log('info', transfers)
    const solTransfer = transfers.find((t) => t.mint === SOL_MINT);
    const usdcTransfer = transfers.find((t) => t.mint === USDC_MINT);
    console.log('TRANSFERS', solTransfer, usdcTransfer)
    return {
      solAmount: solTransfer?.tokenAmount || 0,
      usdcAmount: usdcTransfer?.tokenAmount || 0,
    };
  }


  /**
   * ✅ Увеличить ликвидность с проверкой баланса и retry
   */
  async increaseLiquidity(
    positionMint: string,
    inputAmount: number
  ): Promise<string> {
    try {
      const { position, pool } = await this.fetchPositionInfoEnhanced(positionMint);

      const poolId = pool.poolId;
      let poolInfo: ApiV3PoolInfoConcentratedItem;
      let poolKeys: ClmmKeys | undefined;

      const data = await this.raydium.api.fetchPoolById({ ids: poolId });
      poolInfo = data[0] as ApiV3PoolInfoConcentratedItem;

      const allPositions = await this.raydium.clmm.getOwnerPositionInfo({
        programId: poolInfo.programId
      });

      const ownerPosition = allPositions.find(
        p => p.nftMint.toBase58() === positionMint
      );

      if (!ownerPosition) {
        throw new Error(`Position ${positionMint} not found in blockchain`);
      }

      // ✅ НОВОЕ: Получаем текущие балансы
      const balances = await this.getBalanceByPool(poolId);
      const baseSymbol = this.normalizeSymbol(poolInfo.mintA.symbol);
      const quoteSymbol = this.normalizeSymbol(poolInfo.mintB.symbol);

      const solBalance = balances[baseSymbol]?.amount || 0;
      const usdcBalance = balances[quoteSymbol]?.amount || 0;

      this.logger.log(`Current balances: ${solBalance.toFixed(4)} SOL, ${usdcBalance.toFixed(2)} USDC`);

      // ✅ НОВОЕ: Используем retry логику с адаптивным amount
      const txId = await this.increaseLiquidityWithRetry({
        positionMint,
        poolInfo,
        poolKeys,
        ownerPosition,
        initialInputAmount: inputAmount,
        availableSol: solBalance,
        availableUsdc: usdcBalance,
        minInputAmount: 0.5, // Минимум 0.5 SOL
        maxRetries: 5,
      });

      // ✅ Обновляем транзакцию в БД
      if (txId) {
        await this.sleep(3000);
        const price = pool.currentPrice
        const transaction = await this.transactionService.getTransactionsByPosition(positionMint);
        if (transaction) {
          const txData = await this.parseTransactionHelius(txId, 'OPEN')
          const baseAmount = Number(position.baseAmount);
          const baseValueUsd = txData.solAmount * pool.currentPrice;
          const balance = await this.getWalletBalanceUSD(this.walletAddress)
          await this.transactionService.updateTransaction(
            balance,
            price,
            positionMint,
            txData.solAmount,
            baseValueUsd,
            txData.usdcAmount,
            txData.usdcAmount
          );
        }
      }

      this.logger.log(`✅ Liquidity increased: ${txId.slice(0, 8)}...`);

      return txId;

    } catch (error) {
      this.logger.error(`Failed to increase liquidity: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ НОВЫЙ МЕТОД: Увеличение ликвидности с retry и проверкой баланса
   */
  // ✅ ИСПРАВЛЕННЫЙ increaseLiquidityWithRetry

  private async increaseLiquidityWithRetry(params: {
    positionMint: string;
    poolInfo: any;
    poolKeys: any;
    ownerPosition: any;
    initialInputAmount: number;
    availableSol: number;
    availableUsdc: number;
    minInputAmount: number;
    maxRetries: number;
  }): Promise<string> {

    const {
      positionMint,
      poolInfo,
      poolKeys,
      ownerPosition,
      initialInputAmount,
      availableSol,
      availableUsdc,
      minInputAmount,
      maxRetries,
    } = params;

    let currentInputAmount = initialInputAmount;
    let lastError: any;

    this.logger.log(`Attempting to add ${currentInputAmount.toFixed(4)} SOL to position`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      this.logger.log(`  Attempt ${attempt}/${maxRetries}: ${currentInputAmount.toFixed(4)} SOL`);

      try {
        // ✅ НОВОЕ: Проверяем баланс ПЕРЕД расчетом
        if (currentInputAmount > availableSol * 0.95) {
          const safeAmount = availableSol * 0.90;

          if (safeAmount < minInputAmount) {
            throw new Error(
              `Insufficient SOL: need ${currentInputAmount.toFixed(4)}, have ${availableSol.toFixed(4)}`
            );
          }

          this.logger.warn(`  ⚠️ Reducing SOL: ${currentInputAmount.toFixed(4)} → ${safeAmount.toFixed(4)}`);
          currentInputAmount = safeAmount;
        }

        // ✅ Рассчитываем с текущей ценой
        const slippage = 0.025; // ✅ 1% вместо 5%
        const epochInfo = await this.raydium.fetchEpochInfo();

        const liquidityParams = await this.calculateLiquidityParams({
          poolInfo,
          position: ownerPosition,
          inputAmount: currentInputAmount,
          epochInfo,
          slippage,
        });

        // ✅ ИСПРАВЛЕНО: НЕ добавляем slippage второй раз!
        const requiredUsdcRaw = liquidityParams.amountSlippageB.toNumber(); // ← Уже со slippage
        const requiredUsdc = requiredUsdcRaw / (10 ** poolInfo.mintB.decimals);

        this.logger.log(`  Required: ${currentInputAmount.toFixed(4)} SOL + ${requiredUsdc.toFixed(2)} USDC`);
        this.logger.log(`  Available: ${availableSol.toFixed(4)} SOL + ${availableUsdc.toFixed(2)} USDC`);

        // ✅ Проверка USDC с запасом
        if (requiredUsdc > availableUsdc * 0.95) {
          const usdcRatio = (availableUsdc * 0.90) / requiredUsdc;
          const newAmount = currentInputAmount * usdcRatio;

          if (newAmount < minInputAmount) {
            throw new Error(
              `Insufficient USDC: need ${requiredUsdc.toFixed(2)}, have ${availableUsdc.toFixed(2)}. ` +
              `Reduced SOL ${newAmount.toFixed(4)} below minimum ${minInputAmount}`
            );
          }

          this.logger.warn(`  ⚠️ Insufficient USDC! Reducing SOL: ${currentInputAmount.toFixed(4)} → ${newAmount.toFixed(4)}`);
          currentInputAmount = newAmount;

          // Пересчитываем с новым amount
          continue;
        }

        // ✅ Балансы OK - выполняем
        const txId = await this.executeIncreaseLiquidity({
          positionId: positionMint,
          poolInfo,
          poolKeys,
          ownerPosition,
          liquidityParams,
          slippage,
        });

        this.logger.log(`  ✅ Success! TX: ${txId.slice(0, 8)}...`);
        return txId;

      } catch (error) {
        lastError = error;
        const errorMsg = error.message?.toLowerCase() || '';

        this.logger.error(`  ❌ Attempt ${attempt} failed: ${error.message}`);

        // ✅ Анализ ошибки
        const isSlippageError =
          errorMsg.includes('slippage') ||
          errorMsg.includes('6021') ||
          errorMsg.includes('price') ||
          errorMsg.includes('0x1775'); // Error code для slippage

        const isInsufficientFunds =
          errorMsg.includes('insufficient') ||
          errorMsg.includes('0x1'); // Solana insufficient funds error

        // ✅ Критические ошибки
        if (errorMsg.includes('below minimum') ||
          currentInputAmount <= minInputAmount) {
          throw error;
        }

        if (attempt >= maxRetries) {
          break;
        }

        // ✅ Адаптивное уменьшение
        if (isInsufficientFunds) {
          // Агрессивно уменьшаем на 20%
          const newAmount = currentInputAmount * 0.80;

          if (newAmount < minInputAmount) {
            throw new Error(`Amount too small: ${newAmount.toFixed(4)} < ${minInputAmount}`);
          }

          this.logger.log(`  📉 Insufficient funds: reducing by 20% → ${newAmount.toFixed(4)} SOL`);
          currentInputAmount = newAmount;

        } else if (isSlippageError) {
          // Консервативно уменьшаем на 10%
          const newAmount = currentInputAmount * 0.90;

          if (newAmount >= minInputAmount) {
            this.logger.log(`  📉 Slippage error: reducing by 10% → ${newAmount.toFixed(4)} SOL`);
            currentInputAmount = newAmount;
          }

          // ✅ Ждем обновления цены
          await this.sleep(3000);

        } else {
          // Неизвестная ошибка - ждем и повторяем
          const delay = Math.min(2000 * attempt, 8000);
          this.logger.warn(`  ⏳ Unknown error, waiting ${delay / 1000}s...`);
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error(`Failed after ${maxRetries} attempts`);
  }

  // ✅ ИСПРАВЛЕННЫЙ calculateLiquidityParams
  private async calculateLiquidityParams(params: {
    poolInfo: ApiV3PoolInfoConcentratedItem;
    position: any;
    inputAmount: number;
    epochInfo: any;
    slippage: number;
  }) {
    const { poolInfo, position, inputAmount, epochInfo, slippage } = params;

    const decimalsA = poolInfo.mintA.decimals;
    const decimalsB = poolInfo.mintB.decimals;

    const amountBN = new BN(
      new Decimal(inputAmount)
        .mul(10 ** decimalsA)
        .toFixed(0)
    );

    // ✅ Получаем СВЕЖУЮ цену
    const rpcData = await this.raydium.clmm.getRpcClmmPoolInfo({
      poolId: poolInfo.id
    });

    poolInfo.price = rpcData.currentPrice;

    // ✅ Расчет с внутренним slippage
    const result = await PoolUtils.getLiquidityAmountOutFromAmountIn({
      poolInfo,
      slippage: slippage, // ✅ Передаем slippage в SDK
      inputA: true,
      tickUpper: Math.max(position.tickLower, position.tickUpper),
      tickLower: Math.min(position.tickLower, position.tickUpper),
      amount: amountBN,
      add: true,
      amountHasFee: true,
      epochInfo,
    });

    // ✅ ВАЖНО: НЕ добавляем slippage второй раз!
    // result.amountSlippageB уже включает slippage из SDK
    const amountMaxA = amountBN;
    const amountMaxB = result.amountSlippageB.amount; // ← Без дополнительного множителя!

    this.logger.log('📊 Liquidity calculation:');
    this.logger.log(`   Input SOL: ${inputAmount.toFixed(9)}`);
    this.logger.log(`   Required USDC (with ${(slippage * 100).toFixed(1)}% slippage): ${(amountMaxB.toNumber() / 10 ** decimalsB).toFixed(6)}`);
    this.logger.log(`   Liquidity: ${result.liquidity.toString()}`);
    this.logger.log(`   Current price: $${rpcData.currentPrice.toFixed(2)}`);

    return {
      liquidity: result.liquidity,
      amountMaxA: amountMaxA,
      amountSlippageB: amountMaxB, // ✅ Переименовал для ясности
    };
  }

  // ✅ ИСПРАВЛЕННЫЙ executeIncreaseLiquidity
  private async executeIncreaseLiquidity(params: {
    poolInfo: ApiV3PoolInfoConcentratedItem;
    poolKeys: ClmmKeys | undefined;
    ownerPosition: any;
    liquidityParams: any;
    slippage: number;
    positionId: string;
  }): Promise<string> {

    const { poolInfo, poolKeys, ownerPosition, liquidityParams, positionId } = params;

    this.logger.log('💧 Executing increase liquidity:');
    this.logger.log(`   SOL: ${(liquidityParams.amountMaxA.toNumber() / 1e9).toFixed(9)}`);
    this.logger.log(`   USDC: ${(liquidityParams.amountSlippageB.toNumber() / 1e6).toFixed(6)}`);

    const { execute } = await this.raydium.clmm.increasePositionFromLiquidity({
      poolInfo,
      poolKeys,
      ownerPosition,
      ownerInfo: {
        useSOLBalance: true,
      },
      liquidity: liquidityParams.liquidity,
      amountMaxA: liquidityParams.amountMaxA,
      amountMaxB: liquidityParams.amountSlippageB, // ✅ Используем правильное поле
      checkCreateATAOwner: true,
      txVersion,
      computeBudgetConfig: {
        units: 600000,
        microLamports: 100000,
      },
    });

    const { txId } = await execute({
      sendAndConfirm: true,
      skipPreflight: true, // ✅ Добавь skipPreflight
    });

    return txId;
  }


  async parseOpenPositionTransaction(txId: string) {
    const response = await fetch(
      `https://api.helius.xyz/v0/transactions/?api-key=${this.heliusApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: [txId] }),
      }
    );

    const [txData] = await response.json();

    if (!txData || txData.type !== 'SWAP') {
      this.logger.warn(`Transaction ${txId} is not a swap`);
      return;
    }

    // ✅ Парсим description: "BvFT... swapped 150.933829 USDC for 1.19996062 SOL"
    const description = txData.description;
    const swapMatch = description.match(/swapped ([\d.]+) (\w+) for ([\d.]+) (\w+)/);
    console.log('DESC', description, 'MATCH', swapMatch)
    if (!swapMatch) {
      this.logger.warn(`Could not parse: ${description}`);
      return;
    }

    const [_, inputAmountStr, inputToken, outputAmountStr, outputToken] = swapMatch;

    const inputAmount = parseFloat(inputAmountStr);
    const outputAmount = parseFloat(outputAmountStr);
    console.log('INPUT', outputAmountStr, inputToken, inputAmount, 'OUTPUT', outputToken, outputAmountStr, outputAmount)


    return 'success'

  }

  async transferSOL(recipientAddress: string, amount: number): Promise<string> {
    const recipient = new PublicKey(recipientAddress);
    const sender = new PublicKey(this.walletAddress);
    // Конвертируем в lamports
    const lamports = Math.floor(amount * 1e9);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: sender,
        toPubkey: recipient,
        lamports,
      })
    );

    // Получаем recent blockhash
    const { blockhash } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = sender;

    // Подписываем транзакцию
    transaction.sign(this.owner);

    // Отправляем транзакцию
    const signature = await this.connection.sendRawTransaction(transaction.serialize());

    return signature;
  }

  /**
   * Отправка SPL токена (USDC, USDT, и т.д.)
   */
  async transferSPLToken(
    tokenMintAddress: string,
    recipientAddress: string,
    amount: number
  ): Promise<string> {
    const mintPublicKey = new PublicKey(tokenMintAddress);
    const recipient = new PublicKey(recipientAddress);
    const sender = new PublicKey(this.walletAddress);

    // Получаем ATA отправителя
    const senderATA = await getAssociatedTokenAddress(
      mintPublicKey,
      sender,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // Получаем ATA получателя
    const recipientATA = await getAssociatedTokenAddress(
      mintPublicKey,
      recipient,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const transaction = new Transaction();

    // Проверяем, существует ли ATA получателя
    const recipientATAInfo = await this.connection.getAccountInfo(recipientATA);

    if (!recipientATAInfo) {
      // Создаем ATA для получателя
      this.logger.log(`   Creating associated token account for recipient...`);
      transaction.add(
        createAssociatedTokenAccountInstruction(
          sender, // payer
          recipientATA,
          recipient,
          mintPublicKey,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }

    // Определяем decimals токена
    const mintInfo = await this.connection.getParsedAccountInfo(mintPublicKey);
    const decimals = (mintInfo.value?.data as any).parsed.info.decimals;

    // Конвертируем amount в raw units
    const rawAmount = Math.floor(amount * 10 ** decimals);

    // Добавляем инструкцию трансфера
    transaction.add(
      createTransferInstruction(
        senderATA,
        recipientATA,
        sender,
        rawAmount,
        [],
        TOKEN_PROGRAM_ID
      )
    );

    // Получаем recent blockhash
    const { blockhash } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = sender;

    // Подписываем транзакцию
    transaction.sign(this.owner);

    // Отправляем транзакцию
    const signature = await this.connection.sendRawTransaction(transaction.serialize());
    await this.connection.confirmTransaction(signature, 'confirmed');

    return signature;
  }

  async calculateMaxSafeInputAmount(
    poolId: string,
    availableSolBalance: number,
    availableUsdcBalance: number,
    priceRangePercent: number,
  ): Promise<{ inputAmount: number; requiredUsdc: number }> {
    try {
      const publicKey = new PublicKey(this.walletAddress);

      // 1. Получаем pool info
      let poolInfo: ApiV3PoolInfoConcentratedItem;
      let poolKeys: ClmmKeys | undefined;

      if (this.cluster === 'mainnet') {
        const data = await this.raydium.api.fetchPoolById({ ids: poolId });
        poolInfo = data[0] as ApiV3PoolInfoConcentratedItem;
      } else {
        const data = await this.raydium.clmm.getPoolInfoFromRpc(poolId);
        poolInfo = data.poolInfo;
        poolKeys = data.poolKeys;
      }

      // 2. Получаем актуальную цену
      const rpcData = await this.raydium.clmm.getRpcClmmPoolInfo({ poolId: poolInfo.id });
      poolInfo.price = rpcData.currentPrice;
      const currentPrice = rpcData.currentPrice;

      // 3. Рассчитываем price range
      const percent = priceRangePercent / 100;
      const startPrice = currentPrice * (1 - percent);
      const endPrice = currentPrice * (1 + percent);

      const { tick: lowerTick } = TickUtils.getPriceAndTick({
        poolInfo,
        price: new Decimal(startPrice),
        baseIn: true,
      });

      const { tick: upperTick } = TickUtils.getPriceAndTick({
        poolInfo,
        price: new Decimal(endPrice),
        baseIn: true,
      });

      const epochInfo = await this.raydium.fetchEpochInfo();
      const slippage = 0.05; // 5%

      const mintA = poolInfo.mintA;
      const mintB = poolInfo.mintB;
      const decimalsA = mintA.decimals;
      const decimalsB = mintB.decimals;

      // 4. БИНАРНЫЙ ПОИСК: находим максимальный inputAmount
      let minInput = 0.01; // Минимум 0.01 SOL
      let maxInput = availableSolBalance * 0.95; // Максимум 95% баланса (оставляем на fees)
      let optimalInput = minInput;
      let requiredUsdc = 0;

      const iterations = 10; // 10 итераций достаточно для точности

      this.logger.log('🔍 Calculating optimal input amount...');
      this.logger.log(`   Available SOL: ${availableSolBalance.toFixed(4)}`);
      this.logger.log(`   Available USDC: ${availableUsdcBalance.toFixed(2)}`);

      for (let i = 0; i < iterations; i++) {
        const testInput = (minInput + maxInput) / 2;

        // Рассчитываем требуемое количество USDC для этого inputAmount
        const res = await PoolUtils.getLiquidityAmountOutFromAmountIn({
          poolInfo,
          slippage: 0,
          inputA: true,
          tickUpper: Math.max(lowerTick, upperTick),
          tickLower: Math.min(lowerTick, upperTick),
          amount: new BN(new Decimal(testInput).mul(10 ** decimalsA).toFixed(0)),
          add: true,
          amountHasFee: true,
          epochInfo,
        });

        // Рассчитываем amountMaxB с учетом slippage (как в setupLiquidityPosition)
        const amountMaxB = new BN(
          new Decimal(res.amountSlippageB.amount.toString())
            .mul(1 + slippage)
            .toFixed(0)
        );

        const requiredUsdcRaw = Number(amountMaxB.toString()) / (10 ** decimalsB);

        this.logger.log(`   Iteration ${i + 1}: Input ${testInput.toFixed(4)} SOL → Requires ${requiredUsdcRaw.toFixed(2)} USDC`);

        if (requiredUsdcRaw <= availableUsdcBalance) {
          // Этот inputAmount подходит, пробуем больше
          optimalInput = testInput;
          requiredUsdc = requiredUsdcRaw;
          minInput = testInput;
        } else {
          // Требует слишком много USDC, пробуем меньше
          maxInput = testInput;
        }
      }

      // 5. Добавляем небольшой запас безопасности (99% от найденного значения)
      const safeInput = optimalInput * 0.99;

      // Пересчитываем финальное требуемое количество USDC
      const finalRes = await PoolUtils.getLiquidityAmountOutFromAmountIn({
        poolInfo,
        slippage: 0,
        inputA: true,
        tickUpper: Math.max(lowerTick, upperTick),
        tickLower: Math.min(lowerTick, upperTick),
        amount: new BN(new Decimal(safeInput).mul(10 ** decimalsA).toFixed(0)),
        add: true,
        amountHasFee: true,
        epochInfo,
      });

      const finalAmountMaxB = new BN(
        new Decimal(finalRes.amountSlippageB.amount.toString())
          .mul(1 + slippage)
          .toFixed(0)
      );

      const finalRequiredUsdc = Number(finalAmountMaxB.toString()) / (10 ** decimalsB);

      this.logger.log('');
      this.logger.log('✅ Optimal input calculated:');
      this.logger.log(`   Input: ${safeInput.toFixed(4)} SOL (${(safeInput / availableSolBalance * 100).toFixed(1)}% of balance)`);
      this.logger.log(`   Required USDC: ${finalRequiredUsdc.toFixed(2)} (${(finalRequiredUsdc / availableUsdcBalance * 100).toFixed(1)}% of balance)`);
      this.logger.log(`   USDC margin: ${(availableUsdcBalance - finalRequiredUsdc).toFixed(2)}`);
      this.logger.log('');

      return {
        inputAmount: safeInput,
        requiredUsdc: finalRequiredUsdc,
      };

    } catch (error) {
      this.logger.error(`Failed to calculate safe input: ${error.message}`);
      // Fallback: очень консервативное значение
      return {
        inputAmount: availableSolBalance * 0.5,
        requiredUsdc: availableUsdcBalance * 0.8,
      };
    }
  }

  async getBalanceByPool(poolId: string) {
    try {
      const publicKey = new PublicKey(this.walletAddress);

      // Получаем информацию о пуле
      const data = await this.raydium.api.fetchPoolById({ ids: poolId });
      const poolInfo = data[0] as ApiV3PoolInfoConcentratedItem;
      const mintA = poolInfo.mintA;
      const mintB = poolInfo.mintB;
      const decimalsA = poolInfo.mintA.decimals;
      const decimalsB = poolInfo.mintB.decimals;

      // Нормализуем символы для CoinGecko
      const symbolA = poolInfo.mintA?.symbol === 'WSOL' ? 'SOL' : poolInfo.mintA?.symbol;
      const symbolB = poolInfo.mintB?.symbol === 'WSOL' ? 'SOL' : poolInfo.mintB?.symbol;

      // Получаем баланс токенов
      const tokenAAta = await getAssociatedTokenAddress(new PublicKey(mintA.address), publicKey);
      const tokenBAta = await getAssociatedTokenAddress(new PublicKey(mintB.address), publicKey);

      let amountA = 0;
      let amountB = 0;

      try {
        if (mintA.symbol === 'WSOL') {
          const solBalance = await this.connection.getBalance(publicKey);
          amountA = solBalance / Math.pow(10, decimalsA);
        } else {
          const accountA = await getAccount(this.connection, tokenAAta);
          amountA = Number(accountA.amount) / Math.pow(10, decimalsA);
        }
      } catch (error) {
        console.log('Error getting balance A:', error.message);
        amountA = 0;
      }

      try {
        if (mintB.symbol === 'WSOL') {
          const solBalance = await this.connection.getBalance(publicKey);
          amountB = solBalance / Math.pow(10, decimalsB);
        } else {
          const accountB = await getAccount(this.connection, tokenBAta);
          amountB = Number(accountB.amount) / Math.pow(10, decimalsB);
        }
      } catch (error) {
        console.log('Error getting balance B:', error.message);
        amountB = 0;
      }

      // Формируем строку символов (убираем дубликаты)
      const uniqueSymbols = Array.from(new Set([symbolA, symbolB]));
      const symbols = uniqueSymbols.join(',');

      // Получаем цены через CoinGecko API
      const prices = await this.getTokenPrices(symbols);

      const priceA = prices[symbolA] || 0;
      const priceB = prices[symbolB] || 0;

      const valueA = amountA * priceA;
      const valueB = amountB * priceB;

      console.log('Prices:', { [symbolA]: priceA, [symbolB]: priceB });

      return {
        [symbolA]: {
          amount: amountA,
          price: priceA,
          valueInUSD: valueA,
        },
        [symbolB]: {
          amount: amountB,
          price: priceB,
          valueInUSD: valueB,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to fetch balance for pool ${poolId}: ${error.message}`);
      throw new Error(`Unable to fetch balance: ${error.message}`);
    }
  }



  async getTokenPrices(symbols: string): Promise<{ [symbol: string]: number }> {
    const cachedPrices: { [symbol: string]: number } = {};
    const symbolsArray = symbols.split(',').map(s => s.trim());

    if (symbolsArray.length === 0) {
      return cachedPrices;
    }

    // Преобразуем символы в CoinGecko IDs
    const coinIds: string[] = [];
    const symbolToIdMapping: { [symbol: string]: string } = {};

    symbolsArray.forEach((symbol) => {
      const normalizedSymbol = symbol.toUpperCase();
      const coinId = this.symbolToCoinGeckoId[normalizedSymbol];

      if (coinId) {
        // Избегаем дубликатов (например, SOL и WSOL -> solana)
        if (!coinIds.includes(coinId)) {
          coinIds.push(coinId);
        }
        symbolToIdMapping[symbol] = coinId;
      } else {
        this.logger.warn(`CoinGecko ID not found for symbol: ${symbol}`);
        cachedPrices[symbol] = 0;
      }
    });

    if (coinIds.length === 0) {
      this.logger.warn(`No valid CoinGecko IDs found for symbols: ${symbols}`);
      return cachedPrices;
    }
    console.log('COINS:', coinIds)
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await axios.get(
          `https://pro-api.coingecko.com/api/v3/simple/price`,
          {
            params: {
              ids: coinIds.join(','),
              vs_currencies: 'usd',
              x_cg_pro_api_key: 'CG-MPdC6LgWbJSZrvC32T6KQUGn'
            }
          }
        );

        // Извлекаем цены для всех символов
        symbolsArray.forEach((symbol) => {
          const coinId = symbolToIdMapping[symbol];

          if (coinId && response.data[coinId]?.usd !== undefined) {
            cachedPrices[symbol] = response.data[coinId].usd;
          } else if (!cachedPrices.hasOwnProperty(symbol)) {
            // Устанавливаем 0 только если цена еще не установлена
            this.logger.warn(`Price not found for ${symbol} (${coinId}) on CoinGecko`);
            cachedPrices[symbol] = 0;
          }
        });

        return cachedPrices;
      } catch (error) {
        if (error.response?.status === 429 && attempt < 3) {
          this.logger.warn(`Rate limit exceeded for CoinGecko, retrying (${attempt}/3)`);
          await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
          continue;
        }

        this.logger.error(
          `Failed to fetch prices for ${symbols} from CoinGecko: ${error.message}`,
          error.stack
        );

        // Устанавливаем 0 для всех символов, для которых не получили цены
        symbolsArray.forEach((symbol) => {
          if (!cachedPrices.hasOwnProperty(symbol)) {
            cachedPrices[symbol] = 0;
          }
        });

        return cachedPrices;
      }
    }

    return cachedPrices;
  }


  async positionInfo(nftMint: string): Promise<{ position: PositionInfo; pool: PoolInfo }> {

    const positionNftMint = new PublicKey(nftMint);
    const positionPubKey = getPdaPersonalPositionAddress(CLMM_PROGRAM_ID, positionNftMint).publicKey;
    console.log('positionPubKey:', positionPubKey.toBase58());
    const pos = await this.raydium.connection.getAccountInfo(positionPubKey);
    console.log('pos:', pos);
    if (!pos) throw new Error('Position not found');
    const position = PositionInfoLayout.decode(pos.data);

    let poolInfo: ApiV3PoolInfoConcentratedItem;
    if (this.cluster === 'mainnet') {
      poolInfo = (await this.raydium.api.fetchPoolById({ ids: position.poolId.toBase58() }))[0] as ApiV3PoolInfoConcentratedItem;
    } else {
      const data = await this.raydium.clmm.getPoolInfoFromRpc(position.poolId.toBase58());
      poolInfo = data.poolInfo;
    }

    const epochInfo = await this.raydium.connection.getEpochInfo();

    // Получаем ценовой диапазон
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

    // Получаем количество токенов A и B в позиции
    const { amountA, amountB } = PositionUtils.getAmountsFromLiquidity({
      poolInfo,
      ownerPosition: position,
      liquidity: position.liquidity,
      slippage: 0,
      add: false,
      epochInfo,
    });
    const [pooledAmountA, pooledAmountB] = [
      new Decimal(amountA.amount.toString()).div(10 ** poolInfo.mintA.decimals).toString(),
      new Decimal(amountB.amount.toString()).div(10 ** poolInfo.mintB.decimals).toString(),
    ];

    // Получаем текущую цену пула
    const rpcPoolData = await this.raydium.clmm.getRpcClmmPoolInfo({ poolId: position.poolId });
    const currentPrice = rpcPoolData.currentPrice;

    // Формируем данные о позиции
    const positionInfo: PositionInfo = {
      positionId: positionNftMint.toBase58(),
      baseAmount: pooledAmountA,
      quoteAmount: pooledAmountB,
      priceRange: {
        lower: Number(priceLower.price),
        upper: Number(priceUpper.price),
      },
      currentPrice: currentPrice,
      profitability: 0, // Заглушка, можно заменить реальным расчётом
      actionHistory: [], // Заглушка
      poolKeys: { id: position.poolId.toBase58() },
    };

    // Формируем данные о пуле
    const poolInfoResponse: PoolInfo = {
      poolId: position.poolId.toBase58(),
      baseMint: poolInfo.mintA.symbol,
      baseMintPublicKey: poolInfo.mintA.address,
      quoteMintPublicKey: poolInfo.mintB.address,
      quoteMint: poolInfo.mintB.symbol,
      currentPrice: currentPrice,
    };

    return { position: positionInfo, pool: poolInfoResponse };
  }


  async fetchAllPositions(): Promise<{ positions: PositionInfo[]; pools: PoolInfo[] }> {

    // Получаем все позиции пользователя из базы данных
    const positionRecords = await this.positionRepository.find();
    if (!positionRecords || positionRecords.length === 0) {
      return { positions: [], pools: [] };
    }

    // Массивы для хранения результатов
    const positions: PositionInfo[] = [];
    const pools: PoolInfo[] = [];

    // Используем Promise.all для параллельного выполнения fetchPositionInfo
    const positionPromises = positionRecords.map(async (record) => {
      try {
        const { position, pool } = await this.fetchPositionInfo(record.positionId);
        return { position, pool };
      } catch (error) {
        console.error(`Error fetching position ${record.positionId}: ${(error as Error).message}`);
        return null; // Возвращаем null для ошибочных позиций
      }
    });

    // Дожидаемся выполнения всех промисов
    const results = await Promise.all(positionPromises);

    // Обрабатываем результаты
    results.forEach((result) => {
      if (result) {
        positions.push(result.position);
        // Добавляем пул только если его ещё нет
        if (!pools.some((p) => p.poolId === result.pool.poolId)) {
          pools.push(result.pool);
        }
      }
    });

    return { positions, pools };
  }

  async fetchPositionInfo(nftMint: string): Promise<{ position: PositionInfo; pool: PoolInfo }> {
    const positionNftMint = new PublicKey(nftMint);
    const positionPubKey = getPdaPersonalPositionAddress(CLMM_PROGRAM_ID, positionNftMint).publicKey;
    const pos = await this.connection.getAccountInfo(positionPubKey);
    if (!pos) throw new Error('Position not found');
    const position = PositionInfoLayout.decode(pos.data);

    let poolInfo: ApiV3PoolInfoConcentratedItem;
    if (this.raydium.cluster === 'mainnet') {
      poolInfo = (await this.raydium.api.fetchPoolById({ ids: position.poolId.toBase58() }))[0] as ApiV3PoolInfoConcentratedItem;
    } else {
      const data = await this.raydium.clmm.getPoolInfoFromRpc(position.poolId.toBase58());
      poolInfo = data.poolInfo;
    }

    const epochInfo = await this.connection.getEpochInfo();

    const priceLower = TickUtils.getTickPrice({ poolInfo, tick: position.tickLower, baseIn: true });
    const priceUpper = TickUtils.getTickPrice({ poolInfo, tick: position.tickUpper, baseIn: true });

    const { amountA, amountB } = PositionUtils.getAmountsFromLiquidity({
      poolInfo,
      ownerPosition: position,
      liquidity: position.liquidity,
      slippage: 0,
      add: false,
      epochInfo,
    });
    const [pooledAmountA, pooledAmountB] = [
      new Decimal(amountA.amount.toString()).div(10 ** poolInfo.mintA.decimals).toString(),
      new Decimal(amountB.amount.toString()).div(10 ** poolInfo.mintB.decimals).toString(),
    ];

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
    const tickArrayRes = await this.connection.getMultipleAccountsInfo([tickLowerArrayAddress, tickUpperArrayAddress]);
    if (!tickArrayRes[0] || !tickArrayRes[1]) throw new Error('Tick data not found');
    const tickArrayLower = TickArrayLayout.decode(tickArrayRes[0].data);
    const tickArrayUpper = TickArrayLayout.decode(tickArrayRes[1].data);
    const tickLowerState = tickArrayLower.ticks[TickUtils.getTickOffsetInArray(position.tickLower, poolInfo.config.tickSpacing)];
    const tickUpperState = tickArrayUpper.ticks[TickUtils.getTickOffsetInArray(position.tickUpper, poolInfo.config.tickSpacing)];

    const rpcPoolData = await this.raydium.clmm.getRpcClmmPoolInfo({ poolId: position.poolId });
    const tokenFees = PositionUtils.GetPositionFeesV2(rpcPoolData, position, tickLowerState, tickUpperState);
    const [tokenFeeAmountA, tokenFeeAmountB] = [
      tokenFees.tokenFeeAmountA.gte(new BN(0)) && tokenFees.tokenFeeAmountA.lt(U64_IGNORE_RANGE)
        ? tokenFees.tokenFeeAmountA
        : new BN(0),
      tokenFees.tokenFeeAmountB.gte(new BN(0)) && tokenFees.tokenFeeAmountB.lt(U64_IGNORE_RANGE)
        ? tokenFees.tokenFeeAmountB
        : new BN(0),
    ];
    const [feeAmountA, feeAmountB] = [
      new Decimal(tokenFeeAmountA.toString()).div(10 ** poolInfo.mintA.decimals).toNumber(),
      new Decimal(tokenFeeAmountB.toString()).div(10 ** poolInfo.mintB.decimals).toNumber(),
    ];

    const rewards = PositionUtils.GetPositionRewardsV2(rpcPoolData, position, tickLowerState, tickUpperState);
    const rewardInfos = rewards.map((r) => (r.gte(new BN(0)) && r.lt(U64_IGNORE_RANGE) ? r : new BN(0)));
    const poolRewardInfos = rewardInfos
      .map((r, idx) => {
        const rewardMint = poolInfo.rewardDefaultInfos.find(
          (r) => r.mint.address === rpcPoolData.rewardInfos[idx].tokenMint.toBase58()
        )?.mint;
        if (!rewardMint) return undefined;
        return {
          mint: rewardMint,
          amount: new Decimal(r.toString()).div(10 ** rewardMint.decimals).toNumber(),
        };
      })
      .filter(Boolean) as { mint: ApiV3Token; amount: number }[];

    const feeARewardIdx = poolRewardInfos.findIndex((r) => r.mint.address === poolInfo.mintA.address);
    if (feeARewardIdx >= 0) poolRewardInfos[feeARewardIdx].amount += feeAmountA;
    else poolRewardInfos.push({ mint: poolInfo.mintA, amount: feeAmountA });
    const feeBRewardIdx = poolRewardInfos.findIndex((r) => r.mint.address === poolInfo.mintB.address);
    if (feeBRewardIdx >= 0) poolRewardInfos[feeBRewardIdx].amount += feeAmountB;
    else poolRewardInfos.push({ mint: poolInfo.mintB, amount: feeAmountB });

    const symbolA = poolInfo.mintA.symbol === 'WSOL' ? 'SOL' : poolInfo.mintA.symbol;
    const symbolB = poolInfo.mintB.symbol === 'WSOL' ? 'SOL' : poolInfo.mintB.symbol;

    // Используем ваш метод getTokenPrices
    const prices = await this.getTokenPrices(`${symbolA},${symbolB}`);
    const priceA = prices[symbolA] || 0;
    const priceB = prices[symbolB] || 0;

    const feesValueA = feeAmountA * priceA;
    const feesValueB = feeAmountB * priceB;

    const positionInfo: PositionInfo = {
      positionId: positionNftMint.toBase58(),
      baseAmount: pooledAmountA,
      quoteAmount: pooledAmountB,
      priceRange: {
        lower: Number(priceLower.price),
        upper: Number(priceUpper.price),
      },
      currentPrice: rpcPoolData.currentPrice,
      profitability: 0,
      actionHistory: [
        `Collected Fees: ${feeAmountA.toFixed(6)} ${poolInfo.mintA.symbol} (${feesValueA.toFixed(2)} USD)`,
        `Collected Fees: ${feeAmountB.toFixed(6)} ${poolInfo.mintB.symbol} (${feesValueB.toFixed(2)} USD)`,
      ],
      poolKeys: { id: position.poolId.toBase58() },
    };

    const poolInfoResponse: PoolInfo = {
      poolId: position.poolId.toBase58(),
      baseMint: poolInfo.mintA.symbol,
      baseMintPublicKey: poolInfo.mintA.address,
      quoteMintPublicKey: poolInfo.mintB.address,
      quoteMint: poolInfo.mintB.symbol,
      currentPrice: rpcPoolData.currentPrice,
    };

    return { position: positionInfo, pool: poolInfoResponse };
  }


  async getWalletPositions(walletAddress: string): Promise<string[]> {
    const owner = new PublicKey(walletAddress);

    // Получаем все токен аккаунты кошелька
    const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
      owner,
      { programId: TOKEN_PROGRAM_ID }
    );
    const positionMints: string[] = [];

    for (const { account } of tokenAccounts.value) {
      const parsedInfo = account.data.parsed.info;
      // Проверяем что это NFT (amount = 1, decimals = 0)
      if (parsedInfo.tokenAmount.amount === '1' &&
        parsedInfo.tokenAmount.decimals === 0) {

        const mint = parsedInfo.mint;
        try {
          // Проверяем что это позиция CLMM
          const positionPubKey = getPdaPersonalPositionAddress(
            CLMM_PROGRAM_ID,
            new PublicKey(mint)
          ).publicKey;
          console.log('positionPubKey:', positionPubKey);
          const positionAccount = await this.connection.getAccountInfo(positionPubKey);
          console.log('positionAccount:', positionAccount);
          // Если аккаунт позиции существует - это валидная позиция
          if (positionAccount) {
            positionMints.push(mint);
          }
        } catch (error) {
          // Пропускаем NFT которые не являются позициями
          continue;
        }
      }
    }

    return positionMints;
  }

  async getCLMMPositions(): Promise<Array<{
    position: PositionInfo;
    pool: PoolInfo;
    hasInitialValue: boolean;
  }>> {
    try {
      const positionMints = await this.getCLMMPositionMints();

      // Параллельно получаем полную информацию по каждой позиции
      const positionPromises = positionMints.map(async (nftMint) => {
        try {
          // Используем улучшенную версию с автосохранением
          const result = await this.fetchPositionInfoEnhanced(nftMint);
          return result;
        } catch (error) {
          console.error(`Error fetching position ${nftMint}:`, (error as Error).message);
          return null;
        }
      });

      const results = await Promise.all(positionPromises);

      // Фильтруем успешные результаты
      const validResults = results.filter(Boolean) as Array<{
        position: PositionInfo;
        pool: PoolInfo;
        hasInitialValue: boolean;
      }>;

      console.log(`Successfully loaded ${validResults.length} positions`);
      console.log(`Positions in DB: ${validResults.filter(r => r.hasInitialValue).length}`);
      console.log(`New positions: ${validResults.filter(r => !r.hasInitialValue).length}`);

      return validResults;

    } catch (error) {
      console.error('Error getting CLMM positions:', error);
      return [];
    }
  }

  /**
   * Получить только NFT mints позиций (вспомогательный метод)
   */
  async getCLMMPositionMints(): Promise<string[]> {
    const owner = new PublicKey(this.walletAddress);

    try {
      const positions = await this.raydium.clmm.getOwnerPositionInfo({ programId: CLMM_PROGRAM_ID });
      console.log('Found CLMM positions via SDK:', positions.length);
      return positions.map(pos => pos.nftMint.toBase58());
    } catch (error) {
      console.log('SDK method failed, trying NFT search...', error);
      // Вариант 2: Ищем NFT токены вручную
      return await this.getCLMMPositionsViaNFT(this.walletAddress);
    }
  }

  /**
   * Поиск CLMM позиций через NFT токены
   */
  async getCLMMPositionsViaNFT(walletAddress: string): Promise<string[]> {
    const owner = new PublicKey(walletAddress);

    const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
      owner,
      { programId: TOKEN_PROGRAM_ID }
    );

    console.log(`Found ${tokenAccounts.value.length} token accounts`);
    const positionMints: string[] = [];

    for (const { account } of tokenAccounts.value) {
      const parsedInfo = account.data.parsed.info;

      // NFT имеют amount = 1 и decimals = 0
      if (parsedInfo.tokenAmount.amount === '1' &&
        parsedInfo.tokenAmount.decimals === 0) {

        const mint = parsedInfo.mint;
        console.log(`Checking NFT mint: ${mint}`);

        try {
          // Проверяем что это CLMM позиция
          const positionPubKey = getPdaPersonalPositionAddress(
            CLMM_PROGRAM_ID,
            new PublicKey(mint)
          ).publicKey;

          const positionAccount = await this.connection.getAccountInfo(positionPubKey);

          if (positionAccount) {
            console.log(`✓ Valid CLMM position found: ${mint}`);
            positionMints.push(mint);
          }
        } catch (error) {
          console.log(`✗ Not a CLMM position: ${mint}`);
          continue;
        }
      }
    }

    console.log(`Total CLMM positions found: ${positionMints.length}`);
    return positionMints;
  }

  async getWalletBalanceUSD(walletAddress: string): Promise<number> {
    try {
      const publicKey = new PublicKey(walletAddress);

      // Получаем баланс SOL
      const solBalance = await this.connection.getBalance(publicKey);
      const solAmount = solBalance / 10 ** 9;

      // Получаем цену SOL
      const prices = await this.getTokenPrices('SOL');
      const solPrice = prices['SOL'] || 0;

      const solValueUSD = solAmount * solPrice;

      // Получаем баланс USDC
      let usdcBalance = 0;
      try {
        const usdcMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
        const usdcAta = await getAssociatedTokenAddress(usdcMint, publicKey);
        const accountInfo = await getAccount(this.connection, usdcAta);
        usdcBalance = Number(accountInfo.amount) / 10 ** 6;
      } catch (error) {
        // USDC account не существует
        usdcBalance = 0;
      }

      const totalBalanceUSD = solValueUSD + usdcBalance;

      this.logger.log(`Wallet Balance: SOL ${solAmount.toFixed(4)} ($${solValueUSD.toFixed(2)}) + USDC ${usdcBalance.toFixed(2)} = $${totalBalanceUSD.toFixed(2)}`);

      return totalBalanceUSD;

    } catch (error) {
      this.logger.error(`Failed to get wallet balance: ${error.message}`);
      return 0;
    }
  }


  async fetchPositionInfoEnhanced(nftMint: string): Promise<{
    position: PositionInfo;
    pool: PoolInfo;
    hasInitialValue: boolean;
  }> {
    const positionNftMint = new PublicKey(nftMint);
    const position = await this.fetchPositionData(positionNftMint);
    const poolInfo = await this.fetchPoolInfo(position.poolId.toBase58());
    const epochInfo = await this.connection.getEpochInfo();

    // Получаем базовые данные
    const priceRange = this.calculatePriceRange(poolInfo, position);
    const rawAmounts = this.calculateRawAmounts(poolInfo, position, epochInfo);
    const rpcPoolData = await this.raydium.clmm.getRpcClmmPoolInfo({ poolId: position.poolId });

    const test = await this.raydium.clmm.getRpcClmmPoolInfo({ poolId: position.poolId.toBase58() });
    const currentPrice = rpcPoolData.currentPrice;

    // Нормализуем символы
    const symbolA = this.normalizeSymbol(poolInfo.mintA.symbol);
    const symbolB = this.normalizeSymbol(poolInfo.mintB.symbol);

    // ✅ Анализируем позицию (senior approach)
    const rangeAnalysis = PositionRangeCalculator.analyze(
      currentPrice,
      priceRange.lower,
      priceRange.upper,
      rawAmounts.amountA,
      rawAmounts.amountB,
      symbolA,
      symbolB,
    );

    // Логируем один раз с правильным уровнем
    this.logPositionAnalysis(rangeAnalysis, symbolA, symbolB, currentPrice, priceRange);

    // Рассчитываем fees и values
    const fees = await this.calculatePositionFees(poolInfo, position, rpcPoolData);

    const prices = await this.getTokenPrices(`${symbolA},${symbolB}`);
    const values = this.calculatePositionValues(
      rangeAnalysis.amountA,
      rangeAnalysis.amountB,
      fees,
      prices,
      symbolA,
      symbolB,
    );

    // Получаем данные из БД
    const dbData = await this.getPositionFromDB(nftMint, values.currentPositionValue, values.totalFeesValue);

    // Формируем результат
    return this.buildPositionResponse(
      positionNftMint,
      rangeAnalysis,
      priceRange,
      currentPrice,
      fees,
      values,
      dbData,
      position.poolId,
      poolInfo,
      symbolA,
      symbolB,
    );
  }


  private async fetchPositionData(positionNftMint: PublicKey) {
    const positionPubKey = getPdaPersonalPositionAddress(CLMM_PROGRAM_ID, positionNftMint).publicKey;
    const pos = await this.connection.getAccountInfo(positionPubKey);

    if (!pos) {
      throw new Error(`Position ${positionNftMint.toBase58()} not found on-chain`);
    }

    return PositionInfoLayout.decode(pos.data);
  }

  private async fetchPoolInfo(poolId: string): Promise<ApiV3PoolInfoConcentratedItem> {
    if (this.raydium.cluster === 'mainnet') {
      const pools = await this.raydium.api.fetchPoolById({ ids: poolId });
      return pools[0] as ApiV3PoolInfoConcentratedItem;
    }

    const { poolInfo } = await this.raydium.clmm.getPoolInfoFromRpc(poolId);
    return poolInfo;
  }

  private calculatePriceRange(poolInfo: ApiV3PoolInfoConcentratedItem, position: any) {
    const priceLower = TickUtils.getTickPrice({
      poolInfo,
      tick: position.tickLower,
      baseIn: true
    });

    const priceUpper = TickUtils.getTickPrice({
      poolInfo,
      tick: position.tickUpper,
      baseIn: true
    });

    return {
      lower: Number(priceLower.price),
      upper: Number(priceUpper.price),
    };
  }

  private calculateRawAmounts(
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

    return {
      amountA: new Decimal(amountA.amount.toString()).div(10 ** poolInfo.mintA.decimals),
      amountB: new Decimal(amountB.amount.toString()).div(10 ** poolInfo.mintB.decimals),
    };
  }

  private normalizeSymbol(symbol: string): string {
    return symbol === 'WSOL' ? 'SOL' : symbol;
  }

  private async calculatePositionFees(
    poolInfo: ApiV3PoolInfoConcentratedItem,
    position: any,
    rpcPoolData: any,
  ) {
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
      tickUpperArrayAddress
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

    const tokenFees = PositionUtils.GetPositionFeesV2(
      rpcPoolData,
      position,
      tickLowerState,
      tickUpperState
    );

    const normalizedFeeA = this.normalizeFeeAmount(
      tokenFees.tokenFeeAmountA,
      poolInfo.mintA.decimals
    );

    const normalizedFeeB = this.normalizeFeeAmount(
      tokenFees.tokenFeeAmountB,
      poolInfo.mintB.decimals
    );

    return {
      amountA: normalizedFeeA,
      amountB: normalizedFeeB,
    };
  }

  private normalizeFeeAmount(feeAmount: any, decimals: number): number {
    const isValid = feeAmount.gte(new BN(0)) && feeAmount.lt(U64_IGNORE_RANGE);
    const validAmount = isValid ? feeAmount : new BN(0);

    return new Decimal(validAmount.toString())
      .div(10 ** decimals)
      .toNumber();
  }

  private calculatePositionValues(
    amountA: string,
    amountB: string,
    fees: { amountA: number; amountB: number },
    prices: Record<string, number>,
    symbolA: string,
    symbolB: string,
  ) {
    const priceA = prices[symbolA] || 0;
    const priceB = prices[symbolB] || 0;

    const pooledValueA = Number(amountA) * priceA;
    const pooledValueB = Number(amountB) * priceB;
    const currentPositionValue = pooledValueA + pooledValueB;

    const feesValueA = fees.amountA * priceA;
    const feesValueB = fees.amountB * priceB;
    const totalFeesValue = feesValueA + feesValueB;

    return {
      pooledValueA,
      pooledValueB,
      currentPositionValue,
      feesValueA,
      feesValueB,
      totalFeesValue,
      priceA,
      priceB,
    };
  }

  private async getPositionFromDB(
    nftMint: string,
    currentPositionValue: number,
    totalFeesValue: number,
  ) {
    try {
      const positionRecord = await this.positionRepository.findOne({
        where: { positionId: nftMint }
      });

      if (!positionRecord) {
        return {
          hasInitialValue: false,
          initialValue: currentPositionValue,
          profitability: 0,
        };
      }

      const positionValueChange = currentPositionValue - positionRecord.initialValue;
      const totalProfit = totalFeesValue + positionValueChange;
      const profitability = positionRecord.initialValue > 0
        ? (totalProfit / positionRecord.initialValue) * 100
        : 0;

      return {
        hasInitialValue: true,
        initialValue: positionRecord.initialValue,
        profitability,
      };
    } catch (error) {
      this.logger.warn(`Could not access position repository: ${error.message}`);
      return {
        hasInitialValue: false,
        initialValue: currentPositionValue,
        profitability: 0,
      };
    }
  }

  private logPositionAnalysis(
    analysis: PositionRangeAnalysis,
    symbolA: string,
    symbolB: string,
    currentPrice: number,
    priceRange: { lower: number; upper: number },
  ) {
    const emoji = PositionRangeCalculator.getStatusEmoji(analysis.status);
    const logLevel = PositionRangeCalculator.getLogLevel(analysis.status);

    this.logger[logLevel]('');
    this.logger[logLevel](`${emoji} ${analysis.message}`);
    this.logger[logLevel](`   ${symbolA}: ${analysis.amountA}`);
    this.logger[logLevel](`   ${symbolB}: ${analysis.amountB}`);
    this.logger[logLevel]('');
  }

  private buildPositionResponse(
    positionNftMint: PublicKey,
    rangeAnalysis: PositionRangeAnalysis,
    priceRange: { lower: number; upper: number },
    currentPrice: number,
    fees: { amountA: number; amountB: number },
    values: any,
    dbData: any,
    poolId: PublicKey,
    poolInfo: ApiV3PoolInfoConcentratedItem,
    symbolA: string,
    symbolB: string,
  ) {
    const positionInfo: PositionInfo = {
      positionId: positionNftMint.toBase58(),
      baseAmount: rangeAnalysis.amountA,
      quoteAmount: rangeAnalysis.amountB,
      priceRange,
      currentPrice,
      profitability: dbData.profitability,
      positionStatus: rangeAnalysis.status,
      actionHistory: [
        `Collected Fees: ${fees.amountA.toFixed(6)} ${symbolA} (${values.feesValueA.toFixed(2)} USD)`,
        `Collected Fees: ${fees.amountB.toFixed(6)} ${symbolB} (${values.feesValueB.toFixed(2)} USD)`,
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
