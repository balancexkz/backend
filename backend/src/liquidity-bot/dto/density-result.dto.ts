export interface DensityResultDto {
    poolId: string;
    lowerRangePercent: number;
    upperRangePercent: number;
    
    currentPrice: number;
    lowerPrice: number;
    upperPrice: number;
    
    currentTick: number;
    lowerTick: number;
    upperTick: number;
    
    totalLiquidityUSD: number;
    tickRange: number;
    densityPerTick: number;
    tickCount: number;
    
    calculatedAt: Date;
    cacheTTL: number;
  }