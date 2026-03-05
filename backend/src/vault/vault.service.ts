import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PublicKey } from '@solana/web3.js';
import axios from 'axios';
import { VaultProgramService } from '../solana/vault-program.service';
import { LiquidityTransactionService } from '../liquidity/liquidity-transaction.service';
import {
  LiquidityRole,
  LiquidityTransactionType,
} from '../liquidity/liquidity-transaction.entity';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert Raydium CLMM tick to USD price.
 *
 * Raydium CLMM: price = token1 / token0
 * For SOL/USDC pool:  token0 = wSOL (9 dec), token1 = USDC (6 dec)
 *   priceUsd = 1.0001^tick * 10^(decimals0 - decimals1)
 *            = 1.0001^tick * 10^(9 - 6)
 *            = 1.0001^tick * 1000
 */
function tickToPrice(tick: number, decimals0 = 9, decimals1 = 6): number {
  return Math.pow(1.0001, tick) * Math.pow(10, decimals0 - decimals1);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VaultInfo {
  tvlUsd: number;
  solPrice: number;
  totalShares: number;
  pricePerShareUsd: number;
  isPaused: boolean;
  hasPosition: boolean;
  lastTvlUpdate: Date;
  treasury: { sol: number; usdc: number; valueUsd: number };
}

export interface VaultPosition {
  hasPosition: boolean;
  poolId: string | null;
  positionMint: string | null;
  status: 'IN_RANGE' | 'OUT_OF_RANGE' | 'NO_POSITION';
  priceRange: { lower: number; upper: number; current: number } | null;
  ticks: { lower: number; upper: number } | null;
  liquidity: string | null;
  amounts: { sol: number; usdc: number; valueUsd: number } | null;
  treasury: { sol: number; usdc: number; valueUsd: number };
  tvlUsd: number;
  solPrice: number;
  totalShares: number;
  pricePerShareUsd: number;
  lastTvlUpdate: Date;
}

export interface UserPosition {
  userPubkey: string;
  shares: number;
  totalShares: number;
  sharePercent: number;
  /** Full user value = treasury (available) + position (locked) */
  totalValueUsd: number;
  /** What user receives when clicking Withdraw RIGHT NOW */
  availableNow: number;
  /** Funds locked in active CLMM position (available after admin closes position) */
  lockedInPosition: number;
  /** User's slice of the active CLMM position (null if no position) */
  position: {
    mySol: number;
    myUsdc: number;
    myValueUsd: number;
  } | null;
  /** User's slice of the idle treasury (withdrawable now) */
  treasury: {
    mySol: number;
    myUsdc: number;
    myValueUsd: number;
  };
  totalDepositedSol: number;
  totalDepositedUsdc: number;
  totalWithdrawnUsd: number;
  /** Exact amounts returned on withdraw() call */
  withdrawal: {
    estimatedSolReturn: number;
    estimatedUsdcReturn: number;
    estimatedTotalUsd: number;
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class VaultService {
  private readonly logger = new Logger(VaultService.name);

  constructor(
    private readonly vaultProgram: VaultProgramService,
    private readonly liquidityTx: LiquidityTransactionService,
  ) {}

  // ─── update_tvl cron (every 5 min) ───────────────────────────────────────

  /**
   * Keeps vault's on-chain TVL fresh.
   * Without this the contract rejects deposits/withdrawals with StaleTvl
   * if last_tvl_update is older than 10 minutes.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async updateTvlCron(): Promise<void> {
    try {
      const v = await this.vaultProgram.getVaultState() as any;

      // Fetch fresh SOL price from CoinGecko
      const priceRes = await axios.get(
        'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
        { timeout: 5000 },
      );
      const solPrice: number = priceRes.data?.solana?.usd;
      if (!solPrice) throw new Error('CoinGecko returned no price');

      // Recalculate TVL with fresh price (all amounts stored as integer * 1e6 or lamports)
      const treasurySol  = v.treasurySol.toNumber()  / 1e9;
      const treasuryUsdc = v.treasuryUsdc.toNumber() / 1e6;
      const positionSol  = v.hasActivePosition ? v.positionSol.toNumber()  / 1e9 : 0;
      const positionUsdc = v.hasActivePosition ? v.positionUsdc.toNumber() / 1e6 : 0;

      const tvlUsd = (treasurySol + positionSol) * solPrice + (treasuryUsdc + positionUsdc);

      // Contract rejects changes > 20% per update — converge gradually if needed
      const currentTvl = v.tvlUsd.toNumber() / 1e6;
      let targetTvl = tvlUsd;
      if (currentTvl > 0) {
        const maxChange = currentTvl * 0.19; // stay under 20% limit
        if (Math.abs(tvlUsd - currentTvl) > maxChange) {
          targetTvl = tvlUsd > currentTvl
            ? currentTvl + maxChange
            : currentTvl - maxChange;
          this.logger.warn(`TVL capped: ${currentTvl.toFixed(2)} → ${targetTvl.toFixed(2)} (target: ${tvlUsd.toFixed(2)})`);
        }
      }

      // Contract expects values scaled by 1e6
      await this.vaultProgram.updateTvl(
        Math.round(targetTvl * 1e6),
        Math.round(solPrice  * 1e6),
      );

      this.logger.log(`update_tvl: SOL=$${solPrice} TVL=$${tvlUsd.toFixed(2)}`);
    } catch (err) {
      this.logger.error(`update_tvl cron failed: ${err.message}`);
    }
  }

  // ─── Vault info ───────────────────────────────────────────────────────────

  async getVaultInfo(): Promise<VaultInfo> {
    const v = await this.vaultProgram.getVaultState() as any;

    const solPrice    = v.solPriceUsd.toNumber() / 1e6;
    const tvlUsd      = v.tvlUsd.toNumber() / 1e6;
    const totalShares = v.totalShares.toNumber();
    const treasurySol  = v.treasurySol.toNumber() / 1e9;
    const treasuryUsdc = v.treasuryUsdc.toNumber() / 1e6;

    return {
      tvlUsd,
      solPrice,
      totalShares,
      pricePerShareUsd: totalShares > 0 ? tvlUsd / totalShares : 1,
      isPaused:    v.isPaused,
      hasPosition: v.hasActivePosition,
      lastTvlUpdate: new Date(v.lastTvlUpdate.toNumber() * 1000),
      treasury: {
        sol:      treasurySol,
        usdc:     treasuryUsdc,
        valueUsd: treasurySol * solPrice + treasuryUsdc,
      },
    };
  }

  // ─── Current CLMM position ────────────────────────────────────────────────

  /**
   * Returns full information about the vault's active CLMM position.
   * All data is read from the on-chain Vault account — no extra RPC calls needed.
   *
   * In-range check: lower_price ≤ current_sol_price ≤ upper_price
   */
  async getVaultPosition(): Promise<VaultPosition> {
    const v = await this.vaultProgram.getVaultState() as any;

    const solPrice     = v.solPriceUsd.toNumber() / 1e6;
    const tvlUsd       = v.tvlUsd.toNumber() / 1e6;
    const totalShares  = v.totalShares.toNumber();
    const treasurySol  = v.treasurySol.toNumber() / 1e9;
    const treasuryUsdc = v.treasuryUsdc.toNumber() / 1e6;
    const lastTvlUpdate = new Date(v.lastTvlUpdate.toNumber() * 1000);
    const pricePerShareUsd = totalShares > 0 ? tvlUsd / totalShares : 1;

    const treasury = {
      sol:      treasurySol,
      usdc:     treasuryUsdc,
      valueUsd: treasurySol * solPrice + treasuryUsdc,
    };

    if (!v.hasActivePosition) {
      return {
        hasPosition:   false,
        poolId:        null,
        positionMint:  null,
        status:        'NO_POSITION',
        priceRange:    null,
        ticks:         null,
        liquidity:     null,
        amounts:       null,
        treasury,
        tvlUsd,
        solPrice,
        totalShares,
        pricePerShareUsd,
        lastTvlUpdate,
      };
    }

    const tickLower = v.positionTickLower as number;
    const tickUpper = v.positionTickUpper as number;

    const priceLower = tickToPrice(tickLower);
    const priceUpper = tickToPrice(tickUpper);
    const isInRange  = solPrice >= priceLower && solPrice <= priceUpper;

    const positionSol  = v.positionSol.toNumber() / 1e9;
    const positionUsdc = v.positionUsdc.toNumber() / 1e6;

    return {
      hasPosition:  true,
      poolId:       v.positionPoolId.toBase58(),
      positionMint: v.positionMint.toBase58(),
      status:       isInRange ? 'IN_RANGE' : 'OUT_OF_RANGE',
      priceRange: {
        lower:   priceLower,
        upper:   priceUpper,
        current: solPrice,
      },
      ticks: {
        lower: tickLower,
        upper: tickUpper,
      },
      liquidity: v.positionLiquidity.toString(),
      amounts: {
        sol:      positionSol,
        usdc:     positionUsdc,
        valueUsd: positionSol * solPrice + positionUsdc,
      },
      treasury,
      tvlUsd,
      solPrice,
      totalShares,
      pricePerShareUsd,
      lastTvlUpdate,
    };
  }

  // ─── User position ────────────────────────────────────────────────────────

  /**
   * Returns the user's share of the vault position.
   * userFraction = user.shares / vault.total_shares
   *
   * user.position_sol  = vault.position_sol  * userFraction
   * user.position_usdc = vault.position_usdc * userFraction
   * user.treasury_sol  = vault.treasury_sol  * userFraction
   * user.treasury_usdc = vault.treasury_usdc * userFraction
   *
   * Withdrawal returns only the proportional treasury funds
   * (position funds are locked until admin closes the position).
   */
  /**
   * Returns the user's share of the vault.
   *
   * Treasury (withdrawable now):
   *   Uses ACTUAL on-chain token account balances — same math as the contract.
   *   treasury_sol includes: idle deposits + collected fees not yet deployed.
   *
   * Position (locked):
   *   User's proportional share of funds locked in the CLMM position.
   *   Becomes available after admin calls close_position.
   *
   * totalValueUsd = treasury share + position share  (= user's true value)
   */
  async getUserPosition(userPubkey: string): Promise<UserPosition> {
    const owner = new PublicKey(userPubkey);

    // Fetch vault state, user deposit record, and actual treasury balances in parallel
    const [v, userDeposit, withdrawal] = await Promise.all([
      this.vaultProgram.getVaultState() as Promise<any>,
      this.vaultProgram.getUserDepositState(owner),
      this.vaultProgram.estimateWithdrawal(owner), // reads actual token account balances
    ]);

    const solPrice    = v.solPriceUsd.toNumber() / 1e6;
    const totalShares = v.totalShares.toNumber();
    const userShares  = userDeposit ? (userDeposit as any).shares.toNumber() : 0;
    const fraction    = totalShares > 0 && userShares > 0
      ? userShares / totalShares
      : 0;

    // User's slice of CLMM position (locked)
    let positionData: UserPosition['position'] = null;
    let myPositionValueUsd = 0;

    if (v.hasActivePosition) {
      const mySol  = (v.positionSol.toNumber()  / 1e9) * fraction;
      const myUsdc = (v.positionUsdc.toNumber() / 1e6) * fraction;
      myPositionValueUsd = mySol * solPrice + myUsdc;
      positionData = {
        mySol,
        myUsdc,
        myValueUsd: myPositionValueUsd,
      };
    }

    // withdrawal.estimatedSolReturn / estimatedUsdcReturn = actual treasury share
    const myTreasuryValueUsd = withdrawal.estimatedTotalUsd;

    return {
      userPubkey,
      shares:           userShares,
      totalShares,
      sharePercent:     fraction * 100,
      totalValueUsd:    myTreasuryValueUsd + myPositionValueUsd,
      availableNow:     myTreasuryValueUsd,    // what withdraw() returns right now
      lockedInPosition: myPositionValueUsd,    // unlocked only after admin closes position
      position:         positionData,
      treasury: {
        mySol:      withdrawal.estimatedSolReturn,
        myUsdc:     withdrawal.estimatedUsdcReturn,
        myValueUsd: myTreasuryValueUsd,
      },
      totalDepositedSol:  userDeposit ? (userDeposit as any).totalDepositedSol.toNumber()  / 1e9 : 0,
      totalDepositedUsdc: userDeposit ? (userDeposit as any).totalDepositedUsdc.toNumber() / 1e6 : 0,
      totalWithdrawnUsd:  userDeposit ? (userDeposit as any).totalWithdrawnUsd.toNumber()  / 1e6 : 0,
      withdrawal: {
        estimatedSolReturn:  withdrawal.estimatedSolReturn,
        estimatedUsdcReturn: withdrawal.estimatedUsdcReturn,
        estimatedTotalUsd:   withdrawal.estimatedTotalUsd,
      },
    };
  }

  // ─── Build transactions ───────────────────────────────────────────────────

  async buildDeposit(userPubkey: string, amountLamports: number) {
    const v = await this.vaultProgram.getVaultState() as any;
    if (v.isPaused) {
      throw new HttpException('Vault is currently paused', HttpStatus.SERVICE_UNAVAILABLE);
    }

    const owner = new PublicKey(userPubkey);
    const [tx, estimate] = await Promise.all([
      this.vaultProgram.buildDepositSolTx(owner, amountLamports, true),
      this.vaultProgram.estimateSharesForSol(amountLamports),
    ]);

    return {
      transaction:           tx.serialize({ requireAllSignatures: false }).toString('base64'),
      sharesToMint:          estimate.sharesToMint,
      pricePerShareUsd:      estimate.pricePerShareUsd,
      depositValueUsd:       estimate.depositValueUsd,
      validUntilBlockHeight: tx.lastValidBlockHeight,
    };
  }

  async buildWithdraw(userPubkey: string) {
    const v = await this.vaultProgram.getVaultState() as any;
    if (v.isPaused) {
      throw new HttpException('Vault is currently paused', HttpStatus.SERVICE_UNAVAILABLE);
    }

    const owner = new PublicKey(userPubkey);
    const [tx, estimate] = await Promise.all([
      this.vaultProgram.buildWithdrawTx(owner),
      this.vaultProgram.estimateWithdrawal(owner),
    ]);

    if (estimate.shares === 0) {
      throw new HttpException('No shares to withdraw', HttpStatus.BAD_REQUEST);
    }

    return {
      transaction:           tx.serialize({ requireAllSignatures: false }).toString('base64'),
      shares:                estimate.shares,
      estimatedSolReturn:    estimate.estimatedSolReturn,
      estimatedUsdcReturn:   estimate.estimatedUsdcReturn,
      estimatedTotalUsd:     estimate.estimatedTotalUsd,
      validUntilBlockHeight: tx.lastValidBlockHeight,
    };
  }

  // ─── Confirm (save to DB after on-chain confirmation) ────────────────────

  async confirmDeposit(txHash: string, userPubkey: string, amountLamports: number) {
    const v        = await this.vaultProgram.getVaultState() as any;
    const solPrice = v.solPriceUsd.toNumber() / 1e6;
    const solAmount    = amountLamports / 1e9;
    const solAmountUsd = solAmount * solPrice;

    await this.liquidityTx.save({
      role:             LiquidityRole.VAULT,
      ownerPubkey:      userPubkey,
      type:             LiquidityTransactionType.OPEN_POSITION,
      txHash,
      poolId:           process.env.POOL_ID ?? '',
      solAmount,
      solAmountRaw:     amountLamports,
      solAmountUsd,
      usdcAmountUsd:    0,
      solPrice,
      walletBalanceUsd: solAmountUsd,
    });

    return { txHash, userPubkey, solAmount, solAmountUsd };
  }

  async confirmWithdraw(txHash: string, userPubkey: string) {
    const v    = await this.vaultProgram.getVaultState() as any;
    const solPrice = v.solPriceUsd.toNumber() / 1e6;

    await this.liquidityTx.save({
      role:        LiquidityRole.VAULT,
      ownerPubkey: userPubkey,
      type:        LiquidityTransactionType.CLOSE_POSITION,
      txHash,
      poolId:      process.env.POOL_ID ?? '',
      solPrice,
    });

    return { txHash, userPubkey };
  }

  // ─── History & analytics ─────────────────────────────────────────────────

  async getUserHistory(userPubkey: string, limit = 20) {
    return this.liquidityTx.getByOwner(userPubkey, limit);
  }

  // ─── increase_liquidity cron ─────────────────────────────────────────────────

  /**
   * Minimum idle SOL in treasury (lamports) before we attempt increase_liquidity.
   * Prevents spamming tiny increases with high TX fees.
   */
  private static readonly MIN_IDLE_SOL_LAMPORTS = 10_000_000; // 0.01 SOL

  /**
   * Every 10 minutes: if there are idle funds in treasury AND an active position,
   * deploy them into the CLMM position via increase_liquidity.
   *
   * Skips if:
   *  - no active position
   *  - treasury_sol < 0.01 SOL (not worth the TX fee)
   */
  @Cron('0 */10 * * * *')
  async increaseLiquidityCron(): Promise<void> {
    try {
      const v = await this.vaultProgram.getVaultState() as any;

      if (!v.hasActivePosition) {
        return; // no position to add to
      }

      const treasurySolLamports = v.treasurySol.toNumber();
      if (treasurySolLamports < VaultService.MIN_IDLE_SOL_LAMPORTS) {
        this.logger.debug(
          `increase_liquidity: treasury ${treasurySolLamports} lamports < threshold, skip`,
        );
        return;
      }

      this.logger.log(
        `increase_liquidity cron: deploying ${treasurySolLamports / 1e9} SOL + ` +
        `${v.treasuryUsdc.toNumber() / 1e6} USDC from treasury`,
      );

      await this.triggerIncreaseLiquidity();
    } catch (err) {
      this.logger.error(`increase_liquidity cron failed: ${err.message}`);
    }
  }

  /**
   * Manually trigger increase_liquidity — deploys all idle treasury funds
   * into the active CLMM position.
   *
   * Called by:
   *  - increaseLiquidityCron (automatic)
   *  - POST /monitoring/vault/increase-liquidity (admin panel)
   */
  async triggerIncreaseLiquidity(): Promise<string> {
    const v = await this.vaultProgram.getVaultState() as any;

    if (!v.hasActivePosition) {
      throw new HttpException('No active position', HttpStatus.BAD_REQUEST);
    }

    const amount0Max = v.treasurySol.toNumber();  // SOL lamports
    const amount1Max = v.treasuryUsdc.toNumber(); // USDC micro

    if (amount0Max === 0 && amount1Max === 0) {
      throw new HttpException('Treasury is empty', HttpStatus.BAD_REQUEST);
    }

    // liquidity = 0 → contract calculates from amounts (base_flag = Some(true))
    const tx = await this.vaultProgram.increaseLiquidity(0, amount0Max, amount1Max);

    // Log to DB
    const solPrice = v.solPriceUsd.toNumber() / 1e6;
    await this.liquidityTx.save({
      role:             LiquidityRole.VAULT,
      ownerPubkey:      'admin',
      type:             LiquidityTransactionType.OPEN_POSITION,
      txHash:           tx,
      poolId:           process.env.POOL_ID ?? '',
      solAmount:        amount0Max / 1e9,
      solAmountRaw:     amount0Max,
      solAmountUsd:     (amount0Max / 1e9) * solPrice,
      usdcAmountUsd:    amount1Max / 1e6,
      solPrice,
      walletBalanceUsd: 0,
    });

    this.logger.log(
      `increase_liquidity done: tx=${tx} sol=${amount0Max / 1e9} usdc=${amount1Max / 1e6}`,
    );
    return tx;
  }

  // ─── Admin actions ────────────────────────────────────────────────────────────

  async pauseVault(paused: boolean): Promise<string> {
    return this.vaultProgram.setPaused(paused);
  }

  async triggerUpdateTvl(): Promise<void> {
    await this.updateTvlCron();
  }

  async getAllHistory(limit = 50) {
    return this.liquidityTx.getVaultHistory(limit);
  }

  async getProfitSummary() {
    return this.liquidityTx.getVaultProfitSummary();
  }

  async getDepositors(limit = 200) {
    const txs = await this.liquidityTx.getVaultHistory(limit);
    const map = new Map<string, {
      ownerPubkey: string;
      deposits: number;
      totalSolUsd: number;
      lastActivity: Date;
    }>();

    for (const tx of txs) {
      const key      = tx.ownerPubkey ?? 'unknown';
      const existing = map.get(key);
      if (existing) {
        existing.deposits++;
        existing.totalSolUsd += Number(tx.solAmountUsd ?? 0);
        if (tx.createdAt > existing.lastActivity) existing.lastActivity = tx.createdAt;
      } else {
        map.set(key, {
          ownerPubkey:  key,
          deposits:     1,
          totalSolUsd:  Number(tx.solAmountUsd ?? 0),
          lastActivity: tx.createdAt,
        });
      }
    }

    return Array.from(map.values())
      .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
  }
}
