import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PositionAnalytics } from './analytic.entity';

@Injectable()
export class PositionAnalyticsService {
  private readonly logger = new Logger(PositionAnalyticsService.name);

  constructor(
    @InjectRepository(PositionAnalytics)
    private readonly analyticsRepository: Repository<PositionAnalytics>,
  ) {}


  async createOnOpen(params: {
    positionId: string;
    poolId: string;
    baseAmount: number;
    quoteAmount: number;
    solPrice: number;
    baseSymbol: string;
    quoteSymbol: string;
  }) {
    const initialValueUSD = params.baseAmount * params.solPrice + params.quoteAmount;

    const analytics = this.analyticsRepository.create({
      positionId: params.positionId,
      poolId: params.poolId,
      initialBaseAmount: params.baseAmount,
      initialQuoteAmount: params.quoteAmount,
      initialSolPrice: params.solPrice,
      initialValueUSD,
      baseSymbol: params.baseSymbol,
      quoteSymbol: params.quoteSymbol,
      status: 'ACTIVE',
    });

    await this.analyticsRepository.save(analytics);

    this.logger.log(`📊 Analytics created for position ${params.positionId.slice(0, 8)}...`);

    return analytics;
  }

  async getAnalyticByPosition(positionId: string){
    try{
      const updated = await this.analyticsRepository.findOne({
        where: { positionId: positionId },
      });
        return updated;
    
      

    }
    catch(err){
      throw new Error(err)
    }
  } 

  /**
   * ✅ Обновить при закрытии позиции
   */
  async updateOnClose(params: {
  positionId: string;
  initialBaseAmount: number;     
  initialQuoteAmount: number;    
  initialValueUSD: number;        
  finalBaseAmount: number;
  finalQuoteAmount: number;
  finalSolPrice: number;
  feesUSD: number;
}) {
  try{
  const analytics = await this.analyticsRepository.findOne({
    where: { positionId: params.positionId },
  });

  if (!analytics) {
    throw new Error('Analytics not found');
  }

  // ✅ Используем правильные initial values
  const initialValueUSD = params.initialValueUSD;
  const initialBaseAmount = params.initialBaseAmount;
  const initialQuoteAmount = params.initialQuoteAmount;
  const totalSwapLossUSD = parseFloat(analytics.totalSwapLossUSD.toString());

  // Final values
  const finalValueUSD = params.finalBaseAmount * params.finalSolPrice + params.finalQuoteAmount;

  // ✅ HODL calculation
  const hodlBaseValueUSD = initialBaseAmount * params.finalSolPrice;
  const hodlQuoteValueUSD = initialQuoteAmount;
  const hodlValueUSD = hodlBaseValueUSD + hodlQuoteValueUSD;

  // ✅ Impermanent Loss
  const impermanentLoss = hodlValueUSD - finalValueUSD;
  const impermanentLossPercent = (impermanentLoss / hodlValueUSD) * 100;

  // Fees
  // Profit
  const grossProfit = finalValueUSD - initialValueUSD;
  const netProfit = grossProfit - impermanentLoss - totalSwapLossUSD + params.feesUSD;
  const roi = (netProfit / initialValueUSD) * 100;

  // Duration
  const durationSeconds = Math.floor(
    (new Date().getTime() - analytics.createdAt.getTime()) / 1000
  );
  const durationHours = durationSeconds / 3600;
  const durationDays = durationSeconds / (24 * 60 * 60);
  
  let dailyRate = 0;
  dailyRate = roi / durationDays;
  const percentPool = (params.feesUSD * 100) / initialValueUSD
  const durationYear =  365 / durationDays 
  const apr = durationYear * percentPool
  await this.analyticsRepository.update(
    { positionId: params.positionId },
    {
      initialBaseAmount,
      initialQuoteAmount,
      initialValueUSD,
      finalBaseAmount: params.finalBaseAmount,
      finalQuoteAmount: params.finalQuoteAmount,
      finalSolPrice: params.finalSolPrice,
      finalValueUSD,
      hodlValueUSD,
      impermanentLoss,
      impermanentLossPercent,
      feesEarnedUSD: params.feesUSD,
      grossProfit,
      netProfit,
      roi,
      apr,
      durationSeconds,
      closedAt: new Date(),
      status: 'CLOSED',
    }
  );

  const updated = await this.analyticsRepository.findOne({
    where: { positionId: params.positionId },
  });

  return updated;
}
  catch(err){
    console.error('err', err)
  }
}


  async addSwap(positionId: string, swapLossUSD: number) {
    const analytics = await this.analyticsRepository.findOne({
      where: { positionId },
    });

    if (!analytics) {
      this.logger.warn(`Analytics not found for position ${positionId}`);
      return;
    }

    analytics.totalSwaps += 1;
    analytics.totalSwapLossUSD += swapLossUSD;

    await this.analyticsRepository.save(analytics);
  }


  async getAnalytics(positionId: string) {
    return this.analyticsRepository.findOne({
      where: { positionId },
    });
  }


  async getAllPositions(status?: string) {
    const where = status ? { status } : {};
    
    return this.analyticsRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }


}