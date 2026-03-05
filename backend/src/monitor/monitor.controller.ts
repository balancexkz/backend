import { Controller, Post, Body, HttpException, HttpStatus, Get, Param, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard, Roles } from '../auth/guards';
import { PositionMonitorService } from './monitor.service';

@Controller('monitoring')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class MonitorController {
  constructor( private readonly monitorService: PositionMonitorService ) {}

  @Post('start')
  async startMonitoring() {
    try {
      await this.monitorService.startMonitoring();
      return {
        success: true,
        message: 'Position monitoring started',
        checkInterval: '30 seconds',
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to start monitoring',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('stop')
  async stopMonitoring() {
    this.monitorService.stopMonitoring();
    return {
      success: true,
      message: 'Position monitoring stopped',
    };
  }

  @Get('status')
  async getMonitoringStatus() {
    const stats = this.monitorService.getStats();
    return {
      success: true,
      ...stats,
    };
  }

  @Post('check-now')
  async checkNow() {
    try {
      await this.monitorService.checkAllPositions();
      return {
        success: true,
        message: 'Position check completed',
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to check positions',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('stats')
  async getStats() {
    return {
      success: true,
      stats: this.monitorService.getStats(),
    };
  }

}