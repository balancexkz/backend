
import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ClosePositionDto {
  @ApiProperty({
    description: 'NFT Mint адрес позиции',
    example: '5HauEoJa6tcKBy1vofNAxnEDiMpC7H6V9L5TgLwFYNfd',
  })
  @IsString()
  nftMint: string;
}