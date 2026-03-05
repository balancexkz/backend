import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard, Roles } from '../auth/guards';
import { PositionConfigService } from './position.config.service';
class CreateConfigDto {
  poolId: string;
  lowerRangePercent: number;
  upperRangePercent: number;
}

@ApiTags('Position Config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('position-config')
export class PositionConfigController {
  constructor(private readonly configService: PositionConfigService) {}

  @Post()
  @ApiOperation({ summary: 'Create or update position config' })
  async upsertConfig(@Body() dto: CreateConfigDto) {
    const config = await this.configService.upsertConfig(dto);
    return {
      success: true,
      config,
    };
  }

  @Get(':poolId')
  @ApiOperation({ summary: 'Get config for pool' })
  async getConfig(@Param('poolId') poolId: string) {
    const config = await this.configService.getConfig(poolId);
    return {
      success: true,
      config,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get all configs' })
  async getAllConfigs() {
    const configs = await this.configService.getAllConfigs();
    return {
      success: true,
      configs,
    };
  }

  @Delete(':poolId')
  @ApiOperation({ summary: 'Delete config for pool' })
  async deleteConfig(@Param('poolId') poolId: string) {
    await this.configService.deleteConfig(poolId);
    return {
      success: true,
      message: `Config deleted for pool ${poolId}`,
    };
  }

  @Post(':poolId/deactivate')
  @ApiOperation({ summary: 'Deactivate config for pool' })
  async deactivateConfig(@Param('poolId') poolId: string) {
    await this.configService.deactivateConfig(poolId);
    return {
      success: true,
      message: `Config deactivated for pool ${poolId}`,
    };
  }
  
}