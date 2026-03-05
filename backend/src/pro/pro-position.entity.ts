/**
 * ProPosition entity
 *
 * Tracks every pro-role user whose smart-wallet is under automated management.
 * One row per user — ownerPubkey is unique.
 *
 * The monitor uses this table to know which wallets to watch.
 * The rebalancing service updates positionNftMint / tick range after each rebalance.
 */
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('pro_positions')
export class ProPosition {
  @PrimaryGeneratedColumn()
  id: number;

  /** Solana public key of the user who owns the SmartWallet */
  @Column({ name: 'owner_pubkey', unique: true })
  ownerPubkey: string;

  /** Raydium CLMM pool for this user's liquidity */
  @Column({ name: 'pool_id' })
  poolId: string;

  /** Current active position NFT mint address (null = no open position) */
  @Column({ name: 'position_nft_mint', nullable: true, type: 'varchar' })
  positionNftMint: string | null;

  /** Lower tick of the active position */
  @Column({ name: 'tick_lower', type: 'int', nullable: true })
  tickLower: number | null;

  /** Upper tick of the active position */
  @Column({ name: 'tick_upper', type: 'int', nullable: true })
  tickUpper: number | null;

  /** Target price range percentage — e.g. 5 means ±5% around current price */
  @Column({
    name: 'price_range_percent',
    type: 'decimal',
    precision: 10,
    scale: 4,
    default: 5,
  })
  priceRangePercent: number;

  /** Whether the cron monitor should manage this user's position */
  @Column({ name: 'monitoring_enabled', default: true })
  monitoringEnabled: boolean;

  /** How many times this position has been auto-rebalanced */
  @Column({ name: 'rebalance_count', default: 0 })
  rebalanceCount: number;

  /** Last error message if rebalancing failed, null otherwise */
  @Column({ name: 'last_error', nullable: true, type: 'text' })
  lastError: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
