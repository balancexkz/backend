export interface UserParams {
  poolId?: string; // Добавляем poolId как опциональное поле
  baseMint: string;
  quoteMint: string;
  inputAmount: number;
  priceRangePercent: number;

}