import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  createCloseAccountInstruction,
  NATIVE_MINT,
} from '@solana/spl-token';
import { BN, Program, AnchorProvider } from '@coral-xyz/anchor';
import axios from 'axios';
import {
  VAULT_CONFIG,
  getVaultPda,
  getSolTreasuryPda,
  getUsdcTreasuryPda,
  getShareMintPda,
  getUserDepositPda,
} from '../config/vault';
import vaultIdl from '../../smartDocs/vault.json';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

interface SolanaProvider {
  publicKey?: PublicKey;
  signTransaction: <T extends Transaction>(tx: T) => Promise<T>;
  signAndSendTransaction: (tx: Transaction) => Promise<string>;
  sendTransaction: (tx: Transaction, connection: Connection) => Promise<string>;
}

function createProgram(connection: Connection, walletProvider: SolanaProvider) {
  const wallet = {
    publicKey: walletProvider.publicKey!,
    signTransaction: walletProvider.signTransaction.bind(walletProvider),
    signAllTransactions: async <T extends Transaction[]>(txs: T) => {
      const signed: Transaction[] = [];
      for (const tx of txs) {
        signed.push(await walletProvider.signTransaction(tx));
      }
      return signed as unknown as T;
    },
  };

  const provider = new AnchorProvider(connection, wallet as any, {
    commitment: 'confirmed',
  });

  return new Program(vaultIdl as any, provider);
}

export async function depositSol(
  amountSol: number,
  connection: Connection,
  walletProvider: SolanaProvider,
): Promise<string> {
  const userPubkey = walletProvider.publicKey;
  if (!userPubkey) throw new Error('Wallet not connected');

  const amountLamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
  if (amountLamports <= 0) throw new Error('Invalid amount');

  const program = createProgram(connection, walletProvider);

  // Derive PDAs
  const [vaultPda] = getVaultPda();
  const [solTreasury] = getSolTreasuryPda(vaultPda);
  const [shareMint] = getShareMintPda(vaultPda);
  const [userDeposit] = getUserDepositPda(vaultPda, userPubkey);

  // ATAs
  const userWsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, userPubkey);
  const userShareAta = getAssociatedTokenAddressSync(shareMint, userPubkey);

  // Step 1: Wrap SOL → wSOL + create share ATA if needed
  const wrapTx = new Transaction();

  wrapTx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      userPubkey, userWsolAta, userPubkey, NATIVE_MINT
    )
  );

  wrapTx.add(
    SystemProgram.transfer({
      fromPubkey: userPubkey,
      toPubkey: userWsolAta,
      lamports: amountLamports,
    })
  );

  wrapTx.add(createSyncNativeInstruction(userWsolAta));

  const shareAtaInfo = await connection.getAccountInfo(userShareAta);
  if (!shareAtaInfo) {
    wrapTx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        userPubkey, userShareAta, userPubkey, shareMint
      )
    );
  }

  wrapTx.feePayer = userPubkey;
  wrapTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  const wrapSig = await walletProvider.sendTransaction(wrapTx, connection);
  await connection.confirmTransaction(wrapSig, 'confirmed');

  // Step 2: Call deposit_sol on vault program
  const depositTx = await program.methods
    .depositSol(new BN(amountLamports))
    .accounts({
      user: userPubkey,
      vault: vaultPda,
      userDeposit: userDeposit,
      userWsolAccount: userWsolAta,
      solTreasury: solTreasury,
      shareMint: shareMint,
      userShareAccount: userShareAta,
      wsolMint: NATIVE_MINT,
      raydiumPool: VAULT_CONFIG.RAYDIUM_POOL_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .transaction();

  depositTx.feePayer = userPubkey;
  depositTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  const depositSig = await walletProvider.sendTransaction(depositTx, connection);
  await connection.confirmTransaction(depositSig, 'confirmed');

  // Step 3: Notify backend
  try {
    await axios.post(`${API_BASE_URL}/vault/deposit/confirm`, {
      txHash: depositSig,
      userPubkey: userPubkey.toBase58(),
      amountLamports,
    });
  } catch (err) {
    console.warn('Failed to confirm deposit with backend:', err);
  }

  return depositSig;
}

export async function withdrawVault(
  connection: Connection,
  walletProvider: SolanaProvider,
): Promise<string> {
  const userPubkey = walletProvider.publicKey;
  if (!userPubkey) throw new Error('Wallet not connected');

  const program = createProgram(connection, walletProvider);

  // Derive PDAs
  const [vaultPda] = getVaultPda();
  const [solTreasury] = getSolTreasuryPda(vaultPda);
  const [usdcTreasury] = getUsdcTreasuryPda(vaultPda);
  const [shareMint] = getShareMintPda(vaultPda);
  const [userDeposit] = getUserDepositPda(vaultPda, userPubkey);

  // ATAs
  const userWsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, userPubkey);
  const userUsdcAta = getAssociatedTokenAddressSync(VAULT_CONFIG.USDC_MINT, userPubkey);
  const userShareAta = getAssociatedTokenAddressSync(shareMint, userPubkey);

  // Ensure wSOL ATA and USDC ATA exist before withdrawing
  const setupTx = new Transaction();
  let needsSetup = false;

  const wsolAtaInfo = await connection.getAccountInfo(userWsolAta);
  if (!wsolAtaInfo) {
    setupTx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        userPubkey, userWsolAta, userPubkey, NATIVE_MINT
      )
    );
    needsSetup = true;
  }

  const usdcAtaInfo = await connection.getAccountInfo(userUsdcAta);
  if (!usdcAtaInfo) {
    setupTx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        userPubkey, userUsdcAta, userPubkey, VAULT_CONFIG.USDC_MINT
      )
    );
    needsSetup = true;
  }

  if (needsSetup) {
    setupTx.feePayer = userPubkey;
    setupTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    const setupSig = await walletProvider.sendTransaction(setupTx, connection);
    await connection.confirmTransaction(setupSig, 'confirmed');
  }

  // Call withdraw (burns all shares, returns wSOL + USDC)
  const withdrawTx = await program.methods
    .withdraw()
    .accounts({
      user: userPubkey,
      vault: vaultPda,
      userDeposit: userDeposit,
      shareMint: shareMint,
      userShareAccount: userShareAta,
      solTreasury: solTreasury,
      usdcTreasury: usdcTreasury,
      userWsolAccount: userWsolAta,
      userUsdcAccount: userUsdcAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .transaction();

  // Auto-unwrap wSOL → SOL after withdraw
  withdrawTx.add(
    createCloseAccountInstruction(userWsolAta, userPubkey, userPubkey)
  );

  withdrawTx.feePayer = userPubkey;
  withdrawTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  const withdrawSig = await walletProvider.sendTransaction(withdrawTx, connection);
  await connection.confirmTransaction(withdrawSig, 'confirmed');

  // Notify backend
  try {
    await axios.post(`${API_BASE_URL}/vault/withdraw/confirm`, {
      txHash: withdrawSig,
      userPubkey: userPubkey.toBase58(),
    });
  } catch (err) {
    console.warn('Failed to confirm withdraw with backend:', err);
  }

  return withdrawSig;
}
