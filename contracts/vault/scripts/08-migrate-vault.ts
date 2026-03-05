/**
 * Script 8: Migrate vault account layout after program upgrade.
 *
 * The vault was originally deployed with a smaller struct (389 bytes).
 * After the security-hardening upgrade the struct grew to 447 bytes.
 * This script calls `migrate_vault` which:
 *   - verifies admin authority from raw bytes
 *   - reallocates the account to Vault::LEN (447 bytes)
 *   - writes a fresh, correctly-typed Vault struct sourced from
 *     actual on-chain token account balances
 *
 * Run once after deploying the upgraded program to devnet.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

// ── Config ────────────────────────────────────────────────────────────────────

const DEVNET_RPC = "https://api.devnet.solana.com";

// Protocol wallet that receives 10% of trading fees
const PROTOCOL_WALLET = new PublicKey("GeBqZr4vvvJume463qHbCWAPKnUY51tjLbd9HWH8uhRQ");

// Pyth devnet SOL/USD price feed (legacy account model, pyth-sdk-solana)
const PYTH_SOL_USD_DEVNET = new PublicKey("J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix");

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔧 Vault Layout Migration\n");

  // Load wallet
  const walletPath = path.join(process.env.HOME!, ".config/solana/id.json");
  const walletKeypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );

  // Setup Anchor
  const connection = new Connection(DEVNET_RPC, "confirmed");
  const wallet = new Wallet(walletKeypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  // Load IDL
  const idlPath = path.join(__dirname, "..", "target", "idl", "vault.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program(idl, provider);

  console.log("📍 Program  :", program.programId.toString());
  console.log("📍 Admin    :", walletKeypair.publicKey.toString());

  // ── Derive PDAs ────────────────────────────────────────────────────────────
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault")],
    program.programId
  );
  const [shareMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("share_mint"), vaultPda.toBuffer()],
    program.programId
  );
  const [solTreasury] = PublicKey.findProgramAddressSync(
    [Buffer.from("sol_treasury"), vaultPda.toBuffer()],
    program.programId
  );
  const [usdcTreasury] = PublicKey.findProgramAddressSync(
    [Buffer.from("usdc_treasury"), vaultPda.toBuffer()],
    program.programId
  );

  console.log("\n📦 PDAs:");
  console.log("  Vault         :", vaultPda.toString());
  console.log("  Share Mint    :", shareMint.toString());
  console.log("  SOL Treasury  :", solTreasury.toString());
  console.log("  USDC Treasury :", usdcTreasury.toString());

  // ── Pre-migration diagnostics ──────────────────────────────────────────────
  console.log("\n🔍 Pre-migration diagnostics:");

  const vaultInfo = await connection.getAccountInfo(vaultPda);
  if (!vaultInfo) {
    console.error("❌ Vault account not found! Run initialization first.");
    process.exit(1);
  }
  console.log(`  Vault account size : ${vaultInfo.data.length} bytes`);
  console.log(`  New Vault::LEN     : 447 bytes`);
  console.log(`  Gap                : ${447 - vaultInfo.data.length} bytes`);

  // Peek at admin bytes [8..40] — should match our wallet
  const adminFromBytes = new PublicKey(vaultInfo.data.slice(8, 40));
  console.log(`  Admin from bytes   : ${adminFromBytes.toString()}`);
  console.log(`  Wallet public key  : ${walletKeypair.publicKey.toString()}`);

  if (!adminFromBytes.equals(walletKeypair.publicKey)) {
    console.error("\n❌ Admin mismatch! The wallet does not match the vault admin.");
    process.exit(1);
  }
  console.log("  ✅ Admin matches — migration authorized");

  // Check actual token balances
  try {
    const solBal = await connection.getTokenAccountBalance(solTreasury);
    const usdcBal = await connection.getTokenAccountBalance(usdcTreasury);
    const shareSupply = await connection.getTokenSupply(shareMint);
    console.log("\n📊 On-chain balances (will be written to new layout):");
    console.log(`  SOL Treasury   : ${solBal.value.uiAmount} tokens`);
    console.log(`  USDC Treasury  : ${usdcBal.value.uiAmount} tokens`);
    console.log(`  Share Supply   : ${shareSupply.value.uiAmount} shares`);
  } catch {
    console.log("  (Could not read balances — they will still be written correctly by on-chain instruction)");
  }

  // ── Execute migration ──────────────────────────────────────────────────────
  console.log("\n🚀 Executing migrate_vault...");

  try {
    const tx = await program.methods
      .migrateVault(PROTOCOL_WALLET, PYTH_SOL_USD_DEVNET)
      .accounts({
        admin: walletKeypair.publicKey,
        vault: vaultPda,
        shareMint: shareMint,
        solTreasury: solTreasury,
        usdcTreasury: usdcTreasury,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    console.log("✅ Migration transaction:", tx);
    console.log(`   https://explorer.solana.com/tx/${tx}?cluster=devnet`);
  } catch (err: any) {
    console.error("❌ Migration failed:", err.message);
    if (err.logs) {
      console.error("Program logs:");
      err.logs.forEach((l: string) => console.error(" ", l));
    }
    process.exit(1);
  }

  // ── Post-migration verification ────────────────────────────────────────────
  console.log("\n🔍 Post-migration verification:");

  const vaultInfoAfter = await connection.getAccountInfo(vaultPda);
  console.log(`  New account size: ${vaultInfoAfter?.data.length} bytes`);

  try {
    const vault = await (program.account as any).vault.fetch(vaultPda);
    console.log("\n✅ Vault deserialized successfully with new layout!");
    console.log("  admin             :", vault.admin.toString());
    console.log("  protocol_wallet   :", vault.protocolWallet.toString());
    console.log("  sol_price_feed    :", vault.solPriceFeed.toString());
    console.log("  usdc_mint         :", vault.usdcMint.toString());
    console.log("  total_shares      :", vault.totalShares.toString());
    console.log("  treasury_sol      :", vault.treasurySol.toString(), `(${Number(vault.treasurySol) / 1e9} SOL)`);
    console.log("  treasury_usdc     :", vault.treasuryUsdc.toString(), `(${Number(vault.treasuryUsdc) / 1e6} USDC)`);
    console.log("  is_paused         :", vault.isPaused);
    console.log("  is_rebalancing    :", vault.isRebalancing);
    console.log("  has_active_pos    :", vault.hasActivePosition);
    console.log("  fees_sol          :", vault.accumulatedProtocolFeesSol.toString());
    console.log("  fees_usdc         :", vault.accumulatedProtocolFeesUsdc.toString());
  } catch (err: any) {
    console.error("❌ Post-migration fetch failed:", err.message);
    process.exit(1);
  }

  console.log("\n✨ Migration complete!");
  console.log(`   Vault: https://explorer.solana.com/address/${vaultPda}?cluster=devnet`);
  console.log("\n▶  Next: npx ts-node scripts/check-vault.ts");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });
