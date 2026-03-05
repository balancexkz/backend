export const FEE_CONFIG = {
  PRIMARY_PERCENT: 1.0,    // 70%
  SECONDARY_PERCENT: 0.00,  // 30%
  TRANSFER_DELAY_MS: 1000,
} as const;

export interface FeeRecipient {
  address: string;
  percent: number;
  label: string;
}
