// src/liquidity-bot/services/strategies/retry.strategy.ts

import { Injectable, Logger } from '@nestjs/common';

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  operation: string;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  attempts: number;
  error?: Error;
}

@Injectable()
export class RetryStrategy {
  private readonly logger = new Logger(RetryStrategy.name);

  /**
   * Выполнить операцию с retry
   */
  async execute<T>(
    operation: () => Promise<T>,
    config: RetryConfig,
  ): Promise<T> {
    
    const { maxAttempts, baseDelay, maxDelay, operation: operationName } = config;
    
    let lastError: Error;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.logger.log(`${operationName}: attempt ${attempt}/${maxAttempts}`);

      try {
        const result = await operation();
        
        if (attempt > 1) {
          this.logger.log(`✅ ${operationName} succeeded on attempt ${attempt}`);
        }
        
        return result;
        
      } catch (error) {
        lastError = error;
        
        const shouldRetry = this.shouldRetryError(error);
        
        if (!shouldRetry || attempt >= maxAttempts) {
          this.logger.error(`❌ ${operationName} failed: ${error.message}`);
          throw error;
        }

        // Exponential backoff with max cap
        const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
        
        this.logger.warn(
          `⚠️ ${operationName} failed (${error.message}), ` +
          `retrying in ${delay}ms... (${maxAttempts - attempt} attempts left)`
        );
        
        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  /**
   * Определить, стоит ли повторять операцию
   */
  private shouldRetryError(error: any): boolean {
    const errorMsg = error?.message?.toLowerCase() || '';

    // ❌ Не повторяем fatal errors
    const nonRetryableErrors = [
      'insufficient funds',
      'insufficient lamports',
      'account does not exist',
      'custom program error: 0x1775',
      'below minimum',
    ];

    if (nonRetryableErrors.some(msg => errorMsg.includes(msg))) {
      return false;
    }

    // ✅ Повторяем retryable errors
    const retryableErrors = [
      'blockhash not found',
      'transaction simulation failed',
      'block height exceeded',
      'node is behind',
      'slippage',
      '6021',
      'price slippage check',
    ];

    if (retryableErrors.some(msg => errorMsg.includes(msg))) {
      return true;
    }

    // По умолчанию не повторяем
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}