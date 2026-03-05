import { Injectable, Logger } from '@nestjs/common';
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
} from '@solana/spl-token';

const RAYDIUM_CLMM_PROGRAM_ID = new PublicKey('CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK');
import { SolanaService } from './solana.service';
import { ConfigService } from '@nestjs/config';
import { BN } from '@coral-xyz/anchor';

@Injectable()
export class VaultProgramService {
  private readonly logger = new Logger(VaultProgramService.name);

  constructor(
    private readonly solana: SolanaService,
    private readonly config: ConfigService,
  ) {}

  // ─── State reads ────────────────────────────────────────────────────────────

  async getVaultState() {
    const vaultPda = this.solana.getVaultPda();
    return this.solana.vaultProgram.account.vault.fetch(vaultPda);
  }

  async getUserDepositState(userPubkey: PublicKey) {
    const vaultPda = this.solana.getVaultPda();
    const depositPda = this.solana.getUserDepositPda(vaultPda, userPubkey);
    try {
      return await this.solana.vaultProgram.account.userDeposit.fetch(depositPda);
    } catch {
      return null; // user has no deposit record yet
    }
  }

  async getUserShareBalance(userPubkey: PublicKey): Promise<BN> {
    const deposit = await this.getUserDepositState(userPubkey);
    return deposit ? new BN(deposit.shares.toString()) : new BN(0);
  }

  // ─── Admin: TVL update ───────────────────────────────────────────────────────
  // Called by backend scheduler to keep on-chain TVL in sync with actual positions

  async updateTvl(tvlUsd: number, solPrice: number): Promise<string> {
    // vault PDA is auto-resolved by Anchor (seeds: ["vault"])
    const tx = await this.solana.vaultProgram.methods
      .updateTvl(new BN(tvlUsd), new BN(solPrice))
      .accounts({
        admin: this.solana.adminKeypair.publicKey,
      })
      .signers([this.solana.adminKeypair])
      .rpc();

    this.logger.log(`updateTvl tx: ${tx} | tvlUsd=${tvlUsd} solPrice=${solPrice}`);
    return tx;
  }

  // ─── Admin: pause / unpause ──────────────────────────────────────────────────

  async setPaused(paused: boolean): Promise<string> {
    // vault PDA is auto-resolved by Anchor (seeds: ["vault"])
    const tx = await this.solana.vaultProgram.methods
      .setPaused(paused)
      .accounts({
        admin: this.solana.adminKeypair.publicKey,
      })
      .signers([this.solana.adminKeypair])
      .rpc();

    this.logger.log(`setPaused(${paused}) tx: ${tx}`);
    return tx;
  }

  // ─── Admin: withdraw to manage / return from manage ──────────────────────────
  // Pull funds out of treasury to admin wallet for rebalancing, then return

  async withdrawToManage(solAmount: number, usdcAmount: number): Promise<string> {
    const vaultPda = this.solana.getVaultPda();
    const wsolMint = new PublicKey(this.config.get<string>('WSOL_MINT'));
    const usdcMint = new PublicKey(this.config.get<string>('USDC_MINT'));

    const adminWsolAta = getAssociatedTokenAddressSync(wsolMint, this.solana.adminKeypair.publicKey);
    const adminUsdcAta = getAssociatedTokenAddressSync(usdcMint, this.solana.adminKeypair.publicKey);

    // IDL accounts: admin, vault, sol_treasury, usdc_treasury, admin_wsol_account, admin_usdc_account, token_program
    const tx = await this.solana.vaultProgram.methods
      .withdrawToManage(new BN(solAmount), new BN(usdcAmount))
      .accounts({
        admin: this.solana.adminKeypair.publicKey,
        vault: vaultPda,
        adminWsolAccount: adminWsolAta,
        adminUsdcAccount: adminUsdcAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .signers([this.solana.adminKeypair])
      .rpc();

    this.logger.log(`withdrawToManage tx: ${tx}`);
    return tx;
  }

  async returnFromManage(solAmount: number, usdcAmount: number): Promise<string> {
    const vaultPda = this.solana.getVaultPda();
    const wsolMint = new PublicKey(this.config.get<string>('WSOL_MINT'));
    const usdcMint = new PublicKey(this.config.get<string>('USDC_MINT'));

    const adminWsolAta = getAssociatedTokenAddressSync(wsolMint, this.solana.adminKeypair.publicKey);
    const adminUsdcAta = getAssociatedTokenAddressSync(usdcMint, this.solana.adminKeypair.publicKey);

    // IDL accounts: admin, vault, sol_treasury, usdc_treasury, admin_wsol_account, admin_usdc_account, token_program
    const tx = await this.solana.vaultProgram.methods
      .returnFromManage(new BN(solAmount), new BN(usdcAmount))
      .accounts({
        admin: this.solana.adminKeypair.publicKey,
        vault: vaultPda,
        adminWsolAccount: adminWsolAta,
        adminUsdcAccount: adminUsdcAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .signers([this.solana.adminKeypair])
      .rpc();

    this.logger.log(`returnFromManage tx: ${tx}`);
    return tx;
  }

  // ─── Admin: collect fees ─────────────────────────────────────────────────────
  // CLMM accounts (poolState, positionNftAccount, tokenVaults, tickArrays etc.)
  // are passed as remainingAccounts — built by LiquidityBotService which knows the pool.

  async collectFees(
    positionNftAccount: PublicKey,
    remainingAccounts: any[],
  ): Promise<string> {
    const vaultPda = this.solana.getVaultPda();

    // IDL accounts: admin, vault, sol_treasury, usdc_treasury, pool_state,
    //   position_nft_account, personal_position, token_vault_0..., clmm_program, token_program*
    const tx = await this.solana.vaultProgram.methods
      .collectFees()
      .accounts({
        admin: this.solana.adminKeypair.publicKey,
        vault: vaultPda,
        positionNftAccount,
      } as any)
      .remainingAccounts(remainingAccounts)
      .signers([this.solana.adminKeypair])
      .rpc();

    this.logger.log(`collectFees tx: ${tx}`);
    return tx;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /** Derive SOL treasury PDA for the vault */
  getSolTreasuryPda(): PublicKey {
    const vaultPda = this.solana.getVaultPda();
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('sol_treasury'), vaultPda.toBuffer()],
      this.solana.vaultProgram.programId,
    );
    return pda;
  }

  /** Derive USDC treasury PDA for the vault */
  getUsdcTreasuryPda(): PublicKey {
    const vaultPda = this.solana.getVaultPda();
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('usdc_treasury'), vaultPda.toBuffer()],
      this.solana.vaultProgram.programId,
    );
    return pda;
  }

  /** Derive share mint PDA */
  getShareMintPda(): PublicKey {
    const vaultPda = this.solana.getVaultPda();
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('share_mint'), vaultPda.toBuffer()],
      this.solana.vaultProgram.programId,
    );
    return pda;
  }

  /** Get user's share token account (ATA for share mint) */
  getUserShareAta(userPubkey: PublicKey): PublicKey {
    const shareMint = this.getShareMintPda();
    return getAssociatedTokenAddressSync(shareMint, userPubkey);
  }

  // ─── User: build unsigned transactions ──────────────────────────────────────
  // Frontend signs these with the user's wallet, then broadcasts to Solana.

  /**
   * Build an unsigned deposit_sol transaction.
   * Frontend must:
   *   1. Wrap SOL → wSOL before calling this (or include wrap ix here via prependWrap=true)
   *   2. Sign with user wallet
   *   3. Broadcast
   *   4. Call POST /vault/deposit/confirm with txHash
   *
   * @param userPubkey       user's wallet pubkey
   * @param amountLamports   amount in lamports to deposit
   * @param prependWrap      if true, prepend wrap-SOL instructions (user sends native SOL)
   */
  async buildDepositSolTx(
    userPubkey: PublicKey,
    amountLamports: number,
    prependWrap = true,
  ): Promise<Transaction> {
    const wsolMint  = NATIVE_MINT;
    const vaultPda  = this.solana.getVaultPda();
    const shareMint = this.getShareMintPda();
    const solTreas  = this.getSolTreasuryPda();

    const userWsolAta  = getAssociatedTokenAddressSync(wsolMint, userPubkey);
    const userShareAta = getAssociatedTokenAddressSync(shareMint, userPubkey);

    const [userDepositPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('user_deposit'), vaultPda.toBuffer(), userPubkey.toBuffer()],
      this.solana.vaultProgram.programId,
    );

    // Build deposit instruction via Anchor
    const depositIx = await this.solana.vaultProgram.methods
      .depositSol(new BN(amountLamports))
      .accounts({
        user:             userPubkey,
        vault:            vaultPda,
        userDeposit:      userDepositPda,
        userWsolAccount:  userWsolAta,
        solTreasury:      solTreas,
        shareMint:        shareMint,
        userShareAccount: userShareAta,
        wsolMint:         wsolMint,
        tokenProgram:     TOKEN_PROGRAM_ID,
        systemProgram:    SystemProgram.programId,
      } as any)
      .instruction();

    const tx = new Transaction();

    if (prependWrap) {
      // Create wSOL ATA if needed
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          userPubkey, userWsolAta, userPubkey, wsolMint,
        ),
      );
      // Transfer SOL → wSOL ATA
      tx.add(
        SystemProgram.transfer({
          fromPubkey: userPubkey,
          toPubkey:   userWsolAta,
          lamports:   amountLamports,
        }),
      );
      // Sync native balance
      tx.add(createSyncNativeInstruction(userWsolAta));
    }

    // Create share ATA if needed
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        userPubkey, userShareAta, userPubkey, shareMint,
      ),
    );

    tx.add(depositIx);

    // Attach recent blockhash so it's ready to sign
    const { blockhash, lastValidBlockHeight } =
      await this.solana.connection.getLatestBlockhash();
    tx.recentBlockhash     = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer            = userPubkey;

    return tx;
  }

  /**
   * Build an unsigned withdraw transaction.
   * Withdraws ALL shares → returns proportional SOL (wSOL) + USDC to user.
   * Frontend signs with user wallet.
   */
  async buildWithdrawTx(userPubkey: PublicKey): Promise<Transaction> {
    const wsolMint  = NATIVE_MINT;
    const usdcMint  = new PublicKey(this.config.get<string>('USDC_MINT'));
    const vaultPda  = this.solana.getVaultPda();
    const shareMint = this.getShareMintPda();
    const solTreas  = this.getSolTreasuryPda();
    const usdcTreas = this.getUsdcTreasuryPda();

    const userWsolAta  = getAssociatedTokenAddressSync(wsolMint, userPubkey);
    const userUsdcAta  = getAssociatedTokenAddressSync(usdcMint, userPubkey);
    const userShareAta = getAssociatedTokenAddressSync(shareMint, userPubkey);

    const [userDepositPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('user_deposit'), vaultPda.toBuffer(), userPubkey.toBuffer()],
      this.solana.vaultProgram.programId,
    );

    const withdrawIx = await this.solana.vaultProgram.methods
      .withdraw()
      .accounts({
        user:             userPubkey,
        vault:            vaultPda,
        userDeposit:      userDepositPda,
        shareMint:        shareMint,
        userShareAccount: userShareAta,
        solTreasury:      solTreas,
        usdcTreasury:     usdcTreas,
        userWsolAccount:  userWsolAta,
        userUsdcAccount:  userUsdcAta,
        tokenProgram:     TOKEN_PROGRAM_ID,
      } as any)
      .instruction();

    const tx = new Transaction();

    // Create ATAs if they don't exist
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        userPubkey, userWsolAta, userPubkey, wsolMint,
      ),
    );
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        userPubkey, userUsdcAta, userPubkey, usdcMint,
      ),
    );

    tx.add(withdrawIx);

    const { blockhash, lastValidBlockHeight } =
      await this.solana.connection.getLatestBlockhash();
    tx.recentBlockhash     = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer            = userPubkey;

    return tx;
  }

  /**
   * Estimate how many shares will be minted for a given SOL deposit.
   * Uses current on-chain vault state.
   */
  async estimateSharesForSol(amountLamports: number): Promise<{
    sharesToMint: number;
    pricePerShareUsd: number;
    depositValueUsd: number;
  }> {
    const vault = await this.getVaultState() as any;
    const tvlUsd       = vault.tvlUsd.toNumber();       // 6 decimals
    const solPriceUsd  = vault.solPriceUsd.toNumber();  // 6 decimals
    const totalShares  = vault.totalShares.toNumber();

    const depositValueUsd = (amountLamports / 1e9) * (solPriceUsd / 1e6) * 1e6; // in 6-dec units

    let sharesToMint: number;
    if (totalShares === 0 || tvlUsd === 0) {
      sharesToMint = depositValueUsd; // initial price = 1 USD per share
    } else {
      sharesToMint = Math.floor((depositValueUsd * totalShares) / tvlUsd);
    }

    const pricePerShareUsd = totalShares > 0 ? tvlUsd / totalShares : 1;

    return {
      sharesToMint,
      pricePerShareUsd,               // USD per share (6 dec)
      depositValueUsd: depositValueUsd / 1e6, // human USD
    };
  }

  // ─── Admin: increase liquidity ──────────────────────────────────────────────
  /**
   * Adds idle treasury funds into the active CLMM position.
   *
   * Reads vault state to get position_mint, tick_lower, tick_upper, pool_id,
   * derives all Raydium accounts, then calls increase_liquidity on the vault program.
   *
   * @param liquidity   0 = let contract calculate from amounts (base_flag=true)
   * @param amount0Max  lamports from sol_treasury to deploy
   * @param amount1Max  micro-USDC from usdc_treasury to deploy
   */
  async increaseLiquidity(
    liquidity: number,
    amount0Max: number,
    amount1Max: number,
  ): Promise<string> {
    const vault = await this.getVaultState() as any;

    if (!vault.hasActivePosition) {
      throw new Error('No active position');
    }

    const vaultPda      = this.solana.getVaultPda();
    const solTreasury   = this.getSolTreasuryPda();
    const usdcTreasury  = this.getUsdcTreasuryPda();

    const poolId       = vault.positionPoolId as PublicKey;
    const positionMint = vault.positionMint   as PublicKey;
    const tickLower    = vault.positionTickLower as number;
    const tickUpper    = vault.positionTickUpper as number;

    // Read pool state to get tokenVault0/1 and tickSpacing
    const poolInfo = await this.readPoolState(poolId);

    // Position NFT account — vault PDA owns it, minted with TOKEN_2022
    const positionNftAccount = getAssociatedTokenAddressSync(
      positionMint,
      vaultPda,
      true,                   // allowOwnerOffCurve (PDA as owner)
      TOKEN_2022_PROGRAM_ID,
    );

    const personalPosition  = this.derivePersonalPositionPda(positionMint);
    const tickArrayLowerStart = this.getTickArrayStartIndex(tickLower, poolInfo.tickSpacing);
    const tickArrayUpperStart = this.getTickArrayStartIndex(tickUpper, poolInfo.tickSpacing);
    const tickArrayLower = this.deriveTickArrayPda(poolId, tickArrayLowerStart);
    const tickArrayUpper = this.deriveTickArrayPda(poolId, tickArrayUpperStart);

    const wsolMint = NATIVE_MINT;
    const usdcMint = new PublicKey(this.config.get<string>('USDC_MINT'));

    const tx = await this.solana.vaultProgram.methods
      .increaseLiquidity(new BN(liquidity), new BN(amount0Max), new BN(amount1Max))
      .accounts({
        admin:              this.solana.adminKeypair.publicKey,
        vault:              vaultPda,
        solTreasury,
        usdcTreasury,
        poolState:          poolId,
        positionNftAccount,
        personalPosition,
        tokenVault0:        poolInfo.tokenVault0,
        tokenVault1:        poolInfo.tokenVault1,
        tickArrayLower,
        tickArrayUpper,
        vault0Mint:         wsolMint,
        vault1Mint:         usdcMint,
        clmmProgram:        RAYDIUM_CLMM_PROGRAM_ID,
        tokenProgram:       TOKEN_PROGRAM_ID,
        tokenProgram2022:   TOKEN_2022_PROGRAM_ID,
      } as any)
      .signers([this.solana.adminKeypair])
      .rpc();

    this.logger.log(`increaseLiquidity tx: ${tx} | sol=${amount0Max} usdc=${amount1Max}`);
    return tx;
  }

  // ─── Pool state helpers ──────────────────────────────────────────────────────

  /**
   * Read Raydium CLMM pool state to extract tokenVault0, tokenVault1, tickSpacing.
   * Layout (after 8-byte discriminator):
   *   bump (1) + amm_config (32) + owner (32) + token_mint_0 (32) + token_mint_1 (32)
   *   + token_vault_0 (32) + token_vault_1 (32) + observation_key (32)
   *   + mint_decimals_0 (1) + mint_decimals_1 (1) + tick_spacing (2)
   */
  private async readPoolState(poolId: PublicKey): Promise<{
    tokenVault0: PublicKey;
    tokenVault1: PublicKey;
    tickSpacing:  number;
  }> {
    const info = await this.solana.connection.getAccountInfo(poolId);
    if (!info) throw new Error(`Pool ${poolId.toBase58()} not found`);
    const data = info.data;

    let offset = 8 + 1 + 32 + 32; // discriminator + bump + amm_config + owner
    offset += 32;                  // token_mint_0
    offset += 32;                  // token_mint_1
    const tokenVault0 = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
    const tokenVault1 = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
    offset += 32;                  // observation_key
    offset += 2;                   // mint_decimals_0 + mint_decimals_1
    const tickSpacing = data.readUInt16LE(offset);

    return { tokenVault0, tokenVault1, tickSpacing };
  }

  /** Raydium CLMM: floor(tick / (tickSpacing * 60)) * (tickSpacing * 60) */
  private getTickArrayStartIndex(tickIndex: number, tickSpacing: number): number {
    const ticksPerArray = tickSpacing * 60;
    return Math.floor(tickIndex / ticksPerArray) * ticksPerArray;
  }

  /** Derive tick_array PDA: seeds = ["tick_array", pool, startIndex (BE i32)] */
  private deriveTickArrayPda(poolId: PublicKey, startIndex: number): PublicKey {
    const buf = Buffer.alloc(4);
    buf.writeInt32BE(startIndex);
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('tick_array'), poolId.toBuffer(), buf],
      RAYDIUM_CLMM_PROGRAM_ID,
    );
    return pda;
  }

  /** Derive personal_position PDA: seeds = ["position", nft_mint] */
  private derivePersonalPositionPda(nftMint: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), nftMint.toBuffer()],
      RAYDIUM_CLMM_PROGRAM_ID,
    );
    return pda;
  }

  /**
   * Estimate withdrawal amounts for a user's current share balance.
   *
   * Mirrors the on-chain withdraw handler exactly (security audit fix H-03):
   *   sol_to_withdraw  = actual_sol_treasury_balance  * (user_shares / total_shares)
   *   usdc_to_withdraw = actual_usdc_treasury_balance * (user_shares / total_shares)
   *
   * We read the ACTUAL token-account balances of the treasury PDAs,
   * not the vault.treasury_sol/usdc state fields (which can be stale).
   * This gives the user the correct amount they will receive on withdrawal,
   * including any collected fees that are sitting in the treasury.
   */
  async estimateWithdrawal(userPubkey: PublicKey): Promise<{
    shares: number;
    estimatedSolReturn: number;
    estimatedUsdcReturn: number;
    estimatedTotalUsd: number;
  }> {
    const [vault, userDeposit] = await Promise.all([
      this.getVaultState() as Promise<any>,
      this.getUserDepositState(userPubkey),
    ]);

    if (!userDeposit || (userDeposit as any).shares.toNumber() === 0) {
      return { shares: 0, estimatedSolReturn: 0, estimatedUsdcReturn: 0, estimatedTotalUsd: 0 };
    }

    const shares      = (userDeposit as any).shares.toNumber();
    const totalShares = (vault as any).totalShares.toNumber();
    if (totalShares === 0) {
      return { shares, estimatedSolReturn: 0, estimatedUsdcReturn: 0, estimatedTotalUsd: 0 };
    }

    // Read actual on-chain token account balances (same as the contract does)
    const solTreasuryPda  = this.getSolTreasuryPda();
    const usdcTreasuryPda = this.getUsdcTreasuryPda();

    const [solAccountInfo, usdcAccountInfo] = await Promise.all([
      this.solana.connection.getTokenAccountBalance(solTreasuryPda),
      this.solana.connection.getTokenAccountBalance(usdcTreasuryPda),
    ]);

    const actualSolLamports  = Number(solAccountInfo.value.amount);   // lamports
    const actualUsdcMicro    = Number(usdcAccountInfo.value.amount);  // 6 decimals

    const fraction   = shares / totalShares;
    const solReturn  = (actualSolLamports  * fraction) / 1e9;
    const usdcReturn = (actualUsdcMicro    * fraction) / 1e6;
    const solPrice   = (vault as any).solPriceUsd.toNumber() / 1e6;

    return {
      shares,
      estimatedSolReturn:  solReturn,
      estimatedUsdcReturn: usdcReturn,
      estimatedTotalUsd:   solReturn * solPrice + usdcReturn,
    };
  }
}
