import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from './user.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findByUsername(username: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { username } });
  }

  async findById(id: number): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  async create(params: {
    username: string;
    password: string;
    role: UserRole;
  }): Promise<User> {
    const existing = await this.findByUsername(params.username);
    if (existing) {
      throw new ConflictException('Username already taken');
    }

    const hashedPassword = await bcrypt.hash(params.password, 10);

    const user = this.userRepository.create({
      username: params.username,
      password: hashedPassword,
      role: params.role,
    });

    return this.userRepository.save(user);
  }

  async validatePassword(user: User, plainPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, user.password);
  }

  /** Link a Solana wallet address to a user account (vault or pro). */
  async setWalletPubkey(userId: number, walletPubkey: string): Promise<User> {
    await this.userRepository.update(userId, { walletPubkey });
    return this.findById(userId);
  }

  /** Find user by their Solana wallet address. */
  async findByWalletPubkey(walletPubkey: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { walletPubkey } });
  }
}
