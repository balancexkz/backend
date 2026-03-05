import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('positions')
export class Position {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'position_id', unique: true })
  positionId: string;

  @Column({ name: 'pool_id' })
  poolId: string;

  @Column({ name: 'initial_base_amount' })
  initialBaseAmount: string;

  @Column({ name: 'initial_quote_amount' })
  initialQuoteAmount: string;

  @Column('decimal', { name: 'initial_price_a', precision: 20, scale: 8 })
  initialPriceA: number;

  @Column('decimal', { name: 'initial_price_b', precision: 20, scale: 8 })
  initialPriceB: number;

  @Column('decimal', { name: 'initial_value', precision: 20, scale: 8 })
  initialValue: number;


  @Column({ name: 'user_id', nullable: true })
  userId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}