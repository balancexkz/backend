# Vault Smart Contract — Frontend Integration Guide

## Содержание
1. [Адреса и конфиг](#1-адреса-и-конфиг)
2. [Установка зависимостей](#2-установка-зависимостей)
3. [Инициализация](#3-инициализация)
4. [PDA деривация](#4-pda-деривация)
5. [Чтение состояния vault](#5-чтение-состояния-vault)
6. [Deposit SOL](#6-deposit-sol)
7. [Deposit USDC](#7-deposit-usdc)
8. [Withdraw](#8-withdraw)
9. [Состояние пользователя](#9-состояние-пользователя)
10. [Важные ограничения](#10-важные-ограничения)
11. [Тестирование на devnet](#11-тестирование-на-devnet)
12. [Errors Reference](#12-errors-reference)

---

## 1. Адреса и конфиг

### Program IDs (одинаковые для devnet и mainnet)
```
Vault Program:        6wktAqahNmWdF14B4UQYam7bskj1fUcMQQXaE2jmTYNz
Smart Wallet Program: CikLi2FgfnAoDDepVRe8WA7SsEHvpaJeZv5WpbvvQKCw
```

### Devnet — задеплоенные адреса
```
Vault PDA:      4BKVfQPhwDs6yEHDhKAiUFCrz3CbK6GJxNhCzva3TXkN
Share Mint:     7df44baKnmsugZLCBuXav3dvgiZdyQZJMnjHLTJKVT5D
SOL Treasury:   8VNS1twcPMZnX4t8wNxp7EPFCsfLBM8zmYQ15F6VTvey
USDC Treasury:  7D8mjggXvCKL7zTgyJ6qy7btbhUDPgfVScm4uECgsTy
Admin:          38afxYQhjGKgyoWEsKhAZ85xkdCj3z6bj3YU5RY74mR1
```

### Токены
| Токен | Devnet | Mainnet | Decimals |
|-------|--------|---------|----------|
| wSOL  | `So11111111111111111111111111111111111111112` | `So11111111111111111111111111111111111111112` | 9 |
| USDC  | `BkAKUcPn5W9BxTn7YAgmdDeReynaB3vQvxYwyJsDWcCP` | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | 6 |

### Raydium Pool
```
Devnet Pool ID: 9PkgWfdiuhCeL9svLY1feA2uXiCkw7bbLhXZedaboZLz
```

> **Совет**: тяни эти адреса с бэкенда через `GET /vault/config`, чтобы не менять фронт при смене окружения.

---

## 2. Установка зависимостей

```bash
npm install @coral-xyz/anchor @solana/web3.js @solana/spl-token @solana/wallet-adapter-react
```

Версии, протестированные с контрактом:
```json
{
  "@coral-xyz/anchor": "^0.31.1",
  "@solana/web3.js":   "^1.95.x",
  "@solana/spl-token": "^0.4.x"
}
```

---

## 3. Инициализация

```typescript
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { useAnchorWallet } from "@solana/wallet-adapter-react";

// IDL — взять из /contracts/vault/target/idl/vault.json
// или запросить с бэкенда GET /vault/idl
import vaultIdl from "./vault.json";

const VAULT_PROGRAM_ID = new PublicKey("6wktAqahNmWdF14B4UQYam7bskj1fUcMQQXaE2jmTYNz");
const RPC_URL = "https://api.devnet.solana.com"; // devnet

function useVaultProgram() {
  const wallet = useAnchorWallet(); // из wallet-adapter

  const connection = new Connection(RPC_URL, "confirmed");
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });

  // Anchor 0.31+ читает programId из idl.address
  const program = new Program(vaultIdl as any, provider);

  return { program, connection, provider };
}
```

---

## 4. PDA деривация

Все адреса PDAs фронт может вычислить сам — они детерминированы.

```typescript
import { PublicKey } from "@solana/web3.js";

const VAULT_PROGRAM_ID = new PublicKey("6wktAqahNmWdF14B4UQYam7bskj1fUcMQQXaE2jmTYNz");

// ── Vault (глобальный стейт) ─────────────────────────────────────────────────
const [vaultPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault")],
  VAULT_PROGRAM_ID
);
// = 4BKVfQPhwDs6yEHDhKAiUFCrz3CbK6GJxNhCzva3TXkN

// ── SOL Treasury ─────────────────────────────────────────────────────────────
const [solTreasury] = PublicKey.findProgramAddressSync(
  [Buffer.from("sol_treasury"), vaultPda.toBuffer()],
  VAULT_PROGRAM_ID
);
// = 8VNS1twcPMZnX4t8wNxp7EPFCsfLBM8zmYQ15F6VTvey

// ── USDC Treasury ────────────────────────────────────────────────────────────
const [usdcTreasury] = PublicKey.findProgramAddressSync(
  [Buffer.from("usdc_treasury"), vaultPda.toBuffer()],
  VAULT_PROGRAM_ID
);
// = 7D8mjggXvCKL7zTgyJ6qy7btbhUDPgfVScm4uECgsTy

// ── Share Mint ───────────────────────────────────────────────────────────────
const [shareMint] = PublicKey.findProgramAddressSync(
  [Buffer.from("share_mint"), vaultPda.toBuffer()],
  VAULT_PROGRAM_ID
);
// = 7df44baKnmsugZLCBuXav3dvgiZdyQZJMnjHLTJKVT5D

// ── User Deposit PDA (индивидуальный для каждого юзера) ──────────────────────
const [userDepositPda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("user_deposit"),
    vaultPda.toBuffer(),
    userWalletPublicKey.toBuffer(), // PublicKey кошелька пользователя
  ],
  VAULT_PROGRAM_ID
);
```

---

## 5. Чтение состояния vault

### Vault (глобальный стейт — TVL, цена шара, пауза)

```typescript
const vault = await program.account.vault.fetch(vaultPda);

console.log({
  tvlUsd:             vault.tvlUsd.toNumber() / 1e6,        // TVL в долларах
  solPriceUsd:        vault.solPriceUsd.toNumber() / 1e6,   // цена SOL в USD
  totalShares:        vault.totalShares.toString(),
  treasurySol:        vault.treasurySol.toNumber() / 1e9,   // SOL в treasury
  treasuryUsdc:       vault.treasuryUsdc.toNumber() / 1e6,  // USDC в treasury
  hasActivePosition:  vault.hasActivePosition,
  isPaused:           vault.isPaused,
  lastTvlUpdate:      new Date(vault.lastTvlUpdate.toNumber() * 1000),
});

// Цена одного шара в USD (6 decimals)
const sharePriceUsd = vault.totalShares.toNumber() > 0
  ? vault.tvlUsd.toNumber() / vault.totalShares.toNumber()
  : 1.0; // начальная цена = 1 USD
```

### APR — берётся с бэкенда
```
GET /vault/info  →  { apr, tvlUsd, solPrice, isPaused, pricePerShareUsd }
```
APR рассчитывается ботом на основе собранных fees — не хранится в контракте.

---

## 6. Deposit SOL

### Полный флоу

1. Пользователь вводит сумму в SOL
2. Фронт создаёт/получает wSOL ATA пользователя
3. Фронт оборачивает SOL → wSOL (wrap)
4. Фронт вызывает инструкцию `deposit_sol`
5. После подтверждения — уведомить бэкенд через `POST /vault/deposit/confirm`

```typescript
import {
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  NATIVE_MINT,
} from "@solana/spl-token";
import {
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

async function depositSol(amountSol: number) {
  const { program, connection } = useVaultProgram();
  const userPubkey = wallet.publicKey; // из wallet-adapter

  const amountLamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
  const wsolMint = NATIVE_MINT; // So111...112

  // ── 1. Вычисляем адреса ────────────────────────────────────────────────────
  const [vaultPda]     = PublicKey.findProgramAddressSync([Buffer.from("vault")], program.programId);
  const [solTreasury]  = PublicKey.findProgramAddressSync([Buffer.from("sol_treasury"), vaultPda.toBuffer()], program.programId);
  const [shareMint]    = PublicKey.findProgramAddressSync([Buffer.from("share_mint"), vaultPda.toBuffer()], program.programId);
  const [userDeposit]  = PublicKey.findProgramAddressSync(
    [Buffer.from("user_deposit"), vaultPda.toBuffer(), userPubkey.toBuffer()],
    program.programId
  );

  // ATA пользователя для wSOL и share-токенов
  const userWsolAta  = getAssociatedTokenAddressSync(wsolMint, userPubkey);
  const userShareAta = getAssociatedTokenAddressSync(shareMint, userPubkey);

  // ── 2. Оборачиваем SOL → wSOL ─────────────────────────────────────────────
  // (нужно если у пользователя нет wSOL — обычно он именно так и работает)
  const wrapTx = new Transaction().add(
    // Создать wSOL ATA если нет
    createAssociatedTokenAccountIdempotentInstruction(
      userPubkey, userWsolAta, userPubkey, wsolMint
    ),
    // Перевести SOL lamports на wSOL ATA
    SystemProgram.transfer({
      fromPubkey: userPubkey,
      toPubkey:   userWsolAta,
      lamports:   amountLamports,
    }),
    // Синхронизировать баланс (wSOL = native SOL через sync_native)
    createSyncNativeInstruction(userWsolAta)
  );

  // Создать share ATA если нет
  const shareAtaInfo = await connection.getAccountInfo(userShareAta);
  if (!shareAtaInfo) {
    wrapTx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        userPubkey, userShareAta, userPubkey, shareMint
      )
    );
  }

  const wrapSig = await wallet.sendTransaction(wrapTx, connection);
  await connection.confirmTransaction(wrapSig, "confirmed");

  // ── 3. Вызываем deposit_sol ────────────────────────────────────────────────
  const depositTx = await program.methods
    .depositSol(new BN(amountLamports))
    .accounts({
      user:             userPubkey,
      vault:            vaultPda,
      userDeposit:      userDeposit,
      userWsolAccount:  userWsolAta,
      solTreasury:      solTreasury,
      shareMint:        shareMint,
      userShareAccount: userShareAta,
      wsolMint:         wsolMint,
      tokenProgram:     TOKEN_PROGRAM_ID,
      systemProgram:    SystemProgram.programId,
    })
    .transaction();

  const depositSig = await wallet.sendTransaction(depositTx, connection);
  await connection.confirmTransaction(depositSig, "confirmed");

  // ── 4. Уведомить бэкенд (он запишет в БД) ─────────────────────────────────
  await fetch("/vault/deposit/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
    body: JSON.stringify({
      txHash:         depositSig,
      userPubkey:     userPubkey.toBase58(),
      amountLamports: amountLamports,
    }),
  });

  return depositSig;
}
```

### Аккаунты для `deposit_sol`
| Аккаунт | Тип | Описание |
|---------|-----|----------|
| `user` | Signer | Кошелёк пользователя |
| `vault` | PDA `["vault"]` | Глобальный стейт vault |
| `user_deposit` | PDA `["user_deposit", vault, user]` | Стейт депозита пользователя (init если первый раз) |
| `user_wsol_account` | ATA(wSOL, user) | Откуда списываются wSOL |
| `sol_treasury` | PDA `["sol_treasury", vault]` | Куда зачисляются wSOL |
| `share_mint` | PDA `["share_mint", vault]` | Минт share-токенов |
| `user_share_account` | ATA(shareMint, user) | Куда минтятся shares |
| `wsol_mint` | `So111...112` | Native mint wSOL |
| `token_program` | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` | SPL Token program |
| `system_program` | `11111...1111` | System program |

---

## 7. Deposit USDC

```typescript
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";

async function depositUsdc(amountUsdc: number) {
  const { program, connection } = useVaultProgram();
  const userPubkey = wallet.publicKey;

  // На devnet USDC = BkAKUcPn5W9BxTn7YAgmdDeReynaB3vQvxYwyJsDWcCP
  // На mainnet USDC = EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
  const usdcMint = new PublicKey("BkAKUcPn5W9BxTn7YAgmdDeReynaB3vQvxYwyJsDWcCP");

  const amountRaw = Math.floor(amountUsdc * 1e6); // USDC = 6 decimals

  const [vaultPda]    = PublicKey.findProgramAddressSync([Buffer.from("vault")], program.programId);
  const [usdcTreasury]= PublicKey.findProgramAddressSync([Buffer.from("usdc_treasury"), vaultPda.toBuffer()], program.programId);
  const [shareMint]   = PublicKey.findProgramAddressSync([Buffer.from("share_mint"), vaultPda.toBuffer()], program.programId);
  const [userDeposit] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_deposit"), vaultPda.toBuffer(), userPubkey.toBuffer()],
    program.programId
  );

  const userUsdcAta  = getAssociatedTokenAddressSync(usdcMint, userPubkey);
  const userShareAta = getAssociatedTokenAddressSync(shareMint, userPubkey);

  const tx = await program.methods
    .depositUsdc(new BN(amountRaw))
    .accounts({
      user:             userPubkey,
      vault:            vaultPda,
      userDeposit:      userDeposit,
      userUsdcAccount:  userUsdcAta,
      usdcTreasury:     usdcTreasury,
      shareMint:        shareMint,
      userShareAccount: userShareAta,
      usdcMint:         usdcMint,
      tokenProgram:     TOKEN_PROGRAM_ID,
      systemProgram:    SystemProgram.programId,
    })
    .transaction();

  const sig = await wallet.sendTransaction(tx, connection);
  await connection.confirmTransaction(sig, "confirmed");

  await fetch("/vault/deposit/confirm", {
    method: "POST",
    body: JSON.stringify({ txHash: sig, userPubkey: userPubkey.toBase58(), amountUsdc }),
  });

  return sig;
}
```

### Аккаунты для `deposit_usdc`
| Аккаунт | Тип | Описание |
|---------|-----|----------|
| `user` | Signer | Кошелёк пользователя |
| `vault` | PDA `["vault"]` | Глобальный стейт |
| `user_deposit` | PDA `["user_deposit", vault, user]` | Стейт пользователя |
| `user_usdc_account` | ATA(usdcMint, user) | Откуда списывается USDC |
| `usdc_treasury` | PDA `["usdc_treasury", vault]` | Куда зачисляется USDC |
| `share_mint` | PDA `["share_mint", vault]` | Минт shares |
| `user_share_account` | ATA(shareMint, user) | Куда минтятся shares |
| `usdc_mint` | devnet/mainnet USDC | USDC mint |
| `token_program` | SPL Token | — |
| `system_program` | System | — |

---

## 8. Withdraw

> ⚠️ Withdraw сжигает **ВСЕ** shares пользователя сразу. Частичный вывод не поддерживается контрактом. Пользователь получает обратно пропорциональное количество SOL + USDC из treasury.

```typescript
async function withdraw() {
  const { program, connection } = useVaultProgram();
  const userPubkey = wallet.publicKey;

  const wsolMint = NATIVE_MINT;
  const usdcMint = new PublicKey("BkAKUcPn5W9BxTn7YAgmdDeReynaB3vQvxYwyJsDWcCP");

  const [vaultPda]    = PublicKey.findProgramAddressSync([Buffer.from("vault")], program.programId);
  const [solTreasury] = PublicKey.findProgramAddressSync([Buffer.from("sol_treasury"), vaultPda.toBuffer()], program.programId);
  const [usdcTreasury]= PublicKey.findProgramAddressSync([Buffer.from("usdc_treasury"), vaultPda.toBuffer()], program.programId);
  const [shareMint]   = PublicKey.findProgramAddressSync([Buffer.from("share_mint"), vaultPda.toBuffer()], program.programId);
  const [userDeposit] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_deposit"), vaultPda.toBuffer(), userPubkey.toBuffer()],
    program.programId
  );

  const userWsolAta  = getAssociatedTokenAddressSync(wsolMint, userPubkey);
  const userUsdcAta  = getAssociatedTokenAddressSync(usdcMint, userPubkey);
  const userShareAta = getAssociatedTokenAddressSync(shareMint, userPubkey);

  // Убедиться что USDC ATA существует (нужен для получения USDC)
  const preIxs: TransactionInstruction[] = [];
  const usdcAtaInfo = await connection.getAccountInfo(userUsdcAta);
  if (!usdcAtaInfo) {
    preIxs.push(
      createAssociatedTokenAccountIdempotentInstruction(
        userPubkey, userUsdcAta, userPubkey, usdcMint
      )
    );
  }

  const tx = await program.methods
    .withdraw()
    .accounts({
      user:             userPubkey,
      vault:            vaultPda,
      userDeposit:      userDeposit,
      shareMint:        shareMint,
      userShareAccount: userShareAta,
      solTreasury:      solTreasury,
      usdcTreasury:     usdcTreasury,
      userWsolAccount:  userWsolAta,
      userUsdcAccount:  userUsdcAta,
      tokenProgram:     TOKEN_PROGRAM_ID,
    })
    .preInstructions(preIxs)
    .transaction();

  const sig = await wallet.sendTransaction(tx, connection);
  await connection.confirmTransaction(sig, "confirmed");

  await fetch("/vault/withdraw/confirm", {
    method: "POST",
    body: JSON.stringify({ txHash: sig, userPubkey: userPubkey.toBase58() }),
  });

  return sig;
}
```

### Аккаунты для `withdraw`
| Аккаунт | Тип | Описание |
|---------|-----|----------|
| `user` | Signer | Кошелёк пользователя |
| `vault` | PDA `["vault"]` | Глобальный стейт |
| `user_deposit` | PDA `["user_deposit", vault, user]` | Стейт пользователя |
| `share_mint` | PDA `["share_mint", vault]` | Для сжигания shares |
| `user_share_account` | ATA(shareMint, user) | Откуда сжигаются shares |
| `sol_treasury` | PDA `["sol_treasury", vault]` | Откуда выплачивается SOL |
| `usdc_treasury` | PDA `["usdc_treasury", vault]` | Откуда выплачивается USDC |
| `user_wsol_account` | ATA(wSOL, user) | Куда приходит wSOL |
| `user_usdc_account` | ATA(usdcMint, user) | Куда приходит USDC |
| `token_program` | SPL Token | — |

---

## 9. Состояние пользователя

### Читать с бэкенда (рекомендуется)
```
GET /vault/user/:userPubkey
```
```json
{
  "shares":          "54820",
  "currentValueUsd": 10.87,
  "profitUsd":       0.84,
  "profitPct":       8.4
}
```

### Читать напрямую с чейна
```typescript
async function getUserState(userPubkey: PublicKey) {
  const { program, connection } = useVaultProgram();
  const [vaultPda] = PublicKey.findProgramAddressSync([Buffer.from("vault")], program.programId);

  // UserDeposit PDA
  const [userDepositPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_deposit"), vaultPda.toBuffer(), userPubkey.toBuffer()],
    program.programId
  );

  // Vault глобальный стейт
  const vault = await program.account.vault.fetch(vaultPda);

  // Стейт пользователя (null если первый депозит ещё не сделан)
  let userDeposit = null;
  try {
    userDeposit = await program.account.userDeposit.fetch(userDepositPda);
  } catch { /* не задепозитил ещё */ }

  if (!userDeposit || userDeposit.shares.toNumber() === 0) {
    return { shares: 0, valueUsd: 0, depositedSol: 0, depositedUsdc: 0 };
  }

  // Стоимость shares в USD
  const sharePriceUsd = vault.tvlUsd.toNumber() / vault.totalShares.toNumber(); // USD per share (не умножаем на 1e6 т.к. оба в 6 decimals)
  const valueUsd = userDeposit.shares.toNumber() * sharePriceUsd;

  return {
    shares:        userDeposit.shares.toNumber(),
    valueUsd:      valueUsd / 1e6,                                 // итоговое USD значение
    depositedSol:  userDeposit.totalDepositedSol.toNumber() / 1e9,
    depositedUsdc: userDeposit.totalDepositedUsdc.toNumber() / 1e6,
  };
}
```

---

## 10. Важные ограничения

### ⚠️ TVL должен быть свежим (< 10 минут)
Контракт проверяет `last_tvl_update`. Если прошло > 10 минут с последнего обновления — **депозит/вывод упадёт** с ошибкой `StaleTvl`.

**Кто обновляет**: бэкенд-бот автоматически вызывает `update_tvl` по расписанию (каждые 5 минут).

**Что делать на фронте**: перед показом кнопки "Invest" проверить свежесть TVL:
```typescript
const vault = await program.account.vault.fetch(vaultPda);
const lastUpdate = vault.lastTvlUpdate.toNumber() * 1000; // ms
const staleSec = (Date.now() - lastUpdate) / 1000;

if (staleSec > 540) { // предупреждение за 1 минуту до 10 минут
  showWarning("Vault обновляется, попробуйте через минуту");
}
```

### ⚠️ Vault может быть на паузе
```typescript
if (vault.isPaused) {
  // Заблокировать кнопку Invest / Withdraw
  showError("Vault временно приостановлен");
}
```

### ⚠️ Withdraw сжигает ВСЕ shares
Нет частичного вывода. Пользователь выводит всё сразу.

### ⚠️ wSOL после вывода
После `withdraw` пользователь получает **wSOL**, не нативный SOL. Нужно либо:
- Показать пользователю что у него wSOL в кошельке
- Или добавить `closeAccount` инструкцию для unwrap после вывода

### ⚠️ Первый депозит — нет UserDeposit PDA
Аккаунт `user_deposit` создаётся с `init_if_needed`. Первый депозит чуть дороже по газу (~0.002 SOL) из-за rent.

---

## 11. Тестирование на devnet

### Шаг 1 — Получить devnet SOL
```bash
solana airdrop 2 <ВАШ_АДРЕС> --url devnet
```
Или через https://faucet.solana.com

### Шаг 2 — Получить devnet USDC (BkAKUc...)
Devnet USDC — это кастомный токен `BkAKUcPn5W9BxTn7YAgmdDeReynaB3vQvxYwyJsDWcCP`.
Запросить минт у владельца проекта (скрипт `01-create-tokens.ts`) или написать в чат.

### Шаг 3 — Проверить состояние vault
```bash
cd /contracts/vault
npx ts-node scripts/check-vault.ts
```
Выводит: TVL, total_shares, treasury balances, активная позиция.

### Шаг 4 — Тестовый депозит (скрипт)
```bash
npx ts-node scripts/04-test-deposit.ts
```

### Шаг 5 — Смотреть транзакции
Devnet explorer: https://explorer.solana.com/?cluster=devnet
Вставить txHash или адрес wallet/vault.

### Проверить баланс shares пользователя (CLI)
```bash
# Узнать share mint ATA пользователя и его баланс
spl-token balance --owner <USER_PUBKEY> <SHARE_MINT> --url devnet
# SHARE_MINT = 7df44baKnmsugZLCBuXav3dvgiZdyQZJMnjHLTJKVT5D
```

---

## 12. Errors Reference

| Код ошибки | Что значит | Что делать на UI |
|-----------|-----------|-----------------|
| `StaleTvl` | TVL не обновлялся > 10 минут | "Данные обновляются, подождите..." |
| `VaultPaused` | Vault на паузе | "Vault временно недоступен" |
| `InvalidAmount` | Сумма депозита = 0 | Проверить input перед отправкой |
| `InsufficientShares` | У пользователя нет shares для вывода | Скрыть кнопку Withdraw |
| `MathOverflow` | Переполнение математики | Уменьшить сумму депозита |
| `InvalidMint` | Неправильный адрес токена | Проверить wsolMint/usdcMint |

---

## Быстрая справка — все адреса в одном месте

```typescript
// constants/vault.ts
export const VAULT_CONSTANTS = {
  // Program
  VAULT_PROGRAM_ID: "6wktAqahNmWdF14B4UQYam7bskj1fUcMQQXaE2jmTYNz",

  // Devnet
  devnet: {
    VAULT_PDA:      "4BKVfQPhwDs6yEHDhKAiUFCrz3CbK6GJxNhCzva3TXkN",
    SHARE_MINT:     "7df44baKnmsugZLCBuXav3dvgiZdyQZJMnjHLTJKVT5D",
    SOL_TREASURY:   "8VNS1twcPMZnX4t8wNxp7EPFCsfLBM8zmYQ15F6VTvey",
    USDC_TREASURY:  "7D8mjggXvCKL7zTgyJ6qy7btbhUDPgfVScm4uECgsTy",
    WSOL_MINT:      "So11111111111111111111111111111111111111112",
    USDC_MINT:      "BkAKUcPn5W9BxTn7YAgmdDeReynaB3vQvxYwyJsDWcCP",
    POOL_ID:        "9PkgWfdiuhCeL9svLY1feA2uXiCkw7bbLhXZedaboZLz",
    RPC:            "https://api.devnet.solana.com",
  },

  // Mainnet (заполнить после деплоя)
  mainnet: {
    VAULT_PDA:      "", // деривируется из programId
    SHARE_MINT:     "",
    SOL_TREASURY:   "",
    USDC_TREASURY:  "",
    WSOL_MINT:      "So11111111111111111111111111111111111111112",
    USDC_MINT:      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    RPC:            "https://api.mainnet-beta.solana.com",
  },

  // PDA Seeds (для самостоятельной деривации)
  SEEDS: {
    VAULT:        "vault",
    SOL_TREASURY: "sol_treasury",
    USDC_TREASURY:"usdc_treasury",
    SHARE_MINT:   "share_mint",
    USER_DEPOSIT: "user_deposit",
  },
};
```

---

## Контакт с бэкендом

После каждой on-chain операции фронт должен уведомить бэкенд:

```
POST /vault/deposit/confirm   { txHash, userPubkey, amountLamports }
POST /vault/withdraw/confirm  { txHash, userPubkey }
```

Это нужно чтобы бэкенд записал транзакцию в БД и показал историю в разделе **History**.
Если этот вызов упадёт — ничего страшного, транзакция уже в чейне. Бэкенд сам синхронизирует раз в 5 минут.
