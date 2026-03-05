import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { TransactionType, Transaction } from './transaction.entity';
import { IsOptional } from 'class-validator';


interface CreateTransactionDto {
  positionId: string;
  type: TransactionType;
  txHash: string;
  poolId: string;
  baseAmount: number;
  baseSymbol: string;
  quoteAmount: number;
  quoteSymbol: string;
  solPrice: number;
  walletBalanceUSD: number;
  profitUSD?: number;
}

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) { }

  /**
   * Сохранение транзакции в БД
   */
  async saveTransaction(dto: CreateTransactionDto): Promise<Transaction> {
    try {
      const baseValueUSD = dto.baseAmount * dto.solPrice;
      const quoteValueUSD = dto.quoteAmount;
      const positionBalanceUSD = baseValueUSD + quoteValueUSD;

      const transaction = this.transactionRepository.create({
        positionId: dto.positionId,
        type: dto.type,
        txHash: dto.txHash,
        poolId: dto.poolId,
        baseAmount: dto.baseAmount,
        baseSymbol: dto.baseSymbol,
        baseValueUSD,
        quoteAmount: dto.quoteAmount,
        quoteSymbol: dto.quoteSymbol,
        quoteValueUSD,
        solPrice: dto.solPrice,
        positionBalanceUSD,
        walletBalanceUSD: dto.walletBalanceUSD,
        profitUSD: dto.profitUSD || null,
      });

      const saved = await this.transactionRepository.save(transaction);

      return saved;
    } catch (error) {
      this.logger.error(`Failed to save transaction: ${error.message}`);
      throw error;
    }
  }


  async getStatistics() {
    const allTransactions = await this.transactionRepository.find();

    const openPositions = allTransactions.filter(tx => tx.type === TransactionType.OPEN_POSITION);
    const closePositions = allTransactions.filter(tx => tx.type === TransactionType.CLOSE_POSITION);

    const totalProfit = closePositions
      .filter(tx => tx.profitUSD !== null)
      .reduce((sum, tx) => sum + Number(tx.profitUSD), 0);

    const totalVolume = allTransactions.reduce(
      (sum, tx) => sum + Number(tx.positionBalanceUSD),
      0,
    );

    return {
      totalTransactions: allTransactions.length,
      openPositions: openPositions.length,
      closePositions: closePositions.length,
      totalProfit: totalProfit.toFixed(2),
      totalVolume: totalVolume.toFixed(2),
    };
  }


  async saveSwap(params: {
    positionId: string | null;
    txHash: string;
    poolId: string;
    inputToken: string;
    inputAmount: number;
    outputToken: string;
    outputAmount: number;
    solPrice: number;
    balance: number;
  }) {
    let inputValueUSD: number;
    let outputValueUSD: number;

    if (params.inputToken === 'SOL') {
      inputValueUSD = params.inputAmount * params.solPrice;
      outputValueUSD = params.outputAmount; // USDC
    } else if (params.outputToken === 'SOL') {
      inputValueUSD = params.inputAmount; // USDC
      outputValueUSD = params.outputAmount * params.solPrice;
    } else {
      // ✅ ДОБАВЬТЕ FALLBACK на случай других токенов
      this.logger.warn(`Unknown token pair: ${params.inputToken} -> ${params.outputToken}`);
      inputValueUSD = 0;
      outputValueUSD = 0;
    }

    const lossUSD = inputValueUSD - outputValueUSD;

    const swap = this.transactionRepository.create({
      positionId: params.positionId,
      type: TransactionType.SWAP,
      txHash: params.txHash,
      poolId: params.poolId,
      baseAmount: params.inputAmount,
      baseSymbol: params.inputToken,
      baseValueUSD: inputValueUSD,
      quoteAmount: params.outputAmount,
      quoteSymbol: params.outputToken,
      quoteValueUSD: outputValueUSD,
      profitUSD: -lossUSD,
      solPrice: params.solPrice,
      positionBalanceUSD: 0,
      walletBalanceUSD: params.balance
    });

    await this.transactionRepository.save(swap);
  }

  async updateTransaction(
    balance: number,
    price: number,
    positionId: string,
    baseAmount?: number,
    baseValueUSD?: number,
    quoteAmount?: number,
    quoteValueUSD?: number,
  ) {
    const transaction = await this.transactionRepository.findOne({
      where: { positionId, type: TransactionType.OPEN_POSITION }
    });

    if (!transaction) {
      throw new Error('Open position transaction not found');
    }

    const current = {
      baseAmount: this.toNumber(transaction.baseAmount),
      baseValueUSD: this.toNumber(transaction.baseValueUSD),
      quoteAmount: this.toNumber(transaction.quoteAmount),
      quoteValueUSD: this.toNumber(transaction.quoteValueUSD),
    };

    if (baseAmount !== undefined) current.baseAmount += baseAmount;
    if (baseValueUSD !== undefined) current.baseValueUSD += baseValueUSD;
    if (quoteAmount !== undefined) current.quoteAmount += quoteAmount;
    if (quoteValueUSD !== undefined) current.quoteValueUSD += quoteValueUSD;

    const newPositionBalanceUSD = current.baseValueUSD + current.quoteValueUSD;
    transaction.baseAmount = current.baseAmount as any;
    transaction.baseValueUSD = current.baseValueUSD as any;
    transaction.quoteAmount = current.quoteAmount as any;
    transaction.quoteValueUSD = current.quoteValueUSD as any;
    transaction.positionBalanceUSD = newPositionBalanceUSD as any;
    transaction.solPrice = price
    const currentBalance = current.baseValueUSD + current.quoteValueUSD + balance
    transaction.walletBalanceUSD = currentBalance
    const saved = await this.transactionRepository.save(transaction);


    return saved;
  }


  private toNumber(value: any): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return parseFloat(value) || 0;
    return 0;
  }

  /**
   * Получить историю по позиции
   */
  async getTransactionsByPosition(positionId: string): Promise<Transaction> {
    return this.transactionRepository.findOne({
      where: { positionId },
    });
  }


  async getAllTransactions(limit = 100): Promise<Transaction[]> {
    return this.transactionRepository.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }


  async getOpenTransaction(positionId: string): Promise<Transaction | null> {
    return this.transactionRepository.findOne({
      where: {
        positionId,
        type: TransactionType.OPEN_POSITION
      },
      order: { createdAt: 'DESC' },
    });
  }



  async getTransactionsGrouped(limit = 50): Promise<any[]> {
    const allTransactions = await this.transactionRepository.find({
      order: { createdAt: 'DESC' },
      take: limit * 3,
    });

    const result: any[] = [];
    const swapBuffer: Transaction[] = [];
    let lastAddPositionId: string | null = null;

    for (const tx of allTransactions) {

      if (tx.type === TransactionType.SWAP) {
        // ✅ Собираем ВСЕ свапы до Remove Liquidity
        swapBuffer.push(tx);
      }

      else if (tx.type === TransactionType.OPEN_POSITION) {
        // ✅ Запоминаем ID открытой позиции
        lastAddPositionId = tx.positionId;
        result.push(this.formatTransaction(tx));
      }

      else if (tx.type === TransactionType.CLOSE_POSITION) {
        // ✅ Remove Liquidity - группируем ВСЕ свапы выше для lastAddPositionId
        if (swapBuffer.length > 0 && lastAddPositionId) {
          result.push(this.createSwapGroupForPosition([...swapBuffer], lastAddPositionId));
          swapBuffer.length = 0;
        }

        result.push(this.formatTransaction(tx));
        lastAddPositionId = null;
      }
    }

    // Оставшиеся свапы (самые новые, без Remove)
    if (swapBuffer.length > 0 && lastAddPositionId) {
      result.push(this.createSwapGroupForPosition(swapBuffer, lastAddPositionId));
    }

    return result.slice(0, limit);
  }


  /**
   * Создать группу свапов для конкретной позиции
   */
  private createSwapGroupForPosition(swaps: Transaction[], positionId: string): any {
    // swaps приходят в порядке DESC (от новых к старым)
    const lastSwap = swaps[0]; // Самый НОВЫЙ свап
    const firstSwap = swaps[swaps.length - 1]; // Самый СТАРЫЙ свап

    // Суммируем profit/loss
    const totalProfitUSD = swaps.reduce((sum, swap) =>
      sum + this.toNumber(swap.profitUSD),
      0
    ).toFixed(2);


    return {
      id: `swap-group-${positionId}`,
      type: 'SWAP_GROUP',
      positionId,
      swapCount: swaps.length,
      date: lastSwap.createdAt, // ✅ Дата ПОСЛЕДНЕГО (самого нового) свапа
      swaps: swaps.reverse().map((s, idx) => ({ // ✅ Разворачиваем в хронологическом порядке
        id: s.id,
        index: idx + 1,
        txHash: s.txHash,
        date: s.createdAt,
        inputToken: s.baseSymbol,
        inputAmount: s.baseAmount,
        inputValueUSD: s.baseValueUSD,
        outputToken: s.quoteSymbol,
        outputAmount: s.quoteAmount,
        outputValueUSD: s.quoteValueUSD,
        profitUSD: s.profitUSD,
      })),
      totalProfitUSD,
      solPrice: lastSwap.solPrice, // ✅ Курс на момент ПОСЛЕДНЕГО свапа
      walletBalanceUSD: lastSwap.walletBalanceUSD,
    };
  }

  /**
   * Форматировать обычную транзакцию
   */
  private formatTransaction(tx: Transaction): any {
    return {
      id: tx.id,
      positionId: tx.positionId,
      type: tx.type,
      date: tx.createdAt,
      txHash: tx.txHash,
      baseToken: {
        symbol: tx.baseSymbol,
        amount: tx.baseAmount,
        valueUSD: tx.baseValueUSD,
      },
      quoteToken: {
        symbol: tx.quoteSymbol,
        amount: tx.quoteAmount,
        valueUSD: tx.quoteValueUSD,
      },
      solPrice: tx.solPrice,
      positionBalanceUSD: tx.positionBalanceUSD,
      walletBalanceUSD: tx.walletBalanceUSD,
      profit: tx.profitUSD !== null ? {
        usd: this.toNumber(tx.profitUSD),
      } : null,
    };
  }

  async calculateProfitForPeriod(startDate: Date, endDate: Date): Promise<{
    totalNetProfit: number;
    avgProfit: number;
    operations: number;
    profitableOps: number;
    lossOps: number;
    transactions: ProfitTransaction[];
  }> {

    // Получить все ADD_LIQUIDITY транзакции за период
    const transactions = await this.transactionRepository.find({
      where: {
        type: TransactionType.OPEN_POSITION,
        createdAt: Between(startDate, endDate),
      },
      order: {
        createdAt: 'ASC',
      },
    });

    if (transactions.length === 0) {
      return {
        totalNetProfit: 0,
        avgProfit: 0,
        operations: 0,
        profitableOps: 0,
        lossOps: 0,
        transactions: [],
      };
    }

    // Рассчитать прибыль для каждой транзакции
    const profitTransactions: ProfitTransaction[] = [];
    let previousBalance = 0;

    for (const tx of transactions) {
      const currentBalance = Number(tx.walletBalanceUSD);

      // Первая транзакция - берем начальный баланс из OPEN_POSITION
      if (previousBalance === 0) {
        const openTx = await this.transactionRepository.findOne({
          where: {
            positionId: tx.positionId,
            type: TransactionType.OPEN_POSITION,
          },
        });
        previousBalance = openTx ? Number(openTx.walletBalanceUSD) : currentBalance;
      }

      const profit = currentBalance - previousBalance;

      profitTransactions.push({
        id: tx.id,
        positionId: tx.positionId,
        date: tx.createdAt,
        previousBalance,
        currentBalance,
        profit,
        solPrice: Number(tx.solPrice),
      });

      previousBalance = currentBalance;
    }

    // Статистика
    const totalNetProfit = profitTransactions.reduce((sum, t) => sum + t.profit, 0);
    const avgProfit = totalNetProfit / profitTransactions.length;
    const profitableOps = profitTransactions.filter(t => t.profit > 0).length;
    const lossOps = profitTransactions.filter(t => t.profit < 0).length;

    return {
      totalNetProfit,
      avgProfit,
      operations: profitTransactions.length,
      profitableOps,
      lossOps,
      transactions: profitTransactions,
    };
  }

  /**
   * Получить статистику за месяц
   */
  async getMonthlyProfit(year: number, month: number): Promise<MonthlyProfitStats> {

    const startDate = new Date(year, month - 1, 1); // month - 1 потому что JS месяцы с 0
    const endDate = new Date(year, month, 0, 23, 59, 59); // последний день месяца

    const result = await this.calculateProfitForPeriod(startDate, endDate);

    return {
      year,
      month,
      totalNetProfit: result.totalNetProfit,
      avgProfit: result.avgProfit,
      operations: result.operations,
      profitableOps: result.profitableOps,
      lossOps: result.lossOps,
      successRate: result.operations > 0
        ? (result.profitableOps / result.operations) * 100
        : 0,
    };
  }

  /**
   * Получить статистику за все время
   */
  async getAllTimeProfit(): Promise<AllTimeProfitStats> {

    // Все ADD_LIQUIDITY транзакции
    const transactions = await this.transactionRepository.find({
      where: {
        type: TransactionType.OPEN_POSITION,
      },
      order: {
        createdAt: 'ASC',
      },
    });

    if (transactions.length === 0) {
      return {
        totalNetProfit: 0,
        avgProfit: 0,
        operations: 0,
        profitableOps: 0,
        lossOps: 0,
        successRate: 0,
        monthlyBreakdown: [],
      };
    }

    // Группировка по месяцам
    const monthlyMap = new Map<string, Transaction[]>();

    for (const tx of transactions) {
      const date = new Date(tx.createdAt);
      const key = `${date.getFullYear()}-${date.getMonth() + 1}`;

      if (!monthlyMap.has(key)) {
        monthlyMap.set(key, []);
      }
      monthlyMap.get(key)!.push(tx);
    }

    // Рассчитать прибыль по месяцам
    const monthlyBreakdown: MonthlyBreakdown[] = [];
    let totalProfit = 0;
    let totalOps = 0;
    let totalProfitableOps = 0;
    let totalLossOps = 0;

    for (const [key, txs] of monthlyMap.entries()) {
      const [year, month] = key.split('-').map(Number);
      const monthStats = await this.getMonthlyProfit(year, month);

      monthlyBreakdown.push({
        year,
        month,
        profit: monthStats.totalNetProfit,
        operations: monthStats.operations,
        avgProfit: monthStats.avgProfit,
      });

      totalProfit += monthStats.totalNetProfit;
      totalOps += monthStats.operations;
      totalProfitableOps += monthStats.profitableOps;
      totalLossOps += monthStats.lossOps;
    }

    const avgProfit = totalOps > 0 ? totalProfit / totalOps : 0;
    const successRate = totalOps > 0 ? (totalProfitableOps / totalOps) * 100 : 0;

    return {
      totalNetProfit: totalProfit,
      avgProfit,
      operations: totalOps,
      profitableOps: totalProfitableOps,
      lossOps: totalLossOps,
      successRate,
      monthlyBreakdown: monthlyBreakdown.sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
      }),
    };
  }

  /**
   * Получить детальную историю прибыли для позиции
   */
  async getPositionProfitHistory(positionId: string): Promise<ProfitTransaction[]> {

    const transactions = await this.transactionRepository.find({
      where: {
        positionId,
        type: TransactionType.OPEN_POSITION,
      },
      order: {
        createdAt: 'ASC',
      },
    });

    // Получить начальный баланс из OPEN
    const openTx = await this.transactionRepository.findOne({
      where: {
        positionId,
        type: TransactionType.OPEN_POSITION,
      },
    });

    let previousBalance = openTx ? Number(openTx.walletBalanceUSD) : 0;
    const profitHistory: ProfitTransaction[] = [];

    for (const tx of transactions) {
      const currentBalance = Number(tx.walletBalanceUSD);
      const profit = currentBalance - previousBalance;

      profitHistory.push({
        id: tx.id,
        positionId: tx.positionId,
        date: tx.createdAt,
        previousBalance,
        currentBalance,
        profit,
        solPrice: Number(tx.solPrice),
      });

      previousBalance = currentBalance;
    }

    return profitHistory;
  }
}
