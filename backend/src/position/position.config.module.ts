import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PositionConfig } from './position.config.entity';
import { PositionConfigService } from './position.config.service';
import { PositionConfigController } from './position.config.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PositionConfig]),
  ],
  controllers: [PositionConfigController],
  providers: [PositionConfigService],
  exports: [PositionConfigService],
})
export class PositionConfigModule {}
