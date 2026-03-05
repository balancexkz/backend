import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PositionDailySnapshot } from './snapshot.entity';
import { PositionSnapshotService } from './snapshot.service';
import { PositionSnapshotController } from './snapshot.controller';
import { LiquidityBotModule } from '../liquidity-bot/liquidity-bot.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PositionDailySnapshot]),
    LiquidityBotModule,
  ],
  providers: [PositionSnapshotService],
  controllers: [PositionSnapshotController],
  exports: [PositionSnapshotService],
})
export class SnapshotModule {}
