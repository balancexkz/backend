import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import { useAppKitConnection } from '@reown/appkit-adapter-solana/react';
import type { Provider } from '@reown/appkit-utils/solana';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  User, Transaction, TransactionHistoryStats
} from '../types/interfaces';
import { HistoryTab } from '../tabs/HistoryTab';
import { depositSol, withdrawVault } from '../../services/vaultDeposit';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

type VaultTab = 'positions' | 'history';

interface VaultDashboardProps {
  user: User;
  onLogout: () => void;
}

interface VaultPosition {
  status: string;
  hasActivePosition: boolean;
  solAmount: number;
  usdcAmount: number;
  solAmountUsd: number;
  usdcAmountUsd: number;
  totalPositionUsd: number;
  treasurySolAmount: number;
  treasuryUsdcAmount: number;
  treasurySolUsd: number;
  treasuryUsdcUsd: number;
  totalTreasuryUsd: number;
  currentPrice: number;
}

interface VaultInfo {
  tvlUsd: number;
  solPriceUsd: number;
  isPaused: boolean;
  totalShares: string;
}

interface UserPosition {
  totalValueUsd: number;
  availableNow: number;
  lockedInPosition: number;
}

export const VaultDashboard: React.FC<VaultDashboardProps> = ({ user, onLogout }) => {
  const { address, isConnected } = useAppKitAccount();
  const { connection } = useAppKitConnection();
  const { walletProvider } = useAppKitProvider<Provider>('solana');
  const [balance, setBalance] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<VaultTab>('positions');
  const [investAmount, setInvestAmount] = useState<string>('');
  const [investLoading, setInvestLoading] = useState(false);
  const [investMessage, setInvestMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawMessage, setWithdrawMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [vaultPosition, setVaultPosition] = useState<VaultPosition | null>(null);
  const [vaultInfo, setVaultInfo] = useState<VaultInfo | null>(null);
  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);

  // History state
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [historyStats, setHistoryStats] = useState<TransactionHistoryStats | null>(null);
  const [expandedSwapGroups, setExpandedSwapGroups] = useState<Set<string>>(new Set());

  // Wallet balance
  useEffect(() => {
    if (!isConnected || !address || !connection) {
      setBalance(null);
      return;
    }

    const fetchBalance = async () => {
      try {
        const pubkey = new PublicKey(address);
        const lamports = await connection.getBalance(pubkey);
        setBalance(lamports / LAMPORTS_PER_SOL);
      } catch (err) {
        console.error('Error fetching balance:', err);
        setBalance(null);
      }
    };

    fetchBalance();
    const interval = setInterval(fetchBalance, 15000);
    return () => clearInterval(interval);
  }, [isConnected, address, connection]);

  // Initial data load
  useEffect(() => {
    fetchVaultPosition();
    fetchVaultInfo();
  }, []);

  // Fetch user position when address changes
  useEffect(() => {
    if (address) {
      fetchUserPosition(address);
      fetchTransactionHistory(address);
    }
  }, [address]);

  // Polling history tab
  useEffect(() => {
    if (activeTab !== 'history' || !address) return;
    const interval = setInterval(() => fetchTransactionHistory(address), 10000);
    return () => clearInterval(interval);
  }, [activeTab, address]);

  const fetchVaultPosition = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/vault/position`);
      setVaultPosition(response.data);
    } catch (error) {
      console.error('Error fetching vault position:', error);
    }
  };

  const fetchVaultInfo = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/vault/info`);
      setVaultInfo(response.data);
      // Map to historyStats shape for HistoryTab compatibility
      setHistoryStats(response.data as any);
    } catch (error) {
      console.error('Error fetching vault info:', error);
    }
  };

  const fetchTransactionHistory = async (userPubkey: string) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/vault/history/${userPubkey}?limit=50`);
      setTransactions(response.data.transactions || []);
    } catch (error) {
      console.error('Error fetching transaction history:', error);
    }
  };

  const fetchUserPosition = async (userPubkey: string) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/vault/user/${userPubkey}`);
      setUserPosition(response.data);
    } catch (error) {
      console.error('Error fetching user position:', error);
    }
  };

  const handleWithdraw = async () => {
    if (!connection || !walletProvider || !isConnected) return;
    setWithdrawLoading(true);
    setWithdrawMessage(null);
    try {
      const txHash = await withdrawVault(connection, walletProvider as any);
      setWithdrawMessage({ text: `Withdrawal successful! TX: ${txHash.slice(0, 8)}...`, type: 'success' });
      fetchVaultPosition();
      if (address) {
        fetchUserPosition(address);
        const pubkey = new PublicKey(address);
        const lamports = await connection.getBalance(pubkey);
        setBalance(lamports / LAMPORTS_PER_SOL);
      }
    } catch (err: any) {
      setWithdrawMessage({ text: err?.message || 'Withdrawal failed', type: 'error' });
    } finally {
      setWithdrawLoading(false);
    }
  };

  const toggleSwapGroup = (groupId: string) => {
    setExpandedSwapGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) newSet.delete(groupId);
      else newSet.add(groupId);
      return newSet;
    });
  };

  const setPercentAmount = (percent: number) => {
    if (balance === null) return;
    const amount = balance * (percent / 100);
    setInvestAmount(amount > 0 ? amount.toFixed(6) : '');
  };

  const handleInvestAmountChange = (value: string) => {
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setInvestAmount(value);
    }
  };

  const handleInvest = async () => {
    const amount = Number(investAmount);
    if (!amount || amount <= 0 || !connection || !walletProvider) return;

    setInvestLoading(true);
    setInvestMessage(null);
    try {
      const txHash = await depositSol(amount, connection, walletProvider as any);
      setInvestMessage({ text: `Deposit successful! TX: ${txHash.slice(0, 8)}...`, type: 'success' });
      setInvestAmount('');
      // Refresh balances
      fetchVaultPosition();
      if (address) {
        fetchUserPosition(address);
        const pubkey = new PublicKey(address);
        const lamports = await connection.getBalance(pubkey);
        setBalance(lamports / LAMPORTS_PER_SOL);
      }
    } catch (err: any) {
      const msg = err?.message || 'Transaction failed';
      setInvestMessage({ text: msg, type: 'error' });
    } finally {
      setInvestLoading(false);
    }
  };

  // Total SOL and USDC across position + treasury
  const totalSol = (vaultPosition?.solAmount || 0) + (vaultPosition?.treasurySolAmount || 0);
  const totalUsdc = (vaultPosition?.usdcAmount || 0) + (vaultPosition?.treasuryUsdcAmount || 0);
  const totalSolUsd = (vaultPosition?.solAmountUsd || 0) + (vaultPosition?.treasurySolUsd || 0);
  const totalUsdcUsd = (vaultPosition?.usdcAmountUsd || 0) + (vaultPosition?.treasuryUsdcUsd || 0);

  return (
    <div className="min-h-screen bg-dark-bg">
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-accent-400 to-accent-200 bg-clip-text text-transparent">
              BalanceX
            </h1>
            <p className="text-gray-500 text-sm mt-1">Automatic Pool</p>
          </div>
          <div className="flex items-center gap-4">
            <appkit-button />
            <span className="text-gray-400 text-sm">{user.username}</span>
            <button
              onClick={onLogout}
              className="text-sm text-gray-500 hover:text-red-400 transition-colors"
            >
              Log out
            </button>
          </div>
        </div>

        {/* Wallet info */}
        {isConnected && address && (
          <div className="bg-dark-card border border-dark-border rounded-2xl p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Wallet</p>
                <p className="text-gray-200 text-sm font-mono">
                  {address.slice(0, 6)}...{address.slice(-4)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Balance</p>
                <p className="text-white text-lg font-semibold">
                  {balance !== null ? `${balance.toFixed(4)} SOL` : '...'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab navigation */}
        <div className="flex gap-1 mb-6 bg-dark-card border border-dark-border rounded-xl p-1">
          <button
            onClick={() => setActiveTab('positions')}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'positions'
                ? 'bg-accent-500 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Invest
          </button>
          <button
            onClick={() => { setActiveTab('history'); if (address) fetchTransactionHistory(address); }}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'history'
                ? 'bg-accent-500 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            History
          </button>
        </div>

        {/* Tab content */}
        {activeTab === 'positions' && (<>
          <div className="bg-dark-card border border-dark-border rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-5">Invest</h2>

            {/* SOL Input */}
            <div className="bg-dark-input border border-dark-border rounded-xl p-4 mb-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#9945FF] to-[#14F195] flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 128 128" fill="none">
                      <path d="M25.5 100.5C26.3 99.7 27.4 99.2 28.6 99.2H119.8C121.7 99.2 122.6 101.5 121.3 102.8L102.5 121.6C101.7 122.4 100.6 122.9 99.4 122.9H8.2C6.3 122.9 5.4 120.6 6.7 119.3L25.5 100.5Z" fill="white"/>
                      <path d="M25.5 6.3C26.3 5.5 27.4 5 28.6 5H119.8C121.7 5 122.6 7.3 121.3 8.6L102.5 27.4C101.7 28.2 100.6 28.7 99.4 28.7H8.2C6.3 28.7 5.4 26.4 6.7 25.1L25.5 6.3Z" fill="white"/>
                      <path d="M102.5 53.1C101.7 52.3 100.6 51.8 99.4 51.8H8.2C6.3 51.8 5.4 54.1 6.7 55.4L25.5 74.2C26.3 75 27.4 75.5 28.6 75.5H119.8C121.7 75.5 122.6 73.2 121.3 71.9L102.5 53.1Z" fill="white"/>
                    </svg>
                  </div>
                  <span className="text-white font-medium">SOL</span>
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={investAmount}
                  onChange={(e) => handleInvestAmountChange(e.target.value)}
                  placeholder="0.00"
                  className="bg-transparent text-white text-xl font-semibold w-full text-right outline-none placeholder-gray-600"
                />
              </div>
            </div>

            {/* Balance + MAX */}
            <div className="flex items-center justify-between mb-4 px-1">
              <span className="text-gray-500 text-sm">
                Balance: <span className="text-gray-300">{balance !== null ? `${balance.toFixed(4)} SOL` : '—'}</span>
              </span>
              <button
                onClick={() => setPercentAmount(100)}
                disabled={balance === null}
                className="text-xs font-bold text-accent-400 hover:text-accent-300 disabled:text-gray-600 transition-colors"
              >
                MAX
              </button>
            </div>

            {/* Percent buttons */}
            <div className="grid grid-cols-4 gap-2 mb-6">
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  onClick={() => setPercentAmount(pct)}
                  disabled={balance === null}
                  className="py-2 rounded-lg text-sm font-medium border border-dark-border text-gray-400 hover:text-white hover:border-accent-500 hover:bg-accent-500/10 disabled:opacity-40 transition-colors"
                >
                  {pct}%
                </button>
              ))}
            </div>

            {/* USDC notice */}
            <div className="flex items-start gap-2.5 p-3 mb-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
              <svg className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" />
              </svg>
              <p className="text-yellow-400/90 text-xs leading-relaxed">
                For liquidity provision you need an equal amount of USDC matching the SOL value. Make sure you have enough USDC in your wallet.
              </p>
            </div>

            {/* Calculation summary */}
            <div className="bg-dark-input border border-dark-border rounded-xl p-4 mb-6 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-500 text-sm">Expected APR</span>
                <span className="text-emerald-400 font-medium text-sm">~100%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500 text-sm">Platform fee</span>
                <span className="text-gray-300 text-sm">1.0%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500 text-sm">Min. fee</span>
                <span className="text-gray-300 text-sm">0.001 SOL</span>
              </div>
            </div>

            {/* Invest button */}
            <button
              onClick={handleInvest}
              disabled={!investAmount || Number(investAmount) <= 0 || !isConnected || investLoading}
              className="w-full py-3.5 rounded-xl font-semibold text-white bg-accent-500 hover:bg-accent-400 disabled:bg-gray-700 disabled:text-gray-500 transition-colors"
            >
              {investLoading ? 'Processing...' : 'Invest'}
            </button>

            {investMessage && (
              <div className={`mt-3 p-3 rounded-lg text-sm ${
                investMessage.type === 'success'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}>
                {investMessage.text}
              </div>
            )}
          </div>

          {/* Pool Balances */}
          <div className="bg-dark-card border border-dark-border rounded-2xl p-5 mt-4">
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-4">Pool Balances</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-dark-input border border-dark-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#9945FF] to-[#14F195] flex items-center justify-center">
                    <svg width="12" height="12" viewBox="0 0 128 128" fill="none">
                      <path d="M25.5 100.5C26.3 99.7 27.4 99.2 28.6 99.2H119.8C121.7 99.2 122.6 101.5 121.3 102.8L102.5 121.6C101.7 122.4 100.6 122.9 99.4 122.9H8.2C6.3 122.9 5.4 120.6 6.7 119.3L25.5 100.5Z" fill="white"/>
                      <path d="M25.5 6.3C26.3 5.5 27.4 5 28.6 5H119.8C121.7 5 122.6 7.3 121.3 8.6L102.5 27.4C101.7 28.2 100.6 28.7 99.4 28.7H8.2C6.3 28.7 5.4 26.4 6.7 25.1L25.5 6.3Z" fill="white"/>
                      <path d="M102.5 53.1C101.7 52.3 100.6 51.8 99.4 51.8H8.2C6.3 51.8 5.4 54.1 6.7 55.4L25.5 74.2C26.3 75 27.4 75.5 28.6 75.5H119.8C121.7 75.5 122.6 73.2 121.3 71.9L102.5 53.1Z" fill="white"/>
                    </svg>
                  </div>
                  <span className="text-gray-300 text-sm font-medium">SOL</span>
                </div>
                <p className="text-white text-lg font-semibold">
                  {vaultPosition ? totalSol.toFixed(4) : '—'}
                </p>
                <p className="text-gray-500 text-xs mt-1">
                  {vaultPosition ? `$${totalSolUsd.toFixed(2)}` : ''}
                </p>
              </div>
              <div className="bg-dark-input border border-dark-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-[#2775CA] flex items-center justify-center">
                    <span className="text-white text-[10px] font-bold">$</span>
                  </div>
                  <span className="text-gray-300 text-sm font-medium">USDC</span>
                </div>
                <p className="text-white text-lg font-semibold">
                  {vaultPosition ? totalUsdc.toFixed(2) : '—'}
                </p>
                <p className="text-gray-500 text-xs mt-1">
                  {vaultPosition ? `$${totalUsdcUsd.toFixed(2)}` : ''}
                </p>
              </div>
            </div>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-2 gap-4 mt-4">
            {/* Current Deposit */}
            <div className="bg-dark-card border border-dark-border rounded-2xl p-5">
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">Current Deposit</p>
              <p className="text-2xl font-bold text-white">
                ${(userPosition?.totalValueUsd || 0).toFixed(2)}
              </p>
              {userPosition && (
                <p className="text-gray-500 text-xs mt-1">
                  Available: ${(userPosition.availableNow || 0).toFixed(2)}
                </p>
              )}
              {isConnected && (userPosition?.totalValueUsd || 0) > 0 && (
                <div className="mt-3">
                  <button
                    onClick={handleWithdraw}
                    disabled={withdrawLoading}
                    className="w-full py-2 rounded-lg text-sm font-medium border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
                  >
                    {withdrawLoading ? 'Withdrawing...' : 'Withdraw All'}
                  </button>
                  {withdrawMessage && (
                    <div className={`mt-2 p-2 rounded-lg text-xs ${
                      withdrawMessage.type === 'success'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                      {withdrawMessage.text}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Current APR */}
            <div className="bg-dark-card border border-dark-border rounded-2xl p-5">
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">Current APR</p>
              <p className="text-2xl font-bold text-emerald-400">100%</p>
              <p className="text-gray-500 text-sm mt-1">Annual yield</p>
            </div>
          </div>
        </>)}

        {activeTab === 'history' && (
          <HistoryTab
            transactions={transactions}
            historyStats={historyStats}
            expandedSwapGroups={expandedSwapGroups}
            onToggleSwapGroup={toggleSwapGroup}
          />
        )}
      </div>
    </div>
  );
};
