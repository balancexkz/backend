import { Module } from '@nestjs/common';
import { LiquidityModule } from '../liquidity/liquidity.module';
import { VaultService } from './vault.service';
import { VaultController } from './vault.controller';
import { VaultMonitorController } from './vault-monitor.controller';

/**
 * VaultModule
 *
 * VaultService            — business logic (wraps VaultProgramService + LiquidityTransactionService)
 * VaultController         — /vault/*             (user: info, deposit, withdraw, history)
 * VaultMonitorController  — /monitoring/vault/*  (admin: status, history, profit, depositors)
 *
 * SolanaModule is global → VaultProgramService available without explicit import.
 */
@Module({
  imports: [LiquidityModule],
  controllers: [VaultController, VaultMonitorController],
  providers: [VaultService],
})
export class VaultModule {}
