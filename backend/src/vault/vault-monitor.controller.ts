import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard, RolesGuard, Roles } from '../auth/guards';
import { VaultService } from './vault.service';

class PauseDto { paused: boolean; }

@Controller('monitoring/vault')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class VaultMonitorController {
  constructor(private readonly vaultService: VaultService) {}

  /** GET /monitoring/vault/status */
  @Get('status')
  async getStatus() {
    return { success: true, ...(await this.vaultService.getVaultInfo()) };
  }

  /** GET /monitoring/vault/history?limit=50 */
  @Get('history')
  async getHistory(@Query('limit') limit?: string) {
    const txs = await this.vaultService.getAllHistory(Number(limit ?? 50));
    return { success: true, count: txs.length, transactions: txs };
  }

  /** GET /monitoring/vault/profit */
  @Get('profit')
  async getProfitSummary() {
    const summary = await this.vaultService.getProfitSummary();
    return { success: true, summary };
  }

  /** GET /monitoring/vault/depositors?limit=50 */
  @Get('depositors')
  async getDepositors(@Query('limit') limit?: string) {
    const depositors = await this.vaultService.getDepositors(Number(limit ?? 200));
    return { success: true, count: depositors.length, depositors };
  }

  /** POST /monitoring/vault/pause  body: { paused: boolean } */
  @Post('pause')
  async pauseVault(@Body() dto: PauseDto) {
    try {
      const tx = await this.vaultService.pauseVault(dto.paused);
      return { success: true, paused: dto.paused, tx };
    } catch (err) {
      throw new HttpException(err?.message ?? 'Failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** POST /monitoring/vault/update-tvl — manual trigger */
  @Post('update-tvl')
  async updateTvl() {
    try {
      await this.vaultService.triggerUpdateTvl();
      return { success: true, message: 'TVL update triggered' };
    } catch (err) {
      throw new HttpException(err?.message ?? 'Failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * POST /monitoring/vault/increase-liquidity
   * Deploys all idle treasury funds into the active CLMM position.
   * Also runs automatically every 10 minutes via cron when treasury_sol > 0.01 SOL.
   */
  @Post('increase-liquidity')
  async increaseLiquidity() {
    try {
      const tx = await this.vaultService.triggerIncreaseLiquidity();
      return { success: true, tx };
    } catch (err) {
      throw new HttpException(err?.message ?? 'Failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
