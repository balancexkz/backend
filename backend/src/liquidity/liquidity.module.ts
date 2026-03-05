/**
 * LiquidityModule
 *
 * Houses the unified `liquidity_transactions` table used by both roles:
 *   - PRO  (via ProModule import)
 *   - VAULT (future — vault can import this module when ready)
 *
 * Exported so ProModule (and eventually VaultModule) can inject
 * LiquidityTransactionService without re-declaring the entity.
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LiquidityTransaction } from './liquidity-transaction.entity';
import { LiquidityTransactionService } from './liquidity-transaction.service';

@Module({
  imports: [TypeOrmModule.forFeature([LiquidityTransaction])],
  providers: [LiquidityTransactionService],
  exports: [LiquidityTransactionService],
})
export class LiquidityModule {}
