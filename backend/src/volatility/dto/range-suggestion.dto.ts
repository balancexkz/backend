// src/volatility/dto/range-suggestion.dto.ts

export class RangeSuggestionDto {
    poolId: string;
    baseToken: string;
    quoteToken: string;
    currentPrice: number;
    volatility: number; // σ в %
    suggestedRange: {
      lower: number; // Цена
      upper: number; // Цена
      lowerPercent: number; // %
      upperPercent: number; // %
    };
    confidence: string; // "95%" для 2σ, "99.7%" для 3σ
    period: string; // "30 days"
    dataPoints: number; // количество точек данных
  }
  
  export class VolatilityHistoryDto {
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