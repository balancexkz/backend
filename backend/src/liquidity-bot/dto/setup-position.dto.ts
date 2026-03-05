// src/liquidity-bot/dto/setup-position.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, Min, Max } from 'class-validator';

export class SetupPositionDto {
  @ApiProperty({
    description: 'ID пула',
    example: '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv',
    required: false,
  })
  @IsOptional()
  @IsString()
  poolId?: string;

  @ApiProperty({
    description: 'Адрес базового токена (mint)',
    example: 'So11111111111111111111111111111111111111112',
  })
  @IsString()
  baseMint: string;

  @ApiProperty({
    description: 'Адрес котируемого токена (mint)',
    example: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  })
  @IsString()
  quoteMint: string;

  @ApiProperty({
    description: 'Количество входного токена',
    example: 1.5,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  inputAmount: number;

  @ApiProperty({
    description: 'Процент ценового диапазона',
    example: 2,
    minimum: 0.1,
    maximum: 100,
  })
  @IsNumber()
  @Min(0.1)
  @Max(100)
  priceRangePercent: number;
}