// src/liquidity-bot/services/fee-distributor.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Connection, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { 
  getAssociatedTokenAddress, 
  getAccount, 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { Keypair } from '@solana/web3.js';
import { FeeRecipient, FEE_CONFIG } from '../types/fee.types';
import { TransferResult, FeeDistributionResult } from '../types/transfer.types';

@Injectable()
export class FeeDistributorService {
  private readonly logger = new Logger(FeeDistributorService.name);
  private readonly feeRecipients: FeeRecipient[];

  constructor(
    private readonly configService: ConfigService,
    private readonly connection: Connection,
    private readonly owner: Keypair,
  ) {
    this.feeRecipients = this.initializeFeeRecipients();
  }

  /**
   * Распределить комиссии между получателями
   */
  async distributeFees(params: {
    token: 'SOL' | 'USDC';
    totalAmount: number;
    totalAmountUSD: number;
    tokenMint?: string;
  }): Promise<FeeDistributionResult> {
    
    const { token, totalAmount, totalAmountUSD, tokenMint } = params;

    if (totalAmount <= 0 || this.feeRecipients.length === 0) {
      return {
        transfers: [],
        totalAmount: 0,
        totalAmountUSD: 0,
        success: false,
      };
    }

    this.logger.log('');
    this.logger.log('💸 Fee Distribution:');
    this.logger.log(`   Total: ${totalAmount.toFixed(6)} ${token} ($${totalAmountUSD.toFixed(2)})`);

    const transfers = await Promise.allSettled(
      this.feeRecipients.map(recipient =>
        this.executeSingleTransfer({
          recipient,
          token,
          totalAmount,
          totalAmountUSD,
          tokenMint,
        })
      )
    );

    const results: TransferResult[] = transfers
      .map((result, idx) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          this.logger.error(
            `Transfer failed for ${this.feeRecipients[idx].label}: ${result.reason?.message}`
          );
          return null;
        }
      })
      .filter((r): r is TransferResult => r !== null);

    const success = results.length > 0;

    this.logger.log(success ? '✅ Fee distribution complete' : '❌ All transfers failed');
    this.logger.log('');

    return {
      transfers: results,
      totalAmount,
      totalAmountUSD,
      success,
    };
  }

  /**
   * Выполнить один transfer
   */
  private async executeSingleTransfer(params: {
    recipient: FeeRecipient;
    token: 'SOL' | 'USDC';
    totalAmount: number;
    totalAmountUSD: number;
    tokenMint?: string;
  }): Promise<TransferResult> {
    
    const { recipient, token, totalAmount, totalAmountUSD, tokenMint } = params;

    const amount = totalAmount * recipient.percent;
    const amountUSD = totalAmountUSD * recipient.percent;

    this.logger.log(
      `   ${recipient.label} (${(recipient.percent * 100).toFixed(0)}%): ` +
      `${amount.toFixed(6)} ${token} ($${amountUSD.toFixed(2)})`
    );

    let txId: string;

    if (token === 'SOL') {
      txId = await this.transferSOL(recipient.address, amount);
    } else {
      if (!tokenMint) {
        throw new Error('Token mint required for SPL token transfer');
      }
      txId = await this.transferSPLToken(tokenMint, recipient.address, amount);
    }

    this.logger.log(`   ✅ TX: https://solscan.io/tx/${txId}`);

    return {
      txId,
      amount,
      amountUSD,
      recipient: recipient.address,
      token,
    };
  }

  /**
   * Transfer SOL
   */
  private async transferSOL(recipientAddress: string, amount: number): Promise<string> {
    const recipient = new PublicKey(recipientAddress);
    const sender = this.owner.publicKey;
    const lamports = Math.floor(amount * 1e9);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: sender,
        toPubkey: recipient,
        lamports,
      })
    );

    const { blockhash } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = sender;
    transaction.sign(this.owner);

    const signature = await this.connection.sendRawTransaction(transaction.serialize());
    
    return signature;
  }

  /**
   * Transfer SPL Token
   */
  private async transferSPLToken(
    tokenMintAddress: string,
    recipientAddress: string,
    amount: number
  ): Promise<string> {
    
    const mintPublicKey = new PublicKey(tokenMintAddress);
    const recipient = new PublicKey(recipientAddress);
    const sender = this.owner.publicKey;

    const senderATA = await getAssociatedTokenAddress(
      mintPublicKey,
      sender,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const recipientATA = await getAssociatedTokenAddress(
      mintPublicKey,
      recipient,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const transaction = new Transaction();

    // Проверяем ATA получателя
    const recipientATAInfo = await this.connection.getAccountInfo(recipientATA);

    if (!recipientATAInfo) {
      this.logger.log(`   Creating ATA for recipient...`);
      transaction.add(
        createAssociatedTokenAccountInstruction(
          sender,
          recipientATA,
          recipient,
          mintPublicKey,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }

    // Получаем decimals
    const mintInfo = await this.connection.getParsedAccountInfo(mintPublicKey);
    const decimals = (mintInfo.value?.data as any).parsed.info.decimals;
    const rawAmount = Math.floor(amount * 10 ** decimals);

    // Transfer instruction
    transaction.add(
      createTransferInstruction(
        senderATA,
        recipientATA,
        sender,
        rawAmount,
        [],
        TOKEN_PROGRAM_ID
      )
    );

    const { blockhash } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = sender;
    transaction.sign(this.owner);

    const signature = await this.connection.sendRawTransaction(transaction.serialize());
    await this.connection.confirmTransaction(signature, 'confirmed');

    return signature;
  }

  /**
   * Инициализировать получателей комиссий
   */
  private initializeFeeRecipients(): FeeRecipient[] {
    const recipients: FeeRecipient[] = [];

    const primary = this.configService.get<string>('RECIPIENT_ADDRESS');
    if (primary) {
      recipients.push({
        address: primary,
        percent: FEE_CONFIG.PRIMARY_PERCENT,
        label: 'Primary',
      });
    }

    const secondary = this.configService.get<string>('SECOND_RECIPIENT_ADDRESS');
    if (secondary) {
      recipients.push({
        address: secondary,
        percent: FEE_CONFIG.SECONDARY_PERCENT,
        label: 'Secondary',
      });
    }

    return recipients;
  }
}