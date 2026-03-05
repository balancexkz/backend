import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum WithdrawalStatus {
  PENDING   = 'pending',    // user submitted, admin not yet acted
  READY     = 'ready',      // admin closed position, user can now withdraw
  COMPLETED = 'completed',  // user executed withdraw() on-chain
  CANCELLED = 'cancelled',  // cancelled by user or expired
}

@Entity('vault_withdrawal_requests')
export class WithdrawalRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userPubkey: string;

  @Column({ type: 'enum', enum: WithdrawalStatus, default: WithdrawalStatus.PENDING })
  status: WithdrawalStatus;

  /** User's shares at time of request */
  @Column({ type: 'bigint', nullable: true })
  shares: number;

  /** Estimated total value USD at time of request */
  @Column({ type: 'decimal', precision: 20, scale: 6, nullable: true })
  estimatedValueUsd: number;

  /** Treasury funds available at time of request (instantly withdrawable) */
  @Column({ type: 'decimal', precision: 20, scale: 6, nullable: true })
  availableNowUsd: number;

  /** Funds locked in position at time of request (requires admin close_position) */
  @Column({ type: 'decimal', precision: 20, scale: 6, nullable: true })
  lockedInPositionUsd: number;

  /** Admin note (e.g. "position closed, funds ready") */
  @Column({ nullable: true })
  adminNote: string;

  /** Actual txHash when user completes withdrawal */
  @Column({ nullable: true })
  txHash: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
