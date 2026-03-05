import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

async function run() {
  const walletKeypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(path.join(process.env.HOME!, ".config/solana/id.json"), "utf-8")))
  );
  const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
  const wallet = new Wallet(walletKeypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "target", "idl", "vault.json"), "utf-8"));
  const program = new Program(idl, provider);
  const programId = new PublicKey(idl.address);

  const [vaultPda] = PublicKey.findProgramAddressSync([Buffer.from("vault")], programId);
  const [shareMint] = PublicKey.findProgramAddressSync([Buffer.from("share_mint"), vaultPda.toBuffer()], programId);
  const [solTreasury] = PublicKey.findProgramAddressSync([Buffer.from("sol_treasury"), vaultPda.toBuffer()], programId);
  const [userDepositPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_deposit"), vaultPda.toBuffer(), walletKeypair.publicKey.toBuffer()],
    programId
  );

  const WSOL = new PublicKey("So11111111111111111111111111111111111111112");
  const pyth = new PublicKey("H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG");
  const adminWsolAta = getAssociatedTokenAddressSync(WSOL, walletKeypair.publicKey);
  const adminShareAta = getAssociatedTokenAddressSync(shareMint, walletKeypair.publicKey);

  const wsolBal = await connection.getTokenAccountBalance(adminWsolAta).catch(() => null);
  console.log("wSOL ATA:", adminWsolAta.toString());
  console.log("wSOL balance:", wsolBal?.value?.uiAmount ?? "account not found");

  console.log("\nAccounts:");
  console.log("  vault:", vaultPda.toString());
  console.log("  userDeposit:", userDepositPda.toString());
  console.log("  solTreasury:", solTreasury.toString());
  console.log("  shareMint:", shareMint.toString());
  console.log("  userShareAccount:", adminShareAta.toString());

  console.log("\nCalling depositSol(0.1 SOL)...");
  try {
    const tx = await program.methods
      .depositSol(new BN(100_000_000))
      .accounts({
        user: walletKeypair.publicKey,
        vault: vaultPda,
        userDeposit: userDepositPda,
        userWsolAccount: adminWsolAta,
        solTreasury,
        shareMint,
        userShareAccount: adminShareAta,
        wsolMint: WSOL,
        priceFeed: pyth,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("✅ Success! TX:", tx);
  } catch (e: any) {
    console.error("❌ Error:", e.message ?? e);
    if (e.logs) {
      console.log("\nProgram logs:");
      e.logs.forEach((l: string) => console.log(" ", l));
    }
  }
}

run().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
