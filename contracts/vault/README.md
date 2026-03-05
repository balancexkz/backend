# 🏦 Solana Vault for Raydium CLMM Liquidity Management

Смарт-контракт на Solana для управления ликвидностью на Raydium Concentrated Liquidity Market Maker (CLMM).

## 🎯 Что это?

Vault позволяет пользователям депозитить SOL/USDC и получать share-токены, представляющие их долю в общем TVL (Total Value Locked). Администратор управляет средствами, размещая их в Raydium CLMM позициях для получения торговых комиссий.

### Основные возможности:

**Для пользователей:**
- 💰 Депозит SOL/USDC → получение share-токенов
- 📤 Вывод средств → сжигание shares, получение пропорциональной доли TVL
- 📈 Автоматический рост цены share при увеличении TVL

**Для администратора:**
- 🏊 Управление CLMM позициями: открытие, закрытие, увеличение/уменьшение ликвидности
- 💱 Swap токенов внутри treasury через Raydium
- 💸 Сбор торговых комиссий с позиций
- 📊 Обновление TVL и цены SOL
- 🔄 Вывод/возврат средств для ребалансировки

## 📐 Архитектура

```
┌─────────────────────────────────────────────────────────┐
│                     Vault Program                        │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  Vault PDA                                                │
│  ├── SOL Treasury (wSOL)     ← Хранит SOL пользователей │
│  ├── USDC Treasury            ← Хранит USDC пользователей│
│  ├── Share Mint               ← Минтит share-токены      │
│  └── Position NFT (optional)  ← Владеет Raydium позицией │
│                                                           │
│  User Actions:                                            │
│  ├── deposit_sol()    → mint shares                       │
│  ├── deposit_usdc()   → mint shares                       │
│  └── withdraw()       → burn shares, receive assets       │
│                                                           │
│  Admin Actions:                                           │
│  ├── open_position()        ↔ Raydium CLMM              │
│  ├── close_position()       ↔ Raydium CLMM              │
│  ├── increase_liquidity()   ↔ Raydium CLMM              │
│  ├── decrease_liquidity()   ↔ Raydium CLMM              │
│  ├── collect_fees()         ↔ Raydium CLMM              │
│  ├── swap_in_treasury()     ↔ Raydium CLMM              │
│  ├── update_tvl()           ← Backend периодически       │
│  ├── withdraw_to_manage()   → Admin wallet               │
│  └── return_from_manage()   ← Admin wallet               │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

## 🚀 Быстрый старт

> **📖 Документация:**
> - [⚡ QUICK-START.md](./QUICK-START.md) - Быстрая шпаргалка команд
> - [🚀 DEPLOYMENT.md](./DEPLOYMENT.md) - Полное руководство по деплою
> - [🪙 ADD-TOKENS-TO-RAYDIUM.md](./ADD-TOKENS-TO-RAYDIUM.md) - Как добавить токены в Raydium UI
> - [📝 scripts/README.md](./scripts/README.md) - Описание тестовых скриптов

### TL;DR (Супер-быстрый старт)

```bash
npm install
solana config set --url devnet && solana airdrop 2
anchor build  # Обновите program ID в lib.rs и Anchor.toml
anchor build && anchor deploy --provider.cluster devnet
npm run setup:tokens
# Создайте pool через Raydium UI (см. ADD-TOKENS-TO-RAYDIUM.md)
npm run setup:vault && npm run test:deposit
```

### Предварительные требования

```bash
# Rust & Cargo
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/v1.18.0/install)"

# Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.31.1
avm use 0.31.1

# Node.js (для тестов)
# Установите Node.js 18+
npm install
```

### Сборка

```bash
# Соберите программу
anchor build

# Получите program ID
solana address -k target/deploy/vault-keypair.json

# Обновите program ID в:
# - programs/vault/src/lib.rs (declare_id!)
# - Anchor.toml

# Пересоберите
anchor build
```

### Деплой в devnet

```bash
# Настройте devnet
solana config set --url devnet

# Получите devnet SOL
solana airdrop 2

# Задеплойте
anchor deploy --provider.cluster devnet
```

### Тестирование на devnet

Следуйте пошаговым инструкциям в [`scripts/README.md`](./scripts/README.md):

```bash
# 1. Создайте тестовые токены (TSOL, TUSDC)
npm run setup:tokens

# 2. Создайте Raydium CLMM pool
npm run setup:pool  # Следуйте инструкциям

# 3. Инициализируйте vault
npm run setup:vault

# 4. Протестируйте депозиты
npm run test:deposit

# 5. Протестируйте позиции на Raydium
npm run test:position

# 6. Полный интеграционный тест
npm run test:full
```

## 📖 Инструкции программы

### Пользовательские инструкции

#### `deposit_sol(amount: u64)`
Депозит SOL в vault, получение share-токенов.

**Логика:**
1. Проверяет актуальность TVL (< 10 минут)
2. Конвертирует SOL в USD по текущей цене
3. Рассчитывает shares: `shares = deposit_value * total_shares / tvl`
4. Переводит wSOL от пользователя в treasury
5. Минтит shares пользователю
6. Обновляет state vault и user_deposit

**Accounts:**
- `user` - подписант, плательщик
- `vault` - PDA vault
- `user_deposit` - PDA записи пользователя
- `user_wsol_account` - источник wSOL
- `sol_treasury` - получатель wSOL
- `share_mint` - mint для shares
- `user_share_account` - получатель shares

#### `deposit_usdc(amount: u64)`
Аналогично `deposit_sol`, но для USDC.

#### `withdraw(shares_amount: u64)`
Вывод средств, сжигание shares.

**Логика:**
1. Рассчитывает стоимость: `value = shares * tvl / total_shares`
2. Рассчитывает пропорции SOL/USDC для вывода
3. Сжигает shares пользователя
4. Переводит SOL/USDC из treasury пользователю
5. Обновляет state

### Административные инструкции

#### `initialize()`
Первичная инициализация vault.

Создаёт:
- Vault PDA
- Share mint (6 decimals)
- SOL treasury (wSOL)
- USDC treasury

#### `update_tvl(tvl_usd: u64, sol_price: u64)`
Обновляет TVL и цену SOL. Вызывается backend периодически.

**Важно:** TVL действителен 10 минут. Депозиты/выводы требуют свежий TVL.

#### `open_position(...)`
Открывает CLMM позицию на Raydium.

**Parameters:**
- `tick_lower_index` - нижняя граница диапазона цен
- `tick_upper_index` - верхняя граница диапазона цен
- `liquidity` - количество ликвидности
- `amount_0_max` - макс SOL для позиции
- `amount_1_max` - макс USDC для позиции

**CPI:** Вызывает Raydium `open_position_with_token22_nft`

#### `close_position()`
Закрывает активную позицию, возвращает средства в treasury.

**CPI:** Вызывает Raydium `close_position`

#### `increase_liquidity(liquidity, amount_0_max, amount_1_max)`
Увеличивает ликвидность в активной позиции.

#### `decrease_liquidity(liquidity, amount_0_min, amount_1_min)`
Уменьшает ликвидность в активной позиции.

#### `collect_fees()`
Собирает накопленные торговые комиссии с позиции в treasury.

**CPI:** Вызывает Raydium `collect`

#### `swap_in_treasury(amount_in, minimum_amount_out, direction)`
Свап SOL ↔ USDC внутри treasury через Raydium.

**Direction:**
- `SolToUsdc` - свап SOL → USDC
- `UsdcToSol` - свап USDC → SOL

#### `withdraw_to_manage(sol_amount, usdc_amount)`
Выводит средства из treasury в кошелёк admin для ребалансировки.

#### `return_from_manage(sol_amount, usdc_amount)`
Возвращает средства из кошелька admin обратно в treasury.

## 📊 State Accounts

### `Vault`
Главный аккаунт vault (PDA: `["vault"]`)

```rust
pub struct Vault {
    pub admin: Pubkey,              // Администратор
    pub share_mint: Pubkey,         // Mint share-токенов
    pub sol_treasury: Pubkey,       // PDA с wSOL
    pub usdc_treasury: Pubkey,      // PDA с USDC
    pub usdc_mint: Pubkey,          // USDC mint

    pub total_shares: u64,          // Всего shares выпущено
    pub treasury_sol: u64,          // SOL в treasury (lamports)
    pub treasury_usdc: u64,         // USDC в treasury (6 decimals)

    pub tvl_usd: u64,               // TVL в USD (6 decimals)
    pub sol_price_usd: u64,         // Цена SOL в USD (6 decimals)
    pub last_tvl_update: i64,       // Timestamp последнего обновления

    // Активная позиция
    pub position_mint: Pubkey,      // NFT позиции
    pub has_active_position: bool,  // Есть ли активная позиция
    pub position_liquidity: u128,   // Ликвидность позиции
    pub position_tick_lower: i32,   // Нижний tick
    pub position_tick_upper: i32,   // Верхний tick
    pub position_pool_id: Pubkey,   // Pool ID
}
```

### `UserDeposit`
Запись депозита пользователя (PDA: `["user_deposit", vault, user]`)

```rust
pub struct UserDeposit {
    pub user: Pubkey,               // Адрес пользователя
    pub vault: Pubkey,              // Vault
    pub shares: u64,                // Shares пользователя

    pub total_deposited_sol: u64,   // Всего депозитов SOL
    pub total_deposited_usdc: u64,  // Всего депозитов USDC
    pub total_withdrawn_usd: u64,   // Всего выводов USD

    pub created_at: i64,            // Первый депозит
    pub updated_at: i64,            // Последняя активность
}
```

## 🔒 Безопасность

### Implemented
- ✅ Admin-only инструкции (constraint checks)
- ✅ PDA ownership verification
- ✅ Stale TVL protection (10 min timeout)
- ✅ Overflow protection (checked math)
- ✅ Single active position enforcement

### Рекомендации
- 🔐 Используйте multi-sig для admin кошелька
- ⏰ Настройте автоматическое обновление TVL (cron)
- 🧪 Тестируйте на devnet перед mainnet
- 📊 Мониторьте TVL и позиции

## 🛠️ Разработка

### Структура проекта

```
vault/
├── programs/vault/
│   └── src/
│       ├── lib.rs              # Главный файл программы
│       ├── state.rs            # Vault, UserDeposit structs
│       ├── errors.rs           # Custom errors
│       └── instructions/       # Инструкции
│           ├── initialize.rs
│           ├── deposit_sol.rs
│           ├── withdraw.rs
│           ├── open_position.rs
│           └── ...
├── scripts/                    # TypeScript тесты
│   ├── 01-create-tokens.ts
│   ├── 02-create-pool.ts
│   ├── 03-initialize-vault.ts
│   └── ...
├── Anchor.toml                 # Anchor config
├── Cargo.toml                  # Rust dependencies
└── README.md
```

### Зависимости

**Rust:**
- `anchor-lang = "0.31.1"`
- `anchor-spl = "0.31.1"`
- `raydium-clmm-cpi` - для CPI в Raydium

**TypeScript:**
- `@coral-xyz/anchor = "^0.31.1"`
- `@solana/web3.js`
- `@solana/spl-token`

### Тестирование

```bash
# Unit tests (TODO)
anchor test

# Integration tests на devnet
npm run test:full
```

## 🐛 Known Issues & TODO

- [ ] Implement withdraw instruction (currently not fully implemented)
- [ ] Add proper error handling for Raydium CPI failures
- [ ] Add slippage protection for swaps
- [ ] Implement emergency pause mechanism
- [ ] Add events for better indexing
- [ ] Create frontend UI
- [ ] Audit by security firm

## 📚 Ресурсы

- [Raydium CLMM Docs](https://docs.raydium.io/)
- [Anchor Book](https://book.anchor-lang.com/)
- [Solana Cookbook](https://solanacookbook.com/)
- [SPL Token](https://spl.solana.com/token)

## 📄 Лицензия

MIT

## 🤝 Contributing

Pull requests are welcome! Для больших изменений сначала откройте issue.

## ⚠️ Disclaimer

Этот код предоставляется "как есть" без гарантий. Используйте на свой риск. Всегда проводите аудит перед использованием в production.
