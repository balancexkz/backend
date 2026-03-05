import { Controller, Post, Body, HttpException, HttpStatus, Get, Param, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard, Roles } from '../auth/guards';
import { SwapService } from './swap.service';

@Controller('swap')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class SwapController {
  constructor(private readonly swapService: SwapService) {}

  @Post('')
  async swap(@Body() body: {
    poolId: string;
    inputMint: string;
    inputAmount: number;
    slippage?: number;
  }) {
    try {
      const result = await this.swapService.executeSwap({
        poolId: body.poolId,
        inputMint: body.inputMint,
        inputAmount: body.inputAmount,
        slippage: body.slippage || 0.05,
      });

      return {
        success: true,
        ...result,
        explorerUrl: `https://explorer.solana.com/tx/${result.txId}`,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to execute swap',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }


  @Post('swap/quote')
  async getSwapQuote(@Body() body: {
    poolId: string;
    inputMint: string;
    inputAmount: number;
    slippage?: number; // Deprecated - теперь используется только для расчета minimumOutput на клиенте
  }) {
    try {
      const quote = await this.swapService.getSwapQuote({
        poolId: body.poolId,
        inputMint: body.inputMint,
        inputAmount: body.inputAmount,
      });

      // Рассчитываем minimumOutput локально если slippage передан
      const minimumOutput = body.slippage
        ? (parseFloat(quote.expectedOutput) * (1 - body.slippage)).toString()
        : quote.expectedOutput;

      return {
        success: true,
        ...quote,
        minimumOutput, // Добавляем для обратной совместимости
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get quote',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}