import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VolatilityService } from './volatility.service';
import { VolatilityController } from './volatility.controller';
import { PriceHistory } from './price-history.entity';
import { LiquidityBotModule } from '../liquidity-bot/liquidity-bot.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PriceHistory]),
    LiquidityBotModule,
  ],
  controllers: [VolatilityController],
  providers: [VolatilityService],
  exports: [VolatilityService],
})
export class VolatilityModule {}
