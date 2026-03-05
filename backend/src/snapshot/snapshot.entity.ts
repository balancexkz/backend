import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('position_daily_snapshots')
@Index(['positionId', 'snapshotDate'], { unique: true })
export class PositionDailySnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  positionId: string;

  @Column()
  poolId: string;

  @Column({ type: 'date' })
  @Index()
  snapshotDate: string; // 'YYYY-MM-DD'

  // Amounts
  @Column({ type: 'decimal', precision: 20, scale: 9 })
  baseAmount: number;

  @Column({ type: 'decimal', precision: 20, scale: 9 })
  quoteAmount: number;

  // Fees collected (accumulated)
  @Column({ type: 'decimal', precision: 20, scale: 6 })
  feesCollectedBase: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  feesCollectedQuote: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  feesCollectedUSD: number;

  // Prices
  @Column({ type: 'decimal', precision: 20, scale: 6 })
  currentPrice: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  priceRangeLower: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  priceRangeUpper: number;

  // Position value
  @Column({ type: 'decimal', precision: 20, scale: 6 })
  positionValueUSD: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  totalValueUSD: number; // position + fees

  // Daily change
  @Column({ type: 'decimal', precision: 20, scale: 6, nullable: true })
  dailyChangeUSD: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  dailyChangePercent: number | null;

  @Column({ type: 'decimal', precision: 20, scale: 6, nullable: true })
  dailyFeesEarnedUSD: number | null;

  // Status
  @Column()
  positionStatus: string;

  @CreateDateColumn()
  createdAt: Date;
}