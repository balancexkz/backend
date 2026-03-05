// src/redis/redis.service.ts

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    console.log('HOST REDIS', this.configService.get('REDIS_HOST'), this.configService.get('REDIS_PORT'))
    this.client = new Redis({
        host: this.configService.get('REDIS_HOST')|| 'localhost', 
        port: parseInt(this.configService.get('REDIS_PORT') || '6379'),
        password: ''
    });

    this.client.on('connect', () => {
      this.logger.log('✅ Connected to Redis');
    });

    this.client.on('error', (err) => {
        console.log('ERRR', err)
      this.logger.error(`Redis error: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  /**
   * 🗑️ Очистить весь кеш
   */
  async flushAll(): Promise<void> {
    await this.client.flushdb();
    this.logger.log('All Redis cache cleared');
  }

  /**
   * 🔍 Найти ключи по паттерну (SCAN)
   */
  async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const result = await this.client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== '0');

    return keys;
  }

  /**
   * 🗑️ Удалить ключи по паттерну
   */
  async deleteByPattern(pattern: string): Promise<number> {
    const keys = await this.scanKeys(pattern);

    if (keys.length === 0) {
      this.logger.log(`No keys found for pattern: ${pattern}`);
      return 0;
    }

    // Удалить все найденные ключи
    await this.client.del(...keys);
    
    this.logger.log(`Deleted ${keys.length} keys for pattern: ${pattern}`);
    return keys.length;
  }

  /**
   * 🗑️ Удалить конкретный ключ
   */
  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  /**
   * 📊 Получить статистику
   */
  async getStats(prefix: string): Promise<{
    totalKeys: number;
    keys: string[];
  }> {
    const pattern = `${prefix}*`;
    const keys = await this.scanKeys(pattern);

    return {
      totalKeys: keys.length,
      keys,
    };
  }

  /**
   * ⏱️ Получить TTL ключа
   */
  async getTTL(key: string): Promise<number> {
    return await this.client.ttl(key);
  }

  /**
   * 🔧 Получить прямой доступ к клиенту
   */
  getClient(): Redis {
    return this.client;
  }
}