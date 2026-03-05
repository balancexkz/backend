/**
 * Script 4: Test deposit functionality
 *
 * This tests SOL and USDC deposits into the vault
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  createSyncNativeInstruction,
  NATIVE_MINT,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

const DEVNET_RPC = "https://api.devnet.solana.com";

// Pyth devnet SOL/USD price feed (legacy account model, pyth-sdk-solana)
const PYTH_SOL_USD_DEVNET = new PublicKey("J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix");

async function main() {
  console.log("🚀 Testing vault deposits on devnet...\n");

  // Load config
  const configPath = path.join(__dirname, "..", "devnet-config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

  // Load wallet
  const walletPath = path.join(process.env.HOME!, ".config/solana/id.json");
  const walletKeypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );

  // Setup Anchor
  const connection = new Connection(DEVNET_RPC, "confirmed");
  const wallet = new Wallet(walletKeypair);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Load program
  const idlPath = path.join(__dirname, "..", "target", "idl", "vault.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program(idl, provider);

  console.log("📍 User:", walletKeypair.publicKey.toString());

  // Get vault state
  const vaultPda = new PublicKey(config.vault.vaultPda);
  const vault = await (program.account as any).vault.fetch(vaultPda);

  console.log("\n📊 Vault State BEFORE:");
  console.log("  Total Shares:", vault.totalShares.toString());
  console.log("  Treasury SOL:", vault.treasurySol.toString());
  console.log("  Treasury USDC:", vault.treasuryUsdc.toString());

  // Step 1: Create user share token account
  console.log("\n1️⃣ Creating user token accounts...");
  const shareMint = new PublicKey(config.vault.shareMint);
  const userShareAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    walletKeypair,
    shareMint,
    walletKeypair.publicKey
  );
  console.log("✅ User share account:", userShareAccount.address.toString());

  // Get user deposit PDA
  const [userDepositPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("user_deposit"),
      vaultPda.toBuffer(),
      walletKeypair.publicKey.toBuffer(),
    ],
    program.programId
  );

  // Step 2: Wrap SOL into wSOL and deposit
  console.log("\n2️⃣ Depositing TSOL...");
  const tsolMint = new PublicKey(config.tokens.tsol.mint);
  const userTsolAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    walletKeypair,
    tsolMint,
    walletKeypair.publicKey
  );

  const depositAmount = new BN(1_000_000_000); // 1 wSOL
  console.log("   Depositing: 1 wSOL");

  // Wrap SOL into wSOL token account if using native mint
  if (tsolMint.equals(NATIVE_MINT)) {
    console.log("   Wrapping 1 SOL into wSOL...");
    const wrapTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: walletKeypair.publicKey,
        toPubkey: userTsolAccount.address,
        lamports: depositAmount.toNumber(),
      }),
      createSyncNativeInstruction(userTsolAccount.address)
    );
    const wrapSig = await connection.sendTransaction(wrapTx, [walletKeypair]);
    await connection.confirmTransaction(wrapSig, "confirmed");
    console.log("   ✅ Wrapped:", wrapSig);
  }

  try {
    const tx = await program.methods
      .depositSol(depositAmount)
      .accounts({
        user: walletKeypair.publicKey,
        vault: vaultPda,
        userDeposit: userDepositPda,
        userWsolAccount: userTsolAccount.address,
        solTreasury: new PublicKey(config.vault.solTreasury),
        shareMint: shareMint,
        userShareAccount: userShareAccount.address,
        wsolMint: tsolMint,
        priceFeed: PYTH_SOL_USD_DEVNET,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Deposit successful!");
    console.log("   Transaction:", tx);
  } catch (error) {
    console.error("❌ Deposit failed:", error);
    throw error;
  }

  // Step 3: Check results
  console.log("\n3️⃣ Checking results...");
  const vaultAfter = await (program.account as any).vault.fetch(vaultPda);
  const userDeposit = await (program.account as any).userDeposit.fetch(userDepositPda);

  console.log("\n📊 Vault State AFTER:");
  console.log("  Total Shares:", vaultAfter.totalShares.toString());
  console.log("  Treasury SOL:", vaultAfter.treasurySol.toNumber() / 1e9);
  console.log("  Treasury USDC:", vaultAfter.treasuryUsdc.toNumber() / 1e6);

  console.log("\n👤 User Deposit:");
  console.log("  Shares Owned:", userDeposit.shares.toString());
  console.log("  Total Deposited SOL:", userDeposit.totalDepositedSol.toNumber() / 1e9);
  console.log("  User Share Balance:", (await connection.getTokenAccountBalance(userShareAccount.address)).value.uiAmount);

  console.log("\n✨ Done! Next step: npm run test:position");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });
