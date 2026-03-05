/**
 * Script 10: Open Raydium CLMM position on mainnet
 *
 * Flow:
 *  1. Read pool state (tick_current, tick_spacing)
 *  2. Deposit 0.1 SOL into vault treasury (if empty)
 *  3. Deposit proportional USDC into vault treasury (if empty)
 *  4. Open position with tick range currentTick ± TICK_OFFSET
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  NATIVE_MINT,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

// ── Constants ────────────────────────────────────────────────────────────────
const MAINNET_RPC = "https://api.mainnet-beta.solana.com";
const RAYDIUM_CLMM = new PublicKey(
  "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK"
);
const TOKEN_2022 = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
);
const POOL_ID = new PublicKey("3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv");
const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const USDC_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);

const DEPOSIT_SOL_LAMPORTS = 100_000_000; // 0.1 SOL
const TICK_OFFSET = 6; // ± ticks around current price

// ── Pool helpers ─────────────────────────────────────────────────────────────
async function readPoolState(connection: Connection, poolId: PublicKey) {
  const info = await connection.getAccountInfo(poolId);
  if (!info) throw new Error("Pool not found");
  const data = info.data;
  let offset = 8 + 1 + 32 + 32; // discriminator + bump + amm_config + owner
  const tokenMint0 = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const tokenMint1 = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const tokenVault0 = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const tokenVault1 = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const observationKey = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const mintDecimals0 = data[offset++];
  const mintDecimals1 = data[offset++];
  const tickSpacing = data.readUInt16LE(offset);
  offset += 2;
  offset += 16; // liquidity
  offset += 16; // sqrt_price_x64
  const tickCurrent = data.readInt32LE(offset);
  return {
    tokenMint0,
    tokenMint1,
    tokenVault0,
    tokenVault1,
    observationKey,
    mintDecimals0,
    mintDecimals1,
    tickSpacing,
    tickCurrent,
  };
}

function getTickArrayStartIndex(tickIndex: number, tickSpacing: number): number {
  const ticksPerArray = tickSpacing * 60;
  return Math.floor(tickIndex / ticksPerArray) * ticksPerArray;
}

function getTickArrayPda(poolId: PublicKey, startIndex: number): PublicKey {
  const buf = Buffer.alloc(4);
  buf.writeInt32BE(startIndex);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("tick_array"), poolId.toBuffer(), buf],
    RAYDIUM_CLMM
  );
  return pda;
}

function getPersonalPositionPda(nftMint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), nftMint.toBuffer()],
    RAYDIUM_CLMM
  );
  return pda;
}

function getTickArrayBitmapPda(poolId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("tick_array_bitmap_extension"), poolId.toBuffer()],
    RAYDIUM_CLMM
  );
  return pda;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("Open Raydium CLMM position on mainnet\n");

  const walletKeypair = Keypair.fromSecretKey(
    Buffer.from(
      JSON.parse(
        fs.readFileSync(
          path.join(process.env.HOME!, ".config/solana/id.json"),
          "utf-8"
        )
      )
    )
  );
  const connection = new Connection(MAINNET_RPC, "confirmed");
  const wallet = new Wallet(walletKeypair);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "target", "idl", "vault.json"),
      "utf-8"
    )
  );
  const program = new Program(idl, provider);
  const programId = new PublicKey(idl.address);

  // ── PDAs ──
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault")],
    programId
  );
  const [shareMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("share_mint"), vaultPda.toBuffer()],
    programId
  );
  const [solTreasury] = PublicKey.findProgramAddressSync(
    [Buffer.from("sol_treasury"), vaultPda.toBuffer()],
    programId
  );
  const [usdcTreasury] = PublicKey.findProgramAddressSync(
    [Buffer.from("usdc_treasury"), vaultPda.toBuffer()],
    programId
  );

  console.log("Program:", programId.toString());
  console.log("Admin:  ", walletKeypair.publicKey.toString());
  console.log("Vault:  ", vaultPda.toString());

  // ── Read pool state ──
  console.log("\n1. Reading pool state...");
  const pool = await readPoolState(connection, POOL_ID);
  const tickSpacing = pool.tickSpacing;
  const tickCurrent = pool.tickCurrent;
  console.log("   tick_current:", tickCurrent, "  tick_spacing:", tickSpacing);
  console.log("   token0:", pool.tokenMint0.toString(), `(${pool.mintDecimals0} dec)`);
  console.log("   token1:", pool.tokenMint1.toString(), `(${pool.mintDecimals1} dec)`);

  // Raw price: 1.0001^tick * 10^(dec0-dec1)
  const rawPrice = Math.pow(1.0001, tickCurrent) * Math.pow(10, pool.mintDecimals0 - pool.mintDecimals1);
  console.log(`   Current pool price: ~$${rawPrice.toFixed(2)} USDC/SOL`);

  // ── Treasury balances ──
  const solBal = await connection.getTokenAccountBalance(solTreasury).catch(() => null);
  const usdcBal = await connection.getTokenAccountBalance(usdcTreasury).catch(() => null);
  const solTreasuryAmount = Number(solBal?.value.amount ?? 0);
  const usdcTreasuryAmount = Number(usdcBal?.value.amount ?? 0);

  console.log(`\n   SOL treasury:  ${solTreasuryAmount / 1e9} wSOL`);
  console.log(`   USDC treasury: ${usdcTreasuryAmount / 1e6} USDC`);

  // ── Step 2: Deposit SOL if treasury empty ──
  if (solTreasuryAmount === 0) {
    console.log("\n2. Depositing 0.1 SOL into vault...");

    const adminWsolAta = getAssociatedTokenAddressSync(WSOL_MINT, walletKeypair.publicKey);
    const adminShareAta = getAssociatedTokenAddressSync(shareMint, walletKeypair.publicKey);
    const [userDepositPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_deposit"), vaultPda.toBuffer(), walletKeypair.publicKey.toBuffer()],
      programId
    );

    // Wrap SOL → wSOL
    const wrapTx = new Transaction();
    const ataInfo = await connection.getAccountInfo(adminWsolAta);
    if (!ataInfo) {
      wrapTx.add(
        createAssociatedTokenAccountInstruction(
          walletKeypair.publicKey,
          adminWsolAta,
          walletKeypair.publicKey,
          WSOL_MINT
        )
      );
    }
    wrapTx.add(
      SystemProgram.transfer({
        fromPubkey: walletKeypair.publicKey,
        toPubkey: adminWsolAta,
        lamports: DEPOSIT_SOL_LAMPORTS,
      })
    );
    wrapTx.add(createSyncNativeInstruction(adminWsolAta));
    const wrapSig = await provider.sendAndConfirm(wrapTx, [], { commitment: "confirmed" });
    console.log("   Wrapped SOL -> wSOL, TX:", wrapSig);

    // Create share ATA if needed
    const shareAtaInfo = await connection.getAccountInfo(adminShareAta);
    if (!shareAtaInfo) {
      const createShareAtaTx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          walletKeypair.publicKey,
          adminShareAta,
          walletKeypair.publicKey,
          shareMint
        )
      );
      await provider.sendAndConfirm(createShareAtaTx, [], { commitment: "confirmed" });
      console.log("   Created share ATA");
    }

    const depositSig = await program.methods
      .depositSol(new BN(DEPOSIT_SOL_LAMPORTS))
      .accounts({
        user: walletKeypair.publicKey,
        vault: vaultPda,
        userDeposit: userDepositPda,
        userWsolAccount: adminWsolAta,
        solTreasury,
        shareMint,
        userShareAccount: adminShareAta,
        wsolMint: WSOL_MINT,
        raydiumPool: POOL_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("   Deposited 0.1 SOL. TX:", depositSig);
  } else {
    console.log("\n2. SOL treasury already funded, skipping deposit");
  }

  // ── Step 3: Deposit USDC if treasury empty ──
  const usdcBalFresh = await connection.getTokenAccountBalance(usdcTreasury).catch(() => null);
  const usdcAmountNow = Number(usdcBalFresh?.value.amount ?? 0);
  const solAmountNow = Number((await connection.getTokenAccountBalance(solTreasury)).value.amount);

  if (usdcAmountNow === 0) {
    const usdcNeeded = Math.ceil((solAmountNow / 1e9) * rawPrice * 1e6);
    console.log(`\n3. USDC treasury empty. Need ~${usdcNeeded / 1e6} USDC`);

    const adminUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, walletKeypair.publicKey);
    const adminUsdc = await connection.getTokenAccountBalance(adminUsdcAta).catch(() => null);
    const adminUsdcAmount = Number(adminUsdc?.value.amount ?? 0);
    console.log(`   Admin USDC balance: ${adminUsdcAmount / 1e6} USDC`);

    if (adminUsdcAmount < usdcNeeded) {
      console.error(`Not enough USDC. Need ${usdcNeeded / 1e6}, have ${adminUsdcAmount / 1e6}`);
      console.error("Buy USDC and rerun this script.");
      process.exit(1);
    }

    const adminShareAta = getAssociatedTokenAddressSync(shareMint, walletKeypair.publicKey);
    const [userDepositPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_deposit"), vaultPda.toBuffer(), walletKeypair.publicKey.toBuffer()],
      programId
    );

    const depositUsdcSig = await program.methods
      .depositUsdc(new BN(usdcNeeded))
      .accounts({
        user: walletKeypair.publicKey,
        vault: vaultPda,
        userDeposit: userDepositPda,
        userUsdcAccount: adminUsdcAta,
        usdcTreasury,
        shareMint,
        userShareAccount: adminShareAta,
        usdcMint: USDC_MINT,
        raydiumPool: POOL_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log(`   Deposited ${usdcNeeded / 1e6} USDC. TX:`, depositUsdcSig);
  } else {
    console.log("\n3. USDC treasury already funded, skipping deposit");
  }

  // ── Refresh balances ──
  const solFinal = Number((await connection.getTokenAccountBalance(solTreasury)).value.amount);
  const usdcFinal = Number((await connection.getTokenAccountBalance(usdcTreasury)).value.amount);
  console.log(`\n   Treasury SOL:  ${solFinal / 1e9}`);
  console.log(`   Treasury USDC: ${usdcFinal / 1e6}`);

  // ── Step 4: Open position ──
  console.log("\n4. Opening position...");

  // Tick range: current ± TICK_OFFSET, aligned to tickSpacing
  const tickLower = Math.floor((tickCurrent - TICK_OFFSET) / tickSpacing) * tickSpacing;
  const tickUpper = Math.ceil((tickCurrent + TICK_OFFSET) / tickSpacing) * tickSpacing;
  const tickArrayLowerStart = getTickArrayStartIndex(tickLower, tickSpacing);
  const tickArrayUpperStart = getTickArrayStartIndex(tickUpper, tickSpacing);

  console.log(`   tickLower: ${tickLower}  tickUpper: ${tickUpper}`);
  console.log(`   tickArrayLowerStart: ${tickArrayLowerStart}  tickArrayUpperStart: ${tickArrayUpperStart}`);

  const tickArrayLower = getTickArrayPda(POOL_ID, tickArrayLowerStart);
  const tickArrayUpper = getTickArrayPda(POOL_ID, tickArrayUpperStart);
  const tickArrayBitmap = getTickArrayBitmapPda(POOL_ID);

  // Check tick arrays exist
  const taLowerInfo = await connection.getAccountInfo(tickArrayLower);
  const taUpperInfo = await connection.getAccountInfo(tickArrayUpper);
  if (!taLowerInfo) {
    console.error(`Tick array lower not found: ${tickArrayLower.toString()}`);
    console.error("The pool may need tick arrays initialized first.");
    process.exit(1);
  }
  if (!taUpperInfo) {
    console.error(`Tick array upper not found: ${tickArrayUpper.toString()}`);
    process.exit(1);
  }
  console.log("   Tick arrays exist");

  // New position NFT keypair
  const positionNftMint = Keypair.generate();
  const personalPosition = getPersonalPositionPda(positionNftMint.publicKey);
  const positionNftAccount = getAssociatedTokenAddressSync(
    positionNftMint.publicKey,
    vaultPda,
    true,
    TOKEN_2022
  );

  console.log("   Position NFT Mint:", positionNftMint.publicKey.toString());

  const amount0Max = solFinal;
  const amount1Max = usdcFinal;

  try {
    const tx = await program.methods
      .openPosition(
        tickLower,
        tickUpper,
        tickArrayLowerStart,
        tickArrayUpperStart,
        new BN(0), // liquidity = 0, calculate from amounts
        new BN(amount0Max),
        new BN(amount1Max)
      )
      .accounts({
        admin: walletKeypair.publicKey,
        vault: vaultPda,
        solTreasury,
        usdcTreasury,
        poolState: POOL_ID,
        positionNftMint: positionNftMint.publicKey,
        positionNftAccount,
        personalPosition,
        tickArrayLower,
        tickArrayUpper,
        tokenVault0: pool.tokenVault0,
        tokenVault1: pool.tokenVault1,
        vault0Mint: pool.tokenMint0,
        vault1Mint: pool.tokenMint1,
        tickArrayBitmap,
        clmmProgram: RAYDIUM_CLMM,
        rent: SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram2022: TOKEN_2022,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([positionNftMint])
      .rpc();

    console.log("\nPosition opened!");
    console.log("   TX:       ", tx);
    console.log("   NFT Mint: ", positionNftMint.publicKey.toString());
    console.log(`\n   https://explorer.solana.com/tx/${tx}`);

    // Save position info
    const cfg = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "mainnet-config.json"), "utf-8")
    );
    cfg.position = {
      nftMint: positionNftMint.publicKey.toString(),
      tickLower,
      tickUpper,
      poolId: POOL_ID.toString(),
    };
    fs.writeFileSync(
      path.join(__dirname, "..", "mainnet-config.json"),
      JSON.stringify(cfg, null, 2)
    );
    console.log("   Position info saved to mainnet-config.json");
  } catch (err: any) {
    console.error("\nFailed:", err.message ?? err);
    if (err.logs) {
      console.log("\nProgram logs:");
      err.logs.forEach((l: string) => console.log("  ", l));
    }
    throw err;
  }
}

main()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
