/**
 * ProMonitorController
 *
 * Admin-only REST endpoints for the PRO-role position monitor.
 * Routes: /monitoring/pro/*
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, RolesGuard, Roles } from '../auth/guards';
import { ProPositionMonitorService } from './pro-position-monitor.service';
import { LiquidityTransactionService } from '../liquidity/liquidity-transaction.service';

class SetMonitoringDto {
  enabled: boolean;
}

@Controller('monitoring/pro')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class ProMonitorController {
  constructor(
    private readonly monitor: ProPositionMonitorService,
    private readonly liquidityTx: LiquidityTransactionService,
  ) {}

  // ─── Status ──────────────────────────────────────────────────────────────────

  /**
   * GET /monitoring/pro/status
   * Live monitoring statistics (counters + rebalances in progress).
   */
  @Get('status')
  getStatus() {
    return { success: true, stats: this.monitor.getStats() };
  }

  /**
   * GET /monitoring/pro/positions
   * All PRO user positions from DB.
   */
  @Get('positions')
  async getAllPositions() {
    const positions = await this.monitor.getAllPositions();
    return { success: true, count: positions.length, positions };
  }

  // ─── Manual rebalance ─────────────────────────────────────────────────────────

  /**
   * POST /monitoring/pro/rebalance/:ownerPubkey
   * Manually trigger a rebalance for a specific user.
   */
  @Post('rebalance/:ownerPubkey')
  async manualRebalance(@Param('ownerPubkey') ownerPubkey: string) {
    try {
      const result = await this.monitor.manualRebalance(ownerPubkey);
      if (!result.success) {
        throw new HttpException(result.error ?? 'Rebalance failed', HttpStatus.BAD_REQUEST);
      }
      return { success: true, result };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(err?.message ?? 'Rebalance failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ─── Enable / disable monitoring ─────────────────────────────────────────────

  /**
   * PUT /monitoring/pro/:ownerPubkey/monitoring
   * Body: { enabled: boolean }
   */
  @Put(':ownerPubkey/monitoring')
  async setMonitoring(
    @Param('ownerPubkey') ownerPubkey: string,
    @Body() dto: SetMonitoringDto,
  ) {
    try {
      await this.monitor.setMonitoring(ownerPubkey, dto.enabled);
      return {
        success: true,
        message: `Monitoring ${dto.enabled ? 'enabled' : 'disabled'} for ${ownerPubkey.slice(0, 8)}...`,
      };
    } catch (err) {
      throw new HttpException(err?.message ?? 'Failed to update monitoring', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ─── Transaction history ──────────────────────────────────────────────────────

  /**
   * GET /monitoring/pro/history/:ownerPubkey?limit=50
   * Raw transaction history for a PRO user, newest first.
   */
  @Get('history/:ownerPubkey')
  async getHistory(
    @Param('ownerPubkey') ownerPubkey: string,
    @Query('limit') limit?: string,
  ) {
    const txs = await this.liquidityTx.getByOwner(ownerPubkey, Number(limit ?? 50));
    return { success: true, count: txs.length, transactions: txs };
  }

  /**
   * GET /monitoring/pro/rebalances/:ownerPubkey?limit=20
   * Rebalance cycle history grouped by rebalanceId.
   */
  @Get('rebalances/:ownerPubkey')
  async getRebalanceHistory(
    @Param('ownerPubkey') ownerPubkey: string,
    @Query('limit') limit?: string,
  ) {
    const cycles = await this.liquidityTx.getRebalanceHistory(ownerPubkey, Number(limit ?? 20));
    return { success: true, count: cycles.length, cycles };
  }

  /**
   * GET /monitoring/pro/position/:positionNftMint/history
   * Transaction history for a specific CLMM position NFT.
   */
  @Get('position/:positionNftMint/history')
  async getPositionHistory(@Param('positionNftMint') positionNftMint: string) {
    const txs = await this.liquidityTx.getByPosition(positionNftMint);
    return { success: true, count: txs.length, transactions: txs };
  }

  // ─── P&L analytics ───────────────────────────────────────────────────────────

  /**
   * GET /monitoring/pro/profit/:ownerPubkey
   * Realized P&L summary for a PRO user.
   */
  @Get('profit/:ownerPubkey')
  async getProfitSummary(@Param('ownerPubkey') ownerPubkey: string) {
    const summary = await this.liquidityTx.getProfitSummary(ownerPubkey);
    return { success: true, summary };
  }

  /**
   * GET /monitoring/pro/profit/:ownerPubkey/period?from=ISO&to=ISO
   * P&L for a specific date range.
   */
  @Get('profit/:ownerPubkey/period')
  async getProfitForPeriod(
    @Param('ownerPubkey') ownerPubkey: string,
    @Query('from') from: string,
    @Query('to')   to:   string,
  ) {
    if (!from || !to) {
      throw new HttpException('Query params `from` and `to` (ISO dates) are required', HttpStatus.BAD_REQUEST);
    }
    const summary = await this.liquidityTx.getProfitForPeriod(
      ownerPubkey,
      new Date(from),
      new Date(to),
    );
    return { success: true, summary };
  }
}
