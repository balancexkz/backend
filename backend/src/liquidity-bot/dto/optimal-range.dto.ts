// src/liquidity-bot/dto/optimal-range-volume.dto.ts

export class OptimalRangeVolumeDto {
    // Позиция
    positionId: string;
    poolId: string;
    
    // Текущее состояние
    currentPrice: number;
    currentTick?: number;           // Опционально, если нужен
    
    // Deposit из позиции
    myDeposit: number;              // Общая стоимость позиции
    baseValueUSD: number;           // Стоимость base токена
    quoteValueUSD: number;          // Стоимость quote токена
    
    // Рыночные данные пула
    volume24h: number;              // Объем за 24ч
    tvl: number;                    // TVL пула
    feeTier: number;                // Комиссия (0.003 = 0.3%)
    
    // Волатильность
    volatility: number;             // % годовая
    volatilityPeriod: number;       // дней
    
    // Расчеты по формуле Артура
    lambda: number;                 // λ интенсивность свопов (в день)
    eta: number;                    // η годовая доходность (без IL)
    deltaLog: number;               // Δ оптимальная лог-ширина
    
    // Оптимальный диапазон
    optimalLowerPrice: number;
    optimalUpperPrice: number;
    optimalLowerPercent: number;    // % от текущей цены
    optimalUpperPercent: number;
    
    // Текущий диапазон позиции
    currentRange: {
      lowerPrice: number;
      upperPrice: number;
      lowerPercent: number;
      upperPercent: number;
    };
    
    // Рекомендация
    recommendation: 'rebalance' | 'hold' | 'widen' | 'narrow';
    reasoning: string;
    
    // APY прогноз
    estimatedAPY: number;           // % годовых (fees only, excluding IL)
    
    calculatedAt: Date;
  }