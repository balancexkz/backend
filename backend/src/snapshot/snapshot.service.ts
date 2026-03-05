import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { PositionDailySnapshot } from './snapshot.entity';
import { LiquidityBotService } from '../liquidity-bot/liquidity-bot.service';

@Injectable()
export class PositionSnapshotService {
  private readonly logger = new Logger(PositionSnapshotService.name);

  constructor(
    @InjectRepository(PositionDailySnapshot)
    private readonly snapshotRepo: Repository<PositionDailySnapshot>,
    private readonly liquidityBotService: LiquidityBotService,
  ) {}

  /**
   * Cron: каждый день в 12:00
   */
  @Cron('0 12 * * *', {
    name: 'daily-position-snapshot',
    timeZone: 'Asia/Almaty',
  })
  async createDailySnapshots() {
    this.logger.log('🕛 Starting daily snapshot at 12:00...');

    try {
      const positions = await this.liquidityBotService.getCLMMPositions();

      if (positions.length === 0) {
        this.logger.log('No active positions to snapshot');
        return;
      }

      const today = this.getTodayDate();
      const yesterday = this.getYesterdayDate();
      const snapshots: PositionDailySnapshot[] = [];

      for (const { position, pool } of positions) {
        try {
          // Проверить, есть ли уже snapshot за сегодня
          const existing = await this.snapshotRepo.findOne({
            where: {
              positionId: position.positionId,
              snapshotDate: today,
            },
          });

          if (existing) {
            this.logger.log(`Snapshot already exists for ${position.positionId.slice(0, 8)}...`);
            continue;
          }

          // Извлечь fees из actionHistory
          const { feesBase, feesQuote, feesUSD } = this.extractFees(
            position.actionHistory,
            pool.currentPrice,
          );

          // Рассчитать position value
          const baseValueUSD = Number(position.baseAmount) * pool.currentPrice;
          const quoteValueUSD = Number(position.quoteAmount);
          const positionValueUSD = baseValueUSD + quoteValueUSD;
          const totalValueUSD = positionValueUSD + feesUSD;

          // Получить вчерашний snapshot
          const previousSnapshot = await this.snapshotRepo.findOne({
            where: {
              positionId: position.positionId,
              snapshotDate: yesterday,
            },
          });

          // Рассчитать daily changes
          let dailyChangeUSD: number | null = null;
          let dailyChangePercent: number | null = null;
          let dailyFeesEarnedUSD: number | null = null;

          if (previousSnapshot) {
            // ✅ Формула 1: Daily Change USD
            dailyChangeUSD = totalValueUSD - Number(previousSnapshot.totalValueUSD);

            // ✅ Формула 2: Daily Change Percent (ТВОЯ ФОРМУЛА)
            if (Number(previousSnapshot.totalValueUSD) > 0) {
              dailyChangePercent = (
                (totalValueUSD / Number(previousSnapshot.totalValueUSD)) - 1
              ) * 100;
            }

            // ✅ Формула 3: Daily Fees Earned
            dailyFeesEarnedUSD = feesUSD - Number(previousSnapshot.feesCollectedUSD);
          }

          // Создать snapshot
          const snapshot = this.snapshotRepo.create({
            positionId: position.positionId,
            poolId: pool.poolId,
            snapshotDate: today,
            baseAmount: Number(position.baseAmount),
            quoteAmount: Number(position.quoteAmount),
            feesCollectedBase: feesBase,
            feesCollectedQuote: feesQuote,
            feesCollectedUSD: feesUSD,
            currentPrice: pool.currentPrice,
            priceRangeLower: position.priceRange.lower,
            priceRangeUpper: position.priceRange.upper,
            positionValueUSD,
            totalValueUSD,
            dailyChangeUSD,
            dailyChangePercent,
            dailyFeesEarnedUSD,
            positionStatus: position.positionStatus,
          });

          snapshots.push(snapshot);

          // Логирование
          this.logger.log(`📸 Snapshot for ${position.positionId.slice(0, 8)}...`);
          this.logger.log(`   Position: $${positionValueUSD.toFixed(2)}`);
          this.logger.log(`   Fees: $${feesUSD.toFixed(2)}`);
          this.logger.log(`   Total: $${totalValueUSD.toFixed(2)}`);

          if (dailyChangeUSD !== null && dailyChangePercent !== null) {
            const changeSign = dailyChangeUSD >= 0 ? '+' : '';
            this.logger.log(
              `   Daily change: ${changeSign}$${dailyChangeUSD.toFixed(2)} (${changeSign}${dailyChangePercent.toFixed(2)}%)`
            );
            this.logger.log(`   Daily fees: +$${dailyFeesEarnedUSD!.toFixed(2)}`);
          } else {
            this.logger.log(`   Daily change: N/A (first snapshot)`);
          }

        } catch (error) {
          this.logger.error(`Error creating snapshot for ${position.positionId}: ${error.message}`);
        }
      }

      // Сохранить все snapshots
      if (snapshots.length > 0) {
        await this.snapshotRepo.save(snapshots);
        this.logger.log(`✅ Created ${snapshots.length} daily snapshots`);
      }

    } catch (error) {
      this.logger.error(`Error in daily snapshot: ${error.message}`);
    }
  }

  /**
   * Извлечь fees из actionHistory
   */
  private extractFees(
    actionHistory: string[],
    currentPrice: number,
  ): {
    feesBase: number;
    feesQuote: number;
    feesUSD: number;
  } {
    const feeRegex = /Collected Fees: ([\d.]+) (\w+) \(([\d.]+) USD\)/;

    let feesBase = 0;
    let feesQuote = 0;
    let feesUSD = 0;

    for (const action of actionHistory) {
      const match = action.match(feeRegex);
      if (match) {
        const amount = parseFloat(match[1]);
        const token = match[2];
        const valueUSD = parseFloat(match[3]);

        if (token === 'SOL' || token === 'WSOL') {
          feesBase = amount;
        } else {
          feesQuote = amount;
        }

        feesUSD += valueUSD;
      }
    }

    return { feesBase, feesQuote, feesUSD };
  }

  private getTodayDate(): string {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }

  private getYesterdayDate(): string {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  }

  /**
   * Получить snapshots за период
   */
  async getSnapshotsForPeriod(
    positionId: string,
    startDate: string,
    endDate: string,
  ): Promise<PositionDailySnapshot[]> {
    return this.snapshotRepo
      .createQueryBuilder('snapshot')
      .where('snapshot.positionId = :positionId', { positionId })
      .andWhere('snapshot.snapshotDate >= :startDate', { startDate })
      .andWhere('snapshot.snapshotDate <= :endDate', { endDate })
      .orderBy('snapshot.snapshotDate', 'ASC')
      .getMany();
  }

  /**
   * Получить последний snapshot
   */
  async getLatestSnapshot(positionId: string): Promise<PositionDailySnapshot | null> {
    return this.snapshotRepo.findOne({
      where: { positionId },
      order: { snapshotDate: 'DESC' },
    });
  }

  /**
   * Получить все snapshots за последние N дней
   */
  async getRecentSnapshots(days: number = 30): Promise<PositionDailySnapshot[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    return this.snapshotRepo
      .createQueryBuilder('snapshot')
      .where('snapshot.snapshotDate >= :startDate', { startDate: startDateStr })
      .orderBy('snapshot.snapshotDate', 'DESC')
      .addOrderBy('snapshot.positionId', 'ASC')
      .getMany();
  }

  /**
   * Получить статистику за период
   */
  async getPeriodStatistics(
    startDate: string,
    endDate: string,
  ): Promise<{
    totalPositions: number;
    totalValueUSD: number;
    totalFeesUSD: number;
    totalChangeUSD: number;
    avgDailyChangePercent: number;
  }> {
    const snapshots = await this.snapshotRepo
      .createQueryBuilder('snapshot')
      .where('snapshot.snapshotDate >= :startDate', { startDate })
      .andWhere('snapshot.snapshotDate <= :endDate', { endDate })
      .getMany();

    if (snapshots.length === 0) {
      return {
        totalPositions: 0,
        totalValueUSD: 0,
        totalFeesUSD: 0,
        totalChangeUSD: 0,
        avgDailyChangePercent: 0,
      };
    }

    // Группируем по positionId и берем последний snapshot
    const latestByPosition = new Map<string, PositionDailySnapshot>();

    for (const snapshot of snapshots) {
      const existing = latestByPosition.get(snapshot.positionId);
      if (!existing || snapshot.snapshotDate > existing.snapshotDate) {
        latestByPosition.set(snapshot.positionId, snapshot);
      }
    }

    const latestSnapshots = Array.from(latestByPosition.values());

    const totalValueUSD = latestSnapshots.reduce(
      (sum, s) => sum + Number(s.totalValueUSD),
      0,
    );

    const totalFeesUSD = latestSnapshots.reduce(
      (sum, s) => sum + Number(s.feesCollectedUSD),
      0,
    );

    const totalChangeUSD = latestSnapshots.reduce(
      (sum, s) => sum + (Number(s.dailyChangeUSD) || 0),
      0,
    );

    const validChanges = latestSnapshots.filter(s => s.dailyChangePercent !== null);
    const avgDailyChangePercent =
      validChanges.length > 0
        ? validChanges.reduce((sum, s) => sum + Number(s.dailyChangePercent), 0) / validChanges.length
        : 0;

    return {
      totalPositions: latestSnapshots.length,
      totalValueUSD,
      totalFeesUSD,
      totalChangeUSD,
      avgDailyChangePercent,
    };
  }

  /**
   * Ручной запуск snapshot
   */
  async createSnapshotManually(): Promise<void> {
    this.logger.log('🔧 Manual snapshot triggered');
    await this.createDailySnapshots();
  }
}

