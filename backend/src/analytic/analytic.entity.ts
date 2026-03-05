// src/entities/position-analytics.entity.ts

import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index, OneToOne, JoinColumn } from 'typeorm';

@Entity('position_analytics')
export class PositionAnalytics {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @Index()
  positionId: string; // NFT mint

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  closedAt: Date | null;

  // ===== INITIAL (OPEN) =====
  @Column('decimal', { precision: 18, scale: 9 })
  initialBaseAmount: number;

  @Column('decimal', { precision: 18, scale: 6 })
  initialQuoteAmount: number;

  @Column('decimal', { precision: 18, scale: 2 })
  initialSolPrice: number;

  @Column('decimal', { precision: 18, scale: 2 })
  initialValueUSD: number;

  // ===== FINAL (CLOSE) =====
  @Column('decimal', { precision: 18, scale: 9, nullable: true })
  finalBaseAmount: number | null;

  @Column('decimal', { precision: 18, scale: 6, nullable: true })
  finalQuoteAmount: number | null;

  @Column('decimal', { precision: 18, scale: 2, nullable: true })
  finalSolPrice: number | null;

  @Column('decimal', { precision: 18, scale: 2, nullable: true })
  finalValueUSD: number | null;

  // ===== HODL COMPARISON =====
  @Column('decimal', { precision: 18, scale: 2, nullable: true })
  hodlValueUSD: number | null;

  // ===== IMPERMANENT LOSS =====
  @Column('decimal', { precision: 18, scale: 2, nullable: true })
  impermanentLoss: number | null;

  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  impermanentLossPercent: number | null;

  // ===== FEES =====
  @Column('decimal', { precision: 18, scale: 2, default: 0 })
  feesEarnedUSD: number;

  @Column('decimal', { precision: 18, scale: 9, default: 0 })
  feesEarnedSOL: number;

  @Column('decimal', { precision: 18, scale: 6, default: 0 })
  feesEarnedUSDC: number;

  // ===== SWAPS =====
  @Column('int', { default: 0 })
  totalSwaps: number;

  @Column('decimal', { precision: 18, scale: 2, default: 0 })
  totalSwapLossUSD: number;

  // ===== PROFIT/LOSS =====
  @Column('decimal', { precision: 18, scale: 2, nullable: true })
  grossProfit: number | null; // finalValueUSD - initialValueUSD

  @Column('decimal', { precision: 18, scale: 2, nullable: true })
  netProfit: number | null; // grossProfit - IL - swapLoss + fees

  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  roi: number | null; 

  @Column('int', {nullable: true })
  durationSeconds: number;

  @Column('decimal', { precision: 18, scale: 2, nullable: true })
  apr: number;

  @Column()
  poolId: string;

  @Column()
  baseSymbol: string; 

  @Column()
  quoteSymbol: string; 

  @Column({ default: 'ACTIVE' })
  status: string;
}