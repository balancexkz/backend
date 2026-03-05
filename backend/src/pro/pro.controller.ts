/**
 * ProController
 *
 * Admin REST API for managing PRO-role users (smart wallets + positions).
 * All routes require JWT + admin role.
 *
 * Onboarding flow:
 *   1. GET  /pro/wallet/build-create?ownerPubkey=  → unsigned createWallet TX (owner signs)
 *   2. GET  /pro/wallet/build-delegate?ownerPubkey= → unsigned setDelegate TX (owner signs)
 *   3. POST /pro/register                          → register user in DB, start monitoring
 *   4. Monitor takes over automatically
 */

import {
  Controller,
  Post,
  Get,
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
import { SolanaService } from '../solana/solana.service';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

class RegisterProUserDto {
  ownerPubkey: string;
  poolId: string;
  priceRangePercent?: number;
}

class OpenPositionDto {
  priceRangePercent?: number;
  amount0MaxFraction?: number;
  amount1MaxFraction?: number;
  solPrice?: number;
}

class ClosePositionDto {
  amount0Min?: number;
  amount1Min?: number;
  solPrice?: number;
}

class CollectFeesDto {
  solPrice?: number;
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('pro')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class ProController {
  constructor(
    private readonly smartWallet: SmartWalletProgramService,
    private readonly proLiquidity: ProLiquidityService,
    private readonly solana: SolanaService,
  ) {}

  // ─── Wallet setup ───────────────────────────────────────────────────────────

  /**
   * GET /pro/wallet/build-create?ownerPubkey=...
   * Returns unsigned TX for creating SmartWallet on-chain (owner must sign).
   */
  @Get('wallet/build-create')
  async buildCreateWallet(@Query('ownerPubkey') ownerPubkey: string) {
    if (!ownerPubkey) {
      throw new HttpException('ownerPubkey is required', HttpStatus.BAD_REQUEST);
    }
    try {
      const owner = new PublicKey(ownerPubkey);
      const tx: Transaction = await this.smartWallet.buildCreateWalletTx(owner);
      const { blockhash, lastValidBlockHeight } =
        await this.solana.connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.lastValidBlockHeight = lastValidBlockHeight;
      tx.feePayer = owner;

      return {
        success: true,
        ownerPubkey,
        walletPda:   this.solana.getSmartWalletPda(owner).toBase58(),
        transaction: tx.serialize({ requireAllSignatures: false }).toString('base64'),
      };
    } catch (err) {
      throw new HttpException(err?.message ?? 'Failed to build tx', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * GET /pro/wallet/build-delegate?ownerPubkey=...
   * Returns unsigned TX for authorizing the backend admin as delegate (owner must sign).
   */
  @Get('wallet/build-delegate')
  async buildSetDelegate(@Query('ownerPubkey') ownerPubkey: string) {
    if (!ownerPubkey) {
      throw new HttpException('ownerPubkey is required', HttpStatus.BAD_REQUEST);
    }
    try {
      const owner = new PublicKey(ownerPubkey);
      const tx: Transaction = await this.smartWallet.buildSetDelegateTx(owner);
      const { blockhash, lastValidBlockHeight } =
        await this.solana.connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.lastValidBlockHeight = lastValidBlockHeight;
      tx.feePayer = owner;

      return {
        success: true,
        ownerPubkey,
        delegatePubkey: this.solana.adminKeypair.publicKey.toBase58(),
        transaction:    tx.serialize({ requireAllSignatures: false }).toString('base64'),
      };
    } catch (err) {
      throw new HttpException(err?.message ?? 'Failed to build tx', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * GET /pro/wallet/status?ownerPubkey=...
   * On-chain SmartWallet state + DB pro_position record.
   */
  @Get('wallet/status')
  async getWalletStatus(@Query('ownerPubkey') ownerPubkey: string) {
    if (!ownerPubkey) {
      throw new HttpException('ownerPubkey is required', HttpStatus.BAD_REQUEST);
    }
    const owner = new PublicKey(ownerPubkey);
    const [onChain, dbRecord] = await Promise.all([
      this.proLiquidity.getOnChainWalletState(owner),
      this.proLiquidity.getProPosition(ownerPubkey),
    ]);

    return {
      success: true,
      ownerPubkey,
      walletPda: this.solana.getSmartWalletPda(owner).toBase58(),
      exists:    onChain !== null,
      onChain,
      db:        dbRecord,
    };
  }

  /**
   * GET /pro/wallet/balances?ownerPubkey=...
   * SOL and USDC treasury balances for a user's SmartWallet.
   */
  @Get('wallet/balances')
  async getTreasuryBalances(@Query('ownerPubkey') ownerPubkey: string) {
    if (!ownerPubkey) {
      throw new HttpException('ownerPubkey is required', HttpStatus.BAD_REQUEST);
    }
    const owner = new PublicKey(ownerPubkey);
    const [solRaw, usdcRaw] = await Promise.all([
      this.proLiquidity.getSolTreasuryBalance(owner).catch(() => null),
      this.proLiquidity.getUsdcTreasuryBalance(owner).catch(() => null),
    ]);

    return {
      success: true,
      ownerPubkey,
      sol:  { raw: solRaw,  human: solRaw  !== null ? solRaw  / 1e9 : null, unit: 'SOL'  },
      usdc: { raw: usdcRaw, human: usdcRaw !== null ? usdcRaw / 1e6 : null, unit: 'USDC' },
    };
  }

  // ─── User registration ──────────────────────────────────────────────────────

  /**
   * POST /pro/register
   * Body: { ownerPubkey, poolId, priceRangePercent? }
   * Register a user for automated PRO management. Idempotent.
   */
  @Post('register')
  async register(@Body() dto: RegisterProUserDto) {
    if (!dto.ownerPubkey || !dto.poolId) {
      throw new HttpException('ownerPubkey and poolId are required', HttpStatus.BAD_REQUEST);
    }
    try {
      const record = await this.proLiquidity.registerUser({
        ownerPubkey:       dto.ownerPubkey,
        poolId:            dto.poolId,
        priceRangePercent: dto.priceRangePercent,
      });
      return { success: true, record };
    } catch (err) {
      throw new HttpException(err?.message ?? 'Registration failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ─── Position management ────────────────────────────────────────────────────

  /**
   * POST /pro/:ownerPubkey/position/open
   */
  @Post(':ownerPubkey/position/open')
  async openPosition(
    @Param('ownerPubkey') ownerPubkey: string,
    @Body() dto: OpenPositionDto,
  ) {
    const record = await this.proLiquidity.getProPosition(ownerPubkey);
    if (!record) {
      throw new HttpException(`User ${ownerPubkey.slice(0, 8)} not registered`, HttpStatus.NOT_FOUND);
    }
    try {
      const result = await this.proLiquidity.openPosition({
        owner:              new PublicKey(ownerPubkey),
        poolId:             record.poolId,
        priceRangePercent:  dto.priceRangePercent ?? Number(record.priceRangePercent),
        amount0MaxFraction: dto.amount0MaxFraction,
        amount1MaxFraction: dto.amount1MaxFraction,
        solPrice:           dto.solPrice ?? 0,
      });
      return { success: true, result };
    } catch (err) {
      throw new HttpException(err?.message ?? 'openPosition failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * POST /pro/:ownerPubkey/position/close
   */
  @Post(':ownerPubkey/position/close')
  async closePosition(
    @Param('ownerPubkey') ownerPubkey: string,
    @Body() dto: ClosePositionDto,
  ) {
    const record = await this.proLiquidity.getProPosition(ownerPubkey);
    if (!record?.positionNftMint || record.tickLower === null || record.tickUpper === null) {
      throw new HttpException(`No active position for ${ownerPubkey.slice(0, 8)}`, HttpStatus.NOT_FOUND);
    }
    try {
      const result = await this.proLiquidity.closePosition({
        owner:           new PublicKey(ownerPubkey),
        positionNftMint: record.positionNftMint,
        poolId:          record.poolId,
        tickLower:       record.tickLower,
        tickUpper:       record.tickUpper,
        amount0Min:      dto.amount0Min ?? 0,
        amount1Min:      dto.amount1Min ?? 0,
        solPrice:        dto.solPrice ?? 0,
      });
      return { success: true, result };
    } catch (err) {
      throw new HttpException(err?.message ?? 'closePosition failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * POST /pro/:ownerPubkey/fees/collect
   */
  @Post(':ownerPubkey/fees/collect')
  async collectFees(
    @Param('ownerPubkey') ownerPubkey: string,
    @Body() dto: CollectFeesDto,
  ) {
    const record = await this.proLiquidity.getProPosition(ownerPubkey);
    if (!record?.positionNftMint || record.tickLower === null || record.tickUpper === null) {
      throw new HttpException(`No active position for ${ownerPubkey.slice(0, 8)}`, HttpStatus.NOT_FOUND);
    }
    try {
      const result = await this.proLiquidity.collectFees({
        owner:           new PublicKey(ownerPubkey),
        positionNftMint: record.positionNftMint,
        poolId:          record.poolId,
        tickLower:       record.tickLower,
        tickUpper:       record.tickUpper,
        solPrice:        dto.solPrice ?? 0,
      });
      return { success: true, result };
    } catch (err) {
      throw new HttpException(err?.message ?? 'collectFees failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
