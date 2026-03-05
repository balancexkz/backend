# Vault Backend — Architecture & Specs

## Overview

Vault — это managed liquidity product: пользователи депозитят SOL, получают share-токены,
а admin-бот управляет ликвидностью на Raydium CLMM. Backend обеспечивает API для фронта
и автоматизацию admin-операций.

---

## Architecture

```
Frontend (React/Vite)
    │
    ├── GET  /vault/position          → текущая позиция + treasury
    ├── GET  /vault/user/:pubkey      → доля пользователя
    ├── GET  /vault/deposit/build     → unsigned TX для депозита
    ├── GET  /vault/withdraw/build    → unsigned TX для вывода
    ├── POST /vault/deposit/confirm   → сохранить депозит в БД
    └── POST /vault/withdraw/confirm  → сохранить вывод в БД

Backend (NestJS)
    │
    ├── VaultModule
    │   ├── VaultController           → публичные endpoints (выше)
    │   ├── VaultMonitorController    → admin endpoints (JWT)
    │   └── VaultService              → бизнес-логика
    │
    ├── SolanaModule (global)
    │   ├── SolanaService             → Connection, adminKeypair, Anchor programs
    │   └── VaultProgramService       → low-level CPI вызовы к vault программе
    │
    └── LiquidityBotModule
        └── LiquidityBotService       → Raydium SDK (pool info, tick arrays, etc.)

Solana Mainnet
    ├── Vault Program (BHdQMss1NL2AQGVmsrpyUfmp4o7XC5X9E5ZiXitsdGNx)
    │   ├── Vault PDA                 → state (TVL, shares, position info, treasury amounts)
    │   ├── sol_treasury PDA          → wSOL token account (idle deposits)
    │   └── usdc_treasury PDA         → USDC token account (idle deposits)
    │
    └── Raydium CLMM Pool (3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv)
        └── Position NFT              → активная позиция vault
```

---

## Data Flow

### Пользователь депозитит SOL

```
1. Frontend: GET /vault/deposit/build?userPubkey=X&amountLamports=Y
   └── VaultService.buildDeposit()
       └── VaultProgramService.buildDepositSolTx()
           → Transaction: [createWsolATA, transferSOL→wSOL, syncNative, depositSol ix]
           → unsigned base64 TX

2. Frontend: подписывает TX кошельком → broadcast → подтверждение

3. Frontend: POST /vault/deposit/confirm { txHash, userPubkey, amountLamports }
   └── VaultService.confirmDeposit()
       └── LiquidityTransactionService.save() → PostgreSQL

4. Итог: SOL сидит в sol_treasury PDA (idle), пользователь получил share-токены
```

### Пользователь видит свою долю

```
GET /vault/user/:userPubkey
└── VaultService.getUserPosition()
    ├── VaultProgramService.getVaultState()     → vault PDA state (on-chain)
    ├── VaultProgramService.getUserDepositState() → user_deposit PDA (shares)
    └── VaultProgramService.estimateWithdrawal() → реальные балансы treasury ATAs

    → UserPosition {
        shares, sharePercent, totalValueUsd,
        availableNow (из treasury),
        lockedInPosition (в CLMM),
        position: { mySol, myUsdc, myValueUsd },
        treasury: { mySol, myUsdc, myValueUsd },
        withdrawal: { estimatedSolReturn, estimatedUsdcReturn, estimatedTotalUsd }
      }
```

### Cron: update_tvl (каждые 5 мин)

```
VaultService.updateTvlCron()
├── getVaultState() → получить текущие amounts
├── CoinGecko API  → свежая цена SOL
├── Вычислить TVL = (sol_treasury + position_sol) * solPrice + usdc_total
├── Ограничить изменение ≤19% за апдейт (контракт не принимает >20%)
└── VaultProgramService.updateTvl(tvlUsd, solPrice) → on-chain
```

---

## Planned Features

### 1. increase_liquidity (приоритет — реализовать)

**Цель:** добавить idle средства из treasury в активную CLMM позицию
без закрытия позиции (vs close+reopen).

**Когда запускать:**
- Cron: каждые N минут проверять, есть ли idle средства в treasury
- Пороговое условие: treasury_sol > MIN_IDLE_SOL (например 0.01 SOL)
- Условие: позиция активна (`has_active_position = true`) И цена в диапазоне

**Алгоритм:**
```
1. getVaultState() — проверить treasury_sol, treasury_usdc, has_active_position
2. Если treasury_sol < MIN_THRESHOLD → skip
3. Получить tick arrays для текущей позиции из vault state (tick_lower, tick_upper)
4. Рассчитать amount0Max = treasury_sol_lamports, amount1Max = treasury_usdc
   (контракт сам определит оптимальное соотношение через base_flag)
5. Вызвать vault program: increase_liquidity(liquidity=0, amount0Max, amount1Max)
6. Логировать в DB (LiquidityTransaction)
```

**Контракт increase_liquidity accounts:**
```
admin, vault, sol_treasury, usdc_treasury,
pool_state (POOL_ID),
position_nft_account (ATA с vault PDA owner, mint = vault.position_mint),
personal_position (PDA: ["position", position_mint]),
token_vault_0, token_vault_1 (из pool state),
tick_array_lower, tick_array_upper (PDA: ["tick_array", pool, startIndex]),
vault_0_mint (WSOL), vault_1_mint (USDC),
clmm_program, token_program, token_program_2022
```

**Где реализовать:**
- `VaultProgramService.increaseLiquidity()` — CPI вызов
- `VaultService.triggerIncreaseLiquidity()` — оркестрация + порог + логирование
- `VaultService.increaseLiquidityCron()` — `@Cron(EVERY_10_MINUTES)`
- `VaultMonitorController` — `POST /monitoring/vault/increase-liquidity` (ручной триггер)

### 2. Отображение позиции пользователя

**Статус:** API уже реализован (`GET /vault/user/:userPubkey` возвращает `UserPosition`).

**Что возвращается:**
- `position.mySol` — сколько SOL пользователя заблокировано в CLMM позиции
- `position.myUsdc` — сколько USDC заблокировано
- `position.myValueUsd` — суммарная стоимость доли в позиции
- `treasury.mySol/myUsdc` — idle часть (можно вывести сейчас)
- `availableNow` — что вернёт withdraw() прямо сейчас (только treasury)
- `lockedInPosition` — что заблокировано в позиции

**Нужно:** фронт уже вызывает этот эндпоинт и отображает данные. ✅

---

## IDL Update Needed

Backend IDL (`src/solana/idl/vault.json`) содержит старый program ID:
`6wktAqahNmWdF14B4UQYam7bskj1fUcMQQXaE2jmTYNz`

Нужно обновить на:
`BHdQMss1NL2AQGVmsrpyUfmp4o7XC5X9E5ZiXitsdGNx`

И добавить инструкцию `increase_liquidity` в IDL.

---

## Key Constants (mainnet)

```
VAULT_PROGRAM_ID = BHdQMss1NL2AQGVmsrpyUfmp4o7XC5X9E5ZiXitsdGNx
VAULT_PDA        = 2MHdJWtmhpPzuy3i2GTtv6hJFkM46M4nZdX59GU9KDCp
SOL_TREASURY     = 9FRoiJHYe3mjLAfT7XJyLdJ8BPhvYp31ac8VTpQnPMUe
USDC_TREASURY    = 5CgqRTfJi55FFXwANKrvq6oNB3sjCTi9rAFeBFQpYi3b
SHARE_MINT       = HiXveGj8YsvzqGUPjFpt4TDjcaEDh4ZAgUVodXcLWCBj
RAYDIUM_POOL     = 3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv
RAYDIUM_CLMM     = CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK
WSOL_MINT        = So11111111111111111111111111111111111111112
USDC_MINT        = EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

---

## Liquidity Lifecycle

```
User deposit SOL
      ↓
sol_treasury (idle)
      ↓
increase_liquidity cron (or manual)
      │
      ├── treasury → Raydium CLMM position (in-range)
      │   vault.position_sol += sol_used
      │   vault.treasury_sol -= sol_used
      │
      └── if out-of-range: skip (wait for manual rebalance)

                  ↓ out of range
            close_position
                  ↓
            swap (balance ratio)
                  ↓
            open_position (new ticks)
```
