// src/telegram/telegram.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface PositionClosedNotification {
  positionId: string;
  poolId: string;
  baseSymbol: string;
  quoteSymbol: string;
  walletAddress: string;
  baseAmount: number;
  quoteAmount: number;
  totalFeesUSD: number;
  walletBalanceUSD: number;
  txId: string;
  feeTransferTxId?: string;
  price: number;
  lowerPercent: number;
  upperPercent: number;
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken: string;
  private readonly chatId: string;
  private readonly apiUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    this.chatId = this.configService.get<string>('TELEGRAM_CHAT_ID');
    
    if (!this.botToken || !this.chatId) {
      this.logger.warn('⚠️  Telegram bot not configured (missing TOKEN or CHAT_ID)');
      return;
    }

    this.apiUrl = `https://api.telegram.org/bot${this.botToken}`;
    this.logger.log('✅ Telegram service initialized');
  }

  /**
   * 🔔 Отправить уведомление о закрытии позиции
   */
  async notifyPositionClosed(data: PositionClosedNotification): Promise<void> {
    if (!this.botToken || !this.chatId) {
      this.logger.warn('Telegram not configured, skipping notification');
      return;
    }

    try {
      const message = this.formatPositionClosedMessage(data);
      await this.sendMessage(message);
      
      this.logger.log(`📤 Telegram notification sent for position ${data.positionId.slice(0, 8)}...`);
    } catch (error) {
      this.logger.error(`Failed to send Telegram notification: ${error.message}`);
    }
  }

  /**
   * 📤 Отправить сообщение в Telegram
   */
  async sendMessage(text: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): Promise<void> {
    if (!this.botToken || !this.chatId) return;

    try {
      await axios.post(`${this.apiUrl}/sendMessage`, {
        chat_id: this.chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      });
    } catch (error) {
      this.logger.error(`Failed to send Telegram message: ${error.message}`);
      throw error;
    }
  }

  /**
   * 📝 Форматирование сообщения о закрытии позиции
   */
  private formatPositionClosedMessage(data: PositionClosedNotification): string {
    const emoji = data.totalFeesUSD > 0 ? '💰' : '📊';
    const explorerLink = `https://solscan.io/tx/${data.txId}`;
    
    let message = `${emoji} <b>Position Closed</b>\n\n`;
    
    message += `<b>Pool:</b> ${data.baseSymbol}/${data.quoteSymbol}\n`;
    message += `<b>Position ID:</b> <code>${data.positionId.slice(0, 8)}...</code>\n\n`;
    message += `<b>Range Percent:</b> ${data.lowerPercent, data.upperPercent}\n`;
    message += `<b>📊 Received Tokens:</b>\n`;
    message += `  • ${data.baseAmount.toFixed(6)} ${data.baseSymbol}\n`;
    message += `  • ${data.quoteAmount.toFixed(6)} ${data.quoteSymbol}\n\n`;
    
    message += `<b>💸 Fees Collected:</b>\n`;
    message += `  • <b>$${data.totalFeesUSD.toFixed(2)} USD</b>\n\n`;
    
    message += `<b>💼 Wallet Balances:</b>\n`;
    message += `  • Main: $${data.walletBalanceUSD.toFixed(2)} USD\n`;
    
    message += `<b>Current Price:</b>\n`;
    message += `  • Main: $${data.price.toFixed(2)} USD\n`;

    message += `<b>From Client Wallet</b>\n`;
    message += `  • Wallet: $${data.walletAddress}n`;

    message += `<b>🔗 Transaction:</b>\n`;
    message += `<a href="${explorerLink}">View on Solscan</a>`;
    
    if (data.feeTransferTxId) {
      const feeTransferLink = `https://solscan.io/tx/${data.feeTransferTxId}`;
      message += `\n<a href="${feeTransferLink}">View Fee Transfer</a>`;
    }
    
    return message;
  }

  async sendAlert(title: string, message: string): Promise<void> {
    const text = `⚠️ <b>${title}</b>\n\n${message}`;
    await this.sendMessage(text);
  }

  /**
   * ✅ Отправить успешное уведомление
   */
  async sendSuccess(title: string, message: string): Promise<void> {
    const text = `✅ <b>${title}</b>\n\n${message}`;
    await this.sendMessage(text);
  }

  /**
   * ❌ Отправить ошибку
   */
  async sendError(title: string, error: string): Promise<void> {
    const text = `❌ <b>${title}</b>\n\n<code>${error}</code>`;
    await this.sendMessage(text);
  }

  /**
   * 📸 Отправить фото с подписью
   */
  async sendPhoto(photoUrl: string, caption?: string): Promise<void> {
    if (!this.botToken || !this.chatId) return;

    try {
      await axios.post(`${this.apiUrl}/sendPhoto`, {
        chat_id: this.chatId,
        photo: photoUrl,
        caption,
        parse_mode: 'HTML',
      });
    } catch (error) {
      this.logger.error(`Failed to send photo: ${error.message}`);
    }
  }

  /**
   * 📊 Отправить документ
   */
  async sendDocument(documentUrl: string, caption?: string): Promise<void> {
    if (!this.botToken || !this.chatId) return;

    try {
      await axios.post(`${this.apiUrl}/sendDocument`, {
        chat_id: this.chatId,
        document: documentUrl,
        caption,
        parse_mode: 'HTML',
      });
    } catch (error) {
      this.logger.error(`Failed to send document: ${error.message}`);
    }
  }
 
  async sendTestMessage(): Promise<boolean> {
    try {
      await this.sendMessage('✅ Telegram bot is working!');
      return true;
    } catch (error) {
      this.logger.error(`Test message failed: ${error.message}`);
      return false;
    }
  }
}