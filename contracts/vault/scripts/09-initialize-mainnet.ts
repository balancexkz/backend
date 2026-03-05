/**
 * Script 9: Initialize vault on mainnet
 *
 * Parameters:
 *   protocol_wallet : GeBqZr4vvvJume463qHbCWAPKnUY51tjLbd9HWH8uhRQ
 *   sol_price_feed  : 3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv (Raydium CLMM SOL/USDC pool)
 *   wsol_mint       : So11111111111111111111111111111111111111112
 *   usdc_mint       : EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

const MAINNET_RPC = "https://api.mainnet-beta.solana.com";

const PROTOCOL_WALLET = new PublicKey(
  "GeBqZr4vvvJume463qHbCWAPKnUY51tjLbd9HWH8uhRQ"
);
// Raydium CLMM SOL/USDC pool (price source, replaces Pyth oracle)
const RAYDIUM_SOL_USDC_POOL = new PublicKey(
  "3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv"
);
const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const USDC_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);

async function main() {
  console.log("Initializing vault on mainnet...\n");

  // Load wallet
  const walletPath = path.join(process.env.HOME!, ".config/solana/id.json");
  const walletKeypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );

  const connection = new Connection(MAINNET_RPC, "confirmed");
  const wallet = new Wallet(walletKeypair);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idlPath = path.join(__dirname, "..", "target", "idl", "vault.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const programId = new PublicKey(idl.address);
  const program = new Program(idl, provider);

  console.log("Program ID:", programId.toString());
  console.log("Admin:     ", walletKeypair.publicKey.toString());

  // Derive PDAs
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault")],
    programId
  );
  const [shareMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("share_mint"), vaultPda.toBuffer()],
    programId
  );
  const [solTreasury] = PublicKey.findProgramAddressSync(
    [Buffer.from("sol_treasury"), vaultPda.toBuffer()],
    programId
  );
  const [usdcTreasury] = PublicKey.findProgramAddressSync(
    [Buffer.from("usdc_treasury"), vaultPda.toBuffer()],
    programId
  );

  console.log("\nPDAs:");
  console.log("  Vault:        ", vaultPda.toString());
  console.log("  Share Mint:   ", shareMint.toString());
  console.log("  SOL Treasury: ", solTreasury.toString());
  console.log("  USDC Treasury:", usdcTreasury.toString());

  // Check if already initialized
  try {
    const vaultAccount = await (program.account as any).vault.fetch(vaultPda);
    console.log("\nVault already initialized!");
    console.log("  Total Shares:", vaultAccount.totalShares.toString());
    return;
  } catch {
    // Not initialized yet, proceed
  }

  console.log("\nCalling initialize...");
  const tx = await program.methods
    .initialize(PROTOCOL_WALLET, RAYDIUM_SOL_USDC_POOL)
    .accounts({
      admin: walletKeypair.publicKey,
      vault: vaultPda,
      shareMint,
      solTreasury,
      usdcTreasury,
      wsolMint: WSOL_MINT,
      usdcMint: USDC_MINT,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .rpc();

  console.log("Vault initialized! TX:", tx);

  const vaultAccount = await (program.account as any).vault.fetch(vaultPda);
  console.log("\nVault State:");
  console.log("  Admin:          ", vaultAccount.admin.toString());
  console.log("  Share Mint:     ", vaultAccount.shareMint.toString());
  console.log("  SOL Treasury:   ", vaultAccount.solTreasury.toString());
  console.log("  USDC Treasury:  ", vaultAccount.usdcTreasury.toString());
  console.log("  Protocol Wallet:", vaultAccount.protocolWallet.toString());
  console.log("  Sol Price Feed: ", vaultAccount.solPriceFeed.toString());
  console.log("  Total Shares:   ", vaultAccount.totalShares.toString());
  console.log("  Is Rebalancing: ", vaultAccount.isRebalancing);

  // Save mainnet config
  const mainnetConfig = {
    network: "mainnet-beta",
    programId: programId.toString(),
    vaultPda: vaultPda.toString(),
    shareMint: shareMint.toString(),
    solTreasury: solTreasury.toString(),
    usdcTreasury: usdcTreasury.toString(),
    admin: walletKeypair.publicKey.toString(),
    protocolWallet: PROTOCOL_WALLET.toString(),
    wsolMint: WSOL_MINT.toString(),
    usdcMint: USDC_MINT.toString(),
    raydiumSolUsdcPool: RAYDIUM_SOL_USDC_POOL.toString(),
  };

  const configPath = path.join(__dirname, "..", "mainnet-config.json");
  fs.writeFileSync(configPath, JSON.stringify(mainnetConfig, null, 2));
  console.log("\nSaved to mainnet-config.json");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
