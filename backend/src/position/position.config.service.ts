import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PositionConfig } from './position.config.entity';

@Injectable()
export class PositionConfigService {
  private readonly logger = new Logger(PositionConfigService.name);

  constructor(
    @InjectRepository(PositionConfig)
    private readonly configRepository: Repository<PositionConfig>,
  ) {}

  async upsertConfig(params: {
    poolId: string;
    lowerRangePercent: number;
    upperRangePercent: number;
  }): Promise<PositionConfig> {
    let config = await this.configRepository.findOne({
      where: { poolId: params.poolId, isActive: true },
    });

    if (config) {
      config.lowerRangePercent = params.lowerRangePercent;
      config.upperRangePercent = params.upperRangePercent;
      config.updatedAt = new Date();
    } else {
      config = this.configRepository.create({
        poolId: params.poolId,
        lowerRangePercent: params.lowerRangePercent,
        upperRangePercent: params.upperRangePercent,
        isActive: true,
      });
    }

    const saved = await this.configRepository.save(config);

    this.logger.log(
      `Config saved for pool ${params.poolId}: Lower ${params.lowerRangePercent}%, Upper ${params.upperRangePercent}%`,
    );

    return saved;
  }

  async getConfig(poolId: string): Promise<PositionConfig | null> {
    return this.configRepository.findOne({
      where: { poolId, isActive: true },
    });
  }

  /**
   * Получить все активные конфигурации
   */
  async getAllConfigs(): Promise<PositionConfig[]> {
    return this.configRepository.find({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Деактивировать конфигурацию
   */
  async deactivateConfig(poolId: string): Promise<void> {
    await this.configRepository.update(
      { poolId, isActive: true },
      { isActive: false },
    );
    this.logger.log(`Config deactivated for pool ${poolId}`);
  }

  /**
   * Удалить конфигурацию
   */
  async deleteConfig(poolId: string): Promise<void> {
    await this.configRepository.delete({ poolId });
    this.logger.log(`Config deleted for pool ${poolId}`);
  }

  /**
   * Получить диапазон для пула (с fallback на дефолт)
   */
  async getRangeForPool(poolId: string): Promise<{
    lowerRangePercent: number;
    upperRangePercent: number;
    source: 'database' | 'default';
  }> {
    const config = await this.getConfig(poolId);

    if (config) {
      return {
        lowerRangePercent: Number(config.lowerRangePercent),
        upperRangePercent: Number(config.upperRangePercent),
        source: 'database',
      };
    }

    // Fallback на симметричный дефолт
    return {
      lowerRangePercent: 10,
      upperRangePercent: 10,
      source: 'default',
    };
  }
}