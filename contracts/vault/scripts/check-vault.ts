import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";

const idl = require("../target/idl/vault.json");

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const walletKeypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf-8")))
  );
  const wallet = new Wallet(walletKeypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new Program(idl, provider);

  const [vaultPda] = PublicKey.findProgramAddressSync([Buffer.from("vault")], program.programId);
  const vault = await (program.account as any).vault.fetch(vaultPda);
  console.log("=== Vault State ===");
  console.log("has_active_position:", vault.hasActivePosition);
  console.log("position_mint:", vault.positionMint.toString());
  console.log("position_pool_id:", vault.positionPoolId.toString());
  console.log("position_tick_lower:", vault.positionTickLower);
  console.log("position_tick_upper:", vault.positionTickUpper);
  console.log("position_liquidity:", vault.positionLiquidity.toString());
  console.log("position_sol:", vault.positionSol.toString(), `(${Number(vault.positionSol) / 1e9} SOL)`);
  console.log("position_usdc:", vault.positionUsdc.toString(), `(${Number(vault.positionUsdc) / 1e6} USDC)`);
  console.log("treasury_sol:", vault.treasurySol.toString(), `(${Number(vault.treasurySol) / 1e9} SOL)`);
  console.log("treasury_usdc:", vault.treasuryUsdc.toString(), `(${Number(vault.treasuryUsdc) / 1e6} USDC)`);
  console.log("total_shares:", vault.totalShares.toString());
  console.log("total_shares:", vault.totalShares.toString());
  console.log("treasury_sol:", vault.treasurySol.toString());
  console.log("treasury_usdc:", vault.treasuryUsdc.toString());
  console.log("accumulated_protocol_fees_sol:", vault.accumulatedProtocolFeesSol.toString());
  console.log("accumulated_protocol_fees_usdc:", vault.accumulatedProtocolFeesUsdc.toString());
  console.log("is_rebalancing:", vault.isRebalancing);
  console.log("protocol_wallet:", vault.protocolWallet.toString());
  console.log("sol_price_feed:", vault.solPriceFeed.toString());

  // Check actual token balances on-chain
  const [solTreasury] = PublicKey.findProgramAddressSync([Buffer.from("sol_treasury"), vaultPda.toBuffer()], program.programId);
  const [usdcTreasury] = PublicKey.findProgramAddressSync([Buffer.from("usdc_treasury"), vaultPda.toBuffer()], program.programId);
  const solBal = await connection.getTokenAccountBalance(solTreasury);
  const usdcBal = await connection.getTokenAccountBalance(usdcTreasury);
  console.log("\n=== Actual Treasury Balances ===");
  console.log("SOL Treasury:", solBal.value.uiAmount, "SOL");
  console.log("USDC Treasury:", usdcBal.value.uiAmount, "EbaJd4");
}

main().catch(console.error);
