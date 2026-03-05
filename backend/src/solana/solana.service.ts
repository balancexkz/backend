import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { createWalletFromSecretKey } from '../liquidity-bot/utils/solana.utils';
import { Vault } from './types/vault';
import { SmartWallet } from './types/smart_wallet';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const vaultIdl = require('./idl/vault.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const smartWalletIdl = require('./idl/smart_wallet.json');

@Injectable()
export class SolanaService implements OnModuleInit {
  private readonly logger = new Logger(SolanaService.name);

  connection: Connection;
  provider: AnchorProvider;
  adminKeypair: Keypair;
  vaultProgram: Program<Vault>;
  smartWalletProgram: Program<SmartWallet>;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const rpcUrl = this.config.get<string>('SOLANA_RPC_URL');
    this.adminKeypair = createWalletFromSecretKey(
      this.config.get<string>('OWNER_SECRET_KEY'),
    );
    this.connection = new Connection(rpcUrl, 'confirmed');

    const wallet = new anchor.Wallet(this.adminKeypair);
    this.provider = new AnchorProvider(this.connection, wallet, {
      commitment: 'confirmed',
      skipPreflight: false,
    });

    // Anchor 0.30+ reads programId from idl.address
    this.vaultProgram = new Program<Vault>(vaultIdl, this.provider);
    this.smartWalletProgram = new Program<SmartWallet>(smartWalletIdl, this.provider);

    this.logger.log(
      `SolanaService ready | vault: ${vaultIdl.address} | smart_wallet: ${smartWalletIdl.address}`,
    );
  }

  // ─── PDA helpers ────────────────────────────────────────────────────────────

  getVaultPda(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault')],
      this.vaultProgram.programId,
    );
    return pda;
  }

  getSmartWalletPda(owner: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('smart_wallet'), owner.toBuffer()],
      this.smartWalletProgram.programId,
    );
    return pda;
  }

  getUserDepositPda(vaultPda: PublicKey, user: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('user_deposit'), vaultPda.toBuffer(), user.toBuffer()],
      this.vaultProgram.programId,
    );
    return pda;
  }
}
