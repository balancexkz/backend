// src/liquidity-bot/types/position.types.ts
import Decimal from "decimal.js";

export enum PositionStatus {
  IN_RANGE = 'in-range',
  OUT_OF_RANGE_LOW = 'out-of-range-low',
  OUT_OF_RANGE_HIGH = 'out-of-range-high',
}

export interface PositionRangeAnalysis {
  status: PositionStatus;
  amountA: string;
  amountB: string;
  message: string;
}

export class PositionRangeCalculator {
  static analyze(
    currentPrice: number,
    lowerPrice: number,
    upperPrice: number,
    rawAmountA: Decimal,
    rawAmountB: Decimal,
    symbolA: string,
    symbolB: string,
  ): PositionRangeAnalysis {
    const isAboveRange = currentPrice > upperPrice;
    const isBelowRange = currentPrice < lowerPrice;

    if (isBelowRange) {
      return {
        status: PositionStatus.OUT_OF_RANGE_LOW,
        amountA: rawAmountA.toString(),
        amountB: '0',
        message: `Price ${currentPrice.toFixed(4)} < ${lowerPrice.toFixed(4)} → All liquidity in ${symbolA}`,
      };
    }

    if (isAboveRange) {
      return {
        status: PositionStatus.OUT_OF_RANGE_HIGH,
        amountA: '0',
        amountB: rawAmountB.toString(),
        message: `Price ${currentPrice.toFixed(4)} > ${upperPrice.toFixed(4)} → All liquidity in ${symbolB}`,
      };
    }

    return {
      status: PositionStatus.IN_RANGE,
      amountA: rawAmountA.toString(),
      amountB: rawAmountB.toString(),
      message: `${lowerPrice.toFixed(4)} < ${currentPrice.toFixed(4)} < ${upperPrice.toFixed(4)} → Position in range`,
    };
  }

  static isOutOfRange(status: PositionStatus): boolean {
    return status !== PositionStatus.IN_RANGE;
  }

  static getLogLevel(status: PositionStatus): 'log' | 'warn' {
    return this.isOutOfRange(status) ? 'warn' : 'log';
  }

  static getStatusEmoji(status: PositionStatus): string {
    const emojiMap: Record<PositionStatus, string> = {
      [PositionStatus.IN_RANGE]: '✅',
      [PositionStatus.OUT_OF_RANGE_LOW]: '⚠️',
      [PositionStatus.OUT_OF_RANGE_HIGH]: '⚠️',
    };
    return emojiMap[status];
  }
}