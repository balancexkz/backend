/**
 * LiquidityTransaction  (table: liquidity_transactions)
 *
 * Unified transaction history for ALL user roles:
 *   - VAULT role  (pooled vault managed by the bot via Raydium SDK)
 *   - PRO   role  (per-user SmartWallet managed by the admin delegate)
 *
 * The `role` column distinguishes the two.
 *
 * Pro-specific columns (ownerPubkey, rebalanceId, swapDirection, raw amounts)
 * are NULL for vault rows.
 *
 * Vault-specific columns (walletBalanceUsd) are NULL for pro rows.
 *
 * The existing `transactions` table is left untouched for backward-compat.
 * New vault operations should write here; all pro operations write here.
 */

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum LiquidityRole {
  VAULT = 'vault',
  PRO   = 'pro',
}

export enum LiquidityTransactionType {
  OPEN_POSITION  = 'open_position',
  CLOSE_POSITION = 'close_position',
  SWAP           = 'swap',
  COLLECT_FEES   = 'collect_fees',
}

// ─── Entity ───────────────────────────────────────────────────────────────────

@Entity('liquidity_transactions')
@Index(['role', 'createdAt'])
@Index(['userId', 'createdAt'])
@Index(['ownerPubkey', 'createdAt'])
@Index(['positionNftMint'])
@Index(['rebalanceId'])
export class LiquidityTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ─── Role ────────────────────────────────────────────────────────────────

  /** Which role produced this transaction */
  @Column({ type: 'enum', enum: LiquidityRole })
  role: LiquidityRole;

  // ─── User identity ───────────────────────────────────────────────────────

  /** FK to User.id — nullable until wallet is linked */
  @Column({ name: 'user_id', nullable: true, type: 'int' })
  userId: number | null;

  /**
   * Solana wallet pubkey.
   * PRO:   SmartWallet owner public key.
   * VAULT: null (vault is not per-user).
   */
  @Column({ name: 'owner_pubkey', nullable: true, type: 'varchar' })
  @Index()
  ownerPubkey: string | null;

  // ─── What happened ───────────────────────────────────────────────────────

  @Column({ type: 'enum', enum: LiquidityTransactionType })
  type: LiquidityTransactionType;

  /** Solana transaction signature */
  @Column({ name: 'tx_hash' })
  @Index()
  txHash: string;

  // ─── Where ───────────────────────────────────────────────────────────────

  @Column({ name: 'pool_id' })
  poolId: string;

  /** CLMM position NFT mint — null for swaps not tied to a position */
  @Column({ name: 'position_nft_mint', nullable: true, type: 'varchar' })
  positionNftMint: string | null;

  // ─── Amounts (human-readable) ────────────────────────────────────────────

  /** SOL / wSOL quantity (decimal, e.g. 0.5 SOL) */
  @Column({ name: 'sol_amount', type: 'decimal', precision: 18, scale: 9, default: 0 })
  solAmount: number;

  /** USDC quantity (decimal, e.g. 100.50 USDC) */
  @Column({ name: 'usdc_amount', type: 'decimal', precision: 18, scale: 6, default: 0 })
  usdcAmount: number;

  // ─── Amounts (raw on-chain units) — PRO only ─────────────────────────────

  /** Raw SOL lamports — filled for PRO rows, null for VAULT */
  @Column({ name: 'sol_amount_raw', type: 'bigint', nullable: true })
  solAmountRaw: number | null;

  /** Raw USDC token units — filled for PRO rows, null for VAULT */
  @Column({ name: 'usdc_amount_raw', type: 'bigint', nullable: true })
  usdcAmountRaw: number | null;

  // ─── USD values ──────────────────────────────────────────────────────────

  @Column({ name: 'sol_amount_usd', type: 'decimal', precision: 18, scale: 2, default: 0 })
  solAmountUsd: number;

  @Column({ name: 'usdc_amount_usd', type: 'decimal', precision: 18, scale: 2, default: 0 })
  usdcAmountUsd: number;

  /** solAmountUsd + usdcAmountUsd */
  @Column({ name: 'total_value_usd', type: 'decimal', precision: 18, scale: 2, default: 0 })
  totalValueUsd: number;

  /** SOL price (USD) at the moment of the transaction */
  @Column({ name: 'sol_price', type: 'decimal', precision: 18, scale: 2, default: 0 })
  solPrice: number;

  /**
   * Total wallet / vault balance in USD at time of transaction.
   * Primarily used by VAULT role; null for PRO (per-user balance is tracked on-chain).
   */
  @Column({ name: 'wallet_balance_usd', type: 'decimal', precision: 18, scale: 2, nullable: true })
  walletBalanceUsd: number | null;

  // ─── Profit / Loss ───────────────────────────────────────────────────────

  /**
   * Realized P&L in USD.
   * - CLOSE_POSITION: finalValue − openValue
   * - SWAP: outputValueUSD − inputValueUSD (negative = slippage cost)
   * - OPEN_POSITION / COLLECT_FEES: null
   */
  @Column({ name: 'profit_usd', type: 'decimal', precision: 18, scale: 2, nullable: true })
  profitUsd: number | null;

  // ─── PRO rebalance grouping ───────────────────────────────────────────────

  /**
   * UUID shared by all three transactions of one rebalance cycle
   * (CLOSE_POSITION → SWAP → OPEN_POSITION).
   * Null for manually triggered operations and all VAULT rows.
   */
  @Column({ name: 'rebalance_id', nullable: true, type: 'varchar' })
  rebalanceId: string | null;

  /**
   * Swap direction — only meaningful when type = SWAP (PRO role).
   * 'sol_to_usdc' | 'usdc_to_sol' | null
   */
  @Column({ name: 'swap_direction', nullable: true, type: 'varchar' })
  swapDirection: 'sol_to_usdc' | 'usdc_to_sol' | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
