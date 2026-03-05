import { Module } from '@nestjs/common';
import { SwapService } from './swap.service';
import { SwapController } from './swap.controller';
import { CommonModule } from '../common/common.module';
import { TransactionModule } from '../transaction/transaction.module';

@Module({
  imports: [
    CommonModule,
    TransactionModule,
  ],
  providers: [SwapService],
  controllers: [SwapController],
  exports: [SwapService],
})
export class SwapModule {}
