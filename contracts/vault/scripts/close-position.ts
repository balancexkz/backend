import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SYSVAR_RENT_PUBKEY, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import * as fs from "fs";

const idl = require("../target/idl/vault.json");

const RAYDIUM_CLMM = new PublicKey("DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH");
const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

function getTickArrayStartIndex(tickIndex: number, tickSpacing: number): number {
  const ticksPerArray = tickSpacing * 60;
  let startIndex = Math.floor(tickIndex / ticksPerArray) * ticksPerArray;
  if (tickIndex < 0 && tickIndex % ticksPerArray !== 0) startIndex -= ticksPerArray;
  return startIndex;
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

async function readPoolState(connection: Connection, poolId: PublicKey) {
  const info = await connection.getAccountInfo(poolId);
  if (!info) throw new Error("Pool not found");
  const data = info.data;
  let offset = 8 + 1 + 32 + 32; // discriminator + bump + ammConfig + owner
  const tokenMint0 = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
  const tokenMint1 = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
  const tokenVault0 = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
  const tokenVault1 = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
  offset += 32; // observationKey
  const mintDecimals0 = data[offset]; offset += 1;
  const mintDecimals1 = data[offset]; offset += 1;
  const tickSpacing = data.readUInt16LE(offset); offset += 2;
  offset += 16 + 16; // liquidity + sqrtPriceX64
  const tickCurrent = data.readInt32LE(offset);
  return { tokenMint0, tokenMint1, tokenVault0, tokenVault1, tickSpacing, tickCurrent };
}

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const walletKeypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf-8")))
  );
  const wallet = new Wallet(walletKeypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new Program(idl, provider);

  console.log("🔒 Closing empty vault position...\n");

  // Vault PDAs
  const [vaultPda] = PublicKey.findProgramAddressSync([Buffer.from("vault")], program.programId);
  const vault = await (program.account as any).vault.fetch(vaultPda);

  console.log("Vault has_active_position:", vault.hasActivePosition);
  console.log("Position mint:", vault.positionMint.toString());
  console.log("Position pool:", vault.positionPoolId.toString());
  console.log("Position liquidity:", vault.positionLiquidity.toString());

  if (!vault.hasActivePosition) {
    console.log("✅ No active position, nothing to close.");
    return;
  }

  const poolId = vault.positionPoolId;
  const positionNftMint = vault.positionMint;

  // Read pool state
  const pool = await readPoolState(connection, poolId);
  console.log("\nPool token0:", pool.tokenMint0.toString());
  console.log("Pool token1:", pool.tokenMint1.toString());

  // Derive accounts
  const [solTreasury] = PublicKey.findProgramAddressSync([Buffer.from("sol_treasury"), vaultPda.toBuffer()], program.programId);
  const [usdcTreasury] = PublicKey.findProgramAddressSync([Buffer.from("usdc_treasury"), vaultPda.toBuffer()], program.programId);

  const tickLower = vault.positionTickLower;
  const tickUpper = vault.positionTickUpper;
  const tickArrayLowerStart = getTickArrayStartIndex(tickLower, pool.tickSpacing);
  const tickArrayUpperStart = getTickArrayStartIndex(tickUpper, pool.tickSpacing);

  const tickArrayLower = getTickArrayPda(poolId, tickArrayLowerStart);
  const tickArrayUpper = getTickArrayPda(poolId, tickArrayUpperStart);
  const personalPosition = getPersonalPositionPda(positionNftMint);

  const positionNftAccount = getAssociatedTokenAddressSync(
    positionNftMint,
    vaultPda,
    true,
    TOKEN_2022
  );

  console.log("\n📋 Accounts:");
  console.log("  Vault:", vaultPda.toString());
  console.log("  Position NFT:", positionNftMint.toString());
  console.log("  Personal Position:", personalPosition.toString());
  console.log("  Tick array lower:", tickArrayLower.toString());
  console.log("  Tick array upper:", tickArrayUpper.toString());

  console.log("\n🔒 Calling close_position...");
  try {
    const tx = await program.methods
      .closePosition(
        new BN(0), // amount_0_min
        new BN(0)  // amount_1_min
      )
      .accounts({
        admin: walletKeypair.publicKey,
        vault: vaultPda,
        solTreasury,
        usdcTreasury,
        poolState: poolId,
        positionNftMint,
        positionNftAccount,
        personalPosition,
        tokenVault0: pool.tokenVault0,
        tokenVault1: pool.tokenVault1,
        tickArrayLower,
        tickArrayUpper,
        vault0Mint: pool.tokenMint0,
        vault1Mint: pool.tokenMint1,
        clmmProgram: RAYDIUM_CLMM,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram2022: TOKEN_2022,
        memoProgram: MEMO_PROGRAM,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Position closed!");
    console.log("   TX:", tx);

    const vaultAfter = await (program.account as any).vault.fetch(vaultPda);
    console.log("\n📊 Vault after close:");
    console.log("  has_active_position:", vaultAfter.hasActivePosition);
    console.log("  treasury_sol:", vaultAfter.treasurySol.toNumber() / 1e9, "SOL");
    console.log("  treasury_usdc:", vaultAfter.treasuryUsdc.toNumber() / 1e6, "USDC");
  } catch (err: any) {
    console.error("❌ Failed:", err.message);
    if (err.logs) err.logs.forEach((l: string) => console.log(" ", l));
  }
}

main().catch(console.error);
