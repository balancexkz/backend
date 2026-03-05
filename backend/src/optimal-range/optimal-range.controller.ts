import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards';
import { OptimalRangeVolumeService } from './optimal-range.service';

@Controller('liquidity/optimal-range-volume')
export class OptimalRangeVolumeController {
  constructor(
    private readonly service: OptimalRangeVolumeService,
  ) {}

  /**
   * 🎯 Для конкретной позиции
   * GET /liquidity/optimal-range-volume/position/:positionId?period=14
   */
  @Get('position/:positionId')
  async getForPosition(
    @Param('positionId') positionId: string,
    @Query('period') period?: number,
  ) {
    return await this.service.calculateOptimalRangeCorrect(
      positionId,
      period ? parseInt(String(period)) : 365,
    );
  }





  /**
   * 📊 Для всех позиций
   * GET /liquidity/optimal-range-volume/all?period=14
   */
  @Get('all')
  async getForAllPositions(
    @Query('period') period?: number,
  ) {
    return await this.service.calculateForAllPositions(
      period ? parseInt(String(period)) : 14,
    );
  }
}