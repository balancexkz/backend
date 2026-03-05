/**
 * ProLiquidityService
 *
 * High-level CLMM operations for the PRO role.
 * Wraps SmartWalletProgramService + ClmmAccountsBuilderService and keeps
 * the ProPosition entity in sync with on-chain state.
 *
 * After every successful on-chain call it writes a row to `liquidity_transactions`
 * via LiquidityTransactionService.
 *
 * All methods sign as the backend admin (delegate of the user's SmartWallet).
 * Owner = user's Solana public key, passed as a parameter.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PublicKey } from '@solana/web3.js';
import * as BN from 'bn.js';

import { SolanaService } from '../solana/solana.service';
import { SmartWalletProgramService } from '../solana/smart-wallet-program.service';
import { ClmmAccountsBuilderService } from './clmm-accounts-builder.service';
import { ProPosition } from './pro-position.entity';
import {
  LiquidityTransactionService,
  SaveLiquidityTxDto,
} from '../liquidity/liquidity-transaction.service';
import {
  LiquidityRole,
  LiquidityTransactionType,
} from '../liquidity/liquidity-transaction.entity';

export interface OpenPositionResult {
  tx: string;
  positionNftMint: string;
  tickLower: number;
  tickUpper: number;
}

export interface ClosePositionResult {
  tx: string;
}

export interface CollectFeesResult {
  tx: string;
}

// ─── Lamports / decimals ─────────────────────────────────────────────────────
const SOL_DECIMALS  = 9;
const USDC_DECIMALS = 6;

@Injectable()
export class ProLiquidityService {
  private readonly logger = new Logger(ProLiquidityService.name);

  constructor(
    private readonly solana: SolanaService,
    private readonly smartWallet: SmartWalletProgramService,
    private readonly accountsBuilder: ClmmAccountsBuilderService,
    private readonly liquidityTx: LiquidityTransactionService,
    @InjectRepository(ProPosition)
    private readonly proPositionRepo: Repository<ProPosition>,
  ) {}

  // ─── Register / lookup ──────────────────────────────────────────────────────

  /** Register a pro user for monitoring (idempotent). */
  async registerUser(params: {
    ownerPubkey: string;
    poolId: string;
    priceRangePercent?: number;
  }): Promise<ProPosition> {
    const existing = await this.proPositionRepo.findOne({
      where: { ownerPubkey: params.ownerPubkey },
    });
    if (existing) return existing;

    const record = this.proPositionRepo.create({
      ownerPubkey:       params.ownerPubkey,
      poolId:            params.poolId,
      priceRangePercent: params.priceRangePercent ?? 5,
    });
    return this.proPositionRepo.save(record);
  }

  /** Fetch the DB record for a pro user (null if not registered). */
  async getProPosition(ownerPubkey: string): Promise<ProPosition | null> {
    return this.proPositionRepo.findOne({ where: { ownerPubkey } });
  }

  // ─── Treasury balance helpers ────────────────────────────────────────────────

  /** Read the SOL (wSOL) treasury lamports balance. */
  async getSolTreasuryBalance(owner: PublicKey): Promise<number> {
    const walletPda   = this.solana.getSmartWalletPda(owner);
    const treasuryPda = this.smartWallet.getSolTreasuryPda(walletPda);
    const bal = await this.solana.connection.getTokenAccountBalance(treasuryPda);
    return Number(bal.value.amount); // raw lamports / token units
  }

  /** Read the USDC treasury token balance. */
  async getUsdcTreasuryBalance(owner: PublicKey): Promise<number> {
    const walletPda   = this.solana.getSmartWalletPda(owner);
    const treasuryPda = this.smartWallet.getUsdcTreasuryPda(walletPda);
    const bal = await this.solana.connection.getTokenAccountBalance(treasuryPda);
    return Number(bal.value.amount);
  }

  // ─── Open position ───────────────────────────────────────────────────────────

  /**
   * Open a new CLMM position for the user.
   *
   * @param priceRangePercent  symmetric range in %, e.g. 5 = current ± 5%
   * @param amount0MaxFraction fraction of the SOL treasury to use (0–1), default 0.9
   * @param amount1MaxFraction fraction of the USDC treasury to use (0–1), default 0.95
   * @param rebalanceId        optional — set when called as part of a rebalance cycle
   * @param solPrice           optional — current SOL/USD price for logging
   */
  async openPosition(params: {
    owner: PublicKey;
    poolId: string;
    priceRangePercent?: number;
    amount0MaxFraction?: number;
    amount1MaxFraction?: number;
    rebalanceId?: string | null;
    solPrice?: number;
  }): Promise<OpenPositionResult> {
    const {
      owner,
      poolId,
      priceRangePercent = 5,
      amount0MaxFraction = 0.9,
      amount1MaxFraction = 0.95,
      rebalanceId = null,
      solPrice = 0,
    } = params;

    const poolPubkey = new PublicKey(poolId);
    const walletPda  = this.solana.getSmartWalletPda(owner);
    const ownerStr   = owner.toBase58();

    // 1. Read pool to get current tick + spacing
    const pool = await this.accountsBuilder.readPoolState(poolPubkey);
    const range = this.accountsBuilder.calcTickRange(
      pool.tickCurrent,
      pool.tickSpacing,
      priceRangePercent,
    );

    this.logger.log(
      `[${ownerStr.slice(0, 8)}] openPosition | ` +
      `range=${priceRangePercent}% | ticks [${range.tickLower}, ${range.tickUpper}]`,
    );

    // 2. Read treasury balances for amount caps
    const solBalanceRaw  = await this.getSolTreasuryBalance(owner);
    const usdcBalanceRaw = await this.getUsdcTreasuryBalance(owner);

    const amount0Max = Math.floor(solBalanceRaw  * amount0MaxFraction);
    const amount1Max = Math.floor(usdcBalanceRaw * amount1MaxFraction);

    if (amount0Max <= 0 && amount1Max <= 0) {
      throw new Error('Both treasuries are empty — fund the wallet first');
    }

    // 3. Build on-chain accounts
    const built = await this.accountsBuilder.buildOpenPositionAccounts({
      poolId:    poolPubkey,
      walletPda,
      tickLower: range.tickLower,
      tickUpper: range.tickUpper,
    });

    // 4. Call smart-wallet program
    const tx = await this.smartWallet.openPosition(
      owner,
      {
        tickLowerIndex:           range.tickLower,
        tickUpperIndex:           range.tickUpper,
        tickArrayLowerStartIndex: range.tickArrayLowerStart,
        tickArrayUpperStartIndex: range.tickArrayUpperStart,
        liquidity:               new BN(0), // 0 → Raydium calculates from amount caps
        amount0Max,
        amount1Max,
      },
      built.accounts,
      built.positionNftMintKeypair,
    );

    const nftMint = built.positionNftMintKeypair.publicKey.toBase58();
    this.logger.log(`[${ownerStr.slice(0, 8)}] ✅ position opened: ${nftMint.slice(0, 8)}...`);

    // 5. Persist to pro_position table
    await this.proPositionRepo.upsert(
      {
        ownerPubkey:      ownerStr,
        poolId,
        positionNftMint:  nftMint,
        tickLower:        range.tickLower,
        tickUpper:        range.tickUpper,
        priceRangePercent,
        lastError:        null,
      },
      ['ownerPubkey'],
    );

    // 6. Log to unified transaction table
    const solAmountUsd  = (amount0Max / 10 ** SOL_DECIMALS)  * solPrice;
    const usdcAmountUsd = amount1Max / 10 ** USDC_DECIMALS;

    await this.saveTx({
      ownerPubkey:    ownerStr,
      type:           LiquidityTransactionType.OPEN_POSITION,
      txHash:         tx,
      poolId,
      positionNftMint: nftMint,
      solAmountRaw:   amount0Max,
      usdcAmountRaw:  amount1Max,
      solAmount:      amount0Max / 10 ** SOL_DECIMALS,
      usdcAmount:     amount1Max / 10 ** USDC_DECIMALS,
      solAmountUsd,
      usdcAmountUsd,
      solPrice,
      rebalanceId,
    });

    return { tx, positionNftMint: nftMint, tickLower: range.tickLower, tickUpper: range.tickUpper };
  }

  // ─── Close position ──────────────────────────────────────────────────────────

  /**
   * Close the user's current CLMM position and return funds to treasury.
   *
   * @param amount0Min  minimum SOL to receive (slippage protection, 0 = none)
   * @param amount1Min  minimum USDC to receive (slippage protection, 0 = none)
   * @param rebalanceId optional — set when called as part of a rebalance cycle
   * @param solPrice    optional — current SOL/USD price for logging
   */
  async closePosition(params: {
    owner: PublicKey;
    positionNftMint: string;
    poolId: string;
    tickLower: number;
    tickUpper: number;
    amount0Min?: number;
    amount1Min?: number;
    rebalanceId?: string | null;
    solPrice?: number;
    openValueUsd?: number;  // used to calculate profitUsd
  }): Promise<ClosePositionResult> {
    const {
      owner,
      positionNftMint,
      poolId,
      tickLower,
      tickUpper,
      amount0Min = 0,
      amount1Min = 0,
      rebalanceId = null,
      solPrice = 0,
      openValueUsd,
    } = params;

    const ownerStr  = owner.toBase58();
    const walletPda = this.solana.getSmartWalletPda(owner);
    const accounts  = await this.accountsBuilder.buildPositionAccounts({
      poolId:          new PublicKey(poolId),
      walletPda,
      positionNftMint: new PublicKey(positionNftMint),
      tickLower,
      tickUpper,
    });

    const tx = await this.smartWallet.closePosition(owner, amount0Min, amount1Min, accounts);
    this.logger.log(`[${ownerStr.slice(0, 8)}] ✅ position closed: ${tx.slice(0, 8)}...`);

    // Clear position fields in DB
    await this.proPositionRepo.update(
      { ownerPubkey: ownerStr },
      { positionNftMint: null, tickLower: null, tickUpper: null, lastError: null },
    );

    // Read post-close treasury balances as a rough close-value estimate
    const solRaw  = await this.getSolTreasuryBalance(owner).catch(() => 0);
    const usdcRaw = await this.getUsdcTreasuryBalance(owner).catch(() => 0);

    const solAmountUsd  = (solRaw  / 10 ** SOL_DECIMALS)  * solPrice;
    const usdcAmountUsd =  usdcRaw / 10 ** USDC_DECIMALS;
    const closeValueUsd = solAmountUsd + usdcAmountUsd;
    const profitUsd     = openValueUsd != null ? closeValueUsd - openValueUsd : null;

    await this.saveTx({
      ownerPubkey:    ownerStr,
      type:           LiquidityTransactionType.CLOSE_POSITION,
      txHash:         tx,
      poolId,
      positionNftMint,
      solAmountRaw:   solRaw,
      usdcAmountRaw:  usdcRaw,
      solAmount:      solRaw  / 10 ** SOL_DECIMALS,
      usdcAmount:     usdcRaw / 10 ** USDC_DECIMALS,
      solAmountUsd,
      usdcAmountUsd,
      solPrice,
      profitUsd,
      rebalanceId,
    });

    return { tx };
  }

  // ─── Collect fees ────────────────────────────────────────────────────────────

  async collectFees(params: {
    owner: PublicKey;
    positionNftMint: string;
    poolId: string;
    tickLower: number;
    tickUpper: number;
    solPrice?: number;
  }): Promise<CollectFeesResult> {
    const { owner, positionNftMint, poolId, tickLower, tickUpper, solPrice = 0 } = params;

    const ownerStr  = owner.toBase58();
    const walletPda = this.solana.getSmartWalletPda(owner);
    const accounts  = await this.accountsBuilder.buildPositionAccounts({
      poolId:          new PublicKey(poolId),
      walletPda,
      positionNftMint: new PublicKey(positionNftMint),
      tickLower,
      tickUpper,
    });

    const tx = await this.smartWallet.collectFees(owner, accounts);
    this.logger.log(`[${ownerStr.slice(0, 8)}] ✅ fees collected: ${tx.slice(0, 8)}...`);

    await this.saveTx({
      ownerPubkey:    ownerStr,
      type:           LiquidityTransactionType.COLLECT_FEES,
      txHash:         tx,
      poolId,
      positionNftMint,
      solPrice,
    });

    return { tx };
  }

  // ─── Swap in treasury ────────────────────────────────────────────────────────

  /**
   * Swap tokens inside the user's treasury (used during rebalancing).
   *
   * @param amountIn         raw token units (lamports for SOL, token units for USDC)
   * @param minimumAmountOut slippage floor — 0 means no protection (use carefully)
   * @param rebalanceId      optional — set when called as part of a rebalance cycle
   * @param solPrice         optional — current SOL/USD price
   */
  async swapInTreasury(params: {
    owner: PublicKey;
    poolId: string;
    direction: 'solToUsdc' | 'usdcToSol';
    amountIn: number;
    minimumAmountOut?: number;
    rebalanceId?: string | null;
    solPrice?: number;
  }): Promise<string> {
    const {
      owner,
      poolId,
      direction,
      amountIn,
      minimumAmountOut = 0,
      rebalanceId = null,
      solPrice = 0,
    } = params;

    const ownerStr = owner.toBase58();

    const { accounts, remainingAccounts } = await this.accountsBuilder.buildSwapAccounts({
      poolId:    new PublicKey(poolId),
      direction,
    });

    const anchorDirection = direction === 'solToUsdc'
      ? { solToUsdc: {} as Record<string, never> }
      : { usdcToSol: {} as Record<string, never> };

    const tx = await this.smartWallet.swapInTreasury(
      owner,
      amountIn,
      minimumAmountOut,
      anchorDirection,
      accounts,
      remainingAccounts,
    );

    this.logger.log(
      `[${ownerStr.slice(0, 8)}] ✅ swap ${direction} ${amountIn}: ${tx.slice(0, 8)}...`,
    );

    const isSolToUsdc = direction === 'solToUsdc';
    const solRaw      = isSolToUsdc ? amountIn : 0;
    const usdcRaw     = isSolToUsdc ? 0        : amountIn;
    const solAmountUsd  = (solRaw  / 10 ** SOL_DECIMALS)  * solPrice;
    const usdcAmountUsd =  usdcRaw / 10 ** USDC_DECIMALS;

    await this.saveTx({
      ownerPubkey:    ownerStr,
      type:           LiquidityTransactionType.SWAP,
      txHash:         tx,
      poolId,
      solAmountRaw:   solRaw  || null,
      usdcAmountRaw:  usdcRaw || null,
      solAmount:      solRaw  / 10 ** SOL_DECIMALS,
      usdcAmount:     usdcRaw / 10 ** USDC_DECIMALS,
      solAmountUsd,
      usdcAmountUsd,
      solPrice,
      swapDirection:  isSolToUsdc ? 'sol_to_usdc' : 'usdc_to_sol',
      rebalanceId,
    });

    return tx;
  }

  // ─── On-chain wallet state ───────────────────────────────────────────────────

  /**
   * Fetch the on-chain SmartWallet state for a user.
   * Returns null if the wallet does not exist yet.
   */
  async getOnChainWalletState(owner: PublicKey): Promise<{
    hasActivePosition: boolean;
    positionMint: PublicKey | null;
    positionTickLower: number;
    positionTickUpper: number;
    positionLiquidity: BN;
    isPaused: boolean;
  } | null> {
    const state = await this.smartWallet.getWalletState(owner);
    if (!state) return null;

    return {
      hasActivePosition:  (state as any).hasActivePosition ?? false,
      positionMint:       (state as any).positionMint ?? null,
      positionTickLower:  (state as any).positionTickLower ?? 0,
      positionTickUpper:  (state as any).positionTickUpper ?? 0,
      positionLiquidity:  new BN((state as any).positionLiquidity?.toString() ?? '0'),
      isPaused:           (state as any).isPaused ?? false,
    };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  /** Save a PRO transaction to the unified liquidity_transactions table. */
  private async saveTx(
    dto: Omit<SaveLiquidityTxDto, 'role'>,
  ): Promise<void> {
    try {
      await this.liquidityTx.save({ ...dto, role: LiquidityRole.PRO });
    } catch (err) {
      // Non-fatal — log and continue (on-chain op already succeeded)
      this.logger.error(`Failed to save TX record: ${err?.message ?? err}`);
    }
  }
}
