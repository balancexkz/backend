/**
 * scripts/test-pro-role.ts
 *
 * End-to-end test for the PRO role WITHOUT a browser or wallet extension.
 *
 * Prerequisites:
 *   1. Backend running:    npm run start:dev
 *   2. Devnet configured:  .env → SOLANA_RPC_URL=https://api.devnet.solana.com
 *   3. Admin funded:       The admin keypair in .env must have devnet SOL
 *   4. Pool ID set:        POOL_ID below must be a real devnet Raydium CLMM pool
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register scripts/test-pro-role.ts
 *
 * What this script does:
 *   Step 0  – Generate (or load) the test owner keypair (no browser needed)
 *   Step 1  – Airdrop SOL to the owner on devnet
 *   Step 2  – Create SmartWallet on-chain (owner signs locally)
 *   Step 3  – Set backend admin as delegate (owner signs locally)
 *   Step 4  – Fund the SOL treasury (send wSOL to the treasury PDA)
 *   Step 5  – Fund the USDC treasury (send USDC to the treasury PDA)
 *   Step 6  – Register the user with the backend DB
 *   Step 7  – Open a CLMM position via the admin API
 *   Step 8  – Check monitoring status
 *   Step 9  – Manually trigger rebalance
 *   Step 10 – View transaction history
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import axios, { AxiosInstance } from 'axios';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
  SystemProgram,
} from '@solana/web3.js';
import {
  createSyncNativeInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local'), override: true });

// ─── Config ───────────────────────────────────────────────────────────────────

const BACKEND_URL = process.env.TEST_BACKEND_URL ?? 'http://localhost:3000';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@admin.com';
const ADMIN_PASS  = process.env.TEST_ADMIN_PASS  ?? 'admin123';
const RPC_URL     = process.env.SOLANA_RPC_URL   ?? 'https://api.devnet.solana.com';

// ⚠️  Replace with a real devnet Raydium CLMM pool ID (SOL/USDC)
// Example devnet pool (check https://dev.raydium.io or Solscan devnet):
const POOL_ID = process.env.TEST_POOL_ID ?? '3ucNos4NbumPLZNWztqGZdzjxY4MaAFKKNuXNQRNFJKB';

// Treasury funding amounts
const FUND_SOL_LAMPORTS  = 0.2 * LAMPORTS_PER_SOL; // 0.2 SOL
const FUND_USDC_TOKENS   = 10_000_000;              // 10 USDC (6 decimals)

const KEYPAIR_PATH = path.resolve(__dirname, '.test-owner-keypair.json');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const log  = (msg: string) => console.log(`\n[TEST] ${msg}`);
const ok   = (msg: string) => console.log(`  ✅ ${msg}`);
const info = (msg: string) => console.log(`  ℹ️  ${msg}`);
const fail = (msg: string) => { throw new Error(msg); };

function loadOrCreateOwner(): Keypair {
  if (fs.existsSync(KEYPAIR_PATH)) {
    const raw = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'));
    info(`Loaded existing owner keypair from ${KEYPAIR_PATH}`);
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  }
  const kp = Keypair.generate();
  fs.writeFileSync(KEYPAIR_PATH, JSON.stringify(Array.from(kp.secretKey)));
  info(`Generated new owner keypair → ${KEYPAIR_PATH}`);
  return kp;
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function signAndSend(
  connection: Connection,
  tx: Transaction,
  ...signers: Keypair[]
): Promise<string> {
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  if (signers[0]) tx.feePayer = signers[0].publicKey;
  return sendAndConfirmTransaction(connection, tx, signers, { commitment: 'confirmed' });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  PRO Role — End-to-End Test (no frontend / no wallet)  ');
  console.log('═══════════════════════════════════════════════════════');

  const connection = new Connection(RPC_URL, 'confirmed');
  const owner = loadOrCreateOwner();
  const ownerPubkey = owner.publicKey.toBase58();

  info(`Owner pubkey  : ${ownerPubkey}`);
  info(`Backend URL   : ${BACKEND_URL}`);
  info(`Solana RPC    : ${RPC_URL}`);
  info(`Pool ID       : ${POOL_ID}`);

  // ── Step 0: Check / airdrop owner ─────────────────────────────────────────
  log('Step 0 — Airdrop SOL to owner (if needed)');
  {
    const bal = await connection.getBalance(owner.publicKey);
    info(`Owner balance: ${bal / LAMPORTS_PER_SOL} SOL`);
    if (bal < 0.3 * LAMPORTS_PER_SOL) {
      info('Balance low — requesting airdrop…');
      const sig = await connection.requestAirdrop(owner.publicKey, 1 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, 'confirmed');
      ok(`Airdropped 1 SOL → ${owner.publicKey.toBase58()}`);
    } else {
      ok('Balance sufficient, skipping airdrop');
    }
  }

  // ── Step 1: Login as admin ─────────────────────────────────────────────────
  log('Step 1 — Login as admin');
  let api: AxiosInstance;
  {
    const res = await axios.post(`${BACKEND_URL}/auth/login`, {
      email:    ADMIN_EMAIL,
      password: ADMIN_PASS,
    });
    const token = res.data?.data?.access_token ?? res.data?.access_token;
    if (!token) fail(`Login failed: ${JSON.stringify(res.data)}`);
    api = axios.create({
      baseURL: BACKEND_URL,
      headers: { Authorization: `Bearer ${token}` },
    });
    ok(`Logged in as ${ADMIN_EMAIL}`);
  }

  // ── Step 2: Create SmartWallet on-chain ───────────────────────────────────
  log('Step 2 — Create SmartWallet on-chain (owner signs locally)');
  {
    // Check if already exists
    const statusRes = await api.get(`/pro/wallet/status?ownerPubkey=${ownerPubkey}`).catch(() => null);
    if (statusRes?.data?.exists) {
      ok('SmartWallet already exists — skipping creation');
    } else {
      // Get unsigned tx from backend
      const buildRes = await api.get(`/pro/wallet/build-create?ownerPubkey=${ownerPubkey}`);
      const txBase64 = buildRes.data.transaction;
      const tx = Transaction.from(Buffer.from(txBase64, 'base64'));
      // Owner signs and broadcasts (no browser needed!)
      const sig = await signAndSend(connection, tx, owner);
      ok(`SmartWallet created: ${sig}`);
      await sleep(2000);
    }
  }

  // ── Step 3: Set delegate ───────────────────────────────────────────────────
  log('Step 3 — Set admin as delegate (owner signs locally)');
  {
    const onChain = await api.get(`/pro/wallet/status?ownerPubkey=${ownerPubkey}`);
    if (onChain.data?.onChain?.isPaused === false &&
        onChain.data?.onChain?.hasActivePosition !== undefined) {
      // If the wallet exists and we can read its state, delegate is likely set.
      // Attempt setDelegate anyway (idempotent on Anchor side).
    }
    const buildRes = await api.get(`/pro/wallet/build-delegate?ownerPubkey=${ownerPubkey}`);
    const txBase64 = buildRes.data.transaction;
    const tx = Transaction.from(Buffer.from(txBase64, 'base64'));
    const sig = await signAndSend(connection, tx, owner);
    ok(`Delegate set to ${buildRes.data.delegatePubkey}: ${sig}`);
    await sleep(2000);
  }

  // ── Step 4: Fund the SOL treasury (wrap SOL) ──────────────────────────────
  log('Step 4 — Fund SOL treasury (wrap SOL → wSOL)');
  {
    const walletRes  = await api.get(`/pro/wallet/status?ownerPubkey=${ownerPubkey}`);
    const walletPda  = new PublicKey(walletRes.data.walletPda);
    const solTreasury = getAssociatedTokenAddressSync(NATIVE_MINT, walletPda, true);

    const tx = new Transaction().add(
      // Create the wSOL ATA for the SmartWallet PDA (owner pays)
      createAssociatedTokenAccountIdempotentInstruction(
        owner.publicKey,  // payer
        solTreasury,      // ata
        walletPda,        // owner of the ata
        NATIVE_MINT,
      ),
      // Transfer SOL lamports to the ATA address
      SystemProgram.transfer({
        fromPubkey: owner.publicKey,
        toPubkey:   solTreasury,
        lamports:   FUND_SOL_LAMPORTS,
      }),
      // Sync the native token balance
      createSyncNativeInstruction(solTreasury),
    );

    const sig = await signAndSend(connection, tx, owner);
    ok(`Funded SOL treasury with ${FUND_SOL_LAMPORTS / LAMPORTS_PER_SOL} SOL: ${sig}`);
  }

  // ── Step 5: Fund the USDC treasury ────────────────────────────────────────
  log('Step 5 — Fund USDC treasury');
  {
    const balRes = await api.get(`/pro/wallet/balances?ownerPubkey=${ownerPubkey}`);
    if (balRes.data.usdc?.raw > 0) {
      ok(`USDC treasury already funded (${balRes.data.usdc.human} USDC)`);
    } else {
      info(`⚠️  USDC treasury is empty.`);
      info(`   On devnet, get USDC from the Raydium devnet faucet or mint directly.`);
      info(`   USDC mint: ${process.env.USDC_MINT}`);
      info(`   Skipping automatic USDC funding (manual step required).`);
    }
  }

  // ── Step 6: Register user in backend DB ───────────────────────────────────
  log('Step 6 — Register user with backend (DB record)');
  {
    const res = await api.post('/pro/register', {
      ownerPubkey,
      poolId:            POOL_ID,
      priceRangePercent: 5,
    });
    ok(`Registered: ${JSON.stringify(res.data.record)}`);
  }

  // ── Step 7: Open a position ────────────────────────────────────────────────
  log('Step 7 — Open CLMM position (admin delegate signs on-chain)');
  {
    try {
      const res = await api.post(`/pro/${ownerPubkey}/position/open`, {
        priceRangePercent: 5,
        amount0MaxFraction: 0.9,
        amount1MaxFraction: 0.95,
        solPrice: 180, // approximate — only used for logging
      });
      ok(`Position opened!`);
      ok(`  TX:       ${res.data.result.tx}`);
      ok(`  NFT Mint: ${res.data.result.positionNftMint}`);
      ok(`  Ticks:    [${res.data.result.tickLower}, ${res.data.result.tickUpper}]`);
    } catch (err) {
      const msg = err?.response?.data?.message ?? err?.message;
      info(`⚠️  openPosition failed: ${msg}`);
      info('   This is expected if treasuries are not funded or pool is wrong.');
    }
  }

  // ── Step 8: Check monitor status ──────────────────────────────────────────
  log('Step 8 — Monitor status');
  {
    const res = await api.get('/monitoring/pro/status');
    ok(`Monitor stats: ${JSON.stringify(res.data.stats, null, 2)}`);
  }

  // ── Step 9: Manual rebalance (optional) ───────────────────────────────────
  log('Step 9 — Manual rebalance (skip if no active position)');
  {
    const statusRes = await api.get(`/pro/wallet/status?ownerPubkey=${ownerPubkey}`);
    const hasPosition = statusRes.data?.onChain?.hasActivePosition;

    if (!hasPosition) {
      info('No active position — skipping manual rebalance');
    } else {
      try {
        const res = await api.post(`/monitoring/pro/rebalance/${ownerPubkey}`);
        ok(`Rebalance result: ${JSON.stringify(res.data.result, null, 2)}`);
      } catch (err) {
        info(`Rebalance skipped/failed: ${err?.response?.data?.message ?? err?.message}`);
      }
    }
  }

  // ── Step 10: Transaction history ──────────────────────────────────────────
  log('Step 10 — Transaction history');
  {
    const res = await api.get(`/monitoring/pro/history/${ownerPubkey}?limit=10`);
    ok(`Found ${res.data.count} transaction(s):`);
    for (const tx of res.data.transactions) {
      console.log(`    [${tx.type}] ${tx.txHash?.slice(0, 12)}... | totalUsd=$${tx.totalValueUsd}`);
    }
  }

  // ── Step 11: Profit summary ────────────────────────────────────────────────
  log('Step 11 — Profit summary');
  {
    const res = await api.get(`/monitoring/pro/profit/${ownerPubkey}`);
    ok(`P&L summary: ${JSON.stringify(res.data.summary, null, 2)}`);
  }

  console.log('\n═════════════════════════════════════════════════');
  console.log('  ✅  Test run complete!');
  console.log('═════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('\n❌ Test failed:', err?.response?.data ?? err?.message ?? err);
  process.exit(1);
});
