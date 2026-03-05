// components/types/interfaces.ts

export interface Pool {
    poolId: string;
    baseMint: string;
    quoteMint: string;
    currentPrice: number;
  }
  
  export interface Position {
    positionId: string;
    baseAmount: string;
    quoteAmount: string;
    priceRange: { lower: number; upper: number };
    currentPrice: number;
    profitability: number;
    actionHistory: string[];
    poolKeys: { id: string };
  }
  
  export interface PositionWithPool {
    position: Position;
    pool: Pool;
    hasInitialValue: boolean;
  }
  
  export interface Balance {
    amount: number;
    valueInUSD: number;
  }
  
  export interface BalanceResponse {
    [token: string]: Balance;
  }
  
  export interface Swap {
    id: string;
    index: number;
    txHash: string;
    date: string;
    inputToken: string;
    inputAmount: number;
    inputValueUSD: number;
    outputToken: string;
    outputAmount: number;
    outputValueUSD: number;
    profitUSD: number;
  }
  
  export interface SwapGroup {
    id: string;
    type: 'SWAP_GROUP';
    positionId: string;
    swapCount: number;
    date: string;
    swaps: Swap[];
    totalProfitUSD: number;
    solPrice: number | string;
    walletBalanceUSD: number | string;
  }
  
  export interface Transaction {
    id: string;
    positionId: string;
    type: 'Add Liquidity' | 'Remove Liquidity' | 'SWAP_GROUP';
    date: string;
    txHash?: string;
    baseToken?: {
      symbol: string;
      amount: number | string;
      valueUSD: number | string;
    };
    quoteToken?: {
      symbol: string;
      amount: number | string;
      valueUSD: number | string;
    };
    solPrice?: number | string;
    positionBalanceUSD?: number | string;
    walletBalanceUSD?: number | string;
    profit?: {
      usd: number;
      percent?: number;
    } | null;
    swapCount?: number;
    swaps?: Swap[];
    totalProfitUSD?: number;
  }
  
  export interface MonitoringStats {
    isActive: boolean;
    activePositions: number;
    lastCheck: string | null;
    positionsChecked: number;
    positionsClosed: number;
    swapsExecuted: number;
    positionsReopened: number;
    liquidityAdded: number;
    liquidityRetries: number;
    errors: number;
    uptime: number;
  }
  
  export interface TransactionHistoryStats {
    totalTransactions: number;
    openPositions: number;
    closePositions: number;
    totalProfit: string;
    totalVolume: string;
  }
  
  export interface ILPosition {
    id: string;
    status: 'CLOSED';
    poolId: string;
    createdAt: string;
    closedAt: string;
    duration: string;
    feesEarned: number;
    apr: string | number;
    impermanentLoss: number;
    totalSwaps: number;
  }
  
  export interface ILStats {
    totalClosed: number;
    avgAPR: number;
    totalFees: number;
    avgIL: number;
    totalIL: number;
    positiveILCount: number;
    negativeILCount: number;
    bestPosition: {
      id: string;
      apr: number;
      fees: number;
    } | null;
    worstPosition: {
      id: string;
      apr: number;
      il: number;
    } | null;
  }
  
  export interface PositionConfigData {
    id: string;
    poolId: string;
    lowerRangePercent: number;
    upperRangePercent: number;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  }
  
  export interface ProfitStats {
    totalNetProfit: string;
    avgProfit: string;
    operations: number;
    profitableOps: number;
    lossOps: number;
    successRate: string;
    monthlyBreakdown: Array<{
      year: number;
      month: number;
      monthName: string;
      profit: string;
      operations: number;
      avgProfit: string;
    }>;
  }
  
  export interface MonthlyProfitStats {
    year: number;
    month: number;
    totalNetProfit: string;
    avgProfit: string;
    operations: number;
    profitableOps: number;
    lossOps: number;
    successRate: string;
  }
  
  export type ActiveTab = 'positions' | 'history' | 'monitoring' | 'il-analysis' | 'settings' | 'profit' | 'snapshot' | 'volatility';

  export type UserRole = 'admin' | 'vault' | 'pro';

  export type AuthPage = 'login' | 'register';

  export interface User {
    id: number;
    username: string;
    role: UserRole;
  }

  export interface RangeSuggestion {
    poolId: string;
    baseToken: string;
    quoteToken: string;
    currentPrice: number;
    volatility: number; // σ в %
    suggestedRange: {
      lower: number;
      upper: number;
      lowerPercent: number;
      upperPercent: number;
    };
    confidence: string; // "95%" для 2σ
    period: string; // "30 days"
    dataPoints: number;
  }
  
  export interface VolatilityHistory {
    tokenSymbol: string;
    period: string;
    volatility: number;
    currentPrice: number;
    priceHistory: Array<{
      price: number;
      timestamp: string;
    }>;
    dataPoints: number;
  }
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  