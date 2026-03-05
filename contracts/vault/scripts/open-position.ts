import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, NATIVE_MINT, getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount, transfer, createSyncNativeInstruction } from "@solana/spl-token";
import * as fs from "fs";

const idl = require("../target/idl/vault.json");

const RAYDIUM_CLMM = new PublicKey("DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH");
const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const POOL_ID = new PublicKey("AXQQz83Ji329S42rFuUaLeT2xjaky28rpUk5B3A7UHGh");

// ========== HELPERS ==========

// Read pool state to get token vaults, mints, tick_spacing etc.
async function readPoolState(connection: Connection, poolId: PublicKey) {
  const info = await connection.getAccountInfo(poolId);
  if (!info) throw new Error("Pool not found");
  const data = info.data;

  // Raydium CLMM PoolState layout (anchor discriminator = 8 bytes)
  // See: https://github.com/raydium-io/raydium-clmm/blob/master/programs/amm/src/states/pool.rs
  let offset = 8;

  // bump: [u8; 1]
  offset += 1;
  // amm_config: Pubkey
  const ammConfig = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  // owner: Pubkey
  const owner = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  // token_mint_0: Pubkey
  const tokenMint0 = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  // token_mint_1: Pubkey
  const tokenMint1 = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  // token_vault_0: Pubkey
  const tokenVault0 = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  // token_vault_1: Pubkey
  const tokenVault1 = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  // observation_key: Pubkey
  const observationKey = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  // mint_decimals_0: u8
  const mintDecimals0 = data[offset];
  offset += 1;
  // mint_decimals_1: u8
  const mintDecimals1 = data[offset];
  offset += 1;
  // tick_spacing: u16
  const tickSpacing = data.readUInt16LE(offset);
  offset += 2;
  // liquidity: u128
  offset += 16;
  // sqrt_price_x64: u128
  offset += 16;
  // tick_current: i32
  const tickCurrent = data.readInt32LE(offset);
  offset += 4;

  return {
    ammConfig, owner, tokenMint0, tokenMint1,
    tokenVault0, tokenVault1, observationKey,
    mintDecimals0, mintDecimals1, tickSpacing, tickCurrent,
  };
}

// Calculate tick array start index
function getTickArrayStartIndex(tickIndex: number, tickSpacing: number): number {
  const ticksPerArray = tickSpacing * 60;
  let startIndex = Math.floor(tickIndex / ticksPerArray) * ticksPerArray;
  if (tickIndex < 0 && tickIndex % ticksPerArray !== 0) {
    startIndex -= ticksPerArray;
  }
  return startIndex;
}

// Derive tick array PDA
function getTickArrayPda(poolId: PublicKey, startIndex: number): PublicKey {
  const startIndexBuffer = Buffer.alloc(4);
  startIndexBuffer.writeInt32BE(startIndex);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("tick_array"), poolId.toBuffer(), startIndexBuffer],
    RAYDIUM_CLMM
  );
  return pda;
}

// Derive protocol position PDA
function getProtocolPositionPda(poolId: PublicKey, tickLower: number, tickUpper: number): PublicKey {
  const tickLowerBuf = Buffer.alloc(4);
  tickLowerBuf.writeInt32LE(tickLower);
  const tickUpperBuf = Buffer.alloc(4);
  tickUpperBuf.writeInt32LE(tickUpper);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), poolId.toBuffer(), tickLowerBuf, tickUpperBuf],
    RAYDIUM_CLMM
  );
  return pda;
}

// Derive personal position PDA
function getPersonalPositionPda(nftMint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), nftMint.toBuffer()],
    RAYDIUM_CLMM
  );
  return pda;
}

// Derive tick array bitmap extension
function getTickArrayBitmapPda(poolId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("tick_array_bitmap_extension"), poolId.toBuffer()],
    RAYDIUM_CLMM
  );
  return pda;
}

// ========== MAIN ==========

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const walletKeypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf-8")))
  );
  const wallet = new Wallet(walletKeypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new Program(idl, provider);

  console.log("🚀 Opening Raydium CLMM Position via Vault");

  // 1. Read pool state
  console.log("\n1️⃣ Reading pool state...");
  const pool = await readPoolState(connection, POOL_ID);
  console.log("Token 0:", pool.tokenMint0.toString(), `(${pool.mintDecimals0} decimals)`);
  console.log("Token 1:", pool.tokenMint1.toString(), `(${pool.mintDecimals1} decimals)`);
  console.log("Token Vault 0:", pool.tokenVault0.toString());
  console.log("Token Vault 1:", pool.tokenVault1.toString());
  console.log("Tick Spacing:", pool.tickSpacing);
  console.log("Current Tick:", pool.tickCurrent);

  // 2. Vault PDAs
  const [vaultPda] = PublicKey.findProgramAddressSync([Buffer.from("vault")], program.programId);
  const [solTreasury] = PublicKey.findProgramAddressSync([Buffer.from("sol_treasury"), vaultPda.toBuffer()], program.programId);
  const [usdcTreasury] = PublicKey.findProgramAddressSync([Buffer.from("usdc_treasury"), vaultPda.toBuffer()], program.programId);

  console.log("\n2️⃣ Vault PDAs:");
  console.log("Vault:", vaultPda.toString());
  console.log("SOL Treasury:", solTreasury.toString());
  console.log("USDC Treasury:", usdcTreasury.toString());

  // Check treasury balances
  let solBal = await connection.getTokenAccountBalance(solTreasury);
  let usdcBal = await connection.getTokenAccountBalance(usdcTreasury);
  console.log("SOL Treasury balance:", solBal.value.uiAmount);
  console.log("USDC Treasury balance:", usdcBal.value.uiAmount);

  // 2.5. Fund USDC treasury if empty (transfer EbaJd4 tokens from wallet)
  if (Number(usdcBal.value.amount) === 0) {
    console.log("\n⚠️ USDC Treasury is empty. Funding with EbaJd4 tokens...");

    // Get admin's EbaJd4 token account
    const adminTokenAccount = getAssociatedTokenAddressSync(
      pool.tokenMint1,
      wallet.publicKey,
    );
    const adminBal = await connection.getTokenAccountBalance(adminTokenAccount);
    console.log("Admin EbaJd4 balance:", adminBal.value.uiAmount);

    if (Number(adminBal.value.amount) === 0) {
      console.error("❌ Admin has no EbaJd4 tokens! Get some first.");
      return;
    }

    // Transfer 1000 tokens (1000 * 10^decimals) to USDC treasury
    const fundAmount = BigInt(1000) * BigInt(10 ** pool.mintDecimals1);
    const actualAmount = BigInt(adminBal.value.amount) < fundAmount
      ? BigInt(adminBal.value.amount)
      : fundAmount;

    console.log(`Transferring ${Number(actualAmount) / (10 ** pool.mintDecimals1)} EbaJd4 to treasury...`);

    const transferTx = await transfer(
      connection,
      walletKeypair,
      adminTokenAccount,
      usdcTreasury,
      walletKeypair,
      actualAmount,
    );
    console.log("✅ Funded USDC Treasury. TX:", transferTx);

    // Refresh balance
    usdcBal = await connection.getTokenAccountBalance(usdcTreasury);
    console.log("New USDC Treasury balance:", usdcBal.value.uiAmount);
  }

  // 3. Calculate tick range (narrow: ~+/- 20% around current price)
  const tickSpacing = pool.tickSpacing;
  // Round tick to nearest tickSpacing
  const tickLower = Math.floor((pool.tickCurrent - 4000) / tickSpacing) * tickSpacing;
  const tickUpper = Math.ceil((pool.tickCurrent + 4000) / tickSpacing) * tickSpacing;

  const tickArrayLowerStart = getTickArrayStartIndex(tickLower, tickSpacing);
  const tickArrayUpperStart = getTickArrayStartIndex(tickUpper, tickSpacing);

  console.log("\n3️⃣ Tick range:");
  console.log("Current tick:", pool.tickCurrent);
  console.log("Lower tick:", tickLower);
  console.log("Upper tick:", tickUpper);
  console.log("Tick array lower start:", tickArrayLowerStart);
  console.log("Tick array upper start:", tickArrayUpperStart);

  // 4. Derive all Raydium accounts
  const tickArrayLower = getTickArrayPda(POOL_ID, tickArrayLowerStart);
  const tickArrayUpper = getTickArrayPda(POOL_ID, tickArrayUpperStart);
  const tickArrayBitmap = getTickArrayBitmapPda(POOL_ID);

  // New NFT mint for position
  const positionNftMint = Keypair.generate();
  const personalPosition = getPersonalPositionPda(positionNftMint.publicKey);

  // NFT account (vault PDA owns it, use Token2022 for ATA)
  const positionNftAccount = getAssociatedTokenAddressSync(
    positionNftMint.publicKey,
    vaultPda,
    true,
    TOKEN_2022 // Raydium CLMM uses Token2022 for position NFTs
  );

  console.log("\n4️⃣ Raydium accounts:");
  console.log("Tick Array Lower:", tickArrayLower.toString());
  console.log("Tick Array Upper:", tickArrayUpper.toString());
  console.log("Tick Array Bitmap:", tickArrayBitmap.toString());
  console.log("Position NFT Mint:", positionNftMint.publicKey.toString());
  console.log("Position NFT Account:", positionNftAccount.toString());
  console.log("Personal Position:", personalPosition.toString());

  // 5. Amounts - use 90% of treasury for position (leave some buffer)
  const solTreasuryAmount = Number(solBal.value.amount);
  const usdcTreasuryAmount = Number(usdcBal.value.amount);

  const amount0Max = Math.floor(solTreasuryAmount * 0.9);
  const amount1Max = Math.floor(usdcTreasuryAmount * 0.9);

  console.log("\n5️⃣ Position amounts:");
  console.log("SOL max:", amount0Max / 1e9);
  console.log("Token max:", amount1Max / Math.pow(10, pool.mintDecimals1));

  if (amount0Max === 0 || amount1Max === 0) {
    console.error("❌ Both treasuries must have funds! SOL:", solTreasuryAmount, "USDC:", usdcTreasuryAmount);
    return;
  }

  // 6. Open position
  console.log("\n6️⃣ Opening position...");
  try {
    const tx = await program.methods
      .openPosition(
        tickLower,
        tickUpper,
        tickArrayLowerStart,
        tickArrayUpperStart,
        new BN(0), // liquidity = 0, let Raydium calculate from amounts
        new BN(amount0Max),
        new BN(amount1Max),
      )
      .accounts({
        admin: wallet.publicKey,
        vault: vaultPda,
        solTreasury: solTreasury,
        usdcTreasury: usdcTreasury,
        poolState: POOL_ID,
        positionNftMint: positionNftMint.publicKey,
        positionNftAccount: positionNftAccount,
        personalPosition: personalPosition,
        tickArrayLower: tickArrayLower,
        tickArrayUpper: tickArrayUpper,
        tokenVault0: pool.tokenVault0,
        tokenVault1: pool.tokenVault1,
        vault0Mint: pool.tokenMint0,
        vault1Mint: pool.tokenMint1,
        tickArrayBitmap: tickArrayBitmap,
        clmmProgram: RAYDIUM_CLMM,
        rent: SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram2022: TOKEN_2022,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([positionNftMint])
      .rpc();

    console.log("\n✅ Position opened!");
    console.log("TX:", tx);
    console.log("NFT Mint:", positionNftMint.publicKey.toString());
    console.log(`\nhttps://explorer.solana.com/tx/${tx}?cluster=devnet`);
  } catch (err: any) {
    console.error("\n❌ Failed:", err.message || err);
    if (err.logs) {
      console.log("\nProgram logs:");
      err.logs.forEach((log: string) => console.log("  ", log));
    }
  }
}

main().catch(console.error);
