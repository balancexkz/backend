/**
 * ClmmAccountsBuilderService
 *
 * Builds all Raydium CLMM account references needed by SmartWalletProgramService.
 * Reads pool state directly from Solana RPC — no Raydium SDK dependency.
 *
 * Used exclusively by the PRO role (smart-wallet path).
 * Does NOT touch any existing liquidity-bot logic.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  AccountMeta,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { SolanaService } from '../solana/solana.service';

// ─── Pool state (raw layout) ──────────────────────────────────────────────────

export interface PoolStateData {
  /** AMM config (fee tier) */
  ammConfig: PublicKey;
  owner: PublicKey;
  /** wSOL (token0) */
  tokenMint0: PublicKey;
  /** USDC (token1) */
  tokenMint1: PublicKey;
  /** Raydium-controlled token vault for token0 */
  tokenVault0: PublicKey;
  /** Raydium-controlled token vault for token1 */
  tokenVault1: PublicKey;
  /** Observation state PDA */
  observationKey: PublicKey;
  mintDecimals0: number;
  mintDecimals1: number;
  tickSpacing: number;
  tickCurrent: number;
}

// ─── Tick range ────────────────────────────────────────────────────────────────

export interface TickRange {
  tickLower: number;
  tickUpper: number;
  tickArrayLowerStart: number;
  tickArrayUpperStart: number;
}

// ─── Swap accounts ────────────────────────────────────────────────────────────

export interface SwapClmmAccounts {
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
}

// ─── Open position result ─────────────────────────────────────────────────────

export interface OpenPositionAccountsResult {
  /** Account map to spread into SmartWalletProgramService.openPosition(..., clmmAccounts) */
  accounts: Record<string, PublicKey>;
  /** The generated NFT mint keypair — must be passed to openPosition as positionNftMintKeypair */
  positionNftMintKeypair: Keypair;
  tickArrayLowerStart: number;
  tickArrayUpperStart: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
/** Each tick array covers TICK_ARRAY_SIZE consecutive initializable ticks */
const TICK_ARRAY_SIZE = 60;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ClmmAccountsBuilderService {
  private readonly logger = new Logger(ClmmAccountsBuilderService.name);
  readonly clmmProgram: PublicKey;

  constructor(
    readonly solana: SolanaService,
    private readonly config: ConfigService,
  ) {
    // Mainnet default — override via RAYDIUM_CLMM_PROGRAM_ID env var for devnet
    const programId = this.config.get<string>(
      'RAYDIUM_CLMM_PROGRAM_ID',
      'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
    );
    this.clmmProgram = new PublicKey(programId);
  }

  // ─── Pool state ─────────────────────────────────────────────────────────────

  /**
   * Read raw PoolState from the Raydium CLMM account.
   * Layout from Raydium source: discriminator(8) + bump(1) + ammConfig(32) + owner(32)
   * + tokenMint0(32) + tokenMint1(32) + tokenVault0(32) + tokenVault1(32)
   * + observationKey(32) + mintDecimals0(1) + mintDecimals1(1)
   * + tickSpacing(u16) + liquidity(u128) + sqrtPriceX64(u128) + tickCurrent(i32)
   */
  async readPoolState(poolId: PublicKey): Promise<PoolStateData> {
    const info = await this.solana.connection.getAccountInfo(poolId);
    if (!info) throw new Error(`Pool not found: ${poolId.toBase58()}`);

    const d = info.data;
    let o = 8 + 1; // skip discriminator (8) + bump (1)

    const ammConfig      = new PublicKey(d.slice(o, o + 32)); o += 32;
    const owner          = new PublicKey(d.slice(o, o + 32)); o += 32;
    const tokenMint0     = new PublicKey(d.slice(o, o + 32)); o += 32;
    const tokenMint1     = new PublicKey(d.slice(o, o + 32)); o += 32;
    const tokenVault0    = new PublicKey(d.slice(o, o + 32)); o += 32;
    const tokenVault1    = new PublicKey(d.slice(o, o + 32)); o += 32;
    const observationKey = new PublicKey(d.slice(o, o + 32)); o += 32;
    const mintDecimals0  = d[o++];
    const mintDecimals1  = d[o++];
    const tickSpacing    = d.readUInt16LE(o); o += 2;
    o += 16; // liquidity (u128)
    o += 16; // sqrtPriceX64 (u128)
    const tickCurrent    = d.readInt32LE(o);

    this.logger.debug(
      `Pool ${poolId.toBase58().slice(0, 8)} | tick=${tickCurrent} spacing=${tickSpacing}`,
    );

    return {
      ammConfig, owner,
      tokenMint0, tokenMint1,
      tokenVault0, tokenVault1,
      observationKey,
      mintDecimals0, mintDecimals1,
      tickSpacing, tickCurrent,
    };
  }

  // ─── PDA helpers ────────────────────────────────────────────────────────────

  /** Start index of the tick array that contains the given tick */
  getTickArrayStart(tick: number, tickSpacing: number): number {
    const perArray = tickSpacing * TICK_ARRAY_SIZE;
    let start = Math.floor(tick / perArray) * perArray;
    // Correct for negative ticks that don't fall on array boundaries
    if (tick < 0 && tick % perArray !== 0) start -= perArray;
    return start;
  }

  /** Derive tick array PDA: seeds = ["tick_array", poolId, startIndex_BE_i32] */
  getTickArrayPda(poolId: PublicKey, startIndex: number): PublicKey {
    const buf = Buffer.alloc(4);
    buf.writeInt32BE(startIndex);
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('tick_array'), poolId.toBuffer(), buf],
      this.clmmProgram,
    );
    return pda;
  }

  /** Derive personal position PDA: seeds = ["position", nftMint] */
  getPersonalPositionPda(nftMint: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), nftMint.toBuffer()],
      this.clmmProgram,
    );
    return pda;
  }

  /** Derive tick array bitmap extension PDA: seeds = ["tick_array_bitmap_extension", poolId] */
  getTickArrayBitmapPda(poolId: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('tick_array_bitmap_extension'), poolId.toBuffer()],
      this.clmmProgram,
    );
    return pda;
  }

  // ─── Tick range calculation ──────────────────────────────────────────────────

  /**
   * Calculate a symmetric tick range around the current price.
   *
   * Formula: tickOffset = log(1 + pct) / log(1.0001)
   * — each Raydium CLMM tick represents a price factor of 1.0001.
   *
   * @param tickCurrent  current pool tick
   * @param tickSpacing  pool's tick spacing
   * @param rangePercent percentage range on each side, e.g. 5 = ±5%
   */
  calcTickRange(tickCurrent: number, tickSpacing: number, rangePercent: number): TickRange {
    const pct = rangePercent / 100;
    const tickOffset = Math.round(Math.log(1 + pct) / Math.log(1.0001));

    const tickLower = Math.floor((tickCurrent - tickOffset) / tickSpacing) * tickSpacing;
    const tickUpper = Math.ceil((tickCurrent + tickOffset) / tickSpacing) * tickSpacing;

    return {
      tickLower,
      tickUpper,
      tickArrayLowerStart: this.getTickArrayStart(tickLower, tickSpacing),
      tickArrayUpperStart: this.getTickArrayStart(tickUpper, tickSpacing),
    };
  }

  // ─── Account builders ────────────────────────────────────────────────────────

  /**
   * Build all accounts needed for `open_position`.
   *
   * Generates a fresh positionNftMint keypair (must be passed to SmartWalletProgramService
   * as `positionNftMintKeypair` so it can be included as a transaction signer).
   */
  async buildOpenPositionAccounts(params: {
    poolId: PublicKey;
    walletPda: PublicKey;
    tickLower: number;
    tickUpper: number;
  }): Promise<OpenPositionAccountsResult> {
    const pool = await this.readPoolState(params.poolId);
    const { poolId, walletPda, tickLower, tickUpper } = params;

    const loStart = this.getTickArrayStart(tickLower, pool.tickSpacing);
    const hiStart = this.getTickArrayStart(tickUpper, pool.tickSpacing);

    const positionNftMintKeypair = Keypair.generate();
    const nftMint = positionNftMintKeypair.publicKey;

    // The position NFT is a Token-2022 token held by the walletPda
    const positionNftAccount = getAssociatedTokenAddressSync(
      nftMint,
      walletPda,
      true, // allowOwnerOffCurve — walletPda is a PDA
      TOKEN_2022_PROGRAM_ID,
    );

    const accounts: Record<string, PublicKey> = {
      poolState:              poolId,
      positionNftMint:        nftMint,
      positionNftAccount,
      personalPosition:       this.getPersonalPositionPda(nftMint),
      tickArrayLower:         this.getTickArrayPda(poolId, loStart),
      tickArrayUpper:         this.getTickArrayPda(poolId, hiStart),
      tokenVault0:            pool.tokenVault0,
      tokenVault1:            pool.tokenVault1,
      vault0Mint:             pool.tokenMint0,
      vault1Mint:             pool.tokenMint1,
      tickArrayBitmap:        this.getTickArrayBitmapPda(poolId),
      clmmProgram:            this.clmmProgram,
      rent:                   SYSVAR_RENT_PUBKEY,
      systemProgram:          SystemProgram.programId,
      tokenProgram:           TOKEN_PROGRAM_ID,
      tokenProgram2022:       TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    };

    return {
      accounts,
      positionNftMintKeypair,
      tickArrayLowerStart: loStart,
      tickArrayUpperStart: hiStart,
    };
  }

  /**
   * Build accounts for `close_position`, `collect_fees`,
   * `increase_liquidity`, and `decrease_liquidity`.
   */
  async buildPositionAccounts(params: {
    poolId: PublicKey;
    walletPda: PublicKey;
    positionNftMint: PublicKey;
    tickLower: number;
    tickUpper: number;
  }): Promise<Record<string, PublicKey>> {
    const pool = await this.readPoolState(params.poolId);
    const { poolId, walletPda, positionNftMint, tickLower, tickUpper } = params;

    const loStart = this.getTickArrayStart(tickLower, pool.tickSpacing);
    const hiStart = this.getTickArrayStart(tickUpper, pool.tickSpacing);

    const positionNftAccount = getAssociatedTokenAddressSync(
      positionNftMint,
      walletPda,
      true,
      TOKEN_2022_PROGRAM_ID,
    );

    return {
      poolState:        poolId,
      positionNftMint,
      positionNftAccount,
      personalPosition: this.getPersonalPositionPda(positionNftMint),
      tickArrayLower:   this.getTickArrayPda(poolId, loStart),
      tickArrayUpper:   this.getTickArrayPda(poolId, hiStart),
      tokenVault0:      pool.tokenVault0,
      tokenVault1:      pool.tokenVault1,
      vault0Mint:       pool.tokenMint0,
      vault1Mint:       pool.tokenMint1,
      clmmProgram:      this.clmmProgram,
      tokenProgram:     TOKEN_PROGRAM_ID,
      tokenProgram2022: TOKEN_2022_PROGRAM_ID,
      memoProgram:      MEMO_PROGRAM_ID,
      systemProgram:    SystemProgram.programId,
    };
  }

  /**
   * Build accounts + remaining accounts for `swap_in_treasury`.
   *
   * The remaining accounts are 3 consecutive tick arrays around the current pool tick.
   * They are forwarded by the smart-wallet contract to Raydium's swap CPI.
   *
   * @param direction 'solToUsdc' | 'usdcToSol'
   */
  async buildSwapAccounts(params: {
    poolId: PublicKey;
    direction: 'solToUsdc' | 'usdcToSol';
  }): Promise<{ accounts: SwapClmmAccounts; remainingAccounts: AccountMeta[] }> {
    const pool = await this.readPoolState(params.poolId);
    const { poolId, direction } = params;

    const solToUsdc = direction === 'solToUsdc';

    const accounts: SwapClmmAccounts = {
      ammConfig:       pool.ammConfig,
      poolState:       poolId,
      inputVault:      solToUsdc ? pool.tokenVault0 : pool.tokenVault1,
      outputVault:     solToUsdc ? pool.tokenVault1 : pool.tokenVault0,
      observationState: pool.observationKey,
      inputVaultMint:  solToUsdc ? pool.tokenMint0 : pool.tokenMint1,
      outputVaultMint: solToUsdc ? pool.tokenMint1 : pool.tokenMint0,
      clmmProgram:     this.clmmProgram,
      tokenProgram2022: TOKEN_2022_PROGRAM_ID,
      memoProgram:     MEMO_PROGRAM_ID,
    };

    // Tick arrays for the swap route: 3 consecutive arrays centred on current tick
    const perArray = pool.tickSpacing * TICK_ARRAY_SIZE;
    const curStart = this.getTickArrayStart(pool.tickCurrent, pool.tickSpacing);
    const remainingAccounts: AccountMeta[] = [-1, 0, 1].map(i => ({
      pubkey:     this.getTickArrayPda(poolId, curStart + i * perArray),
      isSigner:   false,
      isWritable: true,
    }));

    return { accounts, remainingAccounts };
  }
}
