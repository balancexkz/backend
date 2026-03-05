/**
 * Script 7: Admin operations
 *
 * Covers:
 * - extract_protocol_fee  — transfer accumulated 10% fees to protocol wallet
 * - cancel_rebalance      — emergency reset of is_rebalancing flag
 * - check vault state     — display current vault state without tvlUsd
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  NATIVE_MINT,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

const DEVNET_RPC = "https://api.devnet.solana.com";

// Protocol wallet that receives 10% of trading fees
const PROTOCOL_WALLET = new PublicKey(
  "GeBqZr4vvvJume463qHbCWAPKnUY51tjLbd9HWH8uhRQ"
);

async function main() {
  const action = process.argv[2] || "status";
  console.log(`🔧 Vault admin ops — action: ${action}\n`);

  // Load config
  const configPath = path.join(__dirname, "..", "devnet-config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

  // Load admin wallet
  const walletPath = path.join(process.env.HOME!, ".config/solana/id.json");
  const adminKeypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );

  // Setup Anchor
  const connection = new Connection(DEVNET_RPC, "confirmed");
  const wallet = new Wallet(adminKeypair);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idlPath = path.join(__dirname, "..", "target", "idl", "vault.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program(idl, provider);

  const vaultPda = new PublicKey(config.vault.vaultPda);

  // ─────────────────────────────────────────────────────────────────────────
  // STATUS: Print current vault state
  // ─────────────────────────────────────────────────────────────────────────
  const vault = await (program.account as any).vault.fetch(vaultPda);
  console.log("📊 Vault State:");
  console.log("  Admin:", vault.admin.toString());
  console.log("  Protocol Wallet:", vault.protocolWallet.toString());
  console.log("  Sol Price Feed:", vault.solPriceFeed.toString());
  console.log("  Total Shares:", vault.totalShares.toString());
  console.log("  Treasury SOL:", vault.treasurySol.toNumber() / 1e9, "SOL");
  console.log("  Treasury USDC:", vault.treasuryUsdc.toNumber() / 1e6, "USDC");
  console.log(
    "  Accumulated Protocol Fees SOL:",
    vault.accumulatedProtocolFeesSol.toNumber(),
    "lamports"
  );
  console.log(
    "  Accumulated Protocol Fees USDC:",
    vault.accumulatedProtocolFeesUsdc.toNumber(),
    "micro-USDC"
  );
  console.log("  Is Rebalancing:", vault.isRebalancing);
  console.log("  Is Paused:", vault.isPaused);
  console.log("  Position Active:", vault.positionNftMint.toString() !== "11111111111111111111111111111111");

  if (action === "status") {
    console.log("\n✅ Use actions: status | extract-fees | cancel-rebalance");
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // EXTRACT-FEES: Transfer accumulated protocol fees to protocol_wallet
  // ─────────────────────────────────────────────────────────────────────────
  if (action === "extract-fees") {
    const solFees = vault.accumulatedProtocolFeesSol.toNumber();
    const usdcFees = vault.accumulatedProtocolFeesUsdc.toNumber();

    if (solFees === 0 && usdcFees === 0) {
      console.log("⚠️  No accumulated protocol fees to extract");
      return;
    }

    console.log(`\n💰 Extracting protocol fees:`);
    console.log(`   SOL fees: ${solFees} lamports (${solFees / 1e9} SOL)`);
    console.log(`   USDC fees: ${usdcFees} micro-USDC (${usdcFees / 1e6} USDC)`);

    // Get/create protocol wallet token accounts
    const solTreasuryPda = new PublicKey(config.vault.solTreasury);
    const usdcTreasuryPda = new PublicKey(config.vault.usdcTreasury);
    const wsolMint = new PublicKey(config.tokens.tsol.mint);
    const usdcMint = new PublicKey(config.tokens.tusdc.mint);

    const protocolSolAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      adminKeypair,
      wsolMint,
      PROTOCOL_WALLET,
      true // allowOwnerOffCurve
    );

    const protocolUsdcAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      adminKeypair,
      usdcMint,
      PROTOCOL_WALLET,
      true // allowOwnerOffCurve
    );

    console.log("\n📤 Protocol SOL account:", protocolSolAccount.address.toString());
    console.log("📤 Protocol USDC account:", protocolUsdcAccount.address.toString());

    try {
      const tx = await program.methods
        .extractProtocolFee()
        .accounts({
          admin: adminKeypair.publicKey,
          vault: vaultPda,
          solTreasury: solTreasuryPda,
          usdcTreasury: usdcTreasuryPda,
          protocolSolAccount: protocolSolAccount.address,
          protocolUsdcAccount: protocolUsdcAccount.address,
          wsolMint: wsolMint,
          usdcMint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      console.log("\n✅ Protocol fees extracted!");
      console.log("   Transaction:", tx);

      // Show updated state
      const vaultAfter = await (program.account as any).vault.fetch(vaultPda);
      console.log("\n📊 After extraction:");
      console.log(
        "  Protocol Fees SOL:",
        vaultAfter.accumulatedProtocolFeesSol.toNumber(),
        "lamports (should be 0)"
      );
      console.log(
        "  Protocol Fees USDC:",
        vaultAfter.accumulatedProtocolFeesUsdc.toNumber(),
        "micro-USDC (should be 0)"
      );
    } catch (err) {
      console.error("❌ Extract failed:", err);
    }
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CANCEL-REBALANCE: Emergency reset of is_rebalancing flag
  // ─────────────────────────────────────────────────────────────────────────
  if (action === "cancel-rebalance") {
    if (!vault.isRebalancing) {
      console.log("⚠️  Vault is not currently rebalancing. Nothing to cancel.");
      return;
    }

    console.log("\n🚨 Cancelling stuck rebalance...");
    console.log(
      "   This resets is_rebalancing = false so users can deposit/withdraw"
    );

    try {
      const tx = await program.methods
        .cancelRebalance()
        .accounts({
          admin: adminKeypair.publicKey,
          vault: vaultPda,
        })
        .rpc();

      console.log("\n✅ Rebalance cancelled!");
      console.log("   Transaction:", tx);

      const vaultAfter = await (program.account as any).vault.fetch(vaultPda);
      console.log("   Is Rebalancing:", vaultAfter.isRebalancing, "(should be false)");
    } catch (err) {
      console.error("❌ Cancel rebalance failed:", err);
    }
    return;
  }

  console.log("❓ Unknown action. Use: status | extract-fees | cancel-rebalance");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });
