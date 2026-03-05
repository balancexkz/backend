// src/liquidity-bot/services/validators/balance.validator.ts

import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { BN } from 'bn.js';

export interface BalanceRequirements {
  requiredSol: number;
  requiredUsdc: number;
  availableSol: number;
  availableUsdc: number;
  hasEnough: boolean;
  solMargin: number;
  usdcMargin: number;
}

export interface WalletBalances {
  sol: number;
  usdc: number;
  solLamports: number;
  usdcRaw: number;
}

@Injectable()
export class BalanceValidatorService {
  private readonly logger = new Logger(BalanceValidatorService.name);
  private readonly MIN_SOL_FOR_FEES = 0.05; // 0.05 SOL минимум для комиссий

  constructor(private readonly connection: Connection) {}

  // ========================================
  // BALANCE VALIDATION
  // ========================================

  /**
   * Проверить достаточно ли балансов для операции
   */
  async validateBalances(params: {
    walletAddress: string;
    requiredSolLamports;
    requiredUsdcRaw;
    usdcMint: string;
    usdcDecimals: number;
    operation: string;
  }): Promise<BalanceRequirements> {
    
    const { 
      walletAddress, 
      requiredSolLamports, 
      requiredUsdcRaw, 
      usdcMint, 
      usdcDecimals, 
      operation 
    } = params;
    
    const publicKey = new PublicKey(walletAddress);

    // Получаем балансы
    const balances = await this.getWalletBalances({
      walletAddress,
      usdcMint,
      usdcDecimals,
    });

    const requiredSol = requiredSolLamports.toNumber() / 1e9;
    const requiredUsdc = requiredUsdcRaw.toNumber() / (10 ** usdcDecimals);

    // Проверяем достаточность
    const hasEnoughSol = balances.sol >= requiredSol;
    const hasEnoughUsdc = balances.usdc >= requiredUsdc;
    const hasEnough = hasEnoughSol && hasEnoughUsdc;

    // Рассчитываем margins
    const solMargin = balances.sol - requiredSol;
    const usdcMargin = balances.usdc - requiredUsdc;

    // Логирование
    this.logger.log('');
    this.logger.log(`💰 Balance check for ${operation}:`);
    this.logger.log(`   SOL:  ${balances.sol.toFixed(4)} / ${requiredSol.toFixed(4)} ${hasEnoughSol ? '✅' : '❌'}`);
    this.logger.log(`         Margin: ${solMargin >= 0 ? '+' : ''}${solMargin.toFixed(4)} SOL`);
    this.logger.log(`   USDC: ${balances.usdc.toFixed(2)} / ${requiredUsdc.toFixed(2)} ${hasEnoughUsdc ? '✅' : '❌'}`);
    this.logger.log(`         Margin: ${usdcMargin >= 0 ? '+' : ''}${usdcMargin.toFixed(2)} USDC`);
    this.logger.log('');

    // Выбрасываем ошибку если не хватает
    if (!hasEnough) {
      const errors: string[] = [];
      
      if (!hasEnoughSol) {
        errors.push(
          `Insufficient SOL: need ${requiredSol.toFixed(4)}, have ${balances.sol.toFixed(4)} (short ${Math.abs(solMargin).toFixed(4)})`
        );
      }
      
      if (!hasEnoughUsdc) {
        errors.push(
          `Insufficient USDC: need ${requiredUsdc.toFixed(2)}, have ${balances.usdc.toFixed(2)} (short ${Math.abs(usdcMargin).toFixed(2)})`
        );
      }

      throw new HttpException(
        errors.join('; '),
        HttpStatus.FORBIDDEN
      );
    }

    return {
      requiredSol,
      requiredUsdc,
      availableSol: balances.sol,
      availableUsdc: balances.usdc,
      hasEnough,
      solMargin,
      usdcMargin,
    };
  }

  // ========================================
  // GET BALANCES
  // ========================================

  /**
   * Получить текущие балансы кошелька
   */
  async getWalletBalances(params: {
    walletAddress: string;
    usdcMint: string;
    usdcDecimals: number;
  }): Promise<WalletBalances> {
    
    const { walletAddress, usdcMint, usdcDecimals } = params;
    const publicKey = new PublicKey(walletAddress);

    // SOL balance
    const solLamports = await this.connection.getBalance(publicKey);
    const sol = solLamports / 1e9;

    // USDC balance
    let usdcRaw = 0;
    let usdc = 0;

    try {
      const usdcAta = await getAssociatedTokenAddress(
        new PublicKey(usdcMint),
        publicKey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const usdcAccount = await getAccount(
        this.connection,
        usdcAta,
        undefined,
        TOKEN_PROGRAM_ID
      );

      usdcRaw = Number(usdcAccount.amount);
      usdc = usdcRaw / (10 ** usdcDecimals);

    } catch (error) {
      // USDC account не существует
      this.logger.warn(`USDC account not found for ${walletAddress.slice(0, 8)}...`);
      usdcRaw = 0;
      usdc = 0;
    }

    return {
      sol,
      usdc,
      solLamports,
      usdcRaw,
    };
  }

  /**
   * Получить SOL баланс
   */
  async getSolBalance(walletAddress: string): Promise<{ lamports: number; sol: number }> {
    const publicKey = new PublicKey(walletAddress);
    const lamports = await this.connection.getBalance(publicKey);
    const sol = lamports / 1e9;

    return { lamports, sol };
  }

  /**
   * Получить SPL Token баланс
   */
  async getSPLTokenBalance(params: {
    walletAddress: string;
    tokenMint: string;
    decimals: number;
  }): Promise<{ raw: number; amount: number }> {
    
    const { walletAddress, tokenMint, decimals } = params;
    const publicKey = new PublicKey(walletAddress);

    try {
      const tokenAta = await getAssociatedTokenAddress(
        new PublicKey(tokenMint),
        publicKey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const tokenAccount = await getAccount(
        this.connection,
        tokenAta,
        undefined,
        TOKEN_PROGRAM_ID
      );

      const raw = Number(tokenAccount.amount);
      const amount = raw / (10 ** decimals);

      return { raw, amount };

    } catch (error) {
      return { raw: 0, amount: 0 };
    }
  }

  // ========================================
  // MINIMUM BALANCE CHECKS
  // ========================================

  /**
   * Проверить минимальный баланс SOL для fees
   */
  async validateMinimumSolForFees(
    walletAddress: string,
    minSol?: number,
  ): Promise<void> {
    
    const minimumRequired = minSol || this.MIN_SOL_FOR_FEES;
    const { sol } = await this.getSolBalance(walletAddress);

    if (sol < minimumRequired) {
      throw new HttpException(
        `Insufficient SOL for transaction fees. ` +
        `Required: ${minimumRequired} SOL, Available: ${sol.toFixed(4)} SOL`,
        HttpStatus.FORBIDDEN
      );
    }
  }

  /**
   * Проверить может ли кошелек выполнить операцию (имеет минимальный баланс)
   */
  async canExecuteOperation(walletAddress: string): Promise<boolean> {
    try {
      await this.validateMinimumSolForFees(walletAddress);
      return true;
    } catch {
      return false;
    }
  }

  // ========================================
  // UTILITIES
  // ========================================

  /**
   * Получить минимальный безопасный баланс SOL для fees
   */
  getMinimumSolForFees(): number {
    return this.MIN_SOL_FOR_FEES;
  }

  /**
   * Рассчитать сколько SOL нужно для операции (с запасом)
   */
  calculateRequiredSolWithFees(params: {
    inputAmount: number;
    operationType: 'open' | 'close' | 'increase';
  }): number {
    
    const { inputAmount, operationType } = params;

    const feeEstimates = {
      open: 0.05,      // ~0.05 SOL для открытия
      close: 0.03,     // ~0.03 SOL для закрытия
      increase: 0.03,  // ~0.03 SOL для увеличения
    };

    const estimatedFees = feeEstimates[operationType];
    
    // Input amount + fees + 10% запас
    return inputAmount + estimatedFees + (estimatedFees * 0.1);
  }

  /**
   * Форматировать баланс для логов
   */
  formatBalance(amount: number, symbol: string, decimals: number = 4): string {
    return `${amount.toFixed(decimals)} ${symbol}`;
  }

  /**
   * Проверить ATA существует ли
   */
  async ataExists(params: {
    walletAddress: string;
    tokenMint: string;
  }): Promise<boolean> {
    
    const { walletAddress, tokenMint } = params;
    const publicKey = new PublicKey(walletAddress);

    try {
      const ata = await getAssociatedTokenAddress(
        new PublicKey(tokenMint),
        publicKey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const accountInfo = await this.connection.getAccountInfo(ata);
      return accountInfo !== null;

    } catch {
      return false;
    }
  }

  /**
   * Логировать балансы кошелька
   */
  async logWalletBalances(params: {
    walletAddress: string;
    usdcMint: string;
    usdcDecimals: number;
  }): Promise<void> {
    
    const balances = await this.getWalletBalances(params);

    this.logger.log('');
    this.logger.log('💼 Wallet Balances:');
    this.logger.log(`   Address: ${params.walletAddress.slice(0, 8)}...`);
    this.logger.log(`   SOL:  ${balances.sol.toFixed(4)}`);
    this.logger.log(`   USDC: ${balances.usdc.toFixed(2)}`);
    this.logger.log('');
  }
}