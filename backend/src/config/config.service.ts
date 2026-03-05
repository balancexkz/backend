import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

@Injectable()
export class ConfigService {
  constructor(private configService: NestConfigService) {}

  get solanaRpcUrl(): string {
    const url = this.configService.get<string>('SOLANA_DEVNET_RPC_URL');
    if (!url) {
      throw new Error('SOLANA_RPC_URL is not configured');
    }
    return url;
  }

  get walletPrivateKey(): string {
    const key = this.configService.get<string>('PRIVATE_KEY');
    if (!key) {
      throw new Error('PRIVATE_KEY is not configured');
    }
    return key;
  }
}
