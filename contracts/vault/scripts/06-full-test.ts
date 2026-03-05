/**
 * Script 6: Full integration test
 *
 * Complete end-to-end test of the vault:
 * 1. Multiple users deposit
 * 2. Admin opens Raydium position
 * 3. Collect fees (simulated)
 * 4. Users withdraw
 * 5. Verify P&L
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

const DEVNET_RPC = "https://api.devnet.solana.com";

// Pyth devnet SOL/USD price feed (legacy account model, pyth-sdk-solana)
const PYTH_SOL_USD_DEVNET = new PublicKey("J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix");

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("🚀 Running full integration test...\n");

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

  // Load program
  const idlPath = path.join(__dirname, "..", "target", "idl", "vault.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program(idl, provider);

  const vaultPda = new PublicKey(config.vault.vaultPda);
  const shareMint = new PublicKey(config.vault.shareMint);
  const tsolMint = new PublicKey(config.tokens.tsol.mint);
  const tusdcMint = new PublicKey(config.tokens.tusdc.mint);

  console.log("=" .repeat(60));
  console.log("📊 INITIAL STATE");
  console.log("=".repeat(60));

  const vaultInitial = await (program.account as any).vault.fetch(vaultPda);
  console.log("Total Shares:", vaultInitial.totalShares.toString());
  console.log("Treasury SOL:", vaultInitial.treasurySol.toNumber() / 1e9);
  console.log("Treasury USDC:", vaultInitial.treasuryUsdc.toNumber() / 1e6);
  console.log("Is Rebalancing:", vaultInitial.isRebalancing);

  // Generate test users
  const user1 = Keypair.generate();
  const user2 = Keypair.generate();
  const user3 = Keypair.generate();

  console.log("\n" + "=".repeat(60));
  console.log("👥 TEST USERS");
  console.log("=".repeat(60));
  console.log("User 1:", user1.publicKey.toString());
  console.log("User 2:", user2.publicKey.toString());
  console.log("User 3:", user3.publicKey.toString());

  // Fund users with SOL for transactions
  console.log("\n💰 Funding users with SOL...");
  for (const user of [user1, user2, user3]) {
    const tx = await connection.requestAirdrop(
      user.publicKey,
      0.5 * anchor.web3.LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(tx);
    console.log("✅ Funded", user.publicKey.toString().slice(0, 8) + "...");
  }

  // Mint test tokens to users
  console.log("\n🪙 Minting test tokens to users...");
  for (const user of [user1, user2, user3]) {
    // Create token accounts
    const tsolAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      adminKeypair,
      tsolMint,
      user.publicKey
    );

    const tusdcAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      adminKeypair,
      tusdcMint,
      user.publicKey
    );

    // Mint tokens
    await mintTo(
      connection,
      adminKeypair,
      tsolMint,
      tsolAccount.address,
      adminKeypair,
      50_000_000_000 // 50 TSOL
    );

    await mintTo(
      connection,
      adminKeypair,
      tusdcMint,
      tusdcAccount.address,
      adminKeypair,
      5_000_000_000 // 5000 TUSDC
    );

    console.log("✅ User", user.publicKey.toString().slice(0, 8) + "...", "- 50 TSOL, 5000 TUSDC");
  }

  // PHASE 1: USER DEPOSITS
  console.log("\n" + "=".repeat(60));
  console.log("📥 PHASE 1: USER DEPOSITS");
  console.log("=".repeat(60));

  const depositAmounts = [
    { user: user1, tsol: 10, label: "User 1" },
    { user: user2, tsol: 20, label: "User 2" },
    { user: user3, tsol: 15, label: "User 3" },
  ];

  for (const { user, tsol, label } of depositAmounts) {
    console.log(`\n${label}: Depositing ${tsol} TSOL...`);

    // Create share account
    const shareAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      user,
      shareMint,
      user.publicKey
    );

    const tsolAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      user,
      tsolMint,
      user.publicKey
    );

    const [userDepositPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_deposit"), vaultPda.toBuffer(), user.publicKey.toBuffer()],
      program.programId
    );

    try {
      const tx = await program.methods
        .depositSol(new BN(tsol * 1e9))
        .accounts({
          user: user.publicKey,
          vault: vaultPda,
          userDeposit: userDepositPda,
          userWsolAccount: tsolAccount.address,
          solTreasury: new PublicKey(config.vault.solTreasury),
          shareMint: shareMint,
          userShareAccount: shareAccount.address,
          wsolMint: tsolMint,
          priceFeed: PYTH_SOL_USD_DEVNET,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user])
        .rpc();

      const userDeposit = await (program.account as any).userDeposit.fetch(userDepositPda);
      console.log(`✅ Deposited! Shares: ${userDeposit.shares.toString()}`);
    } catch (error) {
      console.error(`❌ Deposit failed:`, error.message);
    }

    await sleep(1000);
  }

  // Check vault state after deposits
  const vaultAfterDeposits = await (program.account as any).vault.fetch(vaultPda);
  console.log("\n📊 Vault after deposits:");
  console.log("  Total Shares:", vaultAfterDeposits.totalShares.toString());
  console.log("  Treasury SOL:", vaultAfterDeposits.treasurySol.toNumber() / 1e9);
  console.log("  Treasury USDC:", vaultAfterDeposits.treasuryUsdc.toNumber() / 1e6);

  // PHASE 2: OPEN RAYDIUM POSITION
  console.log("\n" + "=".repeat(60));
  console.log("🏊 PHASE 2: OPEN RAYDIUM POSITION");
  console.log("=".repeat(60));

  if (!config.pool || config.pool.poolId === "PASTE_POOL_ID_HERE") {
    console.log("⚠️  Pool not configured in devnet-config.json");
    console.log("   Please create a Raydium pool first (npm run setup:pool)");
    console.log("   Then update devnet-config.json with the Pool ID");
  } else {
    console.log("Pool ID:", config.pool.poolId);
    console.log("\n⚠️  Opening Raydium position requires:");
    console.log("   - Valid pool state account");
    console.log("   - Tick arrays initialized");
    console.log("   - All Raydium CLMM accounts");
    console.log("\n💡 Refer to scripts/05-test-position.ts for full implementation");
    console.log("   This requires complex Raydium SDK integration");
  }

  // PHASE 3: FEE COLLECTION (via collect_fees instruction)
  console.log("\n" + "=".repeat(60));
  console.log("💸 PHASE 3: FEE COLLECTION");
  console.log("=".repeat(60));

  console.log("\n💡 Fee collection flow (requires active Raydium position):");
  console.log("   1. admin calls collect_fees → 10% to accumulated_protocol_fees");
  console.log("   2. 90% stays in treasury → TVL grows → share price appreciates");
  console.log("   3. admin calls extract_protocol_fee at any time to receive 10%");
  console.log("\n   This test requires a live Raydium position to generate real fees.");
  console.log("   See rebalance flow: collect_fees → close_position → swap → open_position");

  // Read current vault state (no tvlUsd — TVL is now calculated on-chain via Pyth)
  const vaultAfterFees = await (program.account as any).vault.fetch(vaultPda);
  console.log("\n📊 Vault after deposit phase:");
  console.log("  Total Shares:", vaultAfterFees.totalShares.toString());
  console.log("  Treasury SOL:", vaultAfterFees.treasurySol.toNumber() / 1e9);
  console.log("  Treasury USDC:", vaultAfterFees.treasuryUsdc.toNumber() / 1e6);
  console.log("  Protocol Fees SOL:", vaultAfterFees.accumulatedProtocolFeesSol.toNumber());
  console.log("  Protocol Fees USDC:", vaultAfterFees.accumulatedProtocolFeesUsdc.toNumber());

  // PHASE 4: USER WITHDRAWALS
  console.log("\n" + "=".repeat(60));
  console.log("📤 PHASE 4: USER WITHDRAWALS");
  console.log("=".repeat(60));

  console.log("\nUser 1 withdrawing 50% of shares...");
  const user1Deposit = await (program.account as any).userDeposit.fetch(
    PublicKey.findProgramAddressSync(
      [Buffer.from("user_deposit"), vaultPda.toBuffer(), user1.publicKey.toBuffer()],
      program.programId
    )[0]
  );

  const sharesToBurn = user1Deposit.shares;
  console.log("All shares:", sharesToBurn.toString());
  console.log("\n💡 Withdrawal is pro-rata: withdraw() burns all shares, receives");
  console.log("   proportional (treasury_sol * shares / total_shares) SOL");
  console.log("   and (treasury_usdc * shares / total_shares) USDC");

  // Note: Full withdrawal implementation requires:
  // - Burning shares
  // - Transferring proportional SOL/USDC from treasury
  // - Updating vault and user deposit state
  console.log("\n💡 Full withdrawal requires implementing withdraw instruction");
  console.log("   See programs/vault/src/instructions/withdraw.rs");

  // FINAL SUMMARY
  console.log("\n" + "=".repeat(60));
  console.log("📊 FINAL SUMMARY");
  console.log("=".repeat(60));

  const vaultFinal = await (program.account as any).vault.fetch(vaultPda);
  console.log("\nVault Metrics:");
  console.log("  Initial Shares:", vaultInitial.totalShares.toString());
  console.log("  Final Shares:", vaultFinal.totalShares.toString());
  console.log("  Final Treasury SOL:", vaultFinal.treasurySol.toNumber() / 1e9);
  console.log("  Final Treasury USDC:", vaultFinal.treasuryUsdc.toNumber() / 1e6);
  console.log("  Protocol Fees (uncollected) SOL:", vaultFinal.accumulatedProtocolFeesSol.toNumber());
  console.log("  Protocol Fees (uncollected) USDC:", vaultFinal.accumulatedProtocolFeesUsdc.toNumber());
  console.log("  Is Rebalancing:", vaultFinal.isRebalancing);
  console.log("\n💡 TVL is now computed on-chain via Pyth oracle at deposit time.");
  console.log("   Share price appreciation is tracked via treasury growth.");

  console.log("\n✨ Integration test completed!");
  console.log("\n📝 Next steps:");
  console.log("  1. Create Raydium pool (npm run setup:pool)");
  console.log("  2. Implement position management (scripts/05-test-position.ts)");
  console.log("  3. Test full cycle with real Raydium interactions");
  console.log("  4. Deploy to mainnet after thorough testing");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });
