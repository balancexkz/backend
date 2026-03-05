/**
 * scripts/test-vault-deposit.ts
 *
 * Тест vault deposit/withdraw через бэкенд API (без фронтенда).
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register scripts/test-vault-deposit.ts
 *
 * Что нужно:
 *   1. Бэкенд запущен:  npm run start:dev
 *   2. Solana CLI keypair:  ~/.config/solana/id.json  (с devnet SOL)
 *   3. Или укажи KEYPAIR_PATH ниже
 */

import * as fs from 'fs';
import * as os from 'os';
import axios from 'axios';
import {
  Connection,
  Keypair,
  Transaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const BACKEND   = 'http://localhost:3000';
const RPC       = 'https://api.devnet.solana.com';
const EMAIL     = 'admin@admin.com';
const PASSWORD  = 'raydiumweb321068910';
const AMOUNT_SOL = 0.1; // сколько SOL депозитить

const KEYPAIR_PATH = process.env.KEYPAIR_PATH
  ?? `${os.homedir()}/.config/solana/id.json`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const log = (msg: string) => console.log(`\n[TEST] ${msg}`);
const ok  = (msg: string) => console.log(`  ✅  ${msg}`);
const info= (msg: string) => console.log(`  ℹ️   ${msg}`);

async function main() {
  console.log('══════════════════════════════════════════');
  console.log('   Vault Deposit/Withdraw — Backend Test  ');
  console.log('══════════════════════════════════════════');

  // Загрузить keypair
  const secret  = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));
  const userPubkey = keypair.publicKey.toBase58();
  const connection = new Connection(RPC, 'confirmed');

  info(`Wallet: ${userPubkey}`);
  const bal = await connection.getBalance(keypair.publicKey);
  info(`Balance: ${bal / LAMPORTS_PER_SOL} SOL`);

  if (bal < 0.15 * LAMPORTS_PER_SOL) {
    console.log('\n⚠️  Мало SOL. Запрашиваем airdrop...');
    const sig = await connection.requestAirdrop(keypair.publicKey, 1 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, 'confirmed');
    ok('Airdrop 1 SOL получен');
  }

  // ── 1. Vault info ─────────────────────────────────────────────────────────
  log('1. GET /vault/info');
  const infoRes = await axios.get(`${BACKEND}/vault/info`);
  ok(`TVL: $${infoRes.data.tvlUsd}`);
  ok(`SOL Price: $${infoRes.data.solPrice}`);
  ok(`isPaused: ${infoRes.data.isPaused}`);
  ok(`Share price: ${infoRes.data.pricePerShareUsd} (6-dec units)`);

  if (infoRes.data.isPaused) {
    console.log('\n❌ Vault на паузе. Тест остановлен.');
    return;
  }

  // ── 2. Login ──────────────────────────────────────────────────────────────
  log('2. Login → JWT');
  const loginRes = await axios.post(`${BACKEND}/auth/login`, {
    email:    EMAIL,
    password: PASSWORD,
  });
  const jwt = loginRes.data?.data?.access_token ?? loginRes.data?.access_token;
  ok(`JWT получен: ${jwt.slice(0, 20)}...`);

  const api = axios.create({
    baseURL: BACKEND,
    headers: { Authorization: `Bearer ${jwt}` },
  });

  // ── 3. User state (до депозита) ───────────────────────────────────────────
  log('3. GET /vault/user/:pubkey (до депозита)');
  const userBefore = await axios.get(`${BACKEND}/vault/user/${userPubkey}`);
  info(`Shares before: ${userBefore.data.shares}`);
  info(`Value USD before: $${userBefore.data.shareValueUsd}`);

  // ── 4. Build deposit TX ───────────────────────────────────────────────────
  log(`4. GET /vault/deposit/build (${AMOUNT_SOL} SOL)`);
  const amountLamports = Math.floor(AMOUNT_SOL * LAMPORTS_PER_SOL);
  const buildRes = await axios.get(`${BACKEND}/vault/deposit/build`, {
    params: { userPubkey, amountLamports },
  });
  ok(`Shares to mint (preview): ${buildRes.data.sharesToMint}`);
  ok(`Deposit value USD: $${buildRes.data.depositValueUsd}`);

  // ── 5. Sign & send TX ─────────────────────────────────────────────────────
  log('5. Sign TX & broadcast to devnet');
  const tx = Transaction.from(Buffer.from(buildRes.data.transaction, 'base64'));
  tx.partialSign(keypair);
  const rawTx = tx.serialize();
  const txHash = await connection.sendRawTransaction(rawTx, { skipPreflight: false });
  await connection.confirmTransaction(txHash, 'confirmed');
  ok(`TX confirmed: ${txHash}`);
  ok(`Explorer: https://explorer.solana.com/tx/${txHash}?cluster=devnet`);

  // ── 6. Confirm (записать в БД) ────────────────────────────────────────────
  log('6. POST /vault/deposit/confirm');
  const confirmRes = await api.post('/vault/deposit/confirm', {
    txHash,
    userPubkey,
    amountLamports,
  });
  ok(`Saved to DB: ${JSON.stringify(confirmRes.data)}`);

  // ── 7. User state (после депозита) ────────────────────────────────────────
  log('7. GET /vault/user/:pubkey (после депозита)');
  await new Promise(r => setTimeout(r, 2000));
  const userAfter = await axios.get(`${BACKEND}/vault/user/${userPubkey}`);
  ok(`Shares after:  ${userAfter.data.shares}`);
  ok(`Value USD after: $${userAfter.data.shareValueUsd}`);

  // ── 8. Transaction history ────────────────────────────────────────────────
  log('8. GET /vault/history/:pubkey');
  const histRes = await axios.get(`${BACKEND}/vault/history/${userPubkey}`);
  ok(`Transactions in DB: ${histRes.data.count}`);
  for (const t of histRes.data.transactions) {
    console.log(`    [${t.type}] ${t.txHash?.slice(0, 12)}... | $${t.totalValueUsd}`);
  }

  // ── 9. Build withdraw TX (опционально) ───────────────────────────────────
  if (userAfter.data.shares > 0) {
    log('9. GET /vault/withdraw/build');
    const wdBuildRes = await axios.get(`${BACKEND}/vault/withdraw/build`, {
      params: { userPubkey },
    });
    ok(`Estimated SOL return:  ${wdBuildRes.data.estimatedSolReturn} SOL`);
    ok(`Estimated USDC return: ${wdBuildRes.data.estimatedUsdcReturn} USDC`);
    ok(`Estimated total USD:   $${wdBuildRes.data.estimatedTotalUsd}`);
    info('(Withdraw TX не отправляем — только preview)');
  }

  console.log('\n══════════════════════════════════════════');
  console.log('  ✅  Тест завершён успешно!');
  console.log('══════════════════════════════════════════');
}

main().catch(err => {
  console.error('\n❌ Ошибка:', err?.response?.data ?? err?.message ?? err);
  process.exit(1);
});
