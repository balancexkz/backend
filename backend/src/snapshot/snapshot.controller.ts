import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard, Roles } from '../auth/guards';
import { PositionSnapshotService } from './snapshot.service';

@Controller('snapshots')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@ApiBearerAuth('JWT-auth')
@ApiTags('Position Snapshots')
export class PositionSnapshotController {
  constructor(private readonly snapshotService: PositionSnapshotService) {}

  /**
   * GET /snapshots/position/:positionId
   */
  @Get('position/:positionId')
  @ApiOperation({ summary: 'Get snapshots for position' })
  @ApiParam({ name: 'positionId', example: '5ngdutp5g8cTbGFD4dV2hgGQPkPonp4gp32ZxPaMuiP' })
  @ApiQuery({ name: 'startDate', required: false, example: '2025-01-01' })
  @ApiQuery({ name: 'endDate', required: false, example: '2025-01-31' })
  async getPositionSnapshots(
    @Param('positionId') positionId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate || this.getDateDaysAgo(30);
    const end = endDate || this.getTodayDate();

    const snapshots = await this.snapshotService.getSnapshotsForPeriod(positionId, start, end);

    return {
      success: true,
      positionId,
      period: { start, end },
      count: snapshots.length,
      snapshots: snapshots.map(s => ({
        date: s.snapshotDate,
        positionValue: `$${Number(s.positionValueUSD).toFixed(2)}`,
        feesCollected: `$${Number(s.feesCollectedUSD).toFixed(2)}`,
        totalValue: `$${Number(s.totalValueUSD).toFixed(2)}`,
        dailyChange:
          s.dailyChangeUSD !== null
            ? `${s.dailyChangeUSD >= 0 ? '+' : ''}$${Number(s.dailyChangeUSD).toFixed(2)}`
            : null,
        dailyChangePercent:
          s.dailyChangePercent !== null
            ? `${s.dailyChangePercent >= 0 ? '+' : ''}${Number(s.dailyChangePercent).toFixed(2)}%`
            : null,
        dailyFeesEarned:
          s.dailyFeesEarnedUSD !== null ? `+$${Number(s.dailyFeesEarnedUSD).toFixed(2)}` : null,
        status: s.positionStatus,
        price: Number(s.currentPrice).toFixed(2),
      })),
    };
  }

  /**
   * GET /snapshots/recent?days=7
   */
  @Get('recent')
  @ApiOperation({ summary: 'Get recent snapshots for all positions' })
  @ApiQuery({ name: 'days', required: false, example: 7 })
  async getRecentSnapshots(@Query('days') days?: number) {
    const daysNum = days ? Number(days) : 30;
    const snapshots = await this.snapshotService.getRecentSnapshots(daysNum);

    const byDate = snapshots.reduce(
      (acc, s) => {
        if (!acc[s.snapshotDate]) {
          acc[s.snapshotDate] = [];
        }
        acc[s.snapshotDate].push(s);
        return acc;
      },
      {} as Record<string, typeof snapshots>,
    );

    return {
      success: true,
      days: daysNum,
      dates: Object.keys(byDate).sort().reverse(),
      snapshots: Object.entries(byDate).map(([date, snaps]) => ({
        date,
        positions: Number(snaps.length),
        totalValue: `$${snaps.reduce((sum, s) => sum + Number(s.totalValueUSD), 0).toFixed(2)}`,
        totalFees: `$${snaps.reduce((sum, s) => sum + Number(s.feesCollectedUSD), 0).toFixed(2)}`,
        totalDailyChange: `$${snaps
          .reduce((sum, s) => sum + (Number(s.dailyChangeUSD) || 0), 0)
          .toFixed(2)}`,
      })),
    };
  }

  /**
   * GET /snapshots/statistics
   */
  @Get('statistics')
  @ApiOperation({ summary: 'Get statistics for period' })
  @ApiQuery({ name: 'startDate', required: false, example: '2025-01-01' })
  @ApiQuery({ name: 'endDate', required: false, example: '2025-01-31' })
  async getPeriodStatistics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate || this.getDateDaysAgo(30);
    const end = endDate || this.getTodayDate();

    const stats = await this.snapshotService.getPeriodStatistics(start, end);

    return {
      success: true,
      period: { start, end },
      statistics: {
        totalPositions: stats.totalPositions,
        totalValue: `$${stats.totalValueUSD.toFixed(2)}`,
        totalFees: `$${stats.totalFeesUSD.toFixed(2)}`,
        totalChange: `${stats.totalChangeUSD >= 0 ? '+' : ''}$${stats.totalChangeUSD.toFixed(2)}`,
        avgDailyChange: `${stats.avgDailyChangePercent >= 0 ? '+' : ''}${stats.avgDailyChangePercent.toFixed(2)}%`,
      },
    };
  }

  /**
   * POST /snapshots/trigger
   */
  @Post('trigger')
  @ApiOperation({ summary: 'Manually trigger snapshot creation' })
  async triggerSnapshot() {
    await this.snapshotService.createSnapshotManually();
    return {
      success: true,
      message: 'Snapshot created successfully',
    };
  }

  private getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  private getDateDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
  }
}