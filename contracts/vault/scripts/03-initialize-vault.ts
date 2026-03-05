/**
 * Script 3: Initialize the vault with test tokens
 *
 * This initializes the vault program with TSOL/TUSDC tokens
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

const DEVNET_RPC = "https://api.devnet.solana.com";

// Protocol wallet that receives 10% of trading fees
const PROTOCOL_WALLET = new PublicKey("GeBqZr4vvvJume463qHbCWAPKnUY51tjLbd9HWH8uhRQ");

// Pyth devnet SOL/USD price feed (legacy account model, pyth-sdk-solana)
// Mainnet: H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG
const PYTH_SOL_USD_DEVNET = new PublicKey("J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix");

async function main() {
  console.log("🚀 Initializing vault on devnet...\n");

  // Load config
  const configPath = path.join(__dirname, "..", "devnet-config.json");
  if (!fs.existsSync(configPath)) {
    console.error("❌ Config not found! Run: npm run setup:tokens");
    process.exit(1);
  }

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
  const programId = new PublicKey(idl.address);
  const program = new Program(idl, provider);

  console.log("📍 Program ID:", programId.toString());
  console.log("📍 Admin:", walletKeypair.publicKey.toString());

  // Derive PDAs
  const [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault")],
    programId
  );

  const [shareMint, shareMintBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("share_mint"), vaultPda.toBuffer()],
    programId
  );

  const [solTreasury, solTreasuryBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("sol_treasury"), vaultPda.toBuffer()],
    programId
  );

  const [usdcTreasury, usdcTreasuryBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("usdc_treasury"), vaultPda.toBuffer()],
    programId
  );

  console.log("\n📦 PDAs:");
  console.log("  Vault:", vaultPda.toString());
  console.log("  Share Mint:", shareMint.toString());
  console.log("  SOL Treasury:", solTreasury.toString());
  console.log("  USDC Treasury:", usdcTreasury.toString());

  // Token mints
  const tsolMint = new PublicKey(config.tokens.tsol.mint);
  const tusdcMint = new PublicKey(config.tokens.tusdc.mint);

  console.log("\n🪙 Token Mints:");
  console.log("  TSOL:", tsolMint.toString());
  console.log("  TUSDC:", tusdcMint.toString());

  // Check if vault already initialized
  try {
    const vaultAccount = await (program.account as any).vault.fetch(vaultPda);
    console.log("\n⚠️  Vault already initialized!");
    console.log("  Total Shares: " + vaultAccount.totalShares.toString());
    console.log("  Treasury SOL:", vaultAccount.treasurySol.toString());
    console.log("  Treasury USDC:", vaultAccount.treasuryUsdc.toString());
    return;
  } catch (e) {
    // Vault not initialized, continue
  }

  console.log("\n🔨 Initializing vault...");

  try {
    const tx = await program.methods
      .initialize(PROTOCOL_WALLET, PYTH_SOL_USD_DEVNET)
      .accounts({
        admin: walletKeypair.publicKey,
        vault: vaultPda,
        shareMint: shareMint,
        solTreasury: solTreasury,
        usdcTreasury: usdcTreasury,
        wsolMint: tsolMint, // Using TSOL as "wrapped SOL" for testing
        usdcMint: tusdcMint, // Using TUSDC as USDC for testing
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    console.log("✅ Vault initialized!");
    console.log("   Transaction:", tx);

    // Fetch and display vault state
    const vaultAccount = await (program.account as any).vault.fetch(vaultPda);
    console.log("\n📊 Vault State:");
    console.log("  Admin:", vaultAccount.admin.toString());
    console.log("  Share Mint:", vaultAccount.shareMint.toString());
    console.log("  SOL Treasury:", vaultAccount.solTreasury.toString());
    console.log("  USDC Treasury:", vaultAccount.usdcTreasury.toString());
    console.log("  Total Shares:", vaultAccount.totalShares.toString());
    console.log("  Treasury SOL:", vaultAccount.treasurySol.toString());
    console.log("  Treasury USDC:", vaultAccount.treasuryUsdc.toString());
    console.log("  Protocol Wallet:", vaultAccount.protocolWallet.toString());
    console.log("  Is Rebalancing:", vaultAccount.isRebalancing);

    // Update config
    config.vault = {
      programId: programId.toString(),
      vaultPda: vaultPda.toString(),
      shareMint: shareMint.toString(),
      solTreasury: solTreasury.toString(),
      usdcTreasury: usdcTreasury.toString(),
      admin: walletKeypair.publicKey.toString(),
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log("\n💾 Config updated with vault addresses");

    console.log("\n✨ Done! Next step: npm run test:deposit");
  } catch (error) {
    console.error("❌ Error:", error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });
