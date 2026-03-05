import { Module } from '@nestjs/common';
import { PositionMonitorService } from './monitor.service';
import { MonitorController } from './monitor.controller';
import { LiquidityBotModule } from '../liquidity-bot/liquidity-bot.module';
import { SwapModule } from '../swap/swap.module';

@Module({
  imports: [
    LiquidityBotModule,
    SwapModule,
  ],
  providers: [PositionMonitorService],
  controllers: [MonitorController],
  exports: [PositionMonitorService],
})
export class MonitorModule {}
