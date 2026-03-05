import { Injectable, Logger } from '@nestjs/common';
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Keypair, AccountMeta, Transaction } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  createApproveInstruction,
} from '@solana/spl-token';
import { SolanaService } from './solana.service';
import { ConfigService } from '@nestjs/config';
import { BN } from '@coral-xyz/anchor';

@Injectable()
export class SmartWalletProgramService {
  private readonly logger = new Logger(SmartWalletProgramService.name);

  constructor(
    private readonly solana: SolanaService,
    private readonly config: ConfigService,
  ) {}

  // ─── State reads ─────────────────────────────────────────────────────────────

  async getWalletState(owner: PublicKey) {
    const walletPda = this.solana.getSmartWalletPda(owner);
    try {
      return await this.solana.smartWalletProgram.account.smartWallet.fetch(walletPda);
    } catch {
      return null; // wallet not yet created
    }
  }

  async walletExists(owner: PublicKey): Promise<boolean> {
    return (await this.getWalletState(owner)) !== null;
  }

  // ─── Owner: create wallet ─────────────────────────────────────────────────────
  // Returns an unsigned Transaction — frontend signs with owner's wallet.
  // IDL accounts: user, wallet, sol_treasury, usdc_treasury, wsol_mint, usdc_mint,
  //               token_program, system_program, rent

  async buildCreateWalletTx(owner: PublicKey) {
    const wsolMint = new PublicKey(this.config.get<string>('WSOL_MINT'));
    const usdcMint = new PublicKey(this.config.get<string>('USDC_MINT'));
    const walletPda = this.solana.getSmartWalletPda(owner);

    return this.solana.smartWalletProgram.methods
      .createWallet()
      .accounts({
        user: owner,
        wallet: walletPda,
        wsolMint,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      } as any)
      .transaction();
  }

  // ─── Owner: set delegate ──────────────────────────────────────────────────────
  // Frontend signs — sets backend admin as delegate so it can manage positions.
  // IDL accounts: user, wallet

  async buildSetDelegateTx(owner: PublicKey) {
    const walletPda = this.solana.getSmartWalletPda(owner);
    const delegate = this.solana.adminKeypair.publicKey;

    // wallet PDA is auto-resolved by Anchor (seeds: ["smart_wallet", user])
    return this.solana.smartWalletProgram.methods
      .setDelegate(delegate)
      .accounts({
        user: owner,
      })
      .transaction();
  }

  // ─── Owner: set paused ────────────────────────────────────────────────────────
  // IDL accounts: user, wallet — owner signs (not delegate)
  // Frontend must sign this one.

  async buildSetPausedTx(owner: PublicKey, paused: boolean) {
    // wallet PDA is auto-resolved by Anchor (seeds: ["smart_wallet", user])
    return this.solana.smartWalletProgram.methods
      .setPaused(paused)
      .accounts({
        user: owner,
      })
      .transaction();
  }

  // ─── Delegate: swap in treasury ───────────────────────────────────────────────
  // IDL accounts: operator, wallet, sol_treasury, usdc_treasury, amm_config,
  //   pool_state, input_vault, output_vault, observation_state,
  //   input_vault_mint, output_vault_mint, clmm_program, token_program,
  //   token_program_2022, memo_program

  async swapInTreasury(
    owner: PublicKey,
    amountIn: number,
    minimumAmountOut: number,
    direction: { solToUsdc: Record<string, never> } | { usdcToSol: Record<string, never> },
    clmmAccounts: {
      ammConfig: PublicKey;
      poolState: PublicKey;
      inputVault: PublicKey;
      outputVault: PublicKey;
      observationState: PublicKey;
      inputVaultMint: PublicKey;
      outputVaultMint: PublicKey;
      clmmProgram: PublicKey;
      tokenProgram2022: PublicKey;
      memoProgram: PublicKey;
    },
    remainingAccounts?: AccountMeta[],
  ): Promise<string> {
    const walletPda = this.solana.getSmartWalletPda(owner);

    const builder = this.solana.smartWalletProgram.methods
      .swapInTreasury(new BN(amountIn), new BN(minimumAmountOut), direction)
      .accounts({
        operator: this.solana.adminKeypair.publicKey,
        wallet: walletPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        ...clmmAccounts,
      } as any)
      .signers([this.solana.adminKeypair]);

    if (remainingAccounts?.length) {
      builder.remainingAccounts(remainingAccounts);
    }

    const tx = await builder.rpc();

    this.logger.log(`[${owner.toBase58()}] swapInTreasury tx: ${tx}`);
    return tx;
  }

  // ─── Delegate: open position ──────────────────────────────────────────────────
  // IDL accounts: operator, wallet, sol_treasury, usdc_treasury, pool_state,
  //   position_nft_mint, position_nft_account, personal_position, tick_array_lower,
  //   tick_array_upper, token_vault_0, token_vault_1, vault_0_mint, vault_1_mint,
  //   tick_array_bitmap, clmm_program, rent, system_program, token_program,
  //   token_program_2022, associated_token_program

  async openPosition(
    owner: PublicKey,
    params: {
      tickLowerIndex: number;
      tickUpperIndex: number;
      tickArrayLowerStartIndex: number;
      tickArrayUpperStartIndex: number;
      liquidity: BN;
      amount0Max: number;
      amount1Max: number;
    },
    clmmAccounts: Record<string, PublicKey>,
    // positionNftMint must also be a signer (init constraint on the account).
    // If not provided, a new keypair is generated internally.
    positionNftMintKeypair?: Keypair,
  ): Promise<string> {
    const walletPda = this.solana.getSmartWalletPda(owner);
    const mintKeypair = positionNftMintKeypair ?? Keypair.generate();

    // Ensure positionNftMint in accounts matches the keypair
    const accounts = {
      ...clmmAccounts,
      positionNftMint: mintKeypair.publicKey,
    };

    const tx = await this.solana.smartWalletProgram.methods
      .openPosition(
        params.tickLowerIndex,
        params.tickUpperIndex,
        params.tickArrayLowerStartIndex,
        params.tickArrayUpperStartIndex,
        params.liquidity,
        new BN(params.amount0Max),
        new BN(params.amount1Max),
      )
      .accounts({
        operator: this.solana.adminKeypair.publicKey,
        wallet: walletPda,
        ...accounts,
      } as any)
      .signers([this.solana.adminKeypair, mintKeypair])
      .rpc();

    this.logger.log(`[${owner.toBase58()}] openPosition tx: ${tx} | mint: ${mintKeypair.publicKey.toBase58()}`);
    return tx;
  }

  // ─── Delegate: close position ─────────────────────────────────────────────────
  // IDL accounts: operator, wallet, sol_treasury, usdc_treasury, pool_state,
  //   position_nft_mint, position_nft_account, personal_position, token_vault_0/1,
  //   tick_array_lower/upper, vault_0/1_mint, clmm_program, token_program*,
  //   memo_program, system_program

  async closePosition(
    owner: PublicKey,
    amount0Min: number,
    amount1Min: number,
    clmmAccounts: Record<string, PublicKey>,
  ): Promise<string> {
    const walletPda = this.solana.getSmartWalletPda(owner);

    const tx = await this.solana.smartWalletProgram.methods
      .closePosition(new BN(amount0Min), new BN(amount1Min))
      .accounts({
        operator: this.solana.adminKeypair.publicKey,
        wallet: walletPda,
        ...clmmAccounts,
      } as any)
      .signers([this.solana.adminKeypair])
      .rpc();

    this.logger.log(`[${owner.toBase58()}] closePosition tx: ${tx}`);
    return tx;
  }

  // ─── Delegate: collect fees ───────────────────────────────────────────────────
  // IDL accounts: operator, wallet, sol_treasury, usdc_treasury, pool_state,
  //   position_nft_account, personal_position, token_vault_0/1, tick_array_lower/upper,
  //   vault_0/1_mint, clmm_program, token_program*, memo_program

  async collectFees(
    owner: PublicKey,
    clmmAccounts: Record<string, PublicKey>,
  ): Promise<string> {
    const walletPda = this.solana.getSmartWalletPda(owner);

    const tx = await this.solana.smartWalletProgram.methods
      .collectFees()
      .accounts({
        operator: this.solana.adminKeypair.publicKey,
        wallet: walletPda,
        ...clmmAccounts,
      } as any)
      .signers([this.solana.adminKeypair])
      .rpc();

    this.logger.log(`[${owner.toBase58()}] collectFees tx: ${tx}`);
    return tx;
  }

  // ─── Delegate: increase / decrease liquidity ──────────────────────────────────

  async increaseLiquidity(
    owner: PublicKey,
    liquidity: BN,
    amount0Max: number,
    amount1Max: number,
    clmmAccounts: Record<string, PublicKey>,
  ): Promise<string> {
    const walletPda = this.solana.getSmartWalletPda(owner);

    const tx = await this.solana.smartWalletProgram.methods
      .increaseLiquidity(liquidity, new BN(amount0Max), new BN(amount1Max))
      .accounts({
        operator: this.solana.adminKeypair.publicKey,
        wallet: walletPda,
        ...clmmAccounts,
      } as any)
      .signers([this.solana.adminKeypair])
      .rpc();

    this.logger.log(`[${owner.toBase58()}] increaseLiquidity tx: ${tx}`);
    return tx;
  }

  async decreaseLiquidity(
    owner: PublicKey,
    liquidity: BN,
    amount0Min: number,
    amount1Min: number,
    clmmAccounts: Record<string, PublicKey>,
  ): Promise<string> {
    const walletPda = this.solana.getSmartWalletPda(owner);

    const tx = await this.solana.smartWalletProgram.methods
      .decreaseLiquidity(liquidity, new BN(amount0Min), new BN(amount1Min))
      .accounts({
        operator: this.solana.adminKeypair.publicKey,
        wallet: walletPda,
        ...clmmAccounts,
      } as any)
      .signers([this.solana.adminKeypair])
      .rpc();

    this.logger.log(`[${owner.toBase58()}] decreaseLiquidity tx: ${tx}`);
    return tx;
  }

  // ─── Owner: fund treasury ─────────────────────────────────────────────────────
  // Returns a combined unsigned Transaction:
  //   1. Wrap SOL → wSOL ATA (create ATA idempotent + SOL transfer + syncNative)
  //   2. Approve walletPda as delegate on user wSOL ATA (required by contract)
  //   3. fund_treasury — pull wSOL from user ATA into sol_treasury
  // Frontend signs with owner's wallet.

  async buildFundSolTreasuryTx(owner: PublicKey, amountLamports: number): Promise<Transaction> {
    const walletPda   = this.solana.getSmartWalletPda(owner);
    const solTreasury = this.getSolTreasuryPda(walletPda);
    const userWsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, owner);

    const tx = new Transaction();

    // 1. Create wSOL ATA if needed + wrap SOL
    tx.add(createAssociatedTokenAccountIdempotentInstruction(owner, userWsolAta, owner, NATIVE_MINT));
    tx.add(SystemProgram.transfer({ fromPubkey: owner, toPubkey: userWsolAta, lamports: amountLamports }));
    tx.add(createSyncNativeInstruction(userWsolAta));

    // 2. Approve walletPda as delegate — required by fund_treasury NotApproved check
    tx.add(createApproveInstruction(userWsolAta, walletPda, owner, BigInt(amountLamports)));

    // 3. fund_treasury: pull wSOL from user ATA → sol_treasury
    const fundIx = await this.solana.smartWalletProgram.methods
      .fundTreasury(new BN(amountLamports), true)
      .accounts({
        operator:         owner,
        wallet:           walletPda,
        userTokenAccount: userWsolAta,
        treasury:         solTreasury,
        tokenProgram:     TOKEN_PROGRAM_ID,
      } as any)
      .instruction();

    tx.add(fundIx);
    return tx;
  }

  // ─── PDA helpers ─────────────────────────────────────────────────────────────

  getSolTreasuryPda(walletPda: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('wallet_sol'), walletPda.toBuffer()],
      this.solana.smartWalletProgram.programId,
    );
    return pda;
  }

  getUsdcTreasuryPda(walletPda: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('wallet_usdc'), walletPda.toBuffer()],
      this.solana.smartWalletProgram.programId,
    );
    return pda;
  }
}
