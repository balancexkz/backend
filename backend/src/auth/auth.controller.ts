import {
  Controller,
  Post,
  Body,
  UnauthorizedException,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import { UserRole } from '../user/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

  @Post('login')
  @ApiOperation({
    summary: 'Авторизация пользователя',
    description: 'Выполняет вход в систему и возвращает access + refresh токены',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Авторизация успешна',
    type: TokenResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Неверные учетные данные',
  })
  async login(@Body() credentials: LoginDto): Promise<TokenResponseDto> {
    // Попытка admin login (env-based)
    try {
      const isAdmin = await this.authService.validateAdmin(credentials);
      if (isAdmin) {
        return this.authService.generateTokensForAdmin(credentials.username);
      }
    } catch {
      // Not admin, try user login below
    }

    // Попытка user login из БД
    const user = await this.authService.validateUser(credentials.username, credentials.password);
    if (!user) {
      throw new UnauthorizedException('Неверные учетные данные');
    }

    return this.authService.generateTokensForUser(user);
  }

  @Post('register')
  @ApiOperation({
    summary: 'Регистрация пользователя',
    description: 'Создаёт новый аккаунт с ролью vault или pro',
  })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: HttpStatus.CREATED, type: TokenResponseDto })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Username уже занят' })
  async register(@Body() dto: RegisterDto): Promise<TokenResponseDto> {
    const user = await this.userService.create({
      username: dto.username,
      password: dto.password,
      role: dto.role as UserRole,
    });

    return this.authService.generateTokensForUser(user);
  }

  @Post('refresh')
  @ApiOperation({
    summary: 'Обновление токенов',
    description: 'Обновляет access и refresh токены по refresh токену',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({ status: HttpStatus.OK, type: TokenResponseDto })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Недействительный refresh токен' })
  async refresh(@Body() dto: RefreshTokenDto): Promise<TokenResponseDto> {
    return this.authService.refreshTokens(dto.refreshToken);
  }
}
