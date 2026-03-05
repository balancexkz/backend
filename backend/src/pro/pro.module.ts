import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LiquidityModule } from '../liquidity/liquidity.module';
import { PositionConfigModule } from '../position/position.config.module';
import { AnalyticModule } from '../analytic/analytic.module';

import { ProPosition } from './pro-position.entity';
import { ClmmAccountsBuilderService } from './clmm-accounts-builder.service';
import { ProLiquidityService } from './pro-liquidity.service';
import { ProRebalancingService } from './pro-rebalancing.service';
import { ProPositionMonitorService } from './pro-position-monitor.service';
import { ProController } from './pro.controller';
import { ProMonitorController } from './pro-monitor.controller';
import { ProUserController } from './pro-user.controller';

/**
 * ProModule
 *
 * PRO role: per-user SmartWallet + automated CLMM position management.
 *
 * Controllers:
 *   ProController        → /pro/*            (admin: wallet setup, register, position ops)
 *   ProMonitorController → /monitoring/pro/* (admin: monitor status, rebalance, history, P&L)
 *
 * SolanaModule is global → SolanaService, SmartWalletProgramService available without import.
 * LiquidityModule provides LiquidityTransactionService for unified transaction history.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ProPosition]),
    LiquidityModule,
    PositionConfigModule,
    AnalyticModule,
  ],
  controllers: [ProController, ProMonitorController, ProUserController],
  providers: [
    ClmmAccountsBuilderService,
    ProLiquidityService,
    ProRebalancingService,
    ProPositionMonitorService,
  ],
  exports: [
    ProLiquidityService,
    ProPositionMonitorService,
  ],
})
export class ProModule {}
