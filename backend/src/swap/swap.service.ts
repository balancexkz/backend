// src/services/swap.service.ts

import { Injectable, Logger, HttpException, HttpStatus, OnModuleInit } from '@nestjs/common';
import { PublicKey, Connection } from '@solana/web3.js';
import {
  ApiV3PoolInfoConcentratedItem,
  ClmmKeys,
  ComputeClmmPoolInfo,
  PoolUtils,
  ReturnTypeFetchMultiplePoolTickArrays,
  Raydium
} from '@raydium-io/raydium-sdk-v2';
import { BN } from 'bn.js';
import Decimal from 'decimal.js';
import { txVersion } from '../liquidity-bot/config';
import { ConfigService } from '@nestjs/config';
import { CommonRaydiumService } from '../common/common-raydium.service';
import { TransactionExecutor } from '../utils/transaction-executor.utils';
import { TransactionService } from 'src/transaction/transaction.service';
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';
import axios from 'axios';



interface SwapParams {
  poolId: string;
  inputMint: string;
  inputAmount: number; // В UI формате (например, 1.5 SOL)
  slippage?: number;
  maxRetries?: number;
}

interface SwapResult {
  txId: string;
  amountOut: string;
  inputAmount: string;
  outputAmount: string;
  priceImpact: number;
}

@Injectable()
export class SwapService extends CommonRaydiumService implements OnModuleInit { // Добавил implements OnModuleInit
  protected readonly logger = new Logger(SwapService.name);
  private readonly transactionExecutor: TransactionExecutor;
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
   constructor(
    configService: ConfigService,
    private readonly transactionService: TransactionService, 
  ) {
    super(configService);
  }
  async onModuleInit(): Promise<void> {
    await this.initializeRaydium(); 
    this.logger.log('SwapService initialized successfully');
  }



  async executeSwap(params: SwapParams): Promise<SwapResult> {

    const {
      poolId,
      inputMint,
      inputAmount,
      slippage = 0.025,
      maxRetries = 3,
    } = params;


    // 1. Получаем информацию о пуле
    const poolData = await this.getPoolData(poolId);
    const { poolInfo, poolKeys, clmmPoolInfo, tickCache } = poolData;
    // 2. Валидация inputMint
    if (inputMint !== poolInfo.mintA.address && inputMint !== poolInfo.mintB.address) {
      throw new HttpException(
        'Input mint does not match pool tokens',
        HttpStatus.BAD_REQUEST
      );
    }

    const baseIn = inputMint === poolInfo.mintA.address;
    const inputMintInfo = poolInfo[baseIn ? 'mintA' : 'mintB'];
    const outputMintInfo = poolInfo[baseIn ? 'mintB' : 'mintA'];
    // 3. Конвертируем в raw amount
    const inputAmountRaw = new BN(
      new Decimal(inputAmount)
        .mul(10 ** inputMintInfo.decimals)
        .toFixed(0)
    );

    this.logger.log('');
    this.logger.log(`🔄 Swapping ${inputAmount} ${inputMintInfo.symbol} → ${outputMintInfo.symbol}`);
    this.logger.log(`   Pool: ${poolId}`);
    this.logger.log(`   Pool price: ${poolInfo.price.toFixed(6)} ${outputMintInfo.symbol}/${inputMintInfo.symbol}`);

    // Log pool fees if available
    if (clmmPoolInfo.ammConfig) {
      this.logger.log(`   Fee rate: ${clmmPoolInfo.ammConfig.tradeFeeRate / 10000}%`);
    }

    // 4. Рассчитываем ожидаемый output БЕЗ slippage (реальный expected)
    const epochInfo = await this.raydium.fetchEpochInfo();

    // Сначала получаем реальный expected БЕЗ slippage
    const computeResult = PoolUtils.computeAmountOutFormat({
      poolInfo: clmmPoolInfo,
      tickArrayCache: tickCache[poolId],
      amountIn: inputAmountRaw,
      tokenOut: outputMintInfo,
      slippage: 0, // БЕЗ slippage для реального расчета
      epochInfo,
    });

    const expectedOut = new Decimal(computeResult.minAmountOut.amount.raw.toString())
      .div(10 ** outputMintInfo.decimals);

    // Логируем детали расчета
    this.logger.log(`   Compute result (slippage=0):`);
    this.logger.log(`     Expected out: ${expectedOut.toString()} ${outputMintInfo.symbol}`);

    // Теперь получаем минимальный output С slippage (для транзакции)
    const { minAmountOut, remainingAccounts } = PoolUtils.computeAmountOutFormat({
      poolInfo: clmmPoolInfo,
      tickArrayCache: tickCache[poolId],
      amountIn: inputAmountRaw,
      tokenOut: outputMintInfo,
      slippage,
      epochInfo,
    });

    const minOut = new Decimal(minAmountOut.amount.raw.toString())
      .div(10 ** outputMintInfo.decimals);

    this.logger.log(`   Compute result (slippage=${(slippage * 100).toFixed(1)}%):`);
    this.logger.log(`     Minimum out: ${minOut.toString()} ${outputMintInfo.symbol}`);

    // Рассчитываем price impact
    const price = poolInfo.price;
    const expectedPrice = inputAmount / parseFloat(expectedOut.toString());
    const priceImpact = Math.abs((expectedPrice - price) / price) * 100;

    this.logger.log(`Expected output: ${expectedOut.toString()} ${outputMintInfo.symbol}`);
    this.logger.log(`Minimum output (with ${(slippage * 100).toFixed(1)}% slippage): ${minOut.toString()} ${outputMintInfo.symbol}`);
    this.logger.log(`Price impact: ${priceImpact.toFixed(2)}%`);

    // 5. Создаем swap транзакцию
    const { execute } = await this.raydium.clmm.swap({
      poolInfo,
      poolKeys,
      inputMint: inputMintInfo.address,
      amountIn: inputAmountRaw,
      amountOutMin: minAmountOut.amount.raw,
      observationId: clmmPoolInfo.observationId,
      ownerInfo: {
        useSOLBalance: true,
      },
      remainingAccounts,
      txVersion,
      computeBudgetConfig: {
        units: 600000,
        microLamports: 5000000, // Высокий приоритет
      },
    });

    // 6. Выполняем с retry логикой
    let lastError: any;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.log(`Attempt ${attempt}/${maxRetries}`);
        
        const { txId } = await execute({
          sendAndConfirm: true,
          skipPreflight: true, // Быстрее
        });
        const walletBalance = await this.getWalletBalanceUSD(this.walletAddress, poolInfo.price)
        const swapData = await this.getSwapFromHelius(txId)
        const currentSolPrice = await this.getTokenPrices('SOL')
        const solPrice = currentSolPrice['SOL']

        // Логируем реальный результат vs ожидание
        if (swapData) {
          const actualOutput = swapData.outputAmount;
          const actualInput = swapData.inputAmount;
          const difference = actualOutput - parseFloat(expectedOut.toString());
          const diffPercent = (difference / parseFloat(expectedOut.toString())) * 100;

          // Рассчитываем реальную цену vs expected
          const actualPrice = actualInput / actualOutput;
          const expectedPriceCalc = inputAmount / parseFloat(expectedOut.toString());
          const priceDiff = ((actualPrice - expectedPriceCalc) / expectedPriceCalc) * 100;

          this.logger.log('');
          this.logger.log(`📊 Swap Result Comparison:`);
          this.logger.log(`   Input:`);
          this.logger.log(`     Expected: ${inputAmount} ${inputMintInfo.symbol}`);
          this.logger.log(`     Actual:   ${actualInput.toFixed(6)} ${inputMintInfo.symbol}`);
          this.logger.log(`   Output:`);
          this.logger.log(`     Expected: ${expectedOut.toString()} ${outputMintInfo.symbol}`);
          this.logger.log(`     Minimum:  ${minOut.toString()} ${outputMintInfo.symbol}`);
          this.logger.log(`     Actual:   ${actualOutput.toFixed(6)} ${outputMintInfo.symbol}`);
          this.logger.log(`   Difference from expected: ${difference >= 0 ? '+' : ''}${difference.toFixed(6)} (${diffPercent >= 0 ? '+' : ''}${diffPercent.toFixed(2)}%)`);
          this.logger.log(`   Price difference: ${priceDiff >= 0 ? '+' : ''}${priceDiff.toFixed(2)}%`);
          this.logger.log('');
        }

        await this.transactionService.saveSwap({
          positionId: '',
          txHash: txId,
          poolId,
          inputToken: swapData?.inputToken,
          inputAmount: swapData?.inputAmount,
          outputToken: swapData?.outputToken,
          outputAmount: swapData?.outputAmount,
          solPrice: solPrice,
          balance: walletBalance
        })
        this.logger.log(`✅ Swap successful: https://explorer.solana.com/tx/${txId}`);

        return {
          txId,
          amountOut: swapData?.outputAmount.toString() || expectedOut.toString(), // Используем реальный результат
          inputAmount: swapData?.inputAmount.toString() || inputAmount.toString(),
          outputAmount: swapData?.outputAmount.toString() || expectedOut.toString(),
          priceImpact,
        };

      } catch (error) {
        lastError = error;
        this.logger.warn(`Attempt ${attempt} failed: ${error.message}`);

        if (attempt < maxRetries) {
          // Экспоненциальная задержка
          const delay = 1000 * Math.pow(2, attempt - 1);
          this.logger.log(`Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }
    
    // Все попытки провалились
    throw new HttpException(
      `Swap failed after ${maxRetries} attempts: ${lastError.message}`,
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }

    private async getSwapFromHelius(
    txId: string,
  ) {
    try {
      // Ждем индексации
      await this.sleep(2000);
  
      const response = await fetch(
        `https://api.helius.xyz/v0/transactions/?api-key=${process.env.HELIUS_API_KEY}`,
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
  
      if (!swapMatch) {
        this.logger.warn(`Could not parse: ${description}`);
        return;
      }
  
      const [_, inputAmountStr, inputToken, outputAmountStr, outputToken] = swapMatch;
  
      const inputAmount = parseFloat(inputAmountStr);
      const outputAmount = parseFloat(outputAmountStr);
  
    return {
      inputToken, 
      inputAmount,
      outputToken,
      outputAmount
    }
  
    } catch (error) {
      this.logger.error(`Failed to parse swap from Helius: ${error.message}`);
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
 
 async executeSwapWithRetry(params: {
   poolId: string;
   inputMint: string;
   inputAmount: number;
   slippage?: number;
   minOutputAmount?: number;
 }): Promise<{ success: boolean; txId?: string; amountOut?: number }> {
   
   let currentSlippage = params.slippage || 0.05; // Начинаем с 5%
   const maxSlippage = 0.1; // Максимум 10%
   
   // Стратегия: увеличиваем slippage при каждой попытке
   const attemptSwap = async (attemptNumber: number) => {
     // Увеличиваем slippage с каждой попыткой
     if (attemptNumber > 1) {
       currentSlippage = Math.min(currentSlippage * 1.5, maxSlippage);
       this.logger.log(`   Increasing slippage to ${(currentSlippage * 100).toFixed(1)}%`);
     }
     
     return this.executeSwap({
       ...params,
       slippage: currentSlippage,
     });
   };

   const result = await this.transactionExecutor.executeWithRetry(
     async () => {
       const attempts = result?.attempts || 1;
       return attemptSwap(attempts);
     },
     'Swap Transaction',
     {
       maxRetries: 5,
       initialDelay: 2000,
       maxDelay: 16000,
       backoffMultiplier: 2,
     },
     (error) => {
       // Определяем, стоит ли повторять
       const errorMsg = error.message?.toLowerCase() || '';
       
       // Не повторяем если недостаточно баланса
       if (errorMsg.includes('insufficient')) {
         return false;
       }
       
       // Повторяем для всех остальных ошибок
       return true;
     },
   );

   if (result.success && result.data) {
     return {
       success: true,
       txId: result.data.txId,
       amountOut: result.data.amountOut,
     };
   }

   return {
     success: false,
   };
 }


 async getWalletBalanceUSD(walletAddress: string, solPrice: number): Promise<number> {
     try {
       const publicKey = new PublicKey(walletAddress);
 
       // Получаем баланс SOL
       const solBalance = await this.connection.getBalance(publicKey);
       const solAmount = solBalance / 10 ** 9;
 
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

  private async getPoolData(poolId: string): Promise<{
    poolInfo: ApiV3PoolInfoConcentratedItem;
    poolKeys: ClmmKeys | undefined;
    clmmPoolInfo: ComputeClmmPoolInfo;
    tickCache: ReturnTypeFetchMultiplePoolTickArrays;
  }> {
    let poolInfo: ApiV3PoolInfoConcentratedItem;
    let poolKeys: ClmmKeys | undefined;
    let clmmPoolInfo: ComputeClmmPoolInfo;
    let tickCache: ReturnTypeFetchMultiplePoolTickArrays;

    if (this.cluster === 'mainnet') {
      const data = await this.raydium.api.fetchPoolById({ ids: poolId });
      poolInfo = data[0] as ApiV3PoolInfoConcentratedItem;

      clmmPoolInfo = await PoolUtils.fetchComputeClmmInfo({
        connection: this.connection,
        poolInfo,
      });

      tickCache = await PoolUtils.fetchMultiplePoolTickArrays({
        connection: this.connection,
        poolKeys: [clmmPoolInfo],
      });
    } else {
      const data = await this.raydium.clmm.getPoolInfoFromRpc(poolId);
      poolInfo = data.poolInfo;
      poolKeys = data.poolKeys;
      clmmPoolInfo = data.computePoolInfo;
      tickCache = data.tickData;
    }

    return { poolInfo, poolKeys, clmmPoolInfo, tickCache };
  }

  /**
   * Получение quote для свапа БЕЗ выполнения
   * Используется для предпросмотра
   */
  async getSwapQuote(params: Omit<SwapParams, 'maxRetries' | 'slippage'>): Promise<{
    expectedOutput: string;
    priceImpact: number;
  }> {
    const { poolId, inputMint, inputAmount } = params;

    const poolData = await this.getPoolData(poolId);
    const { poolInfo, clmmPoolInfo, tickCache } = poolData;

    const baseIn = inputMint === poolInfo.mintA.address;
    const inputMintInfo = poolInfo[baseIn ? 'mintA' : 'mintB'];
    const outputMintInfo = poolInfo[baseIn ? 'mintB' : 'mintA'];

    const inputAmountRaw = new BN(
      new Decimal(inputAmount)
        .mul(10 ** inputMintInfo.decimals)
        .toFixed(0)
    );

    const epochInfo = await this.raydium.fetchEpochInfo();

    // Получаем реальный expected БЕЗ slippage
    const { minAmountOut: expectedAmountOut } = PoolUtils.computeAmountOutFormat({
      poolInfo: clmmPoolInfo,
      tickArrayCache: tickCache[poolId],
      amountIn: inputAmountRaw,
      tokenOut: outputMintInfo,
      slippage: 0, // ВСЕГДА БЕЗ slippage
      epochInfo,
    });

    const expectedOut = new Decimal(expectedAmountOut.amount.raw.toString())
      .div(10 ** outputMintInfo.decimals);

    const price = poolInfo.price;
    const expectedPrice = inputAmount / parseFloat(expectedOut.toString());
    const priceImpact = Math.abs((expectedPrice - price) / price) * 100;

    return {
      expectedOutput: expectedOut.toString(),
      priceImpact,
    };
  }

  /**
   * Вспомогательная функция задержки
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}