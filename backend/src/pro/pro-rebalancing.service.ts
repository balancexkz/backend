/**
 * ProRebalancingService
 *
 * Automated rebalancing for PRO-role users whose CLMM position is out of range.
 *
 * Flow:
 *   1. closePosition     — remove all liquidity, funds return to treasury
 *   2. swapInTreasury    — rebalance SOL / USDC to ~50/50 for the new position
 *   3. openPosition      — open a fresh position centred on the current price
 *
 * A shared rebalanceId (UUID) is generated at the start and stamped on every
 * transaction saved to `liquidity_transactions` so the three steps can be
 * queried as a single cycle.
 *
 * All operations go through SmartWalletProgramService (CPI to Raydium CLMM).
 * No Raydium SDK dependency.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PublicKey } from '@solana/web3.js';
import { randomUUID } from 'crypto';

import { SolanaService } from '../solana/solana.service';
import { ClmmAccountsBuilderService, PoolStateData } from './clmm-accounts-builder.service';
import { ProLiquidityService } from './pro-liquidity.service';
import { ProPosition } from './pro-position.entity';

export interface RebalanceResult {
  success: boolean;
  ownerPubkey: string;
  rebalanceId?: string;
  closeTx?: string;
  swapTx?: string;
  openTx?: string;
  newPositionNftMint?: string;
  error?: string;
}

/** Minimum swap amount (in raw units) to bother swapping */
const MIN_SWAP_AMOUNT = 1_000;

/** Fraction of the excess treasury balance to swap (avoids over-shooting 50/50) */
const SWAP_FRACTION = 0.45;

/** Delay between steps to let the chain confirm (ms) */
const STEP_DELAY_MS = 3_000;

@Injectable()
export class ProRebalancingService {
  private readonly logger = new Logger(ProRebalancingService.name);

  constructor(
    private readonly solana: SolanaService,
    private readonly accountsBuilder: ClmmAccountsBuilderService,
    private readonly proLiquidity: ProLiquidityService,
    @InjectRepository(ProPosition)
    private readonly proPositionRepo: Repository<ProPosition>,
  ) {}

  // ─── Public entry point ──────────────────────────────────────────────────────

  /**
   * Rebalance a single user's position.
   *
   * @param ownerPubkey  user's Solana wallet address (owner of the SmartWallet)
   * @param solPrice     optional current SOL/USD price (for transaction logging)
   */
  async rebalance(ownerPubkey: string, solPrice = 0): Promise<RebalanceResult> {
    const owner  = new PublicKey(ownerPubkey);
    const record = await this.proPositionRepo.findOne({ where: { ownerPubkey } });

    if (!record) {
      return { success: false, ownerPubkey, error: 'User not registered as pro' };
    }
    if (!record.positionNftMint || record.tickLower === null || record.tickUpper === null) {
      return { success: false, ownerPubkey, error: 'No active position found in DB' };
    }

    // One UUID ties the three on-chain steps together in the transaction log
    const rebalanceId = randomUUID();

    this.logger.log(`🔄 [${ownerPubkey.slice(0, 8)}] Starting rebalance | id=${rebalanceId}`);

    try {
      // ── Step 1: Close ─────────────────────────────────────────────────────
      this.logger.log(`   📍 [1/3] Closing position ${record.positionNftMint.slice(0, 8)}...`);

      const closeResult = await this.proLiquidity.closePosition({
        owner,
        positionNftMint: record.positionNftMint,
        poolId:          record.poolId,
        tickLower:       record.tickLower,
        tickUpper:       record.tickUpper,
        amount0Min:      0,
        amount1Min:      0,
        rebalanceId,
        solPrice,
      });

      this.logger.log(`   ✅ Closed: ${closeResult.tx.slice(0, 8)}...`);
      await this.sleep(STEP_DELAY_MS);

      // ── Step 2: Swap to re-balance treasuries ─────────────────────────────
      this.logger.log(`   📍 [2/3] Rebalancing treasuries`);

      const swapTx = await this.rebalanceTreasuries(owner, record.poolId, rebalanceId, solPrice);
      if (swapTx) {
        this.logger.log(`   ✅ Swap: ${swapTx.slice(0, 8)}...`);
        await this.sleep(STEP_DELAY_MS);
      } else {
        this.logger.log(`   ⏩ Swap skipped (already balanced or amount too small)`);
      }

      // ── Step 3: Open new position ─────────────────────────────────────────
      this.logger.log(`   📍 [3/3] Opening new position`);

      const openResult = await this.proLiquidity.openPosition({
        owner,
        poolId:            record.poolId,
        priceRangePercent: Number(record.priceRangePercent),
        rebalanceId,
        solPrice,
      });

      this.logger.log(`   ✅ Opened: ${openResult.positionNftMint.slice(0, 8)}...`);

      // ── Update DB rebalance counter ───────────────────────────────────────
      await this.proPositionRepo.increment({ ownerPubkey }, 'rebalanceCount', 1);

      return {
        success: true,
        ownerPubkey,
        rebalanceId,
        closeTx:            closeResult.tx,
        swapTx:             swapTx ?? undefined,
        openTx:             openResult.tx,
        newPositionNftMint: openResult.positionNftMint,
      };

    } catch (error) {
      const message = error?.message ?? String(error);
      this.logger.error(`   ❌ Rebalance failed for ${ownerPubkey.slice(0, 8)}: ${message}`);

      // Persist error for visibility in the dashboard
      await this.proPositionRepo.update({ ownerPubkey }, { lastError: message });

      return { success: false, ownerPubkey, rebalanceId, error: message };
    }
  }

  // ─── Treasury rebalancing ────────────────────────────────────────────────────

  /**
   * Determine swap direction and amount, then execute swap_in_treasury.
   *
   * Strategy: after closing the position, all funds are in one token:
   *  - Out-of-range LOW  (price fell) → position was all token0 (SOL) → swap SOL → USDC
   *  - Out-of-range HIGH (price rose) → position was all token1 (USDC) → swap USDC → SOL
   *
   * We swap SWAP_FRACTION of the excess token to reach ≈50/50 by value.
   *
   * Returns the swap transaction ID, or null if no swap was needed.
   */
  private async rebalanceTreasuries(
    owner: PublicKey,
    poolId: string,
    rebalanceId: string,
    solPrice: number,
  ): Promise<string | null> {
    const pool = await this.accountsBuilder.readPoolState(new PublicKey(poolId));

    const solBalance  = await this.proLiquidity.getSolTreasuryBalance(owner);
    const usdcBalance = await this.proLiquidity.getUsdcTreasuryBalance(owner);

    this.logger.debug(
      `   Treasury: SOL=${solBalance} (raw) | USDC=${usdcBalance} (raw)`,
    );

    if (solBalance <= MIN_SWAP_AMOUNT && usdcBalance <= MIN_SWAP_AMOUNT) {
      this.logger.warn('   Both treasuries near-empty, skipping swap');
      return null;
    }

    // Determine which token is dominant after position close
    const direction = this.determineSwapDirection(pool, solBalance, usdcBalance);
    if (!direction) {
      this.logger.log('   Treasuries already balanced, no swap needed');
      return null;
    }

    // Calculate amount to swap (fraction of the dominant token)
    const amountIn = direction === 'solToUsdc'
      ? Math.floor(solBalance  * SWAP_FRACTION)
      : Math.floor(usdcBalance * SWAP_FRACTION);

    if (amountIn < MIN_SWAP_AMOUNT) {
      this.logger.log(`   Swap amount ${amountIn} below minimum, skipping`);
      return null;
    }

    this.logger.log(
      `   Swapping ${amountIn} (raw) ${direction === 'solToUsdc' ? 'SOL→USDC' : 'USDC→SOL'}`,
    );

    return this.proLiquidity.swapInTreasury({
      owner,
      poolId,
      direction,
      amountIn,
      minimumAmountOut: 0, // no slippage floor during rebalancing
      rebalanceId,
      solPrice,
    });
  }

  /**
   * Determine which swap direction brings the treasuries closer to 50/50.
   *
   * We convert both balances to a common unit using pool decimals:
   *   - token0 (SOL): 9 decimals
   *   - token1 (USDC): pool.mintDecimals1
   *
   * "Dominant" means >60% of total value ≈ more than the other side.
   * We compare raw units normalised by decimals (price-agnostic approximation).
   *
   * Returns null if already balanced (within ±10% of 50%).
   */
  private determineSwapDirection(
    pool: PoolStateData,
    solRaw: number,
    usdcRaw: number,
  ): 'solToUsdc' | 'usdcToSol' | null {
    if (solRaw <= 0 && usdcRaw <= 0) return null;

    // Normalise to "units" (divide by 10^decimals)
    const solUnits  = solRaw  / 10 ** pool.mintDecimals0;
    const usdcUnits = usdcRaw / 10 ** pool.mintDecimals1;

    const total = solUnits + usdcUnits;
    if (total === 0) return null;

    const solPct = (solUnits / total) * 100;

    this.logger.debug(`   Balance: SOL=${solPct.toFixed(1)}% / USDC=${(100 - solPct).toFixed(1)}%`);

    if (solPct > 60)  return 'solToUsdc'; // too much SOL
    if (solPct < 40)  return 'usdcToSol'; // too much USDC
    return null;                           // within ±10% of 50/50 — acceptable
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
