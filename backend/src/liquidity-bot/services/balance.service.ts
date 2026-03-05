import { Injectable, Logger } from '@nestjs/common';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import axios from 'axios';

@Injectable()
export class BalanceService {
  private readonly logger = new Logger(BalanceService.name);

  async getByPool(poolId: string, context: any) {
    const publicKey = new PublicKey(context.walletAddress);
    
    const data = await context.raydium.api.fetchPoolById({ ids: poolId });
    const poolInfo = data[0];
    
    const symbolA = this.normalizeSymbol(poolInfo.mintA.symbol);
    const symbolB = this.normalizeSymbol(poolInfo.mintB.symbol);
    
    const [amountA, amountB] = await Promise.all([
      this.getTokenBalance(poolInfo.mintA, publicKey, context),
      this.getTokenBalance(poolInfo.mintB, publicKey, context),
    ]);
    
    const prices = await this.getTokenPrices(`${symbolA},${symbolB}`, context.coinMarketCapApiKey);
    
    return {
      [symbolA]: {
        amount: amountA,
        valueInUSD: amountA * (prices[symbolA] || 0),
      },
      [symbolB]: {
        amount: amountB,
        valueInUSD: amountB * (prices[symbolB] || 1),
      },
    };
  }

  async getTokenPrices(symbols: string, apiKey: string): Promise<Record<string, number>> {
    const symbolsArray = symbols.split(',');
    const prices: Record<string, number> = {};
    
    try {
      const response = await axios.get(
        'https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest',
        {
          params: { symbol: symbols },
          headers: { 'X-CMC_PRO_API_KEY': apiKey },
        }
      );
      
      symbolsArray.forEach((symbol) => {
        const priceData = response.data?.data?.[symbol]?.[0]?.quote?.USD?.price;
        prices[symbol] = priceData ? parseFloat(priceData) : 0;
      });
      
    } catch (error) {
      this.logger.error(`Failed to fetch prices: ${error.message}`);
      symbolsArray.forEach(symbol => prices[symbol] = 0);
    }
    
    return prices;
  }

  async getWalletBalanceUSD(walletAddress: string, context: any): Promise<number> {
    const publicKey = new PublicKey(walletAddress);
    
    const solBalance = await context.connection.getBalance(publicKey);
    const solAmount = solBalance / 10 ** 9;
    
    const prices = await this.getTokenPrices('SOL', context.coinMarketCapApiKey);
    const solValueUSD = solAmount * (prices['SOL'] || 0);
    
    let usdcBalance = 0;
    try {
      const usdcMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      const usdcAta = await getAssociatedTokenAddress(usdcMint, publicKey);
      const accountInfo = await getAccount(context.connection, usdcAta);
      usdcBalance = Number(accountInfo.amount) / 10 ** 6;
    } catch {
      usdcBalance = 0;
    }
    
    return solValueUSD + usdcBalance;
  }

  private async getTokenBalance(mintInfo: any, owner: PublicKey, context: any): Promise<number> {
    if (mintInfo.symbol === 'WSOL') {
      const balance = await context.connection.getBalance(owner);
      return balance / 10 ** mintInfo.decimals;
    }
    
    try {
      const ata = await getAssociatedTokenAddress(
        new PublicKey(mintInfo.address),
        owner
      );
      const account = await getAccount(context.connection, ata);
      return Number(account.amount) / 10 ** mintInfo.decimals;
    } catch {
      return 0;
    }
  }

  private normalizeSymbol(symbol: string): string {
    return symbol === 'WSOL' ? 'SOL' : symbol;
  }
}
