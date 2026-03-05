
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber } from 'class-validator';

export class IncreasePositionDto {
  @ApiProperty({
    description: 'NFT Mint адрес позиции',
    example: '5HauEoJa6tcKBy1vofNAxnEDiMpC7H6V9L5TgLwFYNfd',
  })
  @IsString()
  nftMint: string;

  @ApiProperty({
    description: 'Input Amount',
    example: '1',
  })
  @IsNumber()
  inputAmount: number;
}