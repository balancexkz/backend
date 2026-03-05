/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/vault.json`.
 */
export type Vault = {
  "address": "6wktAqahNmWdF14B4UQYam7bskj1fUcMQQXaE2jmTYNz",
  "metadata": {
    "name": "vault",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Solana Vault for managed liquidity on Raydium CLMM"
  },
  "instructions": [
    {
      "name": "acceptAdmin",
      "docs": [
        "Step 2: New admin accepts the transfer"
      ],
      "discriminator": [
        112,
        42,
        45,
        90,
        116,
        181,
        13,
        170
      ],
      "accounts": [
        {
          "name": "newAdmin",
          "docs": [
            "New admin (must be the pending_admin)"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "docs": [
            "Vault state"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "closePosition",
      "docs": [
        "Close the active CLMM position and return funds to treasury"
      ],
      "discriminator": [
        123,
        134,
        81,
        0,
        49,
        68,
        98,
        98
      ],
      "accounts": [
        {
          "name": "admin",
          "docs": [
            "Admin closing the position"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "docs": [
            "Vault state"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "solTreasury",
          "docs": [
            "SOL treasury PDA (destination for token0)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "usdcTreasury",
          "docs": [
            "USDC treasury PDA (destination for token1)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  100,
                  99,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "poolState",
          "docs": [
            "Pool state"
          ],
          "writable": true
        },
        {
          "name": "positionNftMint",
          "docs": [
            "Position NFT mint"
          ],
          "writable": true
        },
        {
          "name": "positionNftAccount",
          "docs": [
            "Position NFT account (owned by vault)"
          ],
          "writable": true
        },
        {
          "name": "personalPosition",
          "docs": [
            "Personal position state"
          ],
          "writable": true
        },
        {
          "name": "tokenVault0",
          "docs": [
            "Token vault 0 (pool's SOL vault)"
          ],
          "writable": true
        },
        {
          "name": "tokenVault1",
          "docs": [
            "Token vault 1 (pool's USDC vault)"
          ],
          "writable": true
        },
        {
          "name": "tickArrayLower",
          "docs": [
            "Tick array for lower bound"
          ],
          "writable": true
        },
        {
          "name": "tickArrayUpper",
          "docs": [
            "Tick array for upper bound"
          ],
          "writable": true
        },
        {
          "name": "vault0Mint",
          "docs": [
            "Mint of vault 0"
          ]
        },
        {
          "name": "vault1Mint",
          "docs": [
            "Mint of vault 1"
          ]
        },
        {
          "name": "clmmProgram",
          "docs": [
            "Raydium CLMM program"
          ],
          "address": "DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "tokenProgram2022",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "memoProgram",
          "address": "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount0Min",
          "type": "u64"
        },
        {
          "name": "amount1Min",
          "type": "u64"
        }
      ]
    },
    {
      "name": "collectFees",
      "docs": [
        "Collect accumulated trading fees from the position"
      ],
      "discriminator": [
        164,
        152,
        207,
        99,
        30,
        186,
        19,
        182
      ],
      "accounts": [
        {
          "name": "admin",
          "docs": [
            "Admin collecting fees"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "docs": [
            "Vault state"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "solTreasury",
          "docs": [
            "SOL treasury PDA (destination for token0 fees)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "usdcTreasury",
          "docs": [
            "USDC treasury PDA (destination for token1 fees)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  100,
                  99,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "poolState",
          "docs": [
            "Pool state"
          ],
          "writable": true
        },
        {
          "name": "positionNftAccount",
          "docs": [
            "Position NFT account (owned by vault)"
          ]
        },
        {
          "name": "personalPosition",
          "docs": [
            "Personal position state"
          ],
          "writable": true
        },
        {
          "name": "tokenVault0",
          "docs": [
            "Token vault 0 (pool's SOL vault)"
          ],
          "writable": true
        },
        {
          "name": "tokenVault1",
          "docs": [
            "Token vault 1 (pool's USDC vault)"
          ],
          "writable": true
        },
        {
          "name": "tickArrayLower",
          "docs": [
            "Tick array for lower bound"
          ],
          "writable": true
        },
        {
          "name": "tickArrayUpper",
          "docs": [
            "Tick array for upper bound"
          ],
          "writable": true
        },
        {
          "name": "vault0Mint",
          "docs": [
            "Mint of vault 0"
          ]
        },
        {
          "name": "vault1Mint",
          "docs": [
            "Mint of vault 1"
          ]
        },
        {
          "name": "clmmProgram",
          "docs": [
            "Raydium CLMM program"
          ],
          "address": "DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "tokenProgram2022",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "memoProgram",
          "address": "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
        }
      ],
      "args": []
    },
    {
      "name": "decreaseLiquidity",
      "docs": [
        "Decrease liquidity from the active position"
      ],
      "discriminator": [
        160,
        38,
        208,
        111,
        104,
        91,
        44,
        1
      ],
      "accounts": [
        {
          "name": "admin",
          "docs": [
            "Admin decreasing liquidity"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "docs": [
            "Vault state"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "solTreasury",
          "docs": [
            "SOL treasury PDA (destination for token0)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "usdcTreasury",
          "docs": [
            "USDC treasury PDA (destination for token1)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  100,
                  99,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "poolState",
          "docs": [
            "Pool state"
          ],
          "writable": true
        },
        {
          "name": "positionNftAccount",
          "docs": [
            "Position NFT account (owned by vault)"
          ]
        },
        {
          "name": "personalPosition",
          "docs": [
            "Personal position state"
          ],
          "writable": true
        },
        {
          "name": "tokenVault0",
          "docs": [
            "Token vault 0 (pool's SOL vault)"
          ],
          "writable": true
        },
        {
          "name": "tokenVault1",
          "docs": [
            "Token vault 1 (pool's USDC vault)"
          ],
          "writable": true
        },
        {
          "name": "tickArrayLower",
          "docs": [
            "Tick array for lower bound"
          ],
          "writable": true
        },
        {
          "name": "tickArrayUpper",
          "docs": [
            "Tick array for upper bound"
          ],
          "writable": true
        },
        {
          "name": "vault0Mint",
          "docs": [
            "Mint of vault 0"
          ]
        },
        {
          "name": "vault1Mint",
          "docs": [
            "Mint of vault 1"
          ]
        },
        {
          "name": "clmmProgram",
          "docs": [
            "Raydium CLMM program"
          ],
          "address": "DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "tokenProgram2022",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "memoProgram",
          "address": "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
        }
      ],
      "args": [
        {
          "name": "liquidity",
          "type": "u128"
        },
        {
          "name": "amount0Min",
          "type": "u64"
        },
        {
          "name": "amount1Min",
          "type": "u64"
        }
      ]
    },
    {
      "name": "depositSol",
      "docs": [
        "Deposit SOL into vault"
      ],
      "discriminator": [
        108,
        81,
        78,
        117,
        125,
        155,
        56,
        200
      ],
      "accounts": [
        {
          "name": "user",
          "docs": [
            "User making the deposit"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "docs": [
            "Vault state"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "userDeposit",
          "docs": [
            "User's deposit record (created if not exists)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  100,
                  101,
                  112,
                  111,
                  115,
                  105,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "userWsolAccount",
          "docs": [
            "User's wSOL token account (source)"
          ],
          "writable": true
        },
        {
          "name": "solTreasury",
          "docs": [
            "SOL treasury (destination)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "shareMint",
          "docs": [
            "Share mint"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  97,
                  114,
                  101,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "userShareAccount",
          "docs": [
            "User's share token account (will receive shares)"
          ],
          "writable": true
        },
        {
          "name": "wsolMint",
          "docs": [
            "Wrapped SOL mint"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "depositUsdc",
      "docs": [
        "Deposit USDC into vault"
      ],
      "discriminator": [
        184,
        148,
        250,
        169,
        224,
        213,
        34,
        126
      ],
      "accounts": [
        {
          "name": "user",
          "docs": [
            "User making the deposit"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "docs": [
            "Vault state"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "userDeposit",
          "docs": [
            "User's deposit record (created if not exists)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  100,
                  101,
                  112,
                  111,
                  115,
                  105,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "userUsdcAccount",
          "docs": [
            "User's USDC token account (source)"
          ],
          "writable": true
        },
        {
          "name": "usdcTreasury",
          "docs": [
            "USDC treasury (destination)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  100,
                  99,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "shareMint",
          "docs": [
            "Share mint"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  97,
                  114,
                  101,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "userShareAccount",
          "docs": [
            "User's share token account (will receive shares)"
          ],
          "writable": true
        },
        {
          "name": "usdcMint",
          "docs": [
            "USDC mint"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "increaseLiquidity",
      "docs": [
        "Increase liquidity in the active position"
      ],
      "discriminator": [
        46,
        156,
        243,
        118,
        13,
        205,
        251,
        178
      ],
      "accounts": [
        {
          "name": "admin",
          "docs": [
            "Admin increasing liquidity"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "docs": [
            "Vault state"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "solTreasury",
          "docs": [
            "SOL treasury PDA (source for token0)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "usdcTreasury",
          "docs": [
            "USDC treasury PDA (source for token1)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  100,
                  99,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "poolState",
          "docs": [
            "Pool state"
          ],
          "writable": true
        },
        {
          "name": "positionNftAccount",
          "docs": [
            "Position NFT account (owned by vault)"
          ]
        },
        {
          "name": "personalPosition",
          "docs": [
            "Personal position state"
          ],
          "writable": true
        },
        {
          "name": "tokenVault0",
          "docs": [
            "Token vault 0 (pool's SOL vault)"
          ],
          "writable": true
        },
        {
          "name": "tokenVault1",
          "docs": [
            "Token vault 1 (pool's USDC vault)"
          ],
          "writable": true
        },
        {
          "name": "tickArrayLower",
          "docs": [
            "Tick array for lower bound"
          ],
          "writable": true
        },
        {
          "name": "tickArrayUpper",
          "docs": [
            "Tick array for upper bound"
          ],
          "writable": true
        },
        {
          "name": "vault0Mint",
          "docs": [
            "Mint of vault 0"
          ]
        },
        {
          "name": "vault1Mint",
          "docs": [
            "Mint of vault 1"
          ]
        },
        {
          "name": "clmmProgram",
          "docs": [
            "Raydium CLMM program"
          ],
          "address": "DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "tokenProgram2022",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        }
      ],
      "args": [
        {
          "name": "liquidity",
          "type": "u128"
        },
        {
          "name": "amount0Max",
          "type": "u64"
        },
        {
          "name": "amount1Max",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initialize",
      "docs": [
        "Initialize vault with treasury PDAs and share mint"
      ],
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "admin",
          "docs": [
            "Admin who will manage the vault"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "docs": [
            "Vault state account (PDA)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "shareMint",
          "docs": [
            "Share token mint (PDA)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  97,
                  114,
                  101,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "solTreasury",
          "docs": [
            "SOL treasury token account (holds wSOL)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "usdcTreasury",
          "docs": [
            "USDC treasury token account"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  100,
                  99,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "wsolMint",
          "docs": [
            "Wrapped SOL mint (So11111111111111111111111111111111111111112)"
          ]
        },
        {
          "name": "usdcMint",
          "docs": [
            "USDC mint (EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v on mainnet)"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "openPosition",
      "docs": [
        "Open a new CLMM position with funds from treasury"
      ],
      "discriminator": [
        135,
        128,
        47,
        77,
        15,
        152,
        240,
        49
      ],
      "accounts": [
        {
          "name": "admin",
          "docs": [
            "Admin opening the position"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "docs": [
            "Vault state"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "solTreasury",
          "docs": [
            "SOL treasury PDA (source for token0)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "usdcTreasury",
          "docs": [
            "USDC treasury PDA (source for token1)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  100,
                  99,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "poolState",
          "docs": [
            "Pool state"
          ],
          "writable": true
        },
        {
          "name": "positionNftMint",
          "docs": [
            "Position NFT mint (will be created)"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "positionNftAccount",
          "docs": [
            "Position NFT account (vault will own the NFT)"
          ],
          "writable": true
        },
        {
          "name": "personalPosition",
          "docs": [
            "Personal position state (created by Raydium)"
          ],
          "writable": true
        },
        {
          "name": "tickArrayLower",
          "docs": [
            "Tick array for lower bound"
          ],
          "writable": true
        },
        {
          "name": "tickArrayUpper",
          "docs": [
            "Tick array for upper bound"
          ],
          "writable": true
        },
        {
          "name": "tokenVault0",
          "docs": [
            "Token vault 0 (pool's SOL vault)"
          ],
          "writable": true
        },
        {
          "name": "tokenVault1",
          "docs": [
            "Token vault 1 (pool's USDC vault)"
          ],
          "writable": true
        },
        {
          "name": "vault0Mint",
          "docs": [
            "Mint of vault 0"
          ]
        },
        {
          "name": "vault1Mint",
          "docs": [
            "Mint of vault 1"
          ]
        },
        {
          "name": "tickArrayBitmap",
          "docs": [
            "Tick array bitmap extension"
          ]
        },
        {
          "name": "clmmProgram",
          "docs": [
            "Raydium CLMM program"
          ],
          "address": "DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "tokenProgram2022",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        }
      ],
      "args": [
        {
          "name": "tickLowerIndex",
          "type": "i32"
        },
        {
          "name": "tickUpperIndex",
          "type": "i32"
        },
        {
          "name": "tickArrayLowerStartIndex",
          "type": "i32"
        },
        {
          "name": "tickArrayUpperStartIndex",
          "type": "i32"
        },
        {
          "name": "liquidity",
          "type": "u128"
        },
        {
          "name": "amount0Max",
          "type": "u64"
        },
        {
          "name": "amount1Max",
          "type": "u64"
        }
      ]
    },
    {
      "name": "returnFromManage",
      "docs": [
        "Return funds to treasury after rebalance"
      ],
      "discriminator": [
        142,
        88,
        196,
        40,
        119,
        216,
        156,
        12
      ],
      "accounts": [
        {
          "name": "admin",
          "docs": [
            "Admin returning funds"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "docs": [
            "Vault state"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "solTreasury",
          "docs": [
            "SOL treasury PDA"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "usdcTreasury",
          "docs": [
            "USDC treasury PDA"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  100,
                  99,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "adminWsolAccount",
          "docs": [
            "Admin's wSOL account (source for SOL)"
          ],
          "writable": true
        },
        {
          "name": "adminUsdcAccount",
          "docs": [
            "Admin's USDC account (source for USDC)"
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "solAmount",
          "type": "u64"
        },
        {
          "name": "usdcAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setPaused",
      "docs": [
        "Pause or unpause the vault"
      ],
      "discriminator": [
        91,
        60,
        125,
        192,
        176,
        225,
        166,
        218
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "swapInTreasury",
      "docs": [
        "Swap tokens within treasury via Raydium CLMM CPI",
        "This allows rebalancing without moving funds to admin wallet"
      ],
      "discriminator": [
        102,
        26,
        110,
        13,
        130,
        172,
        146,
        126
      ],
      "accounts": [
        {
          "name": "admin",
          "docs": [
            "Admin performing the swap"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "docs": [
            "Vault state"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "solTreasury",
          "docs": [
            "SOL treasury PDA (wSOL)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "usdcTreasury",
          "docs": [
            "USDC treasury PDA"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  100,
                  99,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "ammConfig",
          "docs": [
            "AMM config account"
          ]
        },
        {
          "name": "poolState",
          "docs": [
            "Pool state account"
          ],
          "writable": true
        },
        {
          "name": "inputVault",
          "docs": [
            "Input vault (Raydium pool vault for input token)"
          ],
          "writable": true
        },
        {
          "name": "outputVault",
          "docs": [
            "Output vault (Raydium pool vault for output token)"
          ],
          "writable": true
        },
        {
          "name": "observationState",
          "docs": [
            "Observation state for price oracle"
          ],
          "writable": true
        },
        {
          "name": "inputVaultMint",
          "docs": [
            "Input vault mint"
          ]
        },
        {
          "name": "outputVaultMint",
          "docs": [
            "Output vault mint"
          ]
        },
        {
          "name": "clmmProgram",
          "docs": [
            "Raydium CLMM program"
          ],
          "address": "DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH"
        },
        {
          "name": "tokenProgram",
          "docs": [
            "Token program"
          ],
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "tokenProgram2022",
          "docs": [
            "Token 2022 program"
          ],
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "memoProgram",
          "docs": [
            "Memo program"
          ],
          "address": "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
        }
      ],
      "args": [
        {
          "name": "amountIn",
          "type": "u64"
        },
        {
          "name": "minimumAmountOut",
          "type": "u64"
        },
        {
          "name": "direction",
          "type": {
            "defined": {
              "name": "swapDirection"
            }
          }
        }
      ]
    },
    {
      "name": "transferAdmin",
      "docs": [
        "Step 1: Propose a new admin (current admin only)"
      ],
      "discriminator": [
        42,
        242,
        66,
        106,
        228,
        10,
        111,
        156
      ],
      "accounts": [
        {
          "name": "admin",
          "docs": [
            "Current admin"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "docs": [
            "Vault state"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newAdmin",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "updateTvl",
      "docs": [
        "Update TVL (called by backend periodically)"
      ],
      "discriminator": [
        126,
        203,
        107,
        162,
        169,
        48,
        79,
        156
      ],
      "accounts": [
        {
          "name": "admin",
          "docs": [
            "Admin only"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "docs": [
            "Vault state"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "tvlUsd",
          "type": "u64"
        },
        {
          "name": "solPrice",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdraw",
      "docs": [
        "Full withdrawal from vault (burn ALL shares, receive SOL/USDC)"
      ],
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "user",
          "docs": [
            "User making the withdrawal"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "docs": [
            "Vault state"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "userDeposit",
          "docs": [
            "User's deposit record"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  100,
                  101,
                  112,
                  111,
                  115,
                  105,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "shareMint",
          "docs": [
            "Share mint (for burning)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  97,
                  114,
                  101,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "userShareAccount",
          "docs": [
            "User's share token account (source - will burn from here)"
          ],
          "writable": true
        },
        {
          "name": "solTreasury",
          "docs": [
            "SOL treasury"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "usdcTreasury",
          "docs": [
            "USDC treasury"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  100,
                  99,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "userWsolAccount",
          "docs": [
            "User's wSOL token account (destination for SOL)"
          ],
          "writable": true
        },
        {
          "name": "userUsdcAccount",
          "docs": [
            "User's USDC token account (destination for USDC)"
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "withdrawToManage",
      "docs": [
        "Withdraw funds from treasury to admin wallet for Raydium management"
      ],
      "discriminator": [
        213,
        123,
        246,
        176,
        220,
        182,
        27,
        218
      ],
      "accounts": [
        {
          "name": "admin",
          "docs": [
            "Admin performing the withdrawal"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "docs": [
            "Vault state"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "solTreasury",
          "docs": [
            "SOL treasury PDA"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "usdcTreasury",
          "docs": [
            "USDC treasury PDA"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  100,
                  99,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "adminWsolAccount",
          "docs": [
            "Admin's wSOL account (destination for SOL)"
          ],
          "writable": true
        },
        {
          "name": "adminUsdcAccount",
          "docs": [
            "Admin's USDC account (destination for USDC)"
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "solAmount",
          "type": "u64"
        },
        {
          "name": "usdcAmount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "ammConfig",
      "discriminator": [
        218,
        244,
        33,
        104,
        203,
        203,
        43,
        111
      ]
    },
    {
      "name": "observationState",
      "discriminator": [
        122,
        174,
        197,
        53,
        129,
        9,
        165,
        132
      ]
    },
    {
      "name": "personalPositionState",
      "discriminator": [
        70,
        111,
        150,
        126,
        230,
        15,
        25,
        117
      ]
    },
    {
      "name": "poolState",
      "discriminator": [
        247,
        237,
        227,
        245,
        215,
        195,
        222,
        70
      ]
    },
    {
      "name": "tickArrayState",
      "discriminator": [
        192,
        155,
        85,
        205,
        49,
        249,
        129,
        42
      ]
    },
    {
      "name": "userDeposit",
      "discriminator": [
        69,
        238,
        23,
        217,
        255,
        137,
        185,
        35
      ]
    },
    {
      "name": "vault",
      "discriminator": [
        211,
        8,
        232,
        43,
        2,
        152,
        117,
        119
      ]
    }
  ],
  "events": [
    {
      "name": "adminTransferAccepted",
      "discriminator": [
        79,
        229,
        204,
        202,
        134,
        43,
        177,
        26
      ]
    },
    {
      "name": "adminTransferProposed",
      "discriminator": [
        203,
        168,
        175,
        51,
        239,
        104,
        20,
        85
      ]
    },
    {
      "name": "depositSolEvent",
      "discriminator": [
        183,
        99,
        57,
        178,
        159,
        35,
        189,
        191
      ]
    },
    {
      "name": "depositUsdcEvent",
      "discriminator": [
        146,
        22,
        136,
        227,
        80,
        179,
        219,
        134
      ]
    },
    {
      "name": "feesCollected",
      "discriminator": [
        233,
        23,
        117,
        225,
        107,
        178,
        254,
        8
      ]
    },
    {
      "name": "liquidityDecreased",
      "discriminator": [
        166,
        1,
        36,
        71,
        112,
        202,
        181,
        171
      ]
    },
    {
      "name": "liquidityIncreased",
      "discriminator": [
        30,
        7,
        144,
        181,
        102,
        254,
        155,
        161
      ]
    },
    {
      "name": "positionClosed",
      "discriminator": [
        157,
        163,
        227,
        228,
        13,
        97,
        138,
        121
      ]
    },
    {
      "name": "positionOpened",
      "discriminator": [
        237,
        175,
        243,
        230,
        147,
        117,
        101,
        121
      ]
    },
    {
      "name": "returnFromManageEvent",
      "discriminator": [
        93,
        73,
        205,
        18,
        246,
        186,
        171,
        27
      ]
    },
    {
      "name": "swapEvent",
      "discriminator": [
        64,
        198,
        205,
        232,
        38,
        8,
        113,
        226
      ]
    },
    {
      "name": "tvlUpdated",
      "discriminator": [
        71,
        219,
        162,
        134,
        79,
        155,
        46,
        148
      ]
    },
    {
      "name": "vaultInitialized",
      "discriminator": [
        180,
        43,
        207,
        2,
        18,
        71,
        3,
        75
      ]
    },
    {
      "name": "vaultPausedEvent",
      "discriminator": [
        75,
        189,
        120,
        167,
        117,
        229,
        155,
        60
      ]
    },
    {
      "name": "withdrawEvent",
      "discriminator": [
        22,
        9,
        133,
        26,
        160,
        44,
        71,
        192
      ]
    },
    {
      "name": "withdrawToManageEvent",
      "discriminator": [
        119,
        77,
        243,
        36,
        91,
        175,
        119,
        28
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Unauthorized: only admin can perform this action"
    },
    {
      "code": 6001,
      "name": "invalidAmount",
      "msg": "Invalid amount: must be greater than zero"
    },
    {
      "code": 6002,
      "name": "insufficientShares",
      "msg": "Insufficient shares for withdrawal"
    },
    {
      "code": 6003,
      "name": "insufficientTreasuryBalance",
      "msg": "Insufficient treasury balance"
    },
    {
      "code": 6004,
      "name": "staleTvl",
      "msg": "TVL is stale: update required before operation"
    },
    {
      "code": 6005,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6006,
      "name": "invalidMint",
      "msg": "Invalid mint address"
    },
    {
      "code": 6007,
      "name": "vaultPaused",
      "msg": "Vault is paused"
    },
    {
      "code": 6008,
      "name": "withdrawalExceedsTreasury",
      "msg": "Withdrawal amount exceeds available treasury"
    },
    {
      "code": 6009,
      "name": "invalidSolPrice",
      "msg": "Invalid SOL price"
    },
    {
      "code": 6010,
      "name": "positionAlreadyExists",
      "msg": "Position already exists"
    },
    {
      "code": 6011,
      "name": "noActivePosition",
      "msg": "No active position"
    },
    {
      "code": 6012,
      "name": "invalidPosition",
      "msg": "Invalid position"
    },
    {
      "code": 6013,
      "name": "tvlChangeExceeded",
      "msg": "TVL change exceeds 20% limit per update"
    },
    {
      "code": 6014,
      "name": "noPendingAdmin",
      "msg": "No pending admin transfer"
    }
  ],
  "types": [
    {
      "name": "adminTransferAccepted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "oldAdmin",
            "type": "pubkey"
          },
          {
            "name": "newAdmin",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "adminTransferProposed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "currentAdmin",
            "type": "pubkey"
          },
          {
            "name": "proposedAdmin",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "ammConfig",
      "docs": [
        "Holds the current owner of the factory"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "docs": [
              "Bump to identify PDA"
            ],
            "type": "u8"
          },
          {
            "name": "index",
            "type": "u16"
          },
          {
            "name": "owner",
            "docs": [
              "Address of the protocol owner"
            ],
            "type": "pubkey"
          },
          {
            "name": "protocolFeeRate",
            "docs": [
              "The protocol fee"
            ],
            "type": "u32"
          },
          {
            "name": "tradeFeeRate",
            "docs": [
              "The trade fee, denominated in hundredths of a bip (10^-6)"
            ],
            "type": "u32"
          },
          {
            "name": "tickSpacing",
            "docs": [
              "The tick spacing"
            ],
            "type": "u16"
          },
          {
            "name": "fundFeeRate",
            "docs": [
              "The fund fee, denominated in hundredths of a bip (10^-6)"
            ],
            "type": "u32"
          },
          {
            "name": "paddingU32",
            "type": "u32"
          },
          {
            "name": "fundOwner",
            "type": "pubkey"
          },
          {
            "name": "padding",
            "type": {
              "array": [
                "u64",
                3
              ]
            }
          }
        ]
      }
    },
    {
      "name": "depositSolEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "depositValueUsd",
            "type": "u64"
          },
          {
            "name": "sharesMinted",
            "type": "u64"
          },
          {
            "name": "totalShares",
            "type": "u64"
          },
          {
            "name": "tvlUsd",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "depositUsdcEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "sharesMinted",
            "type": "u64"
          },
          {
            "name": "totalShares",
            "type": "u64"
          },
          {
            "name": "tvlUsd",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "feesCollected",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "solFees",
            "type": "u64"
          },
          {
            "name": "usdcFees",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "liquidityDecreased",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "solReceived",
            "type": "u64"
          },
          {
            "name": "usdcReceived",
            "type": "u64"
          },
          {
            "name": "remainingLiquidity",
            "type": "u128"
          }
        ]
      }
    },
    {
      "name": "liquidityIncreased",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "solAdded",
            "type": "u64"
          },
          {
            "name": "usdcAdded",
            "type": "u64"
          },
          {
            "name": "newLiquidity",
            "type": "u128"
          }
        ]
      }
    },
    {
      "name": "observation",
      "docs": [
        "The element of observations in ObservationState"
      ],
      "serialization": "bytemuckunsafe",
      "repr": {
        "kind": "c",
        "packed": true
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "blockTimestamp",
            "docs": [
              "The block timestamp of the observation"
            ],
            "type": "u32"
          },
          {
            "name": "sqrtPriceX64",
            "docs": [
              "the price of the observation timestamp, Q64.64"
            ],
            "type": "u128"
          },
          {
            "name": "cumulativeTimePriceX64",
            "docs": [
              "the cumulative of price during the duration time, Q64.64"
            ],
            "type": "u128"
          },
          {
            "name": "padding",
            "docs": [
              "padding for feature update"
            ],
            "type": "u128"
          }
        ]
      }
    },
    {
      "name": "observationState",
      "serialization": "bytemuckunsafe",
      "repr": {
        "kind": "c",
        "packed": true
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "initialized",
            "docs": [
              "Whether the ObservationState is initialized"
            ],
            "type": "bool"
          },
          {
            "name": "poolId",
            "type": "pubkey"
          },
          {
            "name": "observations",
            "docs": [
              "observation array"
            ],
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "observation"
                  }
                },
                1000
              ]
            }
          },
          {
            "name": "padding",
            "docs": [
              "padding for feature update"
            ],
            "type": {
              "array": [
                "u128",
                5
              ]
            }
          }
        ]
      }
    },
    {
      "name": "personalPositionState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "docs": [
              "Bump to identify PDA"
            ],
            "type": "u8"
          },
          {
            "name": "nftMint",
            "docs": [
              "Mint address of the tokenized position"
            ],
            "type": "pubkey"
          },
          {
            "name": "poolId",
            "docs": [
              "The ID of the pool with which this token is connected"
            ],
            "type": "pubkey"
          },
          {
            "name": "tickLowerIndex",
            "docs": [
              "The lower bound tick of the position"
            ],
            "type": "i32"
          },
          {
            "name": "tickUpperIndex",
            "docs": [
              "The upper bound tick of the position"
            ],
            "type": "i32"
          },
          {
            "name": "liquidity",
            "docs": [
              "The amount of liquidity owned by this position"
            ],
            "type": "u128"
          },
          {
            "name": "feeGrowthInside0LastX64",
            "docs": [
              "The token_0 fee growth of the aggregate position as of the last action on the individual position"
            ],
            "type": "u128"
          },
          {
            "name": "feeGrowthInside1LastX64",
            "docs": [
              "The token_1 fee growth of the aggregate position as of the last action on the individual position"
            ],
            "type": "u128"
          },
          {
            "name": "tokenFeesOwed0",
            "docs": [
              "The fees owed to the position owner in token_0, as of the last computation"
            ],
            "type": "u64"
          },
          {
            "name": "tokenFeesOwed1",
            "docs": [
              "The fees owed to the position owner in token_1, as of the last computation"
            ],
            "type": "u64"
          },
          {
            "name": "rewardInfos",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "positionRewardInfo"
                  }
                },
                3
              ]
            }
          },
          {
            "name": "padding",
            "type": {
              "array": [
                "u64",
                8
              ]
            }
          }
        ]
      }
    },
    {
      "name": "poolState",
      "docs": [
        "The pool state",
        "",
        "PDA of `[POOL_SEED, config, token_mint_0, token_mint_1]`",
        ""
      ],
      "serialization": "bytemuckunsafe",
      "repr": {
        "kind": "c",
        "packed": true
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "docs": [
              "Bump to identify PDA"
            ],
            "type": {
              "array": [
                "u8",
                1
              ]
            }
          },
          {
            "name": "ammConfig",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "tokenMint0",
            "docs": [
              "Token pair of the pool, where token_mint_0 address < token_mint_1 address"
            ],
            "type": "pubkey"
          },
          {
            "name": "tokenMint1",
            "type": "pubkey"
          },
          {
            "name": "tokenVault0",
            "docs": [
              "Token pair vault"
            ],
            "type": "pubkey"
          },
          {
            "name": "tokenVault1",
            "type": "pubkey"
          },
          {
            "name": "observationKey",
            "docs": [
              "observation account key"
            ],
            "type": "pubkey"
          },
          {
            "name": "mintDecimals0",
            "docs": [
              "mint0 and mint1 decimals"
            ],
            "type": "u8"
          },
          {
            "name": "mintDecimals1",
            "type": "u8"
          },
          {
            "name": "tickSpacing",
            "docs": [
              "The minimum number of ticks between initialized ticks"
            ],
            "type": "u16"
          },
          {
            "name": "liquidity",
            "docs": [
              "The currently in range liquidity available to the pool."
            ],
            "type": "u128"
          },
          {
            "name": "sqrtPriceX64",
            "docs": [
              "The current price of the pool as a sqrt(token_1/token_0) Q64.64 value"
            ],
            "type": "u128"
          },
          {
            "name": "tickCurrent",
            "docs": [
              "The current tick of the pool, i.e. according to the last tick transition that was run."
            ],
            "type": "i32"
          },
          {
            "name": "observationIndex",
            "docs": [
              "the most-recently updated index of the observations array"
            ],
            "type": "u16"
          },
          {
            "name": "observationUpdateDuration",
            "type": "u16"
          },
          {
            "name": "feeGrowthGlobal0X64",
            "docs": [
              "The fee growth as a Q64.64 number, i.e. fees of token_0 and token_1 collected per",
              "unit of liquidity for the entire life of the pool."
            ],
            "type": "u128"
          },
          {
            "name": "feeGrowthGlobal1X64",
            "type": "u128"
          },
          {
            "name": "protocolFeesToken0",
            "docs": [
              "The amounts of token_0 and token_1 that are owed to the protocol."
            ],
            "type": "u64"
          },
          {
            "name": "protocolFeesToken1",
            "type": "u64"
          },
          {
            "name": "swapInAmountToken0",
            "docs": [
              "The amounts in and out of swap token_0 and token_1"
            ],
            "type": "u128"
          },
          {
            "name": "swapOutAmountToken1",
            "type": "u128"
          },
          {
            "name": "swapInAmountToken1",
            "type": "u128"
          },
          {
            "name": "swapOutAmountToken0",
            "type": "u128"
          },
          {
            "name": "status",
            "docs": [
              "Bitwise representation of the state of the pool",
              "bit0, 1: disable open position and increase liquidity, 0: normal",
              "bit1, 1: disable decrease liquidity, 0: normal",
              "bit2, 1: disable collect fee, 0: normal",
              "bit3, 1: disable collect reward, 0: normal",
              "bit4, 1: disable swap, 0: normal"
            ],
            "type": "u8"
          },
          {
            "name": "padding",
            "docs": [
              "Leave blank for future use"
            ],
            "type": {
              "array": [
                "u8",
                7
              ]
            }
          },
          {
            "name": "rewardInfos",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "rewardInfo"
                  }
                },
                3
              ]
            }
          },
          {
            "name": "tickArrayBitmap",
            "docs": [
              "Packed initialized tick array state"
            ],
            "type": {
              "array": [
                "u64",
                16
              ]
            }
          },
          {
            "name": "totalFeesToken0",
            "docs": [
              "except protocol_fee and fund_fee"
            ],
            "type": "u64"
          },
          {
            "name": "totalFeesClaimedToken0",
            "docs": [
              "except protocol_fee and fund_fee"
            ],
            "type": "u64"
          },
          {
            "name": "totalFeesToken1",
            "type": "u64"
          },
          {
            "name": "totalFeesClaimedToken1",
            "type": "u64"
          },
          {
            "name": "fundFeesToken0",
            "type": "u64"
          },
          {
            "name": "fundFeesToken1",
            "type": "u64"
          },
          {
            "name": "openTime",
            "type": "u64"
          },
          {
            "name": "padding1",
            "type": {
              "array": [
                "u64",
                25
              ]
            }
          },
          {
            "name": "padding2",
            "type": {
              "array": [
                "u64",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "positionClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasurySol",
            "type": "u64"
          },
          {
            "name": "treasuryUsdc",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "positionOpened",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "positionMint",
            "type": "pubkey"
          },
          {
            "name": "poolId",
            "type": "pubkey"
          },
          {
            "name": "tickLower",
            "type": "i32"
          },
          {
            "name": "tickUpper",
            "type": "i32"
          },
          {
            "name": "liquidity",
            "type": "u128"
          },
          {
            "name": "solUsed",
            "type": "u64"
          },
          {
            "name": "usdcUsed",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "positionRewardInfo",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "growthInsideLastX64",
            "type": "u128"
          },
          {
            "name": "rewardAmountOwed",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "returnFromManageEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "solAmount",
            "type": "u64"
          },
          {
            "name": "usdcAmount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "rewardInfo",
      "serialization": "bytemuckunsafe",
      "repr": {
        "kind": "c",
        "packed": true
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "rewardState",
            "docs": [
              "Reward state"
            ],
            "type": "u8"
          },
          {
            "name": "openTime",
            "docs": [
              "Reward open time"
            ],
            "type": "u64"
          },
          {
            "name": "endTime",
            "docs": [
              "Reward end time"
            ],
            "type": "u64"
          },
          {
            "name": "lastUpdateTime",
            "docs": [
              "Reward last update time"
            ],
            "type": "u64"
          },
          {
            "name": "emissionsPerSecondX64",
            "docs": [
              "Q64.64 number indicates how many tokens per second are earned per unit of liquidity."
            ],
            "type": "u128"
          },
          {
            "name": "rewardTotalEmissioned",
            "docs": [
              "The total amount of reward emissioned"
            ],
            "type": "u64"
          },
          {
            "name": "rewardClaimed",
            "docs": [
              "The total amount of claimed reward"
            ],
            "type": "u64"
          },
          {
            "name": "tokenMint",
            "docs": [
              "Reward token mint."
            ],
            "type": "pubkey"
          },
          {
            "name": "tokenVault",
            "docs": [
              "Reward vault token account."
            ],
            "type": "pubkey"
          },
          {
            "name": "authority",
            "docs": [
              "The owner that has permission to set reward param"
            ],
            "type": "pubkey"
          },
          {
            "name": "rewardGrowthGlobalX64",
            "docs": [
              "Q64.64 number that tracks the total tokens earned per unit of liquidity since the reward",
              "emissions were turned on."
            ],
            "type": "u128"
          }
        ]
      }
    },
    {
      "name": "swapDirection",
      "docs": [
        "Swap direction enum"
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "solToUsdc"
          },
          {
            "name": "usdcToSol"
          }
        ]
      }
    },
    {
      "name": "swapEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amountIn",
            "type": "u64"
          },
          {
            "name": "direction",
            "type": "string"
          },
          {
            "name": "treasurySol",
            "type": "u64"
          },
          {
            "name": "treasuryUsdc",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "tickArrayState",
      "serialization": "bytemuckunsafe",
      "repr": {
        "kind": "c",
        "packed": true
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "poolId",
            "type": "pubkey"
          },
          {
            "name": "startTickIndex",
            "type": "i32"
          },
          {
            "name": "ticks",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "tickState"
                  }
                },
                60
              ]
            }
          },
          {
            "name": "initializedTickCount",
            "type": "u8"
          },
          {
            "name": "padding",
            "type": {
              "array": [
                "u8",
                115
              ]
            }
          }
        ]
      }
    },
    {
      "name": "tickState",
      "serialization": "bytemuckunsafe",
      "repr": {
        "kind": "c",
        "packed": true
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "tick",
            "type": "i32"
          },
          {
            "name": "liquidityNet",
            "docs": [
              "Amount of net liquidity added (subtracted) when tick is crossed from left to right (right to left)"
            ],
            "type": "i128"
          },
          {
            "name": "liquidityGross",
            "docs": [
              "The total position liquidity that references this tick"
            ],
            "type": "u128"
          },
          {
            "name": "feeGrowthOutside0X64",
            "docs": [
              "Fee growth per unit of liquidity on the _other_ side of this tick (relative to the current tick)",
              "only has relative meaning, not absolute — the value depends on when the tick is initialized"
            ],
            "type": "u128"
          },
          {
            "name": "feeGrowthOutside1X64",
            "type": "u128"
          },
          {
            "name": "rewardGrowthsOutsideX64",
            "type": {
              "array": [
                "u128",
                3
              ]
            }
          },
          {
            "name": "padding",
            "type": {
              "array": [
                "u32",
                13
              ]
            }
          }
        ]
      }
    },
    {
      "name": "tvlUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "oldTvl",
            "type": "u64"
          },
          {
            "name": "newTvl",
            "type": "u64"
          },
          {
            "name": "solPrice",
            "type": "u64"
          },
          {
            "name": "sharePrice",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "userDeposit",
      "docs": [
        "User deposit record"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "docs": [
              "User's wallet address"
            ],
            "type": "pubkey"
          },
          {
            "name": "vault",
            "docs": [
              "Vault this deposit belongs to"
            ],
            "type": "pubkey"
          },
          {
            "name": "shares",
            "docs": [
              "Number of shares owned"
            ],
            "type": "u64"
          },
          {
            "name": "totalDepositedSol",
            "docs": [
              "Total SOL deposited (for tracking, lamports)"
            ],
            "type": "u64"
          },
          {
            "name": "totalDepositedUsdc",
            "docs": [
              "Total USDC deposited (for tracking, 6 decimals)"
            ],
            "type": "u64"
          },
          {
            "name": "totalWithdrawnUsd",
            "docs": [
              "Total USD value withdrawn"
            ],
            "type": "u64"
          },
          {
            "name": "createdAt",
            "docs": [
              "First deposit timestamp"
            ],
            "type": "i64"
          },
          {
            "name": "updatedAt",
            "docs": [
              "Last activity timestamp"
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "vault",
      "docs": [
        "Main Vault account - stores global state"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "docs": [
              "Admin who can manage funds (backend wallet)"
            ],
            "type": "pubkey"
          },
          {
            "name": "shareMint",
            "docs": [
              "SPL Token mint for vault shares"
            ],
            "type": "pubkey"
          },
          {
            "name": "solTreasury",
            "docs": [
              "PDA that holds SOL (wrapped as wSOL)"
            ],
            "type": "pubkey"
          },
          {
            "name": "usdcTreasury",
            "docs": [
              "PDA that holds USDC"
            ],
            "type": "pubkey"
          },
          {
            "name": "usdcMint",
            "docs": [
              "USDC mint address (mainnet: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)"
            ],
            "type": "pubkey"
          },
          {
            "name": "totalShares",
            "docs": [
              "Total shares minted"
            ],
            "type": "u64"
          },
          {
            "name": "treasurySol",
            "docs": [
              "Total SOL in treasury (lamports)"
            ],
            "type": "u64"
          },
          {
            "name": "treasuryUsdc",
            "docs": [
              "Total USDC in treasury (6 decimals)"
            ],
            "type": "u64"
          },
          {
            "name": "tvlUsd",
            "docs": [
              "Total Value Locked in USD (6 decimals, e.g., 1000000 = $1)"
            ],
            "type": "u64"
          },
          {
            "name": "solPriceUsd",
            "docs": [
              "Current SOL price in USD (6 decimals)"
            ],
            "type": "u64"
          },
          {
            "name": "lastTvlUpdate",
            "docs": [
              "Last TVL update timestamp"
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "docs": [
              "Vault PDA bump"
            ],
            "type": "u8"
          },
          {
            "name": "solTreasuryBump",
            "docs": [
              "Sol treasury PDA bump"
            ],
            "type": "u8"
          },
          {
            "name": "usdcTreasuryBump",
            "docs": [
              "USDC treasury PDA bump"
            ],
            "type": "u8"
          },
          {
            "name": "shareMintBump",
            "docs": [
              "Share mint authority bump"
            ],
            "type": "u8"
          },
          {
            "name": "positionMint",
            "docs": [
              "Active position NFT mint (None if no position)"
            ],
            "type": "pubkey"
          },
          {
            "name": "hasActivePosition",
            "docs": [
              "Whether there's an active position"
            ],
            "type": "bool"
          },
          {
            "name": "positionSol",
            "docs": [
              "SOL amount in active position (lamports)"
            ],
            "type": "u64"
          },
          {
            "name": "positionUsdc",
            "docs": [
              "USDC amount in active position (6 decimals)"
            ],
            "type": "u64"
          },
          {
            "name": "positionLiquidity",
            "docs": [
              "Liquidity in position"
            ],
            "type": "u128"
          },
          {
            "name": "positionTickLower",
            "docs": [
              "Lower tick of position"
            ],
            "type": "i32"
          },
          {
            "name": "positionTickUpper",
            "docs": [
              "Upper tick of position"
            ],
            "type": "i32"
          },
          {
            "name": "positionPoolId",
            "docs": [
              "Pool ID for the position"
            ],
            "type": "pubkey"
          },
          {
            "name": "isPaused",
            "docs": [
              "Whether the vault is paused (deposits/withdrawals disabled)"
            ],
            "type": "bool"
          },
          {
            "name": "pendingAdmin",
            "docs": [
              "Pending admin for two-step admin transfer (Pubkey::default() = none)"
            ],
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "vaultInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "shareMint",
            "type": "pubkey"
          },
          {
            "name": "solTreasury",
            "type": "pubkey"
          },
          {
            "name": "usdcTreasury",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "vaultPausedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "paused",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "withdrawEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "sharesBurned",
            "type": "u64"
          },
          {
            "name": "solWithdrawn",
            "type": "u64"
          },
          {
            "name": "usdcWithdrawn",
            "type": "u64"
          },
          {
            "name": "withdrawalValueUsd",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "withdrawToManageEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "solAmount",
            "type": "u64"
          },
          {
            "name": "usdcAmount",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
