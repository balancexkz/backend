// src/services/transaction-executor.service.ts

import { Injectable, Logger } from '@nestjs/common';

export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export interface ExecutionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  attempts: number;
}

@Injectable()
export class TransactionExecutor {
  private readonly logger = new Logger(TransactionExecutor.name);

  /**
   * Универсальный retry механизм с экспоненциальной задержкой
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    config: RetryConfig = {
      maxRetries: 5,
      initialDelay: 2000,
      maxDelay: 32000,
      backoffMultiplier: 2,
    },
    shouldRetryFn?: (error: any) => boolean,
  ): Promise<ExecutionResult<T>> {
    let attempts = 0;
    let delay = config.initialDelay;

    while (attempts < config.maxRetries) {
      attempts++;
      
      try {
        this.logger.log(`[${operationName}] Attempt ${attempts}/${config.maxRetries}`);
        
        const result = await operation();
        
        this.logger.log(`[${operationName}] ✅ Success on attempt ${attempts}`);
        
        return {
          success: true,
          data: result,
          attempts,
        };
        
      } catch (error) {
        this.logger.warn(`[${operationName}] ❌ Attempt ${attempts} failed: ${error.message}`);
        
        // Проверяем, стоит ли повторять
        const shouldRetry = shouldRetryFn ? shouldRetryFn(error) : true;
        
        if (!shouldRetry) {
          this.logger.error(`[${operationName}] Non-retryable error detected`);
          return {
            success: false,
            error: error.message,
            attempts,
          };
        }
        
        if (attempts >= config.maxRetries) {
          this.logger.error(`[${operationName}] All ${config.maxRetries} attempts failed`);
          return {
            success: false,
            error: error.message,
            attempts,
          };
        }
        
        // Экспоненциальная задержка
        this.logger.log(`[${operationName}] Retrying in ${delay}ms...`);
        await this.sleep(delay);
        
        delay = Math.min(delay * config.backoffMultiplier, config.maxDelay);
      }
    }

    return {
      success: false,
      error: 'Max retries exceeded',
      attempts,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}