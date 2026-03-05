import { LiquidityPoolKeys } from '@raydium-io/raydium-sdk-v2';
import { PublicKey } from '@solana/web3.js';

export interface PoolInfo {
  poolId: string;
  baseMint: string;              // Символ (например, 'SOL')
  baseMintPublicKey: string;     // Адрес (например, 'So11111...')
  quoteMint: string;             // Символ (например, 'USDC')
  quoteMintPublicKey: string;    // Адрес (например, 'EPjFWdd...')
  currentPrice: number;
}

export interface PositionInfo {
  positionId: string;
  baseAmount: string;
  quoteAmount: string;
  priceRange: {
    lower: number;
    upper: number;
  };
  currentPrice: number;
  positionStatus?: string;
  profitability: number;
  actionHistory: string[];
  poolKeys: { id: string };
}
