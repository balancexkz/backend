/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/smart_wallet.json`.
 */
export type SmartWallet = {
  "address": "CikLi2FgfnAoDDepVRe8WA7SsEHvpaJeZv5WpbvvQKCw",
  "metadata": {
    "name": "smartWallet",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Account Abstraction smart wallet for per-user Raydium CLMM positions"
  },
  "instructions": [
    {
      "name": "closePosition",
      "docs": [
        "Close the active CLMM position"
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
          "name": "operator",
          "docs": [
            "Operator (delegate or owner)"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "wallet",
          "docs": [
            "Smart wallet state"
          ],
          "writable": true
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
                  119,
                  97,
                  108,
                  108,
                  101,
                  116,
                  95,
                  115,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "wallet"
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
                  119,
                  97,
                  108,
                  108,
                  101,
                  116,
                  95,
                  117,
                  115,
                  100,
                  99
                ]
              },
              {
                "kind": "account",
                "path": "wallet"
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
            "Position NFT account (owned by wallet PDA)"
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
      "name": "closeWallet",
      "docs": [
        "Close smart wallet and return rent to owner (owner only)"
      ],
      "discriminator": [
        35,
        212,
        234,
        224,
        244,
        208,
        31,
        204
      ],
      "accounts": [
        {
          "name": "user",
          "docs": [
            "Owner closing their wallet"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "wallet",
          "docs": [
            "Smart wallet state (will be closed, rent returned to user)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  109,
                  97,
                  114,
                  116,
                  95,
                  119,
                  97,
                  108,
                  108,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "solTreasury",
          "docs": [
            "SOL treasury (will be closed)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  97,
                  108,
                  108,
                  101,
                  116,
                  95,
                  115,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "usdcTreasury",
          "docs": [
            "USDC treasury (will be closed)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  97,
                  108,
                  108,
                  101,
                  116,
                  95,
                  117,
                  115,
                  100,
                  99
                ]
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "collectFees",
      "docs": [
        "Collect accumulated trading fees"
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
          "name": "operator",
          "docs": [
            "Operator (delegate or owner)"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "wallet",
          "docs": [
            "Smart wallet state"
          ],
          "writable": true
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
                  119,
                  97,
                  108,
                  108,
                  101,
                  116,
                  95,
                  115,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "wallet"
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
                  119,
                  97,
                  108,
                  108,
                  101,
                  116,
                  95,
                  117,
                  115,
                  100,
                  99
                ]
              },
              {
                "kind": "account",
                "path": "wallet"
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
            "Position NFT account (owned by wallet PDA)"
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
      "name": "createWallet",
      "docs": [
        "Create a new smart wallet with personal treasury accounts"
      ],
      "discriminator": [
        82,
        172,
        128,
        18,
        161,
        207,
        88,
        63
      ],
      "accounts": [
        {
          "name": "user",
          "docs": [
            "User creating their smart wallet"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "wallet",
          "docs": [
            "Smart wallet state (PDA per user)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  109,
                  97,
                  114,
                  116,
                  95,
                  119,
                  97,
                  108,
                  108,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "solTreasury",
          "docs": [
            "SOL treasury (wSOL token account, self-authority)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  97,
                  108,
                  108,
                  101,
                  116,
                  95,
                  115,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "usdcTreasury",
          "docs": [
            "USDC treasury (USDC token account, self-authority)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  97,
                  108,
                  108,
                  101,
                  116,
                  95,
                  117,
                  115,
                  100,
                  99
                ]
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "wsolMint",
          "docs": [
            "Wrapped SOL mint"
          ]
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
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "decreaseLiquidity",
      "docs": [
        "Decrease liquidity in the active position"
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
          "name": "operator",
          "docs": [
            "Operator (delegate or owner)"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "wallet",
          "docs": [
            "Smart wallet state"
          ],
          "writable": true
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
                  119,
                  97,
                  108,
                  108,
                  101,
                  116,
                  95,
                  115,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "wallet"
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
                  119,
                  97,
                  108,
                  108,
                  101,
                  116,
                  95,
                  117,
                  115,
                  100,
                  99
                ]
              },
              {
                "kind": "account",
                "path": "wallet"
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
            "Position NFT account (owned by wallet PDA)"
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
      "name": "fundTreasury",
      "docs": [
        "Pull tokens from user's account into treasury via approve/delegate"
      ],
      "discriminator": [
        71,
        154,
        45,
        220,
        206,
        32,
        174,
        239
      ],
      "accounts": [
        {
          "name": "operator",
          "docs": [
            "Operator (delegate or owner) triggering the pull"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "wallet",
          "docs": [
            "Smart wallet state"
          ],
          "writable": true
        },
        {
          "name": "userTokenAccount",
          "docs": [
            "User's source token account (must have approved wallet PDA as delegate)"
          ],
          "writable": true
        },
        {
          "name": "treasury",
          "docs": [
            "Wallet's destination treasury"
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
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "isSol",
          "type": "bool"
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
          "name": "operator",
          "docs": [
            "Operator (delegate or owner)"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "wallet",
          "docs": [
            "Smart wallet state"
          ],
          "writable": true
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
                  119,
                  97,
                  108,
                  108,
                  101,
                  116,
                  95,
                  115,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "wallet"
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
                  119,
                  97,
                  108,
                  108,
                  101,
                  116,
                  95,
                  117,
                  115,
                  100,
                  99
                ]
              },
              {
                "kind": "account",
                "path": "wallet"
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
            "Position NFT account (owned by wallet PDA)"
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
      "name": "openPosition",
      "docs": [
        "Open a new Raydium CLMM position"
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
          "name": "operator",
          "docs": [
            "Operator (delegate or owner)"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "wallet",
          "docs": [
            "Smart wallet state"
          ],
          "writable": true
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
                  119,
                  97,
                  108,
                  108,
                  101,
                  116,
                  95,
                  115,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "wallet"
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
                  119,
                  97,
                  108,
                  108,
                  101,
                  116,
                  95,
                  117,
                  115,
                  100,
                  99
                ]
              },
              {
                "kind": "account",
                "path": "wallet"
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
            "Position NFT account (wallet PDA will own the NFT)"
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
      "name": "setDelegate",
      "docs": [
        "Set or remove delegate (backend operator)"
      ],
      "discriminator": [
        242,
        30,
        46,
        76,
        108,
        235,
        128,
        181
      ],
      "accounts": [
        {
          "name": "user",
          "docs": [
            "User setting the delegate (must be owner)"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "wallet",
          "docs": [
            "Smart wallet state"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  109,
                  97,
                  114,
                  116,
                  95,
                  119,
                  97,
                  108,
                  108,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newDelegate",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setPaused",
      "docs": [
        "Pause or unpause the wallet (owner only)"
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
          "name": "user",
          "docs": [
            "Owner only can pause/unpause"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "wallet",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  109,
                  97,
                  114,
                  116,
                  95,
                  119,
                  97,
                  108,
                  108,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "user"
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
        "Swap SOL/USDC within treasury for rebalancing"
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
          "name": "operator",
          "docs": [
            "Operator (delegate or owner)"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "wallet",
          "docs": [
            "Smart wallet state"
          ],
          "writable": true
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
                  119,
                  97,
                  108,
                  108,
                  101,
                  116,
                  95,
                  115,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "wallet"
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
                  119,
                  97,
                  108,
                  108,
                  101,
                  116,
                  95,
                  117,
                  115,
                  100,
                  99
                ]
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "ammConfig"
        },
        {
          "name": "poolState",
          "writable": true
        },
        {
          "name": "inputVault",
          "writable": true
        },
        {
          "name": "outputVault",
          "writable": true
        },
        {
          "name": "observationState",
          "writable": true
        },
        {
          "name": "inputVaultMint"
        },
        {
          "name": "outputVaultMint"
        },
        {
          "name": "clmmProgram",
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
      "name": "withdraw",
      "docs": [
        "Withdraw SOL or USDC from treasury back to user (owner only)"
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
            "User withdrawing (must be owner — delegate CANNOT withdraw)"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "wallet",
          "docs": [
            "Smart wallet state"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  109,
                  97,
                  114,
                  116,
                  95,
                  119,
                  97,
                  108,
                  108,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "treasury",
          "docs": [
            "Wallet's source treasury"
          ],
          "writable": true
        },
        {
          "name": "userTokenAccount",
          "docs": [
            "User's destination token account"
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
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "isSol",
          "type": "bool"
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
      "name": "smartWallet",
      "discriminator": [
        67,
        59,
        220,
        179,
        41,
        10,
        60,
        177
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
    }
  ],
  "events": [
    {
      "name": "delegateSet",
      "discriminator": [
        103,
        126,
        239,
        131,
        201,
        31,
        212,
        253
      ]
    },
    {
      "name": "fundTreasuryEvent",
      "discriminator": [
        82,
        215,
        15,
        113,
        234,
        242,
        196,
        212
      ]
    },
    {
      "name": "walletClosed",
      "discriminator": [
        163,
        73,
        132,
        31,
        180,
        152,
        98,
        48
      ]
    },
    {
      "name": "walletCreated",
      "discriminator": [
        159,
        189,
        177,
        30,
        192,
        157,
        229,
        179
      ]
    },
    {
      "name": "walletFeesCollected",
      "discriminator": [
        144,
        18,
        147,
        72,
        203,
        194,
        13,
        195
      ]
    },
    {
      "name": "walletLiquidityDecreased",
      "discriminator": [
        129,
        180,
        102,
        78,
        197,
        188,
        3,
        253
      ]
    },
    {
      "name": "walletLiquidityIncreased",
      "discriminator": [
        139,
        132,
        73,
        240,
        19,
        242,
        144,
        58
      ]
    },
    {
      "name": "walletPausedEvent",
      "discriminator": [
        139,
        49,
        29,
        72,
        224,
        196,
        34,
        220
      ]
    },
    {
      "name": "walletPositionClosed",
      "discriminator": [
        44,
        108,
        223,
        168,
        147,
        233,
        16,
        47
      ]
    },
    {
      "name": "walletPositionOpened",
      "discriminator": [
        115,
        165,
        24,
        58,
        57,
        150,
        232,
        3
      ]
    },
    {
      "name": "walletSwapEvent",
      "discriminator": [
        96,
        51,
        124,
        17,
        196,
        181,
        180,
        204
      ]
    },
    {
      "name": "walletWithdrawEvent",
      "discriminator": [
        154,
        85,
        173,
        19,
        229,
        235,
        209,
        80
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Unauthorized: not owner or delegate"
    },
    {
      "code": 6001,
      "name": "invalidAmount",
      "msg": "Invalid amount"
    },
    {
      "code": 6002,
      "name": "insufficientBalance",
      "msg": "Insufficient treasury balance"
    },
    {
      "code": 6003,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6004,
      "name": "positionAlreadyExists",
      "msg": "Position already exists"
    },
    {
      "code": 6005,
      "name": "noActivePosition",
      "msg": "No active position"
    },
    {
      "code": 6006,
      "name": "invalidPosition",
      "msg": "Invalid position"
    },
    {
      "code": 6007,
      "name": "noDelegateSet",
      "msg": "No delegate set"
    },
    {
      "code": 6008,
      "name": "notApproved",
      "msg": "Token account not approved for smart wallet"
    },
    {
      "code": 6009,
      "name": "insufficientApproval",
      "msg": "Insufficient approved amount"
    },
    {
      "code": 6010,
      "name": "invalidMint",
      "msg": "Token mint mismatch"
    },
    {
      "code": 6011,
      "name": "walletPaused",
      "msg": "Wallet is paused"
    }
  ],
  "types": [
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
      "name": "delegateSet",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "oldDelegate",
            "type": "pubkey"
          },
          {
            "name": "newDelegate",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "fundTreasuryEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "operator",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "isSol",
            "type": "bool"
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
      "name": "smartWallet",
      "docs": [
        "Per-user smart wallet — holds treasury accounts and position state"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "docs": [
              "User who owns this wallet"
            ],
            "type": "pubkey"
          },
          {
            "name": "delegate",
            "docs": [
              "Backend operator who can manage positions (Pubkey::default() = no delegate)"
            ],
            "type": "pubkey"
          },
          {
            "name": "solTreasury",
            "docs": [
              "PDA that holds wSOL"
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
              "USDC mint address"
            ],
            "type": "pubkey"
          },
          {
            "name": "positionMint",
            "docs": [
              "Active position NFT mint"
            ],
            "type": "pubkey"
          },
          {
            "name": "positionPoolId",
            "docs": [
              "Raydium CLMM pool ID"
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
            "name": "bump",
            "docs": [
              "SmartWallet PDA bump"
            ],
            "type": "u8"
          },
          {
            "name": "solTreasuryBump",
            "docs": [
              "SOL treasury PDA bump"
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
            "name": "isPaused",
            "docs": [
              "Whether the wallet is paused (deposits/position management disabled)"
            ],
            "type": "bool"
          },
          {
            "name": "createdAt",
            "docs": [
              "Wallet creation timestamp"
            ],
            "type": "i64"
          },
          {
            "name": "updatedAt",
            "docs": [
              "Last activity timestamp"
            ],
            "type": "i64"
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
      "name": "walletClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "walletCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
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
      "name": "walletFeesCollected",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
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
      "name": "walletLiquidityDecreased",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
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
      "name": "walletLiquidityIncreased",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
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
      "name": "walletPausedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "paused",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "walletPositionClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "solTreasury",
            "type": "u64"
          },
          {
            "name": "usdcTreasury",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "walletPositionOpened",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
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
      "name": "walletSwapEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "amountIn",
            "type": "u64"
          },
          {
            "name": "direction",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "walletWithdrawEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "isSol",
            "type": "bool"
          }
        ]
      }
    }
  ]
};
