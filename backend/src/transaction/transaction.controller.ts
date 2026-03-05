// src/transaction/transaction.controller.ts

import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { TransactionService } from './transaction.service';
import { JwtAuthGuard, Roles } from '../auth/guards';

@ApiTags('transaction')
@Controller('transaction')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
@Roles('admin', 'vault', 'pro')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Get()
  @ApiOperation({ 
    summary: 'Получить историю транзакций',
    description: 'Возвращает список всех транзакций с пагинацией',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Максимальное количество записей',
    example: 100,
  })
  @ApiResponse({
    status: 200,
    description: 'Список транзакций',
    schema: {
      example: {
        total: 50,
        transactions: [
          {
            id: 1,
            positionId: '5HauEoJa...',
            type: 'OPEN_POSITION',
            date: '2025-01-15T10:30:00Z',
            txHash: 'abc123...',
            baseToken: {
              symbol: 'SOL',
              amount: 21.526289,
              valueUSD: 3996.54,
            },
            quoteToken: {
              symbol: 'USDC',
              amount: 3842.70,
              valueUSD: 3842.70,
            },
            solPrice: 185.79,
            positionBalanceUSD: 7839.24,
            walletBalanceUSD: 248.88,
            profit: {
              usd: 125.50,
            },
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  async getAllTransactions(@Query('limit') limit?: string) {
    const transactions = await this.transactionService.getAllTransactions(
      limit ? parseInt(limit) : 100,
    );
    
    return {
      total: transactions.length,
      transactions: transactions.map(tx => ({
        id: tx.id,
        positionId: tx.positionId,
        type: tx.type,
        date: tx.createdAt,
        txHash: tx.txHash,
        baseToken: {
          symbol: tx.baseSymbol,
          amount: Number(tx.baseAmount),
          valueUSD: Number(tx.baseValueUSD),
        },
        quoteToken: {
          symbol: tx.quoteSymbol,
          amount: Number(tx.quoteAmount),
          valueUSD: Number(tx.quoteValueUSD),
        },
        solPrice: Number(tx.solPrice),
        positionBalanceUSD: Number(tx.positionBalanceUSD),
        walletBalanceUSD: Number(tx.walletBalanceUSD),
        profit: tx.profitUSD !== null ? {
          usd: Number(tx.profitUSD),
        } : null,
      })),
    };
  }

   @Get('statistics')
  @ApiOperation({
    summary: 'Получить статистику транзакций',
    description: 'Возвращает общую статистику по всем транзакциям',
  })
  @ApiResponse({
    status: 200,
    description: 'Статистика',
    schema: {
      example: {
        totalTransactions: 150,
        openPositions: 75,
        closePositions: 75,
        totalProfit: '1250.50',
        totalVolume: '125000.00',
      },
    },
  })
  async getStatistics() {
    return this.transactionService.getStatistics();
  }



  @Get('position/:positionId')
  @ApiOperation({ 
    summary: 'Получить историю позиции',
    description: 'Возвращает все транзакции для конкретной позиции',
  })
  @ApiParam({
    name: 'positionId',
    description: 'ID позиции',
    example: '5HauEoJa6tcKBy1vofNAxnEDiMpC7H6V9L5TgLwFYNfd',
  })
  @ApiResponse({
    status: 200,
    description: 'История позиции',
    schema: {
      example: {
        positionId: '5HauEoJa...',
        total: 2,
        transactions: [
          {
            id: 1,
            type: 'OPEN_POSITION',
            date: '2025-01-15T10:30:00Z',
          },
          {
            id: 2,
            type: 'CLOSE_POSITION',
            date: '2025-01-16T14:20:00Z',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Позиция не найдена' })
  async getPositionHistory(@Param('positionId') positionId: string) {
    const transactions = await this.transactionService.getTransactionsByPosition(positionId);
    
    return {
      positionId,
      transactions,
    };
  }

  @Get('grouped')
  @ApiOperation({ 
    summary: 'Получить историю транзакций с группировкой свапов',
    description: 'Возвращает список транзакций, где свапы сгруппированы по позициям. Свапы между Remove и Add Liquidity объединяются в SWAP_GROUP.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Максимальное количество записей',
    example: 50,
  })
  @ApiResponse({
    status: 200,
    description: 'Список транзакций с группировкой свапов',
    schema: {
      example: {
        total: 25,
        transactions: [
          {
            id: 'swap-group-GFmD4Uc...',
            type: 'SWAP_GROUP',
            positionId: 'GFmD4UcWUTmnq...',
            swapCount: 3,
            date: '2025-12-12T19:51:25.351Z',
            swaps: [
              {
                id: '0bce3b0d-18e0...',
                index: 1,
                txHash: 'rPHW4i73aio9...',
                date: '2025-12-12T19:47:24.156Z',
                inputToken: 'SOL',
                inputAmount: 12.903954322,
                inputValueUSD: 1705.27,
                outputToken: 'USDC',
                outputAmount: 1684.196605,
                outputValueUSD: 1684.2,
                profitUSD: -21.08,
              },
            ],
            totalProfitUSD: -23.92,
            solPrice: 131.3,
            walletBalanceUSD: 143.18,
          },
          {
            id: 'b6f730af-1c1d...',
            positionId: 'GFmD4UcWUTmnq...',
            type: 'OPEN_POSITION',
            date: '2025-12-12T19:47:40.468Z',
            txHash: '66APpa6qFfkf...',
            baseToken: {
              symbol: 'SOL',
              amount: 13.715802339,
              valueUSD: 1792.06,
            },
            quoteToken: {
              symbol: 'USDC',
              amount: 1955.810927,
              valueUSD: 1955.81,
            },
            solPrice: 131.16,
            positionBalanceUSD: 3747.87,
            walletBalanceUSD: 3797.57,
            profit: null,
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  async getGroupedTransactions(@Query('limit') limit?: string) {
    const transactions = await this.transactionService.getTransactionsGrouped(
      limit ? parseInt(limit) : 50,
    );
    
    return {
      total: transactions.length,
      transactions,
    };
  }

  @Get('monthly/:year/:month')
  @ApiOperation({ 
    summary: 'Получить прибыль за месяц',
    description: 'Возвращает чистую и среднюю прибыль за указанный месяц',
  })
  @ApiParam({ name: 'year', example: 2025 })
  @ApiParam({ name: 'month', example: 1, description: '1-12' })
  @ApiResponse({
    status: 200,
    description: 'Статистика прибыли за месяц',
    schema: {
      example: {
        success: true,
        stats: {
          year: 2025,
          month: 1,
          totalNetProfit: '$100.00',
          avgProfit: '$20.00',
          operations: 5,
          profitableOps: 4,
          lossOps: 1,
          successRate: '80.0%',
        },
      },
    },
  })
  async getMonthlyProfit(
    @Param('year') year: number,
    @Param('month') month: number,
  ) {
    const stats = await this.transactionService.getMonthlyProfit(
      Number(year),
      Number(month),
    );

    return {
      success: true,
      stats: {
        year: stats.year,
        month: stats.month,
        totalNetProfit: `$${stats.totalNetProfit.toFixed(2)}`,
        avgProfit: `$${stats.avgProfit.toFixed(2)}`,
        operations: stats.operations,
        profitableOps: stats.profitableOps,
        lossOps: stats.lossOps,
        successRate: `${stats.successRate.toFixed(1)}%`,
      },
    };
  }


  @Get('all-time')
  @ApiOperation({ 
    summary: 'Получить прибыль за все время',
    description: 'Возвращает общую статистику прибыли и разбивку по месяцам',
  })
  @ApiResponse({
    status: 200,
    description: 'Статистика прибыли за все время',
    schema: {
      example: {
        success: true,
        stats: {
          totalNetProfit: '$450.00',
          avgProfit: '$22.50',
          operations: 20,
          profitableOps: 17,
          lossOps: 3,
          successRate: '85.0%',
          monthlyBreakdown: [
            { year: 2025, month: 3, profit: 150, operations: 8, avgProfit: 18.75 },
            { year: 2025, month: 2, profit: 200, operations: 7, avgProfit: 28.57 },
            { year: 2025, month: 1, profit: 100, operations: 5, avgProfit: 20.00 },
          ],
        },
      },
    },
  })
  async getAllTimeProfit() {
    const stats = await this.transactionService.getAllTimeProfit();

    return {
      success: true,
      stats: {
        totalNetProfit: `$${stats.totalNetProfit.toFixed(2)}`,
        avgProfit: `$${stats.avgProfit.toFixed(2)}`,
        operations: stats.operations,
        profitableOps: stats.profitableOps,
        lossOps: stats.lossOps,
        successRate: `${stats.successRate.toFixed(1)}%`,
        monthlyBreakdown: stats.monthlyBreakdown.map(m => ({
          year: m.year,
          month: m.month,
          monthName: this.getMonthName(m.month),
          profit: `$${m.profit.toFixed(2)}`,
          operations: m.operations,
          avgProfit: `$${m.avgProfit.toFixed(2)}`,
        })),
      },
    };
  }


    private getMonthName(month: number): string {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[month - 1];
  }


  


}
