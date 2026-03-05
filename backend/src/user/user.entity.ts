import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum UserRole {
  ADMIN = 'admin',
  VAULT = 'vault',
  PRO = 'pro',
}

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column()
  password: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.VAULT })
  role: UserRole;

  /**
   * Solana wallet public key associated with this account.
   * Required for PRO users (owns the SmartWallet PDA).
   * Optional for VAULT users (used for analytics attribution only).
   */
  @Column({ name: 'wallet_pubkey', nullable: true, unique: true, type: 'varchar' })
  walletPubkey: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
