import { Global, Module } from '@nestjs/common';
import { SolanaService } from './solana.service';
import { VaultProgramService } from './vault-program.service';
import { SmartWalletProgramService } from './smart-wallet-program.service';

@Global()
@Module({
  providers: [SolanaService, VaultProgramService, SmartWalletProgramService],
  exports: [SolanaService, VaultProgramService, SmartWalletProgramService],
})
export class SolanaModule {}
