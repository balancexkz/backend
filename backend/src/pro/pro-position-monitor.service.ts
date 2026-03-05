/**
 * ProPositionMonitorService
 *
 * Cron-based monitor for PRO-role users' CLMM positions.
 *
 * Every minute it:
 *   1. Queries all active ProPosition records (monitoringEnabled = true)
 *   2. Reads each user's on-chain SmartWallet state
 *   3. Fetches the current pool tick
 *   4. Marks the position as out-of-range if tickCurrent < tickLower or > tickUpper
 *   5. Triggers ProRebalancingService.rebalance() for each out-of-range position
 *
 * At most one rebalance per user runs at a time (tracked in `rebalancingInProgress`).
 *
 * IMPORTANT: This service is SEPARATE from the existing MonitorModule / PositionMonitorService.
 * It does NOT use Raydium SDK and does NOT touch vault-role positions.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PublicKey } from '@solana/web3.js';

import { ClmmAccountsBuilderService } from './clmm-accounts-builder.service';
import { ProLiquidityService } from './pro-liquidity.service';
import { ProRebalancingService, RebalanceResult } from './pro-rebalancing.service';
import { ProPosition } from './pro-position.entity';

export interface MonitorStats {
  lastCheck: Date | null;
  usersChecked: number;
  positionsOutOfRange: number;
  rebalancesTriggered: number;
  rebalancesSucceeded: number;
  rebalancesFailed: number;
  errors: number;
}

@Injectable()
export class ProPositionMonitorService {
  private readonly logger = new Logger(ProPositionMonitorService.name);

  /** Owners currently being rebalanced — prevents concurrent rebalances per user */
  private readonly rebalancingInProgress = new Set<string>();

  private stats: MonitorStats = {
    lastCheck:           null,
    usersChecked:        0,
    positionsOutOfRange: 0,
    rebalancesTriggered: 0,
    rebalancesSucceeded: 0,
    rebalancesFailed:    0,
    errors:              0,
  };

  constructor(
    private readonly accountsBuilder: ClmmAccountsBuilderService,
    private readonly proLiquidity: ProLiquidityService,
    private readonly rebalancing: ProRebalancingService,
    @InjectRepository(ProPosition)
    private readonly proPositionRepo: Repository<ProPosition>,
  ) {}

  // ─── Cron job ────────────────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_MINUTE)
  async checkAllProPositions(): Promise<void> {
    this.stats.lastCheck = new Date();

    this.logger.log('═'.repeat(60));
    this.logger.log(`🔍 PRO MONITOR — ${this.stats.lastCheck.toISOString()}`);
    this.logger.log('═'.repeat(60));

    const records = await this.proPositionRepo.find({
      where: { monitoringEnabled: true },
    });

    if (records.length === 0) {
      this.logger.log('No active pro positions to monitor');
      return;
    }

    this.logger.log(`Found ${records.length} monitored pro positions`);
    this.stats.usersChecked += records.length;

    // Check each user concurrently (independent chains, no shared state)
    await Promise.allSettled(records.map(r => this.checkOne(r)));

    this.logStats();
  }

  // ─── Per-user check ──────────────────────────────────────────────────────────

  private async checkOne(record: ProPosition): Promise<void> {
    const tag = record.ownerPubkey.slice(0, 8);

    try {
      const owner = new PublicKey(record.ownerPubkey);

      // 1. Read on-chain SmartWallet state
      const walletState = await this.proLiquidity.getOnChainWalletState(owner);

      if (!walletState) {
        this.logger.warn(`[${tag}] SmartWallet not found on-chain`);
        return;
      }

      if (walletState.isPaused) {
        this.logger.log(`[${tag}] ⏸️  Wallet is paused — skipping`);
        return;
      }

      if (!walletState.hasActivePosition) {
        // Sync DB if it still has a stale position record
        if (record.positionNftMint) {
          await this.proPositionRepo.update(
            { ownerPubkey: record.ownerPubkey },
            { positionNftMint: null, tickLower: null, tickUpper: null },
          );
        }

        // Auto-open initial position if none exists
        if (!this.rebalancingInProgress.has(record.ownerPubkey)) {
          this.logger.log(`[${tag}] ℹ️  No active position — opening initial position`);
          this.rebalancingInProgress.add(record.ownerPubkey);
          this.stats.rebalancesTriggered++;
          this.proLiquidity.openPosition({
            owner:             new PublicKey(record.ownerPubkey),
            poolId:            record.poolId,
            priceRangePercent: Number(record.priceRangePercent),
            solPrice:          0,
          }).then(() => {
            this.stats.rebalancesSucceeded++;
            this.logger.log(`[${tag}] ✅ Initial position opened`);
          }).catch(err => {
            this.stats.rebalancesFailed++;
            this.logger.error(`[${tag}] ❌ Failed to open initial position: ${err.message}`);
            this.proPositionRepo.update(
              { ownerPubkey: record.ownerPubkey },
              { lastError: err.message },
            );
          }).finally(() => {
            this.rebalancingInProgress.delete(record.ownerPubkey);
          });
        }
        return;
      }

      // 2. Sync tick range from chain if DB is stale
      const tickLower = walletState.positionTickLower;
      const tickUpper = walletState.positionTickUpper;
      const nftMint   = walletState.positionMint?.toBase58() ?? record.positionNftMint;

      if (!nftMint) {
        this.logger.warn(`[${tag}] Has active position but no mint address`);
        return;
      }

      if (
        record.positionNftMint !== nftMint ||
        record.tickLower !== tickLower ||
        record.tickUpper !== tickUpper
      ) {
        this.logger.debug(`[${tag}] Syncing position state from chain`);
        await this.proPositionRepo.update(
          { ownerPubkey: record.ownerPubkey },
          { positionNftMint: nftMint, tickLower, tickUpper },
        );
        record.positionNftMint = nftMint;
        record.tickLower       = tickLower;
        record.tickUpper       = tickUpper;
      }

      // 3. Read current pool tick
      const pool = await this.accountsBuilder.readPoolState(new PublicKey(record.poolId));
      const { tickCurrent } = pool;

      // 4. Check range
      const inRange = tickCurrent >= tickLower && tickCurrent <= tickUpper;

      if (inRange) {
        this.logger.log(
          `[${tag}] ✅ IN RANGE | tick ${tickCurrent} ∈ [${tickLower}, ${tickUpper}]`,
        );
        return;
      }

      // 5. Out of range — trigger rebalance (if not already in progress)
      const side = tickCurrent < tickLower ? 'BELOW LOWER' : 'ABOVE UPPER';
      this.logger.warn(
        `[${tag}] ⚠️  OUT OF RANGE (${side}) | tick ${tickCurrent} ∉ [${tickLower}, ${tickUpper}]`,
      );
      this.stats.positionsOutOfRange++;

      if (this.rebalancingInProgress.has(record.ownerPubkey)) {
        this.logger.warn(`[${tag}] Rebalance already in progress — skipping`);
        return;
      }

      // Fire-and-forget (don't await so the cron finishes quickly)
      this.triggerRebalance(record.ownerPubkey);

    } catch (err) {
      this.logger.error(`[${tag}] Error during check: ${err?.message ?? err}`);
      this.stats.errors++;
    }
  }

  // ─── Rebalancing trigger ─────────────────────────────────────────────────────

  private triggerRebalance(ownerPubkey: string): void {
    this.rebalancingInProgress.add(ownerPubkey);
    this.stats.rebalancesTriggered++;

    this.rebalancing
      .rebalance(ownerPubkey)
      .then((result: RebalanceResult) => {
        if (result.success) {
          this.logger.log(
            `[${ownerPubkey.slice(0, 8)}] ✅ Rebalance complete | new pos: ${
              result.newPositionNftMint?.slice(0, 8)
            }...`,
          );
          this.stats.rebalancesSucceeded++;
        } else {
          this.logger.error(
            `[${ownerPubkey.slice(0, 8)}] ❌ Rebalance failed: ${result.error}`,
          );
          this.stats.rebalancesFailed++;
        }
      })
      .catch((err) => {
        this.logger.error(
          `[${ownerPubkey.slice(0, 8)}] ❌ Rebalance threw: ${err?.message ?? err}`,
        );
        this.stats.rebalancesFailed++;
      })
      .finally(() => {
        this.rebalancingInProgress.delete(ownerPubkey);
      });
  }

  // ─── Admin API ───────────────────────────────────────────────────────────────

  /** Get monitoring stats (for the admin dashboard). */
  getStats(): MonitorStats & { inProgress: number } {
    return { ...this.stats, inProgress: this.rebalancingInProgress.size };
  }

  /** Manually trigger a rebalance for a specific user. */
  async manualRebalance(ownerPubkey: string): Promise<RebalanceResult> {
    if (this.rebalancingInProgress.has(ownerPubkey)) {
      return { success: false, ownerPubkey, error: 'Rebalance already in progress' };
    }
    return this.rebalancing.rebalance(ownerPubkey);
  }

  /** Get all PRO positions from DB. */
  async getAllPositions(): Promise<ProPosition[]> {
    return this.proPositionRepo.find({ order: { updatedAt: 'DESC' } });
  }

  /** Enable / disable monitoring for a user without deleting the record. */
  async setMonitoring(ownerPubkey: string, enabled: boolean): Promise<void> {
    await this.proPositionRepo.update({ ownerPubkey }, { monitoringEnabled: enabled });
    this.logger.log(`[${ownerPubkey.slice(0, 8)}] Monitoring ${enabled ? 'enabled' : 'disabled'}`);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private logStats(): void {
    this.logger.log('-'.repeat(60));
    this.logger.log(
      `📊 Checked ${this.stats.usersChecked} | ` +
      `Out-of-range ${this.stats.positionsOutOfRange} | ` +
      `Triggered ${this.stats.rebalancesTriggered} | ` +
      `OK ${this.stats.rebalancesSucceeded} | ` +
      `Failed ${this.stats.rebalancesFailed} | ` +
      `Errors ${this.stats.errors}`,
    );
    this.logger.log('═'.repeat(60));
  }
}
