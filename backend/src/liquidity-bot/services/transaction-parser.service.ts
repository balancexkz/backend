// src/liquidity-bot/services/transaction-parser.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ParsedTransaction {
  solAmount: number;
  usdcAmount: number;
}

@Injectable()
export class TransactionParserService {
  private readonly logger = new Logger(TransactionParserService.name);
  private readonly heliusApiKey: string;
  
  private readonly SOL_MINT = 'So11111111111111111111111111111111111111112';
  private readonly USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  constructor(private readonly configService: ConfigService) {
    this.heliusApiKey = this.configService.get<string>('HELIUS_API_KEY');
  }

 

  async parseTransaction(
    txId: string,
    type: 'OPEN' | 'CLOSE',
    walletAddress: string,
  ): Promise<ParsedTransaction> {
    
    // Rate limiting
    await this.sleep(2000);

    const response = await fetch(
      `https://api.helius.xyz/v0/transactions/?api-key=${this.heliusApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: [txId] }),
      }
    );

    const [txData] = await response.json();

    if (!txData) {
      throw new Error(`Transaction ${txId} not found`);
    }

    const transfers = this.filterTransfersByType(
      txData.tokenTransfers,
      type,
      walletAddress,
    );

    this.logger.log(`Parsed ${type} transaction: ${txId.slice(0, 8)}...`);
    this.logger.log(`  Transfers found: ${transfers.length}`);

    // Извлекаем SOL и USDC
    const solTransfer = transfers.find(t => t.mint === this.SOL_MINT);
    const usdcTransfer = transfers.find(t => t.mint === this.USDC_MINT);

    const result = {
      solAmount: solTransfer?.tokenAmount || 0,
      usdcAmount: usdcTransfer?.tokenAmount || 0,
    };

    this.logger.log(`  SOL: ${result.solAmount}, USDC: ${result.usdcAmount}`);

    return result;
  }

  /**
   * Фильтрует трансферы по типу операции
   */
  private filterTransfersByType(
    transfers: any[],
    type: 'OPEN' | 'CLOSE',
    walletAddress: string,
  ): any[] {
    if (type === 'CLOSE') {
      return transfers.filter(t => t.toUserAccount === walletAddress);
    } else {
      return transfers.filter(t => t.fromUserAccount === walletAddress);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}