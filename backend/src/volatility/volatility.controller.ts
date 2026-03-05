// src/volatility/volatility.controller.ts - С BACKFILL ENDPOINTS

import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard, Roles } from '../auth/guards';
import { VolatilityService } from './volatility.service';

@Controller('volatility')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@ApiBearerAuth('JWT-auth')
@ApiTags('Volatility & Range Suggestions')
export class VolatilityController {
  constructor(private readonly volatilityService: VolatilityService) {}

  /**
   * GET /volatility/suggest/:poolId
   * Получить рекомендацию диапазона для пула
   */
  @Get('suggest/:poolId')
  @ApiOperation({ summary: 'Get range suggestion based on volatility' })
  @ApiParam({ name: 'poolId', example: '61R1ndXxvsWXXoF1qNXXYs...' })
  @ApiQuery({ name: 'days', required: false, example: 30, description: 'Number of days for history' })
  @ApiQuery({ name: 'sigmas', required: false, example: 2, description: 'Number of standard deviations (2 = 95%, 3 = 99.7%)' })
  async getRangeSuggestion(
    @Param('poolId') poolId: string,
    @Query('days') days?: number,
    @Query('sigmas') sigmas?: number,
  ) {
    try {
      const daysNum = days ? Number(days) : 30;
      const sigmasNum = sigmas ? Number(sigmas) : 2;

      const suggestion = await this.volatilityService.getRangeSuggestion(
        poolId,
        daysNum,
        sigmasNum,
      );

      return {
        success: true,
        suggestion,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * GET /volatility/history/:tokenSymbol
   * Получить историю волатильности токена
   */
  @Get('history/:tokenSymbol')
  @ApiOperation({ summary: 'Get volatility history for token' })
  @ApiParam({ name: 'tokenSymbol', example: 'SOL' })
  @ApiQuery({ name: 'days', required: false, example: 30 })
  async getVolatilityHistory(
    @Param('tokenSymbol') tokenSymbol: string,
    @Query('days') days?: number,
  ) {
    try {
      const daysNum = days ? Number(days) : 30;

      const history = await this.volatilityService.getVolatilityHistory(
        tokenSymbol,
        daysNum,
      );

      return {
        success: true,
        history,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * GET /volatility/suggestions
   * Получить все рекомендации для активных пулов
   */
  @Get('suggestions')
  @ApiOperation({ summary: 'Get all range suggestions for active pools' })
  @ApiQuery({ name: 'days', required: false, example: 30 })
  @ApiQuery({ name: 'sigmas', required: false, example: 2 })
  async getAllSuggestions(
    @Query('days') days?: number,
    @Query('sigmas') sigmas?: number,
  ) {
    try {
      const daysNum = days ? Number(days) : 30;
      const sigmasNum = sigmas ? Number(sigmas) : 2;

      const suggestions = await this.volatilityService.getAllSuggestions(
        daysNum,
        sigmasNum,
      );

      return {
        success: true,
        count: suggestions.length,
        suggestions,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * POST /volatility/collect
   * Ручной запуск сбора текущих цен
   */
  @Post('collect')
  @ApiOperation({ summary: 'Manually trigger price collection' })
  async collectPrices() {
    try {
      await this.volatilityService.collectPricesManually();
      return {
        success: true,
        message: 'Price collection completed successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * POST /volatility/backfill/:poolId
   * Загрузить исторические данные для конкретного пула
   */
  @Post('backfill/:poolId')
  @ApiOperation({ summary: 'Backfill historical data for a specific pool' })
  @ApiParam({ name: 'poolId', example: '61R1ndXxvsWXXoF1qNXXYs...' })
  @ApiQuery({ name: 'days', required: false, example: 30, description: 'Number of days to backfill' })
  async backfillPool(
    @Param('poolId') poolId: string,
    @Query('days') days?: number,
  ) {
    try {
      const daysNum = days ? Number(days) : 30;

      // Получить tokenAddress для пула
      const positions = await this.volatilityService['liquidityBotService'].getCLMMPositions();
      const poolData = positions.find((p: any) => p.pool.poolId === poolId);

      if (!poolData) {
        return {
          success: false,
          error: `Pool ${poolId} not found`,
        };
      }

      await this.volatilityService.backfillHistoricalData(
        poolId,
        poolData.pool.baseMintPublicKey,
        daysNum,
      );

      return {
        success: true,
        message: `Backfilled ${daysNum} days of historical data for pool ${poolId}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * POST /volatility/backfill-all
   * Загрузить исторические данные для всех активных пулов
   */
  @Post('backfill-all')
  @ApiOperation({ summary: 'Backfill historical data for all active pools' })
  @ApiQuery({ name: 'days', required: false, example: 30, description: 'Number of days to backfill' })
  async backfillAllPools(@Query('days') days?: number) {
    try {
      const daysNum = days ? Number(days) : 30;

      await this.volatilityService.backfillAllPools(daysNum);

      return {
        success: true,
        message: `Backfilled ${daysNum} days of historical data for all active pools`,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}