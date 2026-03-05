/**
 * LiquidityTransactionService
 *
 * Unified write / query layer for the `liquidity_transactions` table.
 *
 * Used by:
 *   - ProLiquidityService   (role = 'pro')  — after every on-chain CPI call
 *   - ProRebalancingService                 — passes a shared rebalanceId across steps
 *   - VaultTransactionService (future)      — when vault adopts the unified table
 *
 * The old `transactions` table (vault, managed by TransactionService) is left
 * untouched for backward compatibility.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import {
  LiquidityTransaction,
  LiquidityRole,
  LiquidityTransactionType,
} from './liquidity-transaction.entity';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface SaveLiquidityTxDto {
  role: LiquidityRole;
  userId?: number | null;
  ownerPubkey?: string | null;
  type: LiquidityTransactionType;
  txHash: string;
  poolId: string;
  positionNftMint?: string | null;
  /** Human-readable amounts */
  solAmount?: number;
  usdcAmount?: number;
  /** Raw on-chain units (PRO only) */
  solAmountRaw?: number | null;
  usdcAmountRaw?: number | null;
  /** USD valuations */
  solAmountUsd?: number;
  usdcAmountUsd?: number;
  /** SOL spot price at time of tx */
  solPrice?: number;
  /** Vault: total wallet USD balance; PRO: leave null */
  walletBalanceUsd?: number | null;
  /** Realized P&L — null for open / collect_fees */
  profitUsd?: number | null;
  /** PRO rebalance cycle grouping */
  rebalanceId?: string | null;
  /** PRO swap direction */
  swapDirection?: 'sol_to_usdc' | 'usdc_to_sol' | null;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class LiquidityTransactionService {
  private readonly logger = new Logger(LiquidityTransactionService.name);

  constructor(
    @InjectRepository(LiquidityTransaction)
    private readonly repo: Repository<LiquidityTransaction>,
  ) {}

  // ─── Write ──────────────────────────────────────────────────────────────────

  async save(dto: SaveLiquidityTxDto): Promise<LiquidityTransaction> {
    const solAmountUsd  = dto.solAmountUsd  ?? 0;
    const usdcAmountUsd = dto.usdcAmountUsd ?? 0;

    const record = this.repo.create({
      role:            dto.role,
      userId:          dto.userId          ?? null,
      ownerPubkey:     dto.ownerPubkey     ?? null,
      type:            dto.type,
      txHash:          dto.txHash,
      poolId:          dto.poolId,
      positionNftMint: dto.positionNftMint ?? null,
      solAmount:       dto.solAmount       ?? 0,
      usdcAmount:      dto.usdcAmount      ?? 0,
      solAmountRaw:    dto.solAmountRaw    ?? null,
      usdcAmountRaw:   dto.usdcAmountRaw   ?? null,
      solAmountUsd,
      usdcAmountUsd,
      totalValueUsd:   solAmountUsd + usdcAmountUsd,
      solPrice:        dto.solPrice        ?? 0,
      walletBalanceUsd: dto.walletBalanceUsd ?? null,
      profitUsd:       dto.profitUsd       ?? null,
      rebalanceId:     dto.rebalanceId     ?? null,
      swapDirection:   dto.swapDirection   ?? null,
    });

    const saved = await this.repo.save(record);
    this.logger.log(
      `[${dto.role}][${(dto.ownerPubkey ?? 'vault').slice(0, 8)}] ` +
      `TX saved: ${dto.type} | ${dto.txHash.slice(0, 8)}...`,
    );
    return saved;
  }

  // ─── Read — by user ─────────────────────────────────────────────────────────

  /** All transactions for a specific wallet (PRO), newest first. */
  async getByOwner(ownerPubkey: string, limit = 100): Promise<LiquidityTransaction[]> {
    return this.repo.find({
      where:  { ownerPubkey },
      order:  { createdAt: 'DESC' },
      take:   limit,
    });
  }

  /** All transactions for a specific DB user, newest first. */
  async getByUserId(userId: number, limit = 100): Promise<LiquidityTransaction[]> {
    return this.repo.find({
      where:  { userId },
      order:  { createdAt: 'DESC' },
      take:   limit,
    });
  }

  /** All vault transactions, newest first. */
  async getVaultHistory(limit = 100): Promise<LiquidityTransaction[]> {
    return this.repo.find({
      where:  { role: LiquidityRole.VAULT },
      order:  { createdAt: 'DESC' },
      take:   limit,
    });
  }

  // ─── Read — by position / rebalance ─────────────────────────────────────────

  /** All transactions for a specific CLMM position lifecycle (oldest first). */
  async getByPosition(positionNftMint: string): Promise<LiquidityTransaction[]> {
    return this.repo.find({
      where: { positionNftMint },
      order: { createdAt: 'ASC' },
    });
  }

  /** All transactions in a single rebalance cycle (oldest first). */
  async getByRebalanceId(rebalanceId: string): Promise<LiquidityTransaction[]> {
    return this.repo.find({
      where: { rebalanceId },
      order: { createdAt: 'ASC' },
    });
  }

  // ─── Read — rebalance history ────────────────────────────────────────────────

  /**
   * PRO rebalance history grouped by rebalanceId.
   * Returns cycles ordered newest-first (up to `limit` cycles).
   */
  async getRebalanceHistory(
    ownerPubkey: string,
    limit = 20,
  ): Promise<RebalanceCycleDto[]> {
    const txs = await this.repo.find({
      where: { ownerPubkey, role: LiquidityRole.PRO },
      order: { createdAt: 'DESC' },
      take:  limit * 4, // each cycle ≈ 3 txs, fetch a bit extra
    });

    const cycleMap = new Map<string, LiquidityTransaction[]>();
    const standalone: LiquidityTransaction[] = [];

    for (const tx of txs) {
      if (tx.rebalanceId) {
        const arr = cycleMap.get(tx.rebalanceId) ?? [];
        arr.push(tx);
        cycleMap.set(tx.rebalanceId, arr);
      } else {
        standalone.push(tx);
      }
    }

    const cycles: RebalanceCycleDto[] = [];

    for (const [rebalanceId, group] of cycleMap.entries()) {
      const sorted = group.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      );
      const close = sorted.find(t => t.type === LiquidityTransactionType.CLOSE_POSITION);
      const swap  = sorted.find(t => t.type === LiquidityTransactionType.SWAP);
      const open  = sorted.find(t => t.type === LiquidityTransactionType.OPEN_POSITION);

      cycles.push({
        rebalanceId,
        startedAt:           sorted[0].createdAt,
        completedAt:         sorted[sorted.length - 1].createdAt,
        closePositionTx:     close?.txHash             ?? null,
        swapTx:              swap?.txHash              ?? null,
        openPositionTx:      open?.txHash              ?? null,
        newPositionNftMint:  open?.positionNftMint     ?? null,
        swapDirection:       swap?.swapDirection        ?? null,
        swapProfitUsd:       swap  ? Number(swap.profitUsd  ?? 0) : null,
        closeProfitUsd:      close ? Number(close.profitUsd ?? 0) : null,
      });
    }

    return cycles
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit);
  }

  // ─── Analytics ───────────────────────────────────────────────────────────────

  /** Realized P&L summary for one PRO user. */
  async getProfitSummary(ownerPubkey: string): Promise<LiquidityProfitSummary> {
    const txs = await this.repo.find({
      where: { ownerPubkey, role: LiquidityRole.PRO },
    });
    return this.calcProfitSummary(ownerPubkey, txs);
  }

  /** P&L for one PRO user within a date range. */
  async getProfitForPeriod(
    ownerPubkey: string,
    from: Date,
    to: Date,
  ): Promise<LiquidityProfitSummary> {
    const txs = await this.repo.find({
      where: { ownerPubkey, role: LiquidityRole.PRO, createdAt: Between(from, to) },
    });
    return this.calcProfitSummary(ownerPubkey, txs);
  }

  /** Vault P&L summary (all vault transactions). */
  async getVaultProfitSummary(): Promise<LiquidityProfitSummary> {
    const txs = await this.repo.find({ where: { role: LiquidityRole.VAULT } });
    return this.calcProfitSummary('vault', txs);
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private calcProfitSummary(
    key: string,
    txs: LiquidityTransaction[],
  ): LiquidityProfitSummary {
    const closes = txs.filter(
      t => t.type === LiquidityTransactionType.CLOSE_POSITION && t.profitUsd !== null,
    );
    const swaps  = txs.filter(
      t => t.type === LiquidityTransactionType.SWAP && t.profitUsd !== null,
    );
    const fees   = txs.filter(t => t.type === LiquidityTransactionType.COLLECT_FEES);

    const positionProfit = closes.reduce((s, t) => s + Number(t.profitUsd), 0);
    const swapCost       = swaps.reduce ((s, t) => s + Number(t.profitUsd), 0); // typically negative
    const feesUsd        = fees.reduce  ((s, t) => s + Number(t.usdcAmountUsd) + Number(t.solAmountUsd), 0);

    return {
      key,
      totalPositionProfitUsd: positionProfit,
      totalSwapCostUsd:       swapCost,
      totalFeesCollectedUsd:  feesUsd,
      netProfitUsd:           positionProfit + swapCost + feesUsd,
      totalOperations:        txs.length,
      rebalanceCycles:        new Set(txs.map(t => t.rebalanceId).filter(Boolean)).size,
    };
  }
}

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface RebalanceCycleDto {
  rebalanceId:        string;
  startedAt:          Date;
  completedAt:        Date;
  closePositionTx:    string | null;
  swapTx:             string | null;
  openPositionTx:     string | null;
  newPositionNftMint: string | null;
  swapDirection:      'sol_to_usdc' | 'usdc_to_sol' | null;
  swapProfitUsd:      number | null;
  closeProfitUsd:     number | null;
}

export interface LiquidityProfitSummary {
  /** ownerPubkey for PRO, 'vault' for VAULT */
  key:                    string;
  totalPositionProfitUsd: number;
  totalSwapCostUsd:       number;
  totalFeesCollectedUsd:  number;
  netProfitUsd:           number;
  totalOperations:        number;
  rebalanceCycles:        number;
}
