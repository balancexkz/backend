import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { VaultService } from './vault.service';

class DepositConfirmDto {
  txHash: string;
  userPubkey: string;
  amountLamports: number;
}

class WithdrawConfirmDto {
  txHash: string;
  userPubkey: string;
}

@Controller('vault')
export class VaultController {
  constructor(private readonly vaultService: VaultService) {}

  // ─── Vault state (public) ─────────────────────────────────────────────────

  /** GET /vault/info — TVL, solPrice, shares, treasury, isPaused */
  @Get('info')
  async getInfo() {
    return { success: true, ...(await this.vaultService.getVaultInfo()) };
  }

  /**
   * GET /vault/position
   * Active CLMM position: status, price range, amounts, treasury.
   * Used by frontend "Pool Balances" + position info widget.
   */
  @Get('position')
  async getPosition() {
    return { success: true, ...(await this.vaultService.getVaultPosition()) };
  }

  // ─── User state (public) ──────────────────────────────────────────────────

  /**
   * GET /vault/user/:userPubkey
   * User's shares, value, position slice, treasury slice, withdrawal estimate.
   */
  @Get('user/:userPubkey')
  async getUserPosition(@Param('userPubkey') userPubkey: string) {
    return { success: true, ...(await this.vaultService.getUserPosition(userPubkey)) };
  }

  // ─── Build unsigned transactions (public — frontend builds its own but endpoint kept for SDK) ──

  /** GET /vault/deposit/build?userPubkey=&amountLamports= */
  @Get('deposit/build')
  async buildDeposit(
    @Query('userPubkey')     userPubkey: string,
    @Query('amountLamports') amountLamports: string,
  ) {
    if (!userPubkey || !amountLamports) {
      throw new HttpException('userPubkey and amountLamports are required', HttpStatus.BAD_REQUEST);
    }
    const amount = parseInt(amountLamports, 10);
    if (isNaN(amount) || amount <= 0) {
      throw new HttpException('amountLamports must be a positive integer', HttpStatus.BAD_REQUEST);
    }
    return { success: true, ...(await this.vaultService.buildDeposit(userPubkey, amount)) };
  }

  /** GET /vault/withdraw/build?userPubkey= */
  @Get('withdraw/build')
  async buildWithdraw(@Query('userPubkey') userPubkey: string) {
    if (!userPubkey) {
      throw new HttpException('userPubkey is required', HttpStatus.BAD_REQUEST);
    }
    return { success: true, ...(await this.vaultService.buildWithdraw(userPubkey)) };
  }

  // ─── Confirm — no JWT (frontend calls after on-chain TX confirmed) ─────────

  /**
   * POST /vault/deposit/confirm
   * Body: { txHash, userPubkey, amountLamports }
   * Frontend calls this after depositSol TX is confirmed on-chain.
   * No JWT required — txHash serves as proof.
   */
  @Post('deposit/confirm')
  async confirmDeposit(@Body() dto: DepositConfirmDto) {
    if (!dto.txHash || !dto.userPubkey || !dto.amountLamports) {
      throw new HttpException('txHash, userPubkey and amountLamports are required', HttpStatus.BAD_REQUEST);
    }
    return {
      success: true,
      ...(await this.vaultService.confirmDeposit(dto.txHash, dto.userPubkey, dto.amountLamports)),
    };
  }

  /**
   * POST /vault/withdraw/confirm
   * Body: { txHash, userPubkey }
   */
  @Post('withdraw/confirm')
  async confirmWithdraw(@Body() dto: WithdrawConfirmDto) {
    if (!dto.txHash || !dto.userPubkey) {
      throw new HttpException('txHash and userPubkey are required', HttpStatus.BAD_REQUEST);
    }
    return {
      success: true,
      ...(await this.vaultService.confirmWithdraw(dto.txHash, dto.userPubkey)),
    };
  }

  // ─── History (public) ─────────────────────────────────────────────────────

  /** GET /vault/history/:userPubkey?limit=20 */
  @Get('history/:userPubkey')
  async getHistory(
    @Param('userPubkey') userPubkey: string,
    @Query('limit') limit?: string,
  ) {
    const txs = await this.vaultService.getUserHistory(userPubkey, Number(limit ?? 20));
    return { success: true, count: txs.length, transactions: txs };
  }
}
