// src/volatility/entities/price-history.entity.ts

import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    Index,
  } from 'typeorm';
  
  @Entity('price_history')
  @Index(['poolId', 'timestamp'])
  @Index(['tokenSymbol', 'timestamp'])
  export class PriceHistory {
    @PrimaryGeneratedColumn()
    id: number;
  
    @Column({ type: 'varchar', length: 255 })
    poolId: string;
  
    @Column({ type: 'varchar', length: 50 })
    tokenSymbol: string; // SOL, USDC, WSOL, etc.
  
    @Column({ type: 'decimal', precision: 20, scale: 10 })
    price: number;
  
    @Column({ type: 'timestamp' })
    timestamp: Date;
  
    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
  }