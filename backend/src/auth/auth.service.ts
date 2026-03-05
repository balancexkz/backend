import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminCredentials } from './interfaces/admin.interface';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../user/user.service';
import { User } from '../user/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
  ) {}

  async validateAdmin(credentials: AdminCredentials): Promise<boolean> {
    const adminUsername = this.configService.get<string>('ADMIN_USERNAME');
    const adminPassword = this.configService.get<string>('ADMIN_PASSWORD');

    if (!adminUsername || !adminPassword) {
      throw new Error('Admin credentials not configured');
    }

    if (credentials.username === adminUsername && credentials.password === adminPassword) {
      return true;
    }

    throw new UnauthorizedException('Invalid admin credentials');
  }

  async validateUser(username: string, password: string): Promise<User | null> {
    const user = await this.userService.findByUsername(username);
    if (!user) {
      return null;
    }
    const isValid = await this.userService.validatePassword(user, password);
    return isValid ? user : null;
  }

  generateAccessToken(payload: { userId?: number; username: string; role: string }): string {
    return this.jwtService.sign(payload, { expiresIn: '15m' });
  }

  generateRefreshToken(payload: { userId?: number; username: string; role: string }): string {
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET') ||
                          this.configService.get<string>('JWT_SECRET') + '_refresh';
    return this.jwtService.sign(payload, {
      secret: refreshSecret,
      expiresIn: '7d'
    });
  }

  generateTokens(payload: { userId?: number; username: string; role: string }): {
    token: string;
    refreshToken: string;
  } {
    return {
      token: this.generateAccessToken(payload),
      refreshToken: this.generateRefreshToken(payload),
    };
  }

  async refreshTokens(refreshToken: string): Promise<{ token: string; refreshToken: string }> {
    try {
      const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET') ||
                            this.configService.get<string>('JWT_SECRET') + '_refresh';

      const payload = this.jwtService.verify(refreshToken, { secret: refreshSecret });

      const newPayload = {
        userId: payload.userId,
        username: payload.username,
        role: payload.role,
      };

      return this.generateTokens(newPayload);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  // Legacy method for admin (backward compatibility)
  async generateToken(username: string): Promise<string> {
    const payload = { username, role: 'admin' };
    return this.jwtService.sign(payload);
  }

  generateTokensForUser(user: User): { token: string; refreshToken: string } {
    const payload = { userId: user.id, username: user.username, role: user.role };
    return this.generateTokens(payload);
  }

  generateTokensForAdmin(username: string): { token: string; refreshToken: string } {
    const payload = { username, role: 'admin' };
    return this.generateTokens(payload);
  }
}
