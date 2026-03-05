import { Connection, Transaction, VersionedTransaction, TransactionError } from '@solana/web3.js';
import { Logger } from '@nestjs/common';

interface SimpleSimulationResult {
  success: boolean;
  error?: string;
  logs?: string[];
  unitsConsumed?: number;
  computeUnitsUsed?: number;
  warnings?: string[];
}

export class SimpleTransactionSimulator {
  private readonly logger = new Logger(SimpleTransactionSimulator.name);

  constructor(private connection: Connection) {}

  /**
   * Простая симуляция транзакции с правильной обработкой типов
   */
  async simulateTransaction(
    transaction: Transaction | VersionedTransaction
  ): Promise<SimpleSimulationResult> {
    try {
      this.logger.log('Starting transaction simulation...');
      
      let simulation;
      
      if (this.isVersionedTransaction(transaction)) {
        // Для VersionedTransaction
        simulation = await this.connection.simulateTransaction(transaction, {
          sigVerify: false,
          replaceRecentBlockhash: true,
          commitment: 'processed',
        });
      } else {
        // Для обычной Transaction
        simulation = await this.connection.simulateTransaction(transaction);
      }

      if (simulation.value.err) {
        const errorMessage = this.parseTransactionError(simulation.value.err);
        this.logger.error('Transaction simulation failed:', errorMessage);
        
        return {
          success: false,
          error: errorMessage,
          logs: simulation.value.logs || [],
          unitsConsumed: simulation.value.unitsConsumed,
          warnings: this.extractWarningsFromLogs(simulation.value.logs || []),
        };
      }

      const computeInfo = this.extractComputeUnitsFromLogs(simulation.value.logs || []);
      
      this.logger.log(`Simulation successful! Units consumed: ${simulation.value.unitsConsumed}`);
      
      return {
        success: true,
        logs: simulation.value.logs || [],
        unitsConsumed: simulation.value.unitsConsumed,
        computeUnitsUsed: computeInfo.used,
        warnings: this.extractWarningsFromLogs(simulation.value.logs || []),
      };
    } catch (error) {
      this.logger.error('Simulation error:', error);
      return {
        success: false,
        error: `Simulation failed: ${error.message}`,
        warnings: ['Network or RPC error during simulation']
      };
    }
  }

  /**
   * Проверяет, является ли транзакция VersionedTransaction
   */
  private isVersionedTransaction(
    transaction: Transaction | VersionedTransaction
  ): transaction is VersionedTransaction {
    return 'version' in transaction;
  }

  /**
   * Парсит ошибку транзакции в читаемый формат
   */
  private parseTransactionError(error: TransactionError): string {
    if (typeof error === 'string') {
      return error;
    }

    if (typeof error === 'object' && error !== null) {
      if ('InstructionError' in error && Array.isArray(error.InstructionError)) {
        const [index, instructionError] = error.InstructionError;
        
        if (typeof instructionError === 'object' && instructionError !== null) {
          if ('Custom' in instructionError) {
            return `Instruction ${index} failed with custom error ${instructionError.Custom}`;
          } else if ('InsufficientFunds' in instructionError) {
            return `Instruction ${index} failed: Insufficient funds`;
          } else if ('InvalidAccountData' in instructionError) {
            return `Instruction ${index} failed: Invalid account data`;
          }
        }
        
        return `Instruction ${index} failed: ${JSON.stringify(instructionError)}`;
      }
      
      return JSON.stringify(error);
    }

    return 'Unknown transaction error';
  }

  /**
   * Извлекает информацию о compute units из логов
   */
  private extractComputeUnitsFromLogs(logs: string[]): { used?: number; max?: number } {
    for (const log of logs) {
      const match = log.match(/consumed (\d+) of (\d+) compute units/);
      if (match) {
        return {
          used: parseInt(match[1]),
          max: parseInt(match[2]),
        };
      }
    }
    return {};
  }

  /**
   * Извлекает предупреждения из логов
   */
  private extractWarningsFromLogs(logs: string[]): string[] {
    const warnings: string[] = [];
    
    logs.forEach(log => {
      if (log.toLowerCase().includes('warning')) {
        warnings.push(log);
      }
      
      // Специфичные предупреждения для Solana
      if (log.includes('exceeded CUs')) {
        warnings.push('Transaction may exceed compute unit limit');
      }
      
      if (log.includes('slippage')) {
        warnings.push('Slippage tolerance may be insufficient');
      }
      
      if (log.includes('insufficient')) {
        warnings.push('Insufficient funds detected');
      }
    });
    
    return warnings;
  }

  /**
   * Проверяет безопасность выполнения транзакции
   */
  isSafeToExecute(result: SimpleSimulationResult): boolean {
    if (!result.success) return false;
    
    // Проверяем на критические предупреждения
    const criticalWarnings = result.warnings?.filter(w =>
      w.toLowerCase().includes('insufficient') ||
      w.toLowerCase().includes('exceed') ||
      w.toLowerCase().includes('failed')
    ) || [];
    
    return criticalWarnings.length === 0;
  }

  /**
   * Получает рекомендуемые параметры на основе симуляции
   */
  getRecommendedParams(result: SimpleSimulationResult): {
    computeUnits?: number;
    priorityFee?: number;
  } {
    const recommendations: any = {};
    
    if (result.computeUnitsUsed) {
      // Добавляем 20% буфер к использованным compute units
      recommendations.computeUnits = Math.min(
        Math.floor(result.computeUnitsUsed * 1.2),
        1400000 // Максимум для транзакции
      );
    }
    
    // Увеличиваем priority fee если есть предупреждения
    if (result.warnings && result.warnings.length > 0) {
      recommendations.priorityFee = 200000; // Увеличенный priority fee
    }
    
    return recommendations;
  }
}