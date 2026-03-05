// src/liquidity-bot/services/balance-calculator.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { Connection, PublicKey } from '@solana/web3.js';
import { 
  getAssociatedTokenAddress, 
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID 
} from '@solana/spl-token';

// Services
import { PriceFetcherService } from './price-fetcher.service';
import { PoolInfoService } from './pool-info.service';

// Raydium SDK
import { ApiV3PoolInfoConcentratedItem } from '@raydium-io/raydium-sdk-v2';

export interface TokenBalance {
  amount: number;
  price: number;
  valueInUSD: number;
  symbol: string;
}

export interface PoolBalances {
  [symbol: string]: TokenBalance;
}

export interface WalletBalance {
  sol: number;
  usdc: number;
  totalUSD: number;
  tokens: {
    [symbol: string]: {
      amount: number;
      valueUSD: number;
    };
  };
}

@Injectable()
export class BalanceCalculatorService {
  private readonly logger = new Logger(BalanceCalculatorService.name);

  // Standard token mints
  private readonly USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  private readonly USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

  constructor(
    private readonly connection: Connection,
    private readonly priceFetcher: PriceFetcherService,
    private readonly poolInfoService: PoolInfoService,
  ) {}

  // ========================================
  // WALLET BALANCE
  // ========================================

  /**
   * Получить полный баланс кошелька в USD
   */
  async getWalletBalanceUSD(walletAddress: string): Promise<number> {
    try {
      const publicKey = new PublicKey(walletAddress);

      // SOL balance
      const solBalance = await this.connection.getBalance(publicKey);
      const solAmount = solBalance / 1e9;

      // USDC balance
      let usdcAmount = 0;
      try {
        const usdcMint = new PublicKey(this.USDC_MINT);
        const usdcAta = await getAssociatedTokenAddress(usdcMint, publicKey);
        const usdcAccount = await getAccount(this.connection, usdcAta);
        usdcAmount = Number(usdcAccount.amount) / 1e6;
      } catch {
        usdcAmount = 0;
      }

      // Получаем цену SOL
      const prices = await this.priceFetcher.getTokenPrices('SOL');
      const solPrice = prices['SOL'] || 0;

      const solValueUSD = solAmount * solPrice;
      const usdcValueUSD = usdcAmount; // USDC = $1

      const totalBalanceUSD = solValueUSD + usdcValueUSD;

      this.logger.log('💼 Wallet Balance:');
      this.logger.log(`   SOL:  ${solAmount.toFixed(4)} ($${solValueUSD.toFixed(2)})`);
      this.logger.log(`   USDC: ${usdcAmount.toFixed(2)} ($${usdcValueUSD.toFixed(2)})`);
      this.logger.log(`   Total: $${totalBalanceUSD.toFixed(2)}`);

      return totalBalanceUSD;

    } catch (error) {
      this.logger.error(`Failed to get wallet balance: ${error.message}`);
      return 0;
    }
  }

  /**
   * Получить детальный баланс кошелька
   */
  async getWalletBalanceDetailed(walletAddress: string): Promise<WalletBalance> {
    const publicKey = new PublicKey(walletAddress);

    // SOL
    const solBalance = await this.connection.getBalance(publicKey);
    const sol = solBalance / 1e9;

    // USDC
    let usdc = 0;
    try {
      const usdcMint = new PublicKey(this.USDC_MINT);
      const usdcAta = await getAssociatedTokenAddress(usdcMint, publicKey);
      const usdcAccount = await getAccount(this.connection, usdcAta);
      usdc = Number(usdcAccount.amount) / 1e6;
    } catch {
      usdc = 0;
    }

    // USDT
    let usdt = 0;
    try {
      const usdtMint = new PublicKey(this.USDT_MINT);
      const usdtAta = await getAssociatedTokenAddress(usdtMint, publicKey);
      const usdtAccount = await getAccount(this.connection, usdtAta);
      usdt = Number(usdtAccount.amount) / 1e6;
    } catch {
      usdt = 0;
    }

    // Получаем цены
    const prices = await this.priceFetcher.getTokenPrices('SOL');
    const solPrice = prices['SOL'] || 0;

    const solValueUSD = sol * solPrice;
    const usdcValueUSD = usdc;
    const usdtValueUSD = usdt;

    const totalUSD = solValueUSD + usdcValueUSD + usdtValueUSD;

    return {
      sol,
      usdc,
      totalUSD,
      tokens: {
        SOL: {
          amount: sol,
          valueUSD: solValueUSD,
        },
        USDC: {
          amount: usdc,
          valueUSD: usdcValueUSD,
        },
        USDT: {
          amount: usdt,
          valueUSD: usdtValueUSD,
        },
      },
    };
  }

  // ========================================
  // POOL BALANCES
  // ========================================

  /**
   * Получить балансы токенов пула
   */
  async getPoolBalances(poolId: string): Promise<PoolBalances> {
    try {
      const publicKey = new PublicKey(this.walletAddress);

      // Получаем информацию о пуле
      const poolData = await this.poolInfoService.getPoolData(poolId);
      const poolInfo = poolData.poolInfo;

      const mintA = poolInfo.mintA;
      const mintB = poolInfo.mintB;
      const decimalsA = mintA.decimals;
      const decimalsB = mintB.decimals;

      // Нормализуем символы
      const symbolA = this.poolInfoService.normalizeSymbol(mintA.symbol);
      const symbolB = this.poolInfoService.normalizeSymbol(mintB.symbol);

      // Получаем балансы
      let amountA = 0;
      let amountB = 0;

      try {
        if (mintA.symbol === 'WSOL') {
          const solBalance = await this.connection.getBalance(publicKey);
          amountA = solBalance / Math.pow(10, decimalsA);
        } else {
          const tokenAAta = await getAssociatedTokenAddress(
            new PublicKey(mintA.address),
            publicKey
          );
          const accountA = await getAccount(this.connection, tokenAAta);
          amountA = Number(accountA.amount) / Math.pow(10, decimalsA);
        }
      } catch (error) {
        this.logger.warn(`Error getting balance A: ${error.message}`);
        amountA = 0;
      }

      try {
        if (mintB.symbol === 'WSOL') {
          const solBalance = await this.connection.getBalance(publicKey);
          amountB = solBalance / Math.pow(10, decimalsB);
        } else {
          const tokenBAta = await getAssociatedTokenAddress(
            new PublicKey(mintB.address),
            publicKey
          );
          const accountB = await getAccount(this.connection, tokenBAta);
          amountB = Number(accountB.amount) / Math.pow(10, decimalsB);
        }
      } catch (error) {
        this.logger.warn(`Error getting balance B: ${error.message}`);
        amountB = 0;
      }

      // Получаем цены
      const uniqueSymbols = Array.from(new Set([symbolA, symbolB]));
      const symbols = uniqueSymbols.join(',');
      const prices = await this.priceFetcher.getTokenPrices(symbols);

      const priceA = prices[symbolA] || 0;
      const priceB = prices[symbolB] || 0;

      const valueA = amountA * priceA;
      const valueB = amountB * priceB;

      this.logger.log(`Pool ${poolId.slice(0, 8)}... balances:`);
      this.logger.log(`  ${symbolA}: ${amountA.toFixed(6)} ($${valueA.toFixed(2)})`);
      this.logger.log(`  ${symbolB}: ${amountB.toFixed(6)} ($${valueB.toFixed(2)})`);

      return {
        [symbolA]: {
          amount: amountA,
          price: priceA,
          valueInUSD: valueA,
          symbol: symbolA,
        },
        [symbolB]: {
          amount: amountB,
          price: priceB,
          valueInUSD: valueB,
          symbol: symbolB,
        },
      };

    } catch (error) {
      this.logger.error(`Failed to fetch pool balances: ${error.message}`);
      throw new Error(`Unable to fetch pool balances: ${error.message}`);
    }
  }

  // ========================================
  // TOKEN BALANCES
  // ========================================

  /**
   * Получить баланс конкретного токена
   */
  async getTokenBalance(params: {
    walletAddress: string;
    tokenMint: string;
    decimals: number;
    symbol: string;
  }): Promise<TokenBalance> {
    
    const { walletAddress, tokenMint, decimals, symbol } = params;
    const publicKey = new PublicKey(walletAddress);

    let amount = 0;

    try {
      if (tokenMint === 'native' || symbol === 'SOL') {
        // Native SOL
        const balance = await this.connection.getBalance(publicKey);
        amount = balance / 1e9;
      } else {
        // SPL Token
        const tokenAta = await getAssociatedTokenAddress(
          new PublicKey(tokenMint),
          publicKey,
          false,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );

        const account = await getAccount(this.connection, tokenAta);
        amount = Number(account.amount) / Math.pow(10, decimals);
      }
    } catch (error) {
      this.logger.warn(`Token balance not found for ${symbol}: ${error.message}`);
      amount = 0;
    }

    // Получаем цену
    const prices = await this.priceFetcher.getTokenPrices(symbol);
    const price = prices[symbol] || 0;
    const valueInUSD = amount * price;

    return {
      amount,
      price,
      valueInUSD,
      symbol,
    };
  }

  /**
   * Получить баланс SOL
   */
  async getSolBalance(walletAddress: string): Promise<{
    lamports: number;
    sol: number;
    valueUSD: number;
  }> {
    const publicKey = new PublicKey(walletAddress);
    const lamports = await this.connection.getBalance(publicKey);
    const sol = lamports / 1e9;

    const prices = await this.priceFetcher.getTokenPrices('SOL');
    const solPrice = prices['SOL'] || 0;
    const valueUSD = sol * solPrice;

    return { lamports, sol, valueUSD };
  }

  /**
   * Получить баланс USDC
   */
  async getUsdcBalance(walletAddress: string): Promise<{
    raw: number;
    usdc: number;
    valueUSD: number;
  }> {
    const publicKey = new PublicKey(walletAddress);

    try {
      const usdcMint = new PublicKey(this.USDC_MINT);
      const usdcAta = await getAssociatedTokenAddress(usdcMint, publicKey);
      const account = await getAccount(this.connection, usdcAta);
      
      const raw = Number(account.amount);
      const usdc = raw / 1e6;
      const valueUSD = usdc; // USDC ≈ $1

      return { raw, usdc, valueUSD };

    } catch (error) {
      return { raw: 0, usdc: 0, valueUSD: 0 };
    }
  }

  async hasSufficientBalance(params: {
    walletAddress: string;
    requiredSol: number;
    requiredUsdc: number;
  }): Promise<boolean> {
    
    const { walletAddress, requiredSol, requiredUsdc } = params;

    const { sol } = await this.getSolBalance(walletAddress);
    const { usdc } = await this.getUsdcBalance(walletAddress);

    const hasEnoughSol = sol >= requiredSol;
    const hasEnoughUsdc = usdc >= requiredUsdc;

    return hasEnoughSol && hasEnoughUsdc;
  }

  /**
   * Форматировать баланс для отображения
   */
  formatBalance(balance: TokenBalance): string {
    return `${balance.amount.toFixed(6)} ${balance.symbol} ($${balance.valueInUSD.toFixed(2)})`;
  }

  /**
   * Рассчитать общую стоимость балансов
   */
  calculateTotalValue(balances: PoolBalances): number {
    return Object.values(balances).reduce(
      (total, balance) => total + balance.valueInUSD,
      0
    );
  }

  /**
   * Получить адрес кошелька из конфига
   */
  private get walletAddress(): string {
    // Это должно быть получено из CommonRaydiumService или ConfigService
    // Для упрощения используем прямой доступ
    throw new Error('walletAddress should be injected from service');
  }
}