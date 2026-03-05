/**
 * Script 2: Create Raydium CLMM pool for TSOL/TUSDC on devnet
 *
 * This creates a concentrated liquidity pool on Raydium devnet.
 * Note: This is a simplified version. For full Raydium pool creation,
 * you may need to use their UI or SDK directly.
 *
 * Alternative: Use Raydium UI on devnet to create the pool manually:
 * https://raydium.io/clmm/create-pool (switch to devnet)
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const DEVNET_RPC = "https://api.devnet.solana.com";

// Raydium CLMM Program ID on devnet
const RAYDIUM_CLMM_PROGRAM = new PublicKey(
  "devi51mZmdwUJGU9hjN27vEz64Gps7uUefqxg27EAtH"
);

async function main() {
  console.log("🚀 Creating Raydium CLMM pool on devnet...\n");

  // Load config
  const configPath = path.join(__dirname, "..", "devnet-config.json");
  if (!fs.existsSync(configPath)) {
    console.error("❌ Config not found! Run: npm run setup:tokens");
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  console.log("📍 TSOL Mint:", config.tokens.tsol.mint);
  console.log("📍 TUSDC Mint:", config.tokens.tusdc.mint);

  // Load wallet
  const walletPath = path.join(process.env.HOME!, ".config/solana/id.json");
  const walletKeypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );

  const connection = new Connection(DEVNET_RPC, "confirmed");

  console.log("\n" + "=".repeat(60));
  console.log("⚠️  MANUAL POOL CREATION REQUIRED");
  console.log("=".repeat(60));
  console.log("\nOption 1: Use Raydium UI (Recommended)");
  console.log("-".repeat(60));
  console.log("1. Go to: https://raydium.io/clmm/create-pool/");
  console.log("2. Switch network to DEVNET in your wallet");
  console.log("3. Connect your wallet");
  console.log("4. Create pool with:");
  console.log("   - Token A: " + config.tokens.tsol.mint);
  console.log("   - Token B: " + config.tokens.tusdc.mint);
  console.log("   - Initial Price: 100 (1 TSOL = 100 TUSDC)");
  console.log("   - Fee Tier: 0.25% (2500)");
  console.log("\n5. After creation, copy the Pool ID and update devnet-config.json");

  console.log("\n" + "=".repeat(60));
  console.log("Option 2: Use Raydium SDK (Advanced)");
  console.log("-".repeat(60));
  console.log("You can use @raydium-io/raydium-sdk-v2 to create pool programmatically.");
  console.log("Example code: https://github.com/raydium-io/raydium-sdk-V2-demo");

  console.log("\n" + "=".repeat(60));
  console.log("Option 3: Use Orca Whirlpools (Alternative)");
  console.log("-".repeat(60));
  console.log("Orca has better devnet support for testing:");
  console.log("1. Use @orca-so/whirlpools-sdk");
  console.log("2. Create a whirlpool with your tokens");
  console.log("3. Adapt vault instructions to work with Orca");

  console.log("\n" + "=".repeat(60));
  console.log("\n💡 For quick testing, I recommend Option 1 (Raydium UI)");
  console.log("   or switching to Orca Whirlpools which has better devnet tools.");

  // Update config with placeholder
  config.pool = {
    poolId: "PASTE_POOL_ID_HERE",
    ammConfig: "PASTE_AMM_CONFIG_HERE",
    createdBy: "manual",
    note: "Create pool manually using Raydium UI or SDK, then update this field",
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log("\n💾 Config updated with pool placeholder");
  console.log("   Update devnet-config.json with actual Pool ID after creation");

  console.log("\n✨ Next step after pool creation: npm run setup:vault");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });
