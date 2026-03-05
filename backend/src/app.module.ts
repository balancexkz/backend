import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';

// ─── Global modules ───────────────────────────────────────────────────────────
import { SharedModule } from './shared/shared.module';
import { SolanaModule } from './solana/solana.module';
import { RedisModule } from './redis/redis.module';

// ─── Core modules ─────────────────────────────────────────────────────────────
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';

// ─── Feature modules: new roles ───────────────────────────────────────────────
import { ProModule } from './pro/pro.module';
import { VaultModule } from './vault/vault.module';

// ─── Feature modules: legacy bot ──────────────────────────────────────────────
import { LiquidityBotModule } from './liquidity-bot/liquidity-bot.module';
import { SwapModule } from './swap/swap.module';
import { MonitorModule } from './monitor/monitor.module';
import { TransactionModule } from './transaction/transaction.module';
import { AnalyticModule } from './analytic/analytic.module';
import { PositionConfigModule } from './position/position.config.module';
import { SnapshotModule } from './snapshot/snapshot.module';
import { VolatilityModule } from './volatility/volatility.module';
import { RangeModule } from './optimal-range/optimal-range.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host:     configService.get('DB_HOST'),
        port:     configService.get('DB_PORT'),
        username: configService.get('DB_USERNAME'),
        password: configService.get('DB_PASSWORD'),
        database: configService.get('DB_DATABASE'),
        entities:           [__dirname + '/**/*.entity{.ts,.js}'],
        migrationsTableName: 'migrations_typeorm',
        migrations:          ['src/migration/*.ts'],
        cli: { migrationsDir: 'src/migration' },
      }),
    }),
    ScheduleModule.forRoot(),
    HttpModule,
    // Global
    SolanaModule,
    SharedModule,
    RedisModule,
    // Core
    UserModule,
    AuthModule,
    // New roles
    ProModule,
    VaultModule,
    // Legacy bot
    LiquidityBotModule,
    SwapModule,
    MonitorModule,
    TransactionModule,
    AnalyticModule,
    PositionConfigModule,
    SnapshotModule,
    VolatilityModule,
    RangeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
