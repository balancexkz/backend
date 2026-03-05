// src/position-monitor/types/monitor.types.ts

export interface MonitorConfig {
  outOfRangeThreshold: number;
  priceRangePercent: number;
  maxLossUSD: number;
  minSlippage: number;
  maxSlippage: number;
  maxSwapAttempts: number;
  retryDelayMs: number;
  minReserveUSD: number;
  aggressiveReserveUSD: number;
  minReserveSol: number;
  minAddAmountSol: number;
  maxAddIterations: number;
  maxAddRetries: number;
  balanceThreshold: number;
  addLiquidityPercent: number;
  confirmDelayMs: number;
}

export interface MonitoringStats {
  lastCheck: Date | null;
  positionsChecked: number;
  positionsClosed: number;
  swapsExecuted: number;
  positionsReopened: number;
  liquidityAdded: number;
  liquidityRetries: number;
  errors: number;
}

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
  health?: 'healthy' | 'warning' | 'critical';
}

// ✅ ОБНОВЛЕННЫЙ RebalanceResult
export interface RebalanceResult {
  success: boolean;
  closeTxId?: string;
  newPositionMint?: string;
  swapsExecuted?: number;      // ✅ Добавлено
  liquidityAdded?: number;      // ✅ Добавлено
  error?: string;
}

export interface SwapParams {
  poolId: string;
  inputMint: string;
  inputAmount: number;
  slippage: number;
}

export interface LiquidityAttemptData {
  successfulAdds: number;
  lastAttempt: Date;
  shouldRetry: boolean;
  consecutiveFailures: number;
}