import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('position_config')
export class PositionConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  poolId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  lowerRangePercent: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  upperRangePercent: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}