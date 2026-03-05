import { Module } from '@nestjs/common';
import { OptimalRangeVolumeService } from './optimal-range.service';
import { OptimalRangeVolumeController } from './optimal-range.controller';
import { LiquidityBotModule } from '../liquidity-bot/liquidity-bot.module';
import { VolatilityModule } from '../volatility/volatility.module';
import { PositionConfigModule } from '../position/position.config.module';
import { AnalyticModule } from '../analytic/analytic.module';

@Module({
  imports: [
    LiquidityBotModule,
    VolatilityModule,
    PositionConfigModule,
    AnalyticModule,
  ],
  providers: [OptimalRangeVolumeService],
  controllers: [OptimalRangeVolumeController],
  exports: [OptimalRangeVolumeService],
})
export class RangeModule {}
