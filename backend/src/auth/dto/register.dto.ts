import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, IsEnum } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'john_doe', minLength: 3 })
  @IsString()
  @MinLength(3)
  username: string;

  @ApiProperty({ example: 'SecurePass123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'vault', enum: ['vault', 'pro'] })
  @IsEnum(['vault', 'pro'])
  role: 'vault' | 'pro';
}
