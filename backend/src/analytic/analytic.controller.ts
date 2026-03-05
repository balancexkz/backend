// src/controllers/position-analytics.controller.ts

import { 
  Controller, 
  Get, 
  Param, 
  Query, 
  UseGuards,
  HttpException,
  HttpStatus 
} from '@nestjs/common';
import {PositionAnalyticsService} from './analytic.service'
import { JwtAuthGuard } from '../auth/guards';

@Controller('analytics')
@UseGuards(JwtAuthGuard)

export class PositionAnalyticsController {
  constructor(
    private readonly analyticsService: PositionAnalyticsService,
  ) {}


  @Get('position/:positionId')
  async getPositionAnalytics(@Param('positionId') positionId: string) {
    const analytics = await this.analyticsService.getAnalytics(positionId);

    if (!analytics) {
      throw new HttpException('Position not found', HttpStatus.NOT_FOUND);
    }

    return {
      position: {
        id: analytics.positionId,
        poolId: analytics.poolId,
        status: analytics.status,
        duration: this.formatDuration(analytics.durationSeconds),
        durationSeconds: analytics.durationSeconds,
      },
      initial: {
        timestamp: analytics.createdAt,
        baseAmount: parseFloat(analytics.initialBaseAmount.toString()),
        quoteAmount: parseFloat(analytics.initialQuoteAmount.toString()),
        solPrice: parseFloat(analytics.initialSolPrice.toString()),
        totalValueUSD: parseFloat(analytics.initialValueUSD.toString()),
        composition: {
          basePercent: 50,
          quotePercent: 50,
        }
      },
      final: analytics.status === 'CLOSED' ? {
        timestamp: analytics.closedAt,
        baseAmount: parseFloat(analytics.finalBaseAmount?.toString() || '0'),
        quoteAmount: parseFloat(analytics.finalQuoteAmount?.toString() || '0'),
        solPrice: parseFloat(analytics.finalSolPrice?.toString() || '0'),
        totalValueUSD: parseFloat(analytics.finalValueUSD?.toString() || '0'),
      } : null,
      impermanentLoss: analytics.status === 'CLOSED' ? {
        hodlValueUSD: parseFloat(analytics.hodlValueUSD?.toString() || '0'),
        actualValueUSD: parseFloat(analytics.finalValueUSD?.toString() || '0'),
        lossUSD: parseFloat(analytics.impermanentLoss?.toString() || '0'),
        lossPercent: parseFloat(analytics.impermanentLossPercent?.toString() || '0'),
        explanation: {
          hodlBreakdown: {
            baseValue: parseFloat(analytics.initialBaseAmount.toString()) * parseFloat(analytics.finalSolPrice?.toString() || '0'),
            quoteValue: parseFloat(analytics.initialQuoteAmount.toString()),
          },
          actualBreakdown: {
            baseValue: parseFloat(analytics.finalBaseAmount?.toString() || '0') * parseFloat(analytics.finalSolPrice?.toString() || '0'),
            quoteValue: parseFloat(analytics.finalQuoteAmount?.toString() || '0'),
          }
        }
      } : null,
      fees: {
        earnedSOL: parseFloat(analytics.feesEarnedSOL.toString()),
        earnedUSDC: parseFloat(analytics.feesEarnedUSDC.toString()),
        totalUSD: parseFloat(analytics.feesEarnedUSD.toString()),
      },
      swaps: {
        totalCount: analytics.totalSwaps,
        totalLossUSD: parseFloat(analytics.totalSwapLossUSD.toString()),
        avgLossPerSwap: analytics.totalSwaps > 0 
          ? parseFloat(analytics.totalSwapLossUSD.toString()) / analytics.totalSwaps 
          : 0,
      },
      profit: analytics.status === 'CLOSED' ? {
        grossProfitUSD: parseFloat(analytics.grossProfit?.toString() || '0'),
        netProfitUSD: parseFloat(analytics.netProfit?.toString() || '0'),
        roi: parseFloat(analytics.roi?.toString() || '0'),
        breakdown: {
          initial: parseFloat(analytics.initialValueUSD.toString()),
          final: parseFloat(analytics.finalValueUSD?.toString() || '0'),
          grossProfit: parseFloat(analytics.grossProfit?.toString() || '0'),
          impermanentLoss: -parseFloat(analytics.impermanentLoss?.toString() || '0'),
          swapLoss: -parseFloat(analytics.totalSwapLossUSD.toString()),
          feesEarned: parseFloat(analytics.feesEarnedUSD.toString()),
          netProfit: parseFloat(analytics.netProfit?.toString() || '0'),
        }
      } : null,
      comparison: analytics.status === 'CLOSED' ? {
        strategy: 'Liquidity Providing',
        result: {
          invested: parseFloat(analytics.initialValueUSD.toString()),
          received: parseFloat(analytics.finalValueUSD?.toString() || '0'),
          profit: parseFloat(analytics.netProfit?.toString() || '0'),
          roi: parseFloat(analytics.roi?.toString() || '0'),
        },
        vsHodl: {
          hodlValue: parseFloat(analytics.hodlValueUSD?.toString() || '0'),
          hodlProfit: parseFloat(analytics.hodlValueUSD?.toString() || '0') - parseFloat(analytics.initialValueUSD.toString()),
          hodlROI: ((parseFloat(analytics.hodlValueUSD?.toString() || '0') - parseFloat(analytics.initialValueUSD.toString())) / parseFloat(analytics.initialValueUSD.toString())) * 100,
          difference: parseFloat(analytics.netProfit?.toString() || '0') - (parseFloat(analytics.hodlValueUSD?.toString() || '0') - parseFloat(analytics.initialValueUSD.toString())),
          betterStrategy: parseFloat(analytics.netProfit?.toString() || '0') > (parseFloat(analytics.hodlValueUSD?.toString() || '0') - parseFloat(analytics.initialValueUSD.toString())) ? 'LP' : 'HODL',
        }
      } : null,
    };
  }


  @Get('positions')
  async getAllPositions(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: string,
  ) {
    const positions = await this.analyticsService.getAllPositions(status);

    // Сортировка
    if (sort === 'roi') {
      positions.sort((a, b) => (b.roi || 0) - (a.roi || 0));
    } else if (sort === 'profit') {
      positions.sort((a, b) => (b.netProfit || 0) - (a.netProfit || 0));
    } else if (sort === 'duration') {
      positions.sort((a, b) => (b.durationSeconds || 0) - (a.durationSeconds || 0));
    }

    // Лимит
    const limitNum = limit ? parseInt(limit) : undefined;
    const limitedPositions = limitNum ? positions.slice(0, limitNum) : positions;

    return {
      total: positions.length,
      positions: limitedPositions.map(p => ({
        id: p.positionId,
        status: p.status,
        poolId: p.poolId,
        createdAt: p.createdAt,
        closedAt: p.closedAt,
        duration: this.formatDuration(p.durationSeconds),
        initialValueUSD: parseFloat(p.initialValueUSD.toString()),
        finalValueUSD: p.finalValueUSD ? parseFloat(p.finalValueUSD.toString()) : null,
        netProfit: p.netProfit ? parseFloat(p.netProfit.toString()) : null,
        roi: p.roi ? parseFloat(p.roi.toString()) : null,
        impermanentLoss: p.impermanentLoss ? parseFloat(p.impermanentLoss.toString()) : null,
        feesEarned: parseFloat(p.feesEarnedUSD.toString()),
        totalSwaps: p.totalSwaps,
        apr: p.apr
      })),
    };
  }



  @Get('comparison/:positionId')
  async getStrategyComparison(@Param('positionId') positionId: string) {
    const analytics = await this.analyticsService.getAnalytics(positionId);

    if (!analytics || analytics.status !== 'CLOSED') {
      throw new HttpException('Position not closed yet', HttpStatus.BAD_REQUEST);
    }

    const initialValue = parseFloat(analytics.initialValueUSD.toString());
    const finalValue = parseFloat(analytics.finalValueUSD?.toString() || '0');
    const hodlValue = parseFloat(analytics.hodlValueUSD?.toString() || '0');
    const netProfit = parseFloat(analytics.netProfit?.toString() || '0');
    const hodlProfit = hodlValue - initialValue;

    return {
      position: {
        id: analytics.positionId,
        duration: this.formatDuration(analytics.durationSeconds),
        initialInvestment: initialValue,
      },
      strategies: {
        liquidityProviding: {
          strategy: 'Liquidity Providing',
          finalValue: finalValue,
          profit: netProfit,
          roi: parseFloat(analytics.roi?.toString() || '0'),
          breakdown: {
            valueChange: finalValue - initialValue,
            impermanentLoss: -parseFloat(analytics.impermanentLoss?.toString() || '0'),
            feesEarned: parseFloat(analytics.feesEarnedUSD.toString()),
            swapCosts: -parseFloat(analytics.totalSwapLossUSD.toString()),
          },
          rating: netProfit > 0 ? '✅ Profitable' : '❌ Loss',
        },
        hodl: {
          strategy: 'HODL',
          finalValue: hodlValue,
          profit: hodlProfit,
          roi: ((hodlProfit / initialValue) * 100),
          breakdown: {
            baseTokenChange: (parseFloat(analytics.initialBaseAmount.toString()) * (parseFloat(analytics.finalSolPrice?.toString() || '0') - parseFloat(analytics.initialSolPrice.toString()))),
            quoteTokenChange: 0,
          },
          rating: hodlProfit > 0 ? '✅ Profitable' : '❌ Loss',
        }
      },
      winner: {
        strategy: netProfit > hodlProfit ? 'Liquidity Providing' : 'HODL',
        advantage: Math.abs(netProfit - hodlProfit).toFixed(2),
        advantagePercent: (((netProfit - hodlProfit) / initialValue) * 100).toFixed(2),
      },
    };
  }

  // ===== Вспомогательные методы =====

  private formatDuration(seconds: number | null): string {
    if (!seconds) return 'N/A';
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      return `${days}d ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  private groupByDay(positions: any[]) {
    const grouped = new Map();

    positions.forEach(p => {
      if (!p.closedAt) return;
      
      const date = new Date(p.closedAt).toISOString().split('T')[0];
      
      if (!grouped.has(date)) {
        grouped.set(date, {
          date,
          positions: 0,
          totalProfit: 0,
          totalIL: 0,
          totalFees: 0,
        });
      }

      const day = grouped.get(date);
      day.positions += 1;
      day.totalProfit += parseFloat(p.netProfit?.toString() || '0');
      day.totalIL += parseFloat(p.impermanentLoss?.toString() || '0');
      day.totalFees += parseFloat(p.feesEarnedUSD.toString());
    });

    return Array.from(grouped.values()).sort((a, b) => 
      a.date.localeCompare(b.date)
    );
  }

}