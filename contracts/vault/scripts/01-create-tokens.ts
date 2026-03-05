import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import * as fs from "fs";

// Загрузите IDL явно
const idl = require("../target/idl/vault.json");

const POOL_ID = new PublicKey("7PKSdUDAEXtGEVZtGSizZ1YUN3o6HewBi3ZkT4ewPCoS");

async function main() {
  // Setup connection
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  
  // Load wallet
  const walletKeypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf-8")))
  );
  const wallet = new Wallet(walletKeypair);
  
  // Create provider
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  
  const program = new Program(idl, provider);

  console.log("🚀 Testing Vault on devnet");
  console.log("Program ID:", program.programId.toString());
  console.log("Pool ID:", POOL_ID.toString());
  console.log("Wallet:", wallet.publicKey.toString());

  // PDAs
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
  console.log("Vault:", vaultPda.toString());
  console.log("Share Mint:", shareMint.toString());
  console.log("SOL Treasury:", solTreasury.toString());
  console.log("USDC Treasury:", usdcTreasury.toString());

  const wsolMint = new PublicKey("So11111111111111111111111111111111111111112");
  const usdcMint = new PublicKey("EbaJd4dUSjARfajn1fc8Ekot2LxemFPouPi7BnSyoBrb");

  // Protocol wallet receives 10% of trading fees
  const protocolWallet = new PublicKey("GeBqZr4vvvJume463qHbCWAPKnUY51tjLbd9HWH8uhRQ");
  // Pyth devnet SOL/USD price feed (legacy account model, pyth-sdk-solana)
  const pythSolUsdDevnet = new PublicKey("J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix");

  // 1. Инициализация vault
  console.log("\n1️⃣ Initializing vault...");
  try {
    const vaultAccount = await connection.getAccountInfo(vaultPda);
    if (vaultAccount) {
      console.log("✅ Vault already initialized");
    } else {
      throw new Error("Not initialized");
    }
  } catch {
    const tx = await program.methods
      .initialize(protocolWallet, pythSolUsdDevnet)
      .accounts({
        admin: wallet.publicKey,
        vault: vaultPda,
        shareMint: shareMint,
        solTreasury: solTreasury,
        usdcTreasury: usdcTreasury,
        wsolMint: wsolMint,
        usdcMint: usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();
    console.log("✅ Vault initialized:", tx);
  }

  console.log("\n2️⃣ TVL is now calculated on-chain via Pyth oracle (no updateTvl needed)");
  console.log("   Price feed:", pythSolUsdDevnet.toString());
  console.log("   Protocol wallet:", protocolWallet.toString());

  console.log("\n✨ Setup completed!");
}

main().catch(console.error);
