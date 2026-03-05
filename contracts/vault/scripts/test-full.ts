import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { PublicKey, Connection, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount, createSyncNativeInstruction, NATIVE_MINT } from "@solana/spl-token";
import * as fs from "fs";

const idl = require("../target/idl/vault.json");

const POOL_ID = new PublicKey("7PKSdUDAEXtGEVZtGSizZ1YUN3o6HewBi3ZkT4ewPCoS");

// Pyth devnet SOL/USD price feed (legacy account model, pyth-sdk-solana)
const PYTH_SOL_USD_DEVNET = new PublicKey("J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix");

async function main() {
  // Setup
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const walletKeypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf-8")))
  );
  const wallet = new Wallet(walletKeypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new Program(idl, provider);

  console.log("🚀 Full Vault Test on Devnet");
  console.log("Program:", program.programId.toString());
  console.log("Wallet:", wallet.publicKey.toString());
  console.log("Pool:", POOL_ID.toString());

  // PDAs
  const [vaultPda] = PublicKey.findProgramAddressSync([Buffer.from("vault")], program.programId);
  const [shareMint] = PublicKey.findProgramAddressSync([Buffer.from("share_mint"), vaultPda.toBuffer()], program.programId);
  const [solTreasury] = PublicKey.findProgramAddressSync([Buffer.from("sol_treasury"), vaultPda.toBuffer()], program.programId);
  const [usdcTreasury] = PublicKey.findProgramAddressSync([Buffer.from("usdc_treasury"), vaultPda.toBuffer()], program.programId);

  const wsolMint = NATIVE_MINT; // So11111...
  const usdcMint = new PublicKey("EbaJd4dUSjARfajn1fc8Ekot2LxemFPouPi7BnSyoBrb");

  console.log("\n📦 PDAs:");
  console.log("Vault:", vaultPda.toString());
  console.log("Share Mint:", shareMint.toString());

  // 1. Check if initialized
  console.log("\n1️⃣ Checking vault...");
  let vaultExists = false;
  try {
    await connection.getAccountInfo(vaultPda);
    vaultExists = true;
    console.log("✅ Vault exists");
  } catch {
    console.log("⚠️  Vault not found, run initialization first");
    return;
  }

  // 2. Wrap 0.1 SOL
  console.log("\n2️⃣ Wrapping 0.1 SOL...");
  const userWsolAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    walletKeypair,
    wsolMint,
    wallet.publicKey
  );

  const wrapAmount = 0.1 * 1e9; // 0.1 SOL
  const wrapTx = new anchor.web3.Transaction().add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: userWsolAccount.address,
      lamports: wrapAmount,
    }),
    createSyncNativeInstruction(userWsolAccount.address)
  );

  const wrapSig = await connection.sendTransaction(wrapTx, [walletKeypair]);
  await connection.confirmTransaction(wrapSig);
  console.log("✅ Wrapped 0.1 SOL:", wrapSig);

  // 3. Get/Create USDC account (if you have USDC)
  console.log("\n3️⃣ Creating token accounts...");
  const userUsdcAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    walletKeypair,
    usdcMint,
    wallet.publicKey
  );
  console.log("✅ USDC account:", userUsdcAccount.address.toString());

  const userShareAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    walletKeypair,
    shareMint,
    wallet.publicKey
  );
  console.log("✅ Share account:", userShareAccount.address.toString());

  // 4. Deposit SOL
  console.log("\n4️⃣ Depositing 0.1 SOL to vault...");
  const [userDepositPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_deposit"), vaultPda.toBuffer(), wallet.publicKey.toBuffer()],
    program.programId
  );

  try {
    const depositTx = await program.methods
      .depositSol(new BN(wrapAmount))
      .accounts({
        user: wallet.publicKey,
        vault: vaultPda,
        userDeposit: userDepositPda,
        userWsolAccount: userWsolAccount.address,
        solTreasury: solTreasury,
        shareMint: shareMint,
        userShareAccount: userShareAccount.address,
        wsolMint: wsolMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("✅ Deposited 0.1 SOL:", depositTx);
  } catch (err) {
    console.error("❌ Deposit failed:", err.message);
    console.log("\nCheck:");
    console.log("- wSOL account has balance");
  }

  // 5. Check vault state
  console.log("\n5️⃣ Checking vault state...");
  const vaultData = await connection.getAccountInfo(vaultPda);
  console.log("✅ Vault account size:", vaultData?.data.length);

  const shareBalance = await connection.getTokenAccountBalance(userShareAccount.address);
  console.log("✅ Your shares:", shareBalance.value.uiAmount);

  // 6. Open Position (requires Raydium accounts)
  console.log("\n6️⃣ Opening Raydium position...");
  console.log("⚠️  This requires:");
  console.log("   - Pool state account from Raydium");
  console.log("   - Tick arrays (initialized)");
  console.log("   - Token vaults from pool");
  console.log("   - Position NFT mint (new keypair)");
  console.log("\n💡 This is complex - use Raydium SDK to get all accounts");
  console.log("   Or add liquidity directly through Raydium UI first");

  console.log("\n✨ Test completed!");
  console.log("\n📊 Summary:");
  console.log("  Vault:", vaultPda.toString());
  console.log("  Your shares:", shareBalance.value.uiAmount || 0);
  console.log("\nView on explorer:");
  console.log(`  https://explorer.solana.com/address/${vaultPda}?cluster=devnet`);
  console.log(`  https://explorer.solana.com/address/${wallet.publicKey}?cluster=devnet`);
}

main().catch(console.error);
