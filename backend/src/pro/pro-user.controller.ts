/**
 * ProUserController
 *
 * User-facing REST API for PRO-role users.
 * Accessible by both 'pro' and 'admin' roles.
 * Routes: /pro/user/*
 */

import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { PublicKey, Transaction } from '@solana/web3.js';
import { JwtAuthGuard, RolesGuard, Roles } from '../auth/guards';
import { SmartWalletProgramService } from '../solana/smart-wallet-program.service';
import { ProLiquidityService } from './pro-liquidity.service';
import { LiquidityTransactionService } from '../liquidity/liquidity-transaction.service';
import { SolanaService } from '../solana/solana.service';
import { PositionConfigService } from '../position/position.config.service';
import { PositionAnalyticsService } from '../analytic/analytic.service';

const POOL_ID = process.env.POOL_ID ?? '9PkgWfdiuhCeL9svLY1feA2uXiCkw7bbLhXZedaboZLz';

@Controller('pro/user')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('pro', 'admin')
export class ProUserController {
  constructor(
    private readonly smartWallet: SmartWalletProgramService,
    private readonly proLiquidity: ProLiquidityService,
    private readonly liquidityTx: LiquidityTransactionService,
    private readonly solana: SolanaService,
    private readonly positionConfig: PositionConfigService,
    private readonly analytics: PositionAnalyticsService,
  ) {}

  // ─── Onboarding ──────────────────────────────────────────────────────────────

  /** GET /pro/user/status?ownerPubkey= */
  @Get('status')
  async getStatus(@Query('ownerPubkey') ownerPubkey: string) {
    if (!ownerPubkey) throw new HttpException('ownerPubkey required', HttpStatus.BAD_REQUEST);
    const owner = new PublicKey(ownerPubkey);
    const [onChain, dbRecord] = await Promise.all([
      this.proLiquidity.getOnChainWalletState(owner).catch(() => null),
      this.proLiquidity.getProPosition(ownerPubkey).catch(() => null),
    ]);
    return {
      success: true,
      ownerPubkey,
      walletPda: this.solana.getSmartWalletPda(owner).toBase58(),
      walletExists: onChain !== null,
      registered: dbRecord !== null,
      position: dbRecord,
    };
  }

  /** GET /pro/user/build-create?ownerPubkey= */
  @Get('build-create')
  async buildCreate(@Query('ownerPubkey') ownerPubkey: string) {
    if (!ownerPubkey) throw new HttpException('ownerPubkey required', HttpStatus.BAD_REQUEST);
    const owner = new PublicKey(ownerPubkey);
    const tx: Transaction = await this.smartWallet.buildCreateWalletTx(owner);
    const { blockhash } = await this.solana.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = owner;
    return {
      success: true,
      walletPda: this.solana.getSmartWalletPda(owner).toBase58(),
      transaction: tx.serialize({ requireAllSignatures: false }).toString('base64'),
    };
  }

  /** GET /pro/user/build-fund?ownerPubkey=&amountSol= */
  @Get('build-fund')
  async buildFund(
    @Query('ownerPubkey') ownerPubkey: string,
    @Query('amountSol') amountSol: string,
  ) {
    if (!ownerPubkey) throw new HttpException('ownerPubkey required', HttpStatus.BAD_REQUEST);
    if (!amountSol || isNaN(Number(amountSol)) || Number(amountSol) <= 0)
      throw new HttpException('amountSol required (e.g. 0.1)', HttpStatus.BAD_REQUEST);

    const owner = new PublicKey(ownerPubkey);
    const amountLamports = Math.floor(Number(amountSol) * 1e9);
    const tx = await this.smartWallet.buildFundSolTreasuryTx(owner, amountLamports);
    const { blockhash } = await this.solana.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = owner;
    return {
      success: true,
      amountSol: Number(amountSol),
      amountLamports,
      transaction: tx.serialize({ requireAllSignatures: false }).toString('base64'),
    };
  }

  /** GET /pro/user/build-delegate?ownerPubkey= */
  @Get('build-delegate')
  async buildDelegate(@Query('ownerPubkey') ownerPubkey: string) {
    if (!ownerPubkey) throw new HttpException('ownerPubkey required', HttpStatus.BAD_REQUEST);
    const owner = new PublicKey(ownerPubkey);
    const tx: Transaction = await this.smartWallet.buildSetDelegateTx(owner);
    const { blockhash } = await this.solana.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = owner;
    return {
      success: true,
      delegatePubkey: this.solana.adminKeypair.publicKey.toBase58(),
      transaction: tx.serialize({ requireAllSignatures: false }).toString('base64'),
    };
  }

  /** POST /pro/user/register  body: { ownerPubkey } */
  @Post('register')
  async register(@Body() body: { ownerPubkey: string }) {
    if (!body.ownerPubkey) throw new HttpException('ownerPubkey required', HttpStatus.BAD_REQUEST);
    const record = await this.proLiquidity.registerUser({
      ownerPubkey: body.ownerPubkey,
      poolId: POOL_ID,
    });
    return { success: true, record };
  }

  // ─── History & P&L ───────────────────────────────────────────────────────────

  /** GET /pro/user/history?ownerPubkey=&limit=50 */
  @Get('history')
  async getHistory(
    @Query('ownerPubkey') ownerPubkey: string,
    @Query('limit') limit?: string,
  ) {
    if (!ownerPubkey) throw new HttpException('ownerPubkey required', HttpStatus.BAD_REQUEST);
    const txs = await this.liquidityTx.getByOwner(ownerPubkey, Number(limit ?? 50));
    return { success: true, count: txs.length, transactions: txs };
  }

  /** GET /pro/user/profit?ownerPubkey= */
  @Get('profit')
  async getProfit(@Query('ownerPubkey') ownerPubkey: string) {
    if (!ownerPubkey) throw new HttpException('ownerPubkey required', HttpStatus.BAD_REQUEST);
    const summary = await this.liquidityTx.getProfitSummary(ownerPubkey);
    return { success: true, summary };
  }

  // ─── Position config (range settings) ────────────────────────────────────────

  /** POST /pro/user/config  body: { poolId, lowerRangePercent, upperRangePercent } */
  @Post('config')
  async upsertConfig(
    @Body() dto: { poolId: string; lowerRangePercent: number; upperRangePercent: number },
  ) {
    const config = await this.positionConfig.upsertConfig(dto);
    return { success: true, config };
  }

  /** GET /pro/user/config/:poolId */
  @Get('config/:poolId')
  async getConfig(@Param('poolId') poolId: string) {
    const config = await this.positionConfig.getConfig(poolId);
    return { success: true, config };
  }

  /** GET /pro/user/config */
  @Get('config')
  async getAllConfigs() {
    const configs = await this.positionConfig.getAllConfigs();
    return { success: true, configs };
  }

  /** DELETE /pro/user/config/:poolId */
  @Delete('config/:poolId')
  async deleteConfig(@Param('poolId') poolId: string) {
    await this.positionConfig.deleteConfig(poolId);
    return { success: true, message: `Config deleted for pool ${poolId}` };
  }

  /** POST /pro/user/config/:poolId/deactivate */
  @Post('config/:poolId/deactivate')
  async deactivateConfig(@Param('poolId') poolId: string) {
    await this.positionConfig.deactivateConfig(poolId);
    return { success: true, message: `Config deactivated for pool ${poolId}` };
  }

  // ─── Analytics ────────────────────────────────────────────────────────────────

  /** GET /pro/user/analytics/positions?status=&limit=&sort= */
  @Get('analytics/positions')
  async getAnalyticsPositions(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: string,
  ) {
    const positions = await this.analytics.getAllPositions(status);

    if (sort === 'roi')      positions.sort((a, b) => (b.roi || 0) - (a.roi || 0));
    else if (sort === 'profit')   positions.sort((a, b) => (b.netProfit || 0) - (a.netProfit || 0));
    else if (sort === 'duration') positions.sort((a, b) => (b.durationSeconds || 0) - (a.durationSeconds || 0));

    const limited = limit ? positions.slice(0, parseInt(limit)) : positions;
    return {
      total: positions.length,
      positions: limited.map(p => ({
        id: p.positionId,
        status: p.status,
        poolId: p.poolId,
        createdAt: p.createdAt,
        closedAt: p.closedAt,
        durationSeconds: p.durationSeconds,
        initialValueUSD: parseFloat(p.initialValueUSD.toString()),
        finalValueUSD: p.finalValueUSD ? parseFloat(p.finalValueUSD.toString()) : null,
        netProfit: p.netProfit ? parseFloat(p.netProfit.toString()) : null,
        roi: p.roi ? parseFloat(p.roi.toString()) : null,
        impermanentLoss: p.impermanentLoss ? parseFloat(p.impermanentLoss.toString()) : null,
        feesEarned: parseFloat(p.feesEarnedUSD.toString()),
        totalSwaps: p.totalSwaps,
        apr: p.apr,
      })),
    };
  }

  /** GET /pro/user/analytics/position/:positionId */
  @Get('analytics/position/:positionId')
  async getAnalyticsPosition(@Param('positionId') positionId: string) {
    const a = await this.analytics.getAnalytics(positionId);
    if (!a) throw new HttpException('Position not found', HttpStatus.NOT_FOUND);
    return { success: true, analytics: a };
  }
}
