// src/services/position-monitor/interfaces/monitor.interface.ts

export interface PositionConfig {
  poolId: string;
  priceRangePercent: number;
  initialInputAmount: number;
}

export interface MonitorResult {
  positionId: string;
  shouldClose: boolean;
  reason: string;
  priceOutOfRange: number;
  currentPrice: number;
  rangeMin: number;
  rangeMax: number;
  tokenToSwap?: 'A' | 'B';
  distanceToLowerUSD?: number;
  distanceToUpperUSD?: number;
}