// base-raydium.service.ts (new file)
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Connection, Keypair } from '@solana/web3.js';
import { Raydium } from '@raydium-io/raydium-sdk-v2';
import { SimpleTransactionSimulator } from '../liquidity-bot/utils/simulateTransaction';
import { createWalletFromSecretKey } from '../liquidity-bot/utils/solana.utils'; 
import { initSdk } from '../liquidity-bot/config';
import { API_URLS,  } from '@raydium-io/raydium-sdk-v2';


@Injectable()
export abstract class CommonRaydiumService {
  protected readonly logger = new Logger(this.constructor.name);
  protected raydium: Raydium;
  protected connection: Connection;
  protected cluster: string;
  protected owner: Keypair;
  protected coinMarketCapApiKey: string;
  protected walletAddress: string;
  protected simulator: SimpleTransactionSimulator;

  constructor(protected readonly configService: ConfigService) {
    this.cluster = 'mainnet';
    const rpcUrl = this.configService.get<string>('SOLANA_RPC_URL');
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.owner = createWalletFromSecretKey(this.configService.get<string>('OWNER_SECRET_KEY'));
    this.coinMarketCapApiKey = this.configService.get<string>('COINMARKETCAP_API_KEY');
    this.walletAddress = this.configService.get<string>('WALLET_ADDRESS');
    this.simulator = new SimpleTransactionSimulator(this.connection);
  }

  async initializeRaydium(): Promise<void> {
    try {
      API_URLS.JUP_TOKEN_LIST = 'https://lite-api.jup.ag/tokens/v2/tag?query=verified';
      this.raydium = await initSdk(this.connection, this.owner, this.cluster);
      this.logger.log('Raydium SDK initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize Raydium SDK: ${error.message}`);
      throw error;
    }
  }

}