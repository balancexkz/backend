# Vault — Invest Flow (Frontend Integration Guide)

## Что делает кнопка «Invest»

Пользователь депозитит SOL в **общий vault-контракт**.
Взамен он получает **share-токены** — пропорциональную долю в пуле.
Бот сам управляет позицией (ребаланс, сбор fees). Пользователь ничего не делает сам.

---

## Архитектура vault-контракта

```
Пользователь (Phantom)
       │
       │  подписывает инструкцию  deposit(lamports)
       ▼
┌─────────────────────────────────────────────┐
│         Vault Smart Contract (on-chain)     │
│                                             │
│  vault PDA         ← seeds: ["vault"]       │
│  sol_treasury PDA  ← seeds: ["sol_treasury", vault]   │
│  usdc_treasury PDA ← seeds: ["usdc_treasury", vault]  │
│  share_mint PDA    ← seeds: ["share_mint", vault]     │
│  userDeposit PDA   ← seeds: ["user_deposit", vault, user] │
└─────────────────────────────────────────────┘
       │
       │  минтит share-токены пользователю
       │  зачисляет SOL в sol_treasury
       ▼
┌─────────────────────────┐
│   userDeposit PDA       │
│   shares: u64           │  ← сколько share-токенов у пользователя
│   depositedLamports: u64│  ← сколько SOL задепозитил (для статистики)
└─────────────────────────┘
```

---

## Полный флоу — шаг за шагом

```
Frontend                            Backend                     Solana
   │                                   │                           │
   │  1. GET /vault/info               │                           │
   │──────────────────────────────────>│                           │
   │<── tvlUsd, apr, solPrice ─────────│                           │
   │                                   │                           │
   │  (пользователь вводит сумму SOL)  │                           │
   │                                   │                           │
   │  2. GET /vault/deposit/build      │                           │
   │     ?userPubkey=&amountLamports=  │                           │
   │──────────────────────────────────>│  читает vault PDA (цена шара)
   │<── { transaction: base64,         │                           │
   │      sharesToMint, pricePerShare } │                          │
   │                                   │                           │
   │  3. Wallet.signAndSendTransaction │                           │
   │────────────────────────────────────────────────────────────── >│
   │<── txHash ──────────────────────────────────────────────────── │
   │                                   │                           │
   │  4. POST /vault/deposit/confirm   │                           │
   │     { txHash, userPubkey,         │                           │
   │       amountLamports }            │                           │
   │──────────────────────────────────>│  проверяет tx on-chain    │
   │                                   │  обновляет DB             │
   │<── { success, sharesReceived,     │                           │
   │      shareBalanceUsd }            │                           │
```

---

## API Endpoints (все под JWT-токеном роли `vault` / `admin`)

### `GET /vault/info`
Статистика пула для главной страницы.
```json
Response:
{
  "tvlUsd": 125400.50,
  "solPrice": 183.20,
  "apr": 0.98,
  "totalShares": "4820000000",
  "pricePerShareSol": 0.000026,
  "isPaused": false
}
```

---

### `GET /vault/deposit/build?userPubkey={pubkey}&amountLamports={n}`
Возвращает **неподписанную транзакцию** в base64.
Фронт подписывает её кошельком пользователя и отправляет в сеть.

```json
Request params:
  userPubkey    — публичный ключ кошелька пользователя (string)
  amountLamports — сумма депозита в lamports (1 SOL = 1_000_000_000)

Response:
{
  "transaction": "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAQAHBeyR3...",
  "sharesToMint": "54820",
  "pricePerShareSol": 0.0000265,
  "estimatedShareValueUsd": 183.20,
  "vaultPda": "7xKXt...",
  "shareMintPda": "3mNPq..."
}
```

> ⚠️ **Важно**: транзакция содержит `recentBlockhash` и действительна ~90 секунд.
> Если пользователь медлит → запросить снова.

---

### `POST /vault/deposit/confirm`
Вызвать **сразу после** того как транзакция подтверждена в сети.
Backend верифицирует tx на чейне и записывает депозит в БД.

```json
Request body:
{
  "txHash": "5GsMpJ3...",
  "userPubkey": "BqQnf...",
  "amountLamports": 200000000
}

Response:
{
  "success": true,
  "sharesReceived": "54820",
  "newShareBalance": "54820",
  "shareBalanceUsd": 10.03,
  "txHash": "5GsMpJ3..."
}
```

---

### `GET /vault/user/:userPubkey`
Текущее состояние пользователя в vault.

```json
Response:
{
  "userPubkey": "BqQnf...",
  "shares": "54820",
  "depositedLamports": "200000000",
  "currentValueUsd": 10.87,
  "profitUsd": 0.84,
  "profitPct": 8.4
}
```

---

### `GET /vault/withdraw/build?userPubkey={pubkey}&shareAmount={n}`
Аналогично deposit — возвращает неподписанную транзакцию вывода.

```json
Response:
{
  "transaction": "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAQAHBeyR3...",
  "estimatedSolReturn": 0.198,
  "estimatedUsdReturn": 36.28
}
```

---

### `POST /vault/withdraw/confirm`
```json
Request body:
{
  "txHash": "9xQmPJ3...",
  "userPubkey": "BqQnf...",
  "shareAmount": "54820"
}
```

---

## Что фронт подписывает

Фронт получает `transaction` в base64 → декодирует → `wallet.signAndSendTransaction()`.

**Пример (TypeScript + @solana/wallet-adapter-react):**
```typescript
import { useWallet } from '@solana/wallet-adapter-react';
import { Transaction, Connection } from '@solana/web3.js';

const { publicKey, signTransaction, sendTransaction } = useWallet();
const connection = new Connection(RPC_URL);

async function invest(amountSol: number) {
  const lamports = Math.floor(amountSol * 1e9);

  // 1. Получить неподписанную транзакцию
  const { data } = await api.get(`/vault/deposit/build`, {
    params: {
      userPubkey: publicKey.toBase58(),
      amountLamports: lamports,
    },
  });

  // 2. Декодировать и подписать
  const tx = Transaction.from(Buffer.from(data.transaction, 'base64'));
  const signed = await signTransaction(tx);

  // 3. Отправить в сеть
  const txHash = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(txHash, 'confirmed');

  // 4. Уведомить backend
  await api.post('/vault/deposit/confirm', {
    txHash,
    userPubkey: publicKey.toBase58(),
    amountLamports: lamports,
  });

  // 5. Обновить UI
  refetchBalance();
}
```

---

## Как backend узнаёт о транзакции

**Выбранная стратегия: "Frontend confirms after broadcast"**
После того как кошелёк пользователя подтвердил транзакцию в сети, фронт вызывает
`POST /vault/deposit/confirm`. Backend:

1. Делает `connection.getTransaction(txHash)` → верифицирует что это реальная tx
2. Проверяет что `tx.instructions` содержит вызов vault-программы (по program ID)
3. Читает on-chain `userDeposit PDA` → берёт итоговый баланс shares (source of truth)
4. Записывает в таблицу `liquidity_transactions` (роль vault)
5. Обновляет `User.walletPubkey` если не привязан

**Почему не WebSocket/polling?**

| Подход | Плюсы | Минусы |
|---|---|---|
| Frontend confirm (выбранный) | Просто, мгновенно, нет нагрузки | Нужен вызов от фронта |
| Backend WebSocket (`onAccountChange`) | Не нужен вызов от фронта | Сложно, много открытых соединений, devnet нестабилен |
| Backend polling (каждые N сек) | Надёжный fallback | Задержка, нагрузка на RPC |

На продакшне можно добавить **фоновый reconciler** — раз в 5 минут Backend
читает все `userDeposit` PDAs и сверяет с БД (fallback на случай пропуска).

---

## Что нужно учесть в UI

1. **Кнопка задизейблена** пока кошелёк не подключён (Connect Wallet)
2. **До показа суммы share** — вызвать `/vault/deposit/build` для расчёта `sharesToMint` (превью)
3. **Минимальный депозит** — 0.01 SOL (проверить на фронте до отправки запроса)
4. **Если vault isPaused: true** — кнопка Invest задизейблена, показать сообщение
5. **Loading state** — кнопка показывает spinner между steps 2–4
6. **Ошибка пользователя** — если кошелёк отклонил подпись, не вызывать `/confirm`
7. **Ошибка сети** — если `/confirm` упал, можно повторить (он идемпотентен по `txHash`)

---

## Что пользователь видит после Invest

```
POOL BALANCES
  SOL    → [твой депозит в SOL]
  USDC   → [эквивалент в USDC]

CURRENT DEPOSIT
  $XX.XX

CURRENT APR
  100%  ← берётся из /vault/info
```

Для этого нужен `GET /vault/user/:userPubkey` + пересчёт shares → USD
по `pricePerShareSol * solPrice` из `/vault/info`.
