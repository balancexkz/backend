import { Module } from '@nestjs/common';
import { LiquidityBotService } from './liquidity-bot.service';
import { LiquidityBotController } from './liquidity-bot.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Position } from './position.entity';
import { CommonModule } from '../common/common.module';
import { TransactionModule } from '../transaction/transaction.module';
import { TelegramModule } from '../telegram/telegram.module';
import { PositionAnalyticsService } from '../analytic/analytic.service';
import { PositionAnalytics } from '../analytic/analytic.entity';
import { PositionConfigService } from '../position/position.config.service';
import { PositionConfig } from '../position/position.config.entity';
import { RedisService } from '../redis/redis.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Position, PositionAnalytics, PositionConfig]),
    CommonModule,
    TransactionModule,
    TelegramModule,
  ],
  providers: [
    LiquidityBotService,
    PositionAnalyticsService,
    PositionConfigService,
    RedisService,
  ],
  controllers: [LiquidityBotController],
  exports: [LiquidityBotService, PositionAnalyticsService, PositionConfigService],
})
export class LiquidityBotModule {}
