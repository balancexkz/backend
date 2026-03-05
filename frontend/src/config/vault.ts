import { PublicKey } from '@solana/web3.js';

export const VAULT_PROGRAM_ID = new PublicKey('BHdQMss1NL2AQGVmsrpyUfmp4o7XC5X9E5ZiXitsdGNx');

// Mainnet addresses
export const VAULT_CONFIG = {
  WSOL_MINT: new PublicKey('So11111111111111111111111111111111111111112'),
  USDC_MINT: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  RAYDIUM_POOL_ID: new PublicKey('3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv'),
  RPC_URL: 'https://api.mainnet-beta.solana.com',
};

// PDA derivations
export function getVaultPda() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault')],
    VAULT_PROGRAM_ID
  );
}

export function getSolTreasuryPda(vaultPda: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('sol_treasury'), vaultPda.toBuffer()],
    VAULT_PROGRAM_ID
  );
}

export function getUsdcTreasuryPda(vaultPda: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('usdc_treasury'), vaultPda.toBuffer()],
    VAULT_PROGRAM_ID
  );
}

export function getShareMintPda(vaultPda: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('share_mint'), vaultPda.toBuffer()],
    VAULT_PROGRAM_ID
  );
}

export function getUserDepositPda(vaultPda: PublicKey, userPubkey: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('user_deposit'), vaultPda.toBuffer(), userPubkey.toBuffer()],
    VAULT_PROGRAM_ID
  );
}
