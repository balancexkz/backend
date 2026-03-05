interface ProfitTransaction {
  id: string;
  positionId: string;
  date: Date;
  previousBalance: number;
  currentBalance: number;
  profit: number;
  solPrice: number;
}

interface MonthlyProfitStats {
  year: number;
  month: number;
  totalNetProfit: number;
  avgProfit: number;
  operations: number;
  profitableOps: number;
  lossOps: number;
  successRate: number;
}

interface MonthlyBreakdown {
  year: number;
  month: number;
  profit: number;
  operations: number;
  avgProfit: number;
}

interface AllTimeProfitStats {
  totalNetProfit: number;
  avgProfit: number;
  operations: number;
  profitableOps: number;
  lossOps: number;
  successRate: number;
  monthlyBreakdown: MonthlyBreakdown[];
}