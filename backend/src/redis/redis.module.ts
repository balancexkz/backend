// src/redis/redis.module.ts

import { Module, Global } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';


@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        store: redisStore as any,
        host: configService.get('REDIS_HOST'),
        port: configService.get('REDIS_PORT'),
        password: configService.get('REDIS_PASSWORD'),
        ttl: 5 * 60,
        max: 100,
      }),
    }),
  ],
  providers: [RedisService], // ✅ Добавить
  exports: [CacheModule, RedisService], // ✅ Экспортировать
})
export class RedisModule {}