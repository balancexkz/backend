import { Module } from '@nestjs/common';
import { PositionAnalyticsService } from './analytic.service';
import { PositionAnalyticsController } from './analytic.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PositionAnalytics } from './analytic.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([PositionAnalytics]),
  ],
  providers: [PositionAnalyticsService],
  controllers: [PositionAnalyticsController],
  exports: [PositionAnalyticsService],
})
export class AnalyticModule {}
