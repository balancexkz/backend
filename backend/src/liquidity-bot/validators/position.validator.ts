// src/liquidity-bot/services/validators/position.validator.ts

import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PublicKey } from '@solana/web3.js';

@Injectable()
export class PositionValidatorService {
  private readonly logger = new Logger(PositionValidatorService.name);

  /**
   * Валидировать NFT mint позиции
   */
  validatePositionMint(nftMint: string): PublicKey {
    try {
      const publicKey = new PublicKey(nftMint);
      return publicKey;
    } catch (error) {
      throw new HttpException(
        `Invalid position mint address: ${nftMint}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Валидировать pool ID
   */
  validatePoolId(poolId: string): PublicKey {
    try {
      const publicKey = new PublicKey(poolId);
      return publicKey;
    } catch (error) {
      throw new HttpException(
        `Invalid pool ID: ${poolId}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Валидировать input amount
   */
  validateInputAmount(amount: number, minAmount: number = 0.01): number {
    if (isNaN(amount) || amount <= 0) {
      throw new HttpException(
        `Invalid amount: ${amount}. Must be positive number.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (amount < minAmount) {
      throw new HttpException(
        `Amount too small: ${amount}. Minimum is ${minAmount}.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    return amount;
  }

  /**
   * Валидировать price range percent
   */
  validatePriceRangePercent(percent: number): number {
    if (isNaN(percent) || percent <= 0 || percent > 100) {
      throw new HttpException(
        `Invalid price range: ${percent}%. Must be between 0 and 100.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    return percent;
  }
}