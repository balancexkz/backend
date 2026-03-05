export interface TransferResult {
  txId: string | null;
  amount: number;
  amountUSD: number;
  recipient: string;
  token: 'SOL' | 'USDC';
}

export interface FeeDistributionResult {
  transfers: TransferResult[];
  totalAmount: number;
  totalAmountUSD: number;
  success: boolean;
}