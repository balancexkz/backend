// src/liquidity-bot/services/pool-info.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { Raydium, ApiV3PoolInfoConcentratedItem, ClmmKeys } from '@raydium-io/raydium-sdk-v2';
import { isValidClmm } from '../utils/raydium.utils';

export interface PoolData {
  poolInfo: ApiV3PoolInfoConcentratedItem;
  poolKeys?: ClmmKeys;
  currentPrice: number;
}

@Injectable()
export class PoolInfoService {
  private readonly logger = new Logger(PoolInfoService.name);

  constructor(private readonly raydium: Raydium) {}

  /**
   * Получить информацию о пуле с актуальной ценой
   */
  async getPoolData(poolId: string): Promise<PoolData> {
    let poolInfo: ApiV3PoolInfoConcentratedItem;
    let poolKeys: ClmmKeys | undefined;

    // Получаем базовую информацию
    if (this.raydium.cluster === 'mainnet') {
      const data = await this.raydium.api.fetchPoolById({ ids: poolId });
      poolInfo = data[0] as ApiV3PoolInfoConcentratedItem;

      if (!isValidClmm(poolInfo.programId)) {
        throw new Error('Target pool is not CLMM pool');
      }
    } else {
      const data = await this.raydium.clmm.getPoolInfoFromRpc(poolId);
      poolInfo = data.poolInfo;
      poolKeys = data.poolKeys;
    }

    // Получаем актуальную цену из RPC
    const rpcData = await this.raydium.clmm.getRpcClmmPoolInfo({ poolId });
    poolInfo.price = rpcData.currentPrice;

    this.logger.log(`Pool ${poolId.slice(0, 8)}... loaded`);
    this.logger.log(`  ${poolInfo.mintA.symbol}/${poolInfo.mintB.symbol}`);
    this.logger.log(`  Price: ${rpcData.currentPrice.toFixed(2)}`);

    return {
      poolInfo,
      poolKeys,
      currentPrice: rpcData.currentPrice,
    };
  }

  /**
   * Получить только RPC данные пула
   */
  async getRpcPoolInfo(poolId: string) {
    return await this.raydium.clmm.getRpcClmmPoolInfo({ poolId });
  }

  /**
   * Нормализовать символ токена (WSOL -> SOL)
   */
  normalizeSymbol(symbol: string): string {
    return symbol === 'WSOL' ? 'SOL' : symbol;
  }
}