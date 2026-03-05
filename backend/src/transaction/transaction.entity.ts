// src/liquidity-bot/entities/liquidity-transaction.entity.ts

import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

export enum TransactionType {
  OPEN_POSITION = 'Add Liquidity',
  CLOSE_POSITION = 'Remove Liquidity',
  SWAP = 'SWAP',
}

@Entity('transactions')
@Index(['positionId', 'createdAt'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  positionId: string; // ID позиции (NFT mint)

  @Column({
    type: 'enum',
    enum: TransactionType,
  })
  type: TransactionType;

  @CreateDateColumn()
  createdAt: Date;

  @Column()
  @Index()
  txHash: string; // Hash транзакции

  @Column()
  poolId: string; // ID пула

  // Базовый токен (SOL/WSOL)
  @Column('decimal', { precision: 18, scale: 9 })
  baseAmount: number; // Количество SOL

  @Column('decimal', { precision: 18, scale: 2 })
  baseValueUSD: number; // Стоимость SOL в USD

  @Column()
  baseSymbol: string; // SOL

  // Котируемый токен (USDC)
  @Column('decimal', { precision: 18, scale: 6 })
  quoteAmount: number; // Количество USDC

  @Column('decimal', { precision: 18, scale: 2 })
  quoteValueUSD: number; // Стоимость USDC в USD

  @Column()
  quoteSymbol: string; // USDC

  // Цена SOL на момент операции
  @Column('decimal', { precision: 18, scale: 2 })
  solPrice: number; // currentPrice из pool

  // Общий баланс позиции в USD (baseValueUSD + quoteValueUSD)
  @Column('decimal', { precision: 18, scale: 2 })
  positionBalanceUSD: number;

  // Общий баланс кошелька в USD на момент транзакции
  @Column('decimal', { precision: 18, scale: 2 })
  walletBalanceUSD: number;

  // Прибыль/убыток (только для закрытия позиции)
  @Column('decimal', { precision: 18, scale: 2, nullable: true })
  profitUSD: number | null;

  @Column({ name: 'user_id', nullable: true })
  userId: number | null;
}