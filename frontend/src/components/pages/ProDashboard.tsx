// ProDashboard.tsx
// Original legacy interface + PRO wallet connect / onboarding / fund wallet on top

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import { useAppKitConnection } from '@reown/appkit-adapter-solana/react';
import { PublicKey, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';

import {
  Pool, PositionWithPool, BalanceResponse,
  MonitoringStats, TransactionHistoryStats, ILPosition, ILStats,
  PositionConfigData, ProfitStats, MonthlyProfitStats, ActiveTab, User,
  Transaction as LegacyTransaction,
} from '../types/interfaces';

import { Header }      from '../common/Header';
import { Navigation }  from '../common/Navigation';
import { PositionsTab }  from '../tabs/PositionsTab';
import { HistoryTab }    from '../tabs/HistoryTab';
import { ILAnalysisTab } from '../tabs/ILAnalysisTab';
import { ProfitTab }     from '../tabs/ProfitTab';
import { SnapshotTab }   from '../tabs/SnapshotTab';
import { VolatilityTab } from '../tabs/VolatilityTab';
import { SettingsTab }   from '../tabs/SettingsTab';
import { MonitoringTab } from '../tabs/MonitoringTab';

const API = import.meta.env.VITE_API_BASE_URL;

// ─── Types ────────────────────────────────────────────────────────────────────

interface SolanaProvider {
  publicKey?: PublicKey;
  signTransaction: <T extends Transaction>(tx: T) => Promise<T>;
  sendTransaction: (tx: Transaction, connection: any) => Promise<string>;
}

interface ProStatus {
  walletExists: boolean;
  registered: boolean;
  walletPda: string;
  position: {
    positionNftMint: string | null;
    tickLower: number | null;
    tickUpper: number | null;
    priceRangePercent: number;
    monitoringEnabled: boolean;
    rebalanceCount: number;
    lastError: string | null;
    updatedAt: string;
  } | null;
}

// ─── Onboarding ───────────────────────────────────────────────────────────────

const OnboardingFlow: React.FC<{
  address: string;
  connection: any;
  walletProvider: SolanaProvider;
  onDone: () => void;
}> = ({ address, connection, walletProvider, onDone }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const signAndSend = async (txBase64: string): Promise<string> => {
    const buf = Buffer.from(txBase64, 'base64');
    const tx = Transaction.from(buf);
    const signed = await walletProvider.signTransaction(tx);
    const sig = await connection.sendRawTransaction(signed.serialize());
    await connection.confirmTransaction(sig, 'confirmed');
    return sig;
  };

  const doStep1 = async () => {
    setLoading(true); setMsg('');
    try {
      const r = await axios.get(`${API}/pro/user/build-create?ownerPubkey=${address}`);
      await signAndSend(r.data.transaction);
      setMsg('✅ SmartWallet created');
      setStep(2);
    } catch (e: any) {
      setMsg(`❌ ${e.response?.data?.message ?? e.message}`);
    } finally { setLoading(false); }
  };

  const doStep2 = async () => {
    setLoading(true); setMsg('');
    try {
      const r = await axios.get(`${API}/pro/user/build-delegate?ownerPubkey=${address}`);
      await signAndSend(r.data.transaction);
      setMsg('✅ Delegate authorized');
      setStep(3);
    } catch (e: any) {
      setMsg(`❌ ${e.response?.data?.message ?? e.message}`);
    } finally { setLoading(false); }
  };

  const doStep3 = async () => {
    setLoading(true); setMsg('');
    try {
      await axios.post(`${API}/pro/user/register`, { ownerPubkey: address });
      setMsg('✅ Registered! Monitor starting…');
      setTimeout(onDone, 1500);
    } catch (e: any) {
      setMsg(`❌ ${e.response?.data?.message ?? e.message}`);
    } finally { setLoading(false); }
  };

  const steps = [
    { n: 1, title: 'Create SmartWallet', desc: 'Creates your personal smart wallet PDA on-chain. Sign with your wallet.', action: doStep1 },
    { n: 2, title: 'Authorize Manager', desc: 'Grants our backend permission to manage your liquidity positions automatically.', action: doStep2 },
    { n: 3, title: 'Start Monitoring', desc: 'Registers you in the system. The bot will open and manage your CLMM position.', action: doStep3 },
  ];

  return (
    <div className="max-w-2xl mx-auto p-6 min-h-screen flex items-center">
      <div className="w-full bg-[#1a1f2e] border border-[#2a3045] rounded-2xl p-8">
        <h2 className="text-white font-semibold text-xl mb-2">Setup PRO Account</h2>
        <p className="text-gray-400 text-sm mb-8">Complete 3 steps to activate automated liquidity management</p>

        <div className="space-y-4 mb-6">
          {steps.map(s => (
            <div key={s.n} className={`flex items-start gap-4 p-4 rounded-xl border transition-colors ${
              step === s.n ? 'border-purple-500 bg-purple-500/5' :
              step > s.n  ? 'border-emerald-700 bg-emerald-900/10' :
              'border-[#2a3045] opacity-50'
            }`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                step > s.n  ? 'bg-emerald-600 text-white' :
                step === s.n ? 'bg-purple-600 text-white' :
                'bg-[#2a3045] text-gray-500'
              }`}>
                {step > s.n ? '✓' : s.n}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium text-sm">{s.title}</p>
                <p className="text-gray-500 text-xs mt-0.5">{s.desc}</p>
              </div>
              {step === s.n && (
                <button
                  onClick={s.action}
                  disabled={loading}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 shrink-0"
                >
                  {loading ? '…' : 'Sign & Send'}
                </button>
              )}
            </div>
          ))}
        </div>

        {msg && (
          <p className={`text-sm px-4 py-2 rounded-lg ${msg.startsWith('✅') ? 'bg-emerald-900/30 text-emerald-300' : 'bg-red-900/30 text-red-300'}`}>
            {msg}
          </p>
        )}
      </div>
    </div>
  );
};

// ─── Fund Wallet Banner ────────────────────────────────────────────────────────

const FundWalletBanner: React.FC<{
  address: string;
  connection: any;
  walletProvider: SolanaProvider;
  onFunded: () => void;
}> = ({ address, connection, walletProvider, onFunded }) => {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const fund = async () => {
    if (!amount || Number(amount) <= 0) return;
    setLoading(true); setMsg('');
    try {
      const r = await axios.get(`${API}/pro/user/build-fund?ownerPubkey=${address}&amountSol=${amount}`);
      const buf = Buffer.from(r.data.transaction, 'base64');
      const tx = Transaction.from(buf);
      const signed = await walletProvider.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, 'confirmed');
      setMsg(`✅ Funded ${amount} SOL — the bot will open your position shortly`);
      setAmount('');
      setTimeout(onFunded, 2000);
    } catch (e: any) {
      setMsg(`❌ ${e.response?.data?.message ?? e.message}`);
    } finally { setLoading(false); }
  };

  return (
    <div className="mb-4 border border-yellow-600/40 bg-yellow-900/10 rounded-xl p-4">
      <p className="text-yellow-400 text-xs font-semibold uppercase tracking-wider mb-1">⚡ Fund SmartWallet Treasury</p>
      <p className="text-gray-400 text-sm mb-3">Your SmartWallet is empty. Deposit SOL to open a CLMM position.</p>
      <div className="flex gap-2 items-center">
        <input
          type="number"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="Amount SOL"
          className="bg-[#0d1117] border border-[#2a3045] rounded-lg px-3 py-1.5 text-white text-sm w-36 focus:outline-none focus:border-purple-500"
        />
        <button
          onClick={fund}
          disabled={loading || !amount}
          className="px-4 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {loading ? '…' : 'Deposit'}
        </button>
        {msg && <span className={`text-xs ${msg.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>{msg}</span>}
      </div>
    </div>
  );
};

// ─── PRO Header wrapper ───────────────────────────────────────────────────────

const ProHeaderBar: React.FC<{
  user: User;
  address: string | undefined;
  solBalance: number | null;
  walletPda: string;
  onLogout: () => void;
}> = ({ user, address, solBalance, walletPda, onLogout }) => {
  const short = (s: string) => s ? `${s.slice(0, 6)}…${s.slice(-4)}` : '';
  return (
    <div className="flex items-center justify-between mb-2 px-1">
      <div className="flex items-center gap-3">
        <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded-full text-xs font-bold uppercase">PRO</span>
        <span className="text-gray-400 text-sm">{user.username}</span>
        {address && (
          <span className="text-gray-600 text-xs font-mono">wallet: {short(address)}</span>
        )}
        {walletPda && (
          <span className="text-gray-600 text-xs font-mono">pda: {short(walletPda)}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {solBalance != null && (
          <span className="text-gray-300 text-sm">{solBalance.toFixed(4)} SOL</span>
        )}
        <appkit-button />
        <button onClick={onLogout} className="text-sm text-gray-500 hover:text-red-400 transition-colors">
          Logout
        </button>
      </div>
    </div>
  );
};

// ─── Main ProDashboard ────────────────────────────────────────────────────────

interface Props { user: User; onLogout: () => void; }

export const ProDashboard: React.FC<Props> = ({ user, onLogout }) => {
  // ── Wallet ──
  const { address, isConnected } = useAppKitAccount();
  const { connection }           = useAppKitConnection();
  const { walletProvider }       = useAppKitProvider<SolanaProvider>('solana');

  const [solBalance, setSolBalance]     = useState<number | null>(null);
  const [status, setStatus]             = useState<ProStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [showFundBanner, setShowFundBanner] = useState(false);

  // ── Legacy dashboard state (identical to App.tsx) ──
  const [activeTab, setActiveTab] = useState<ActiveTab>('positions');
  const [positionsData, setPositionsData] = useState<PositionWithPool[]>([]);
  const [pools, setPools]         = useState<Pool[]>([]);
  const [selectedPool, setSelectedPool] = useState('');
  const [baseMint, setBaseMint]   = useState('');
  const [quoteMint, setQuoteMint] = useState('');
  const [priceRangePercent, setPriceRangePercent] = useState<number>(10);
  const [inputAmount, setInputAmount]   = useState<number>(0);
  const [balances, setBalances]         = useState<BalanceResponse>({});
  const [tokenPrices, setTokenPrices]   = useState<{ [key: string]: number }>({});
  const [usdValue, setUsdValue]         = useState<number>(0);
  const [transactions, setTransactions] = useState<LegacyTransaction[]>([]);
  const [historyStats, setHistoryStats] = useState<TransactionHistoryStats | null>(null);
  const [expandedSwapGroups, setExpandedSwapGroups] = useState<Set<string>>(new Set());
  const [ilPositions, setILPositions]   = useState<ILPosition[]>([]);
  const [ilStats, setILStats]           = useState<ILStats | null>(null);
  const [positionConfigs, setPositionConfigs] = useState<PositionConfigData[]>([]);
  const [selectedConfigPool, setSelectedConfigPool] = useState('');
  const [lowerRangePercent, setLowerRangePercent]   = useState<number>(10);
  const [upperRangePercent, setUpperRangePercent]   = useState<number>(10);
  const [monitoringStats, setMonitoringStats]       = useState<MonitoringStats | null>(null);
  const [profitStats, setProfitStats]     = useState<ProfitStats | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<{ year: number; month: number } | null>(null);
  const [monthlyProfit, setMonthlyProfit] = useState<MonthlyProfitStats | null>(null);
  const [loading, setLoading]   = useState(false);
  const [message, setMessage]   = useState('');

  // ── Wallet balance ──
  useEffect(() => {
    if (!isConnected || !address || !connection) { setSolBalance(null); return; }
    const fetch = async () => {
      try { setSolBalance((await connection.getBalance(new PublicKey(address))) / LAMPORTS_PER_SOL); }
      catch { setSolBalance(null); }
    };
    fetch();
    const t = setInterval(fetch, 15000);
    return () => clearInterval(t);
  }, [isConnected, address, connection]);

  // ── PRO status ──
  const fetchStatus = useCallback(async () => {
    if (!address) return;
    setStatusLoading(true);
    try {
      const r = await axios.get(`${API}/pro/user/status?ownerPubkey=${address}`);
      setStatus(r.data);
      // Show fund banner if registered but no active position
      setShowFundBanner(r.data.registered && !r.data.position?.positionNftMint);
    } catch { setStatus(null); }
    finally { setStatusLoading(false); }
  }, [address]);

  useEffect(() => {
    if (isConnected && address) fetchStatus();
    else setStatus(null);
  }, [isConnected, address, fetchStatus]);

  // ── USD value calc ──
  useEffect(() => {
    if (inputAmount && baseMint && tokenPrices[baseMint]) {
      setUsdValue(inputAmount * tokenPrices[baseMint]);
    } else { setUsdValue(0); }
  }, [inputAmount, baseMint, tokenPrices]);

  // ── Polling ──
  useEffect(() => {
    if (!status?.registered) return;
    const t = setInterval(() => {
      fetchMonitoringStats();
      if (activeTab === 'history')     fetchTransactionHistory();
      else if (activeTab === 'il-analysis') fetchILAnalysis();
      else if (activeTab === 'profit') fetchProfitAnalytics();
    }, 10000);
    return () => clearInterval(t);
  }, [status, activeTab]);

  // ── Legacy fetchers ──
  const fetchAllData = async () => {
    await Promise.all([
      fetchPositions(), fetchMonitoringStats(), fetchTransactionHistory(),
      fetchHistoryStats(), fetchILAnalysis(), fetchPositionConfigs(), fetchProfitAnalytics(),
    ]);
  };

  const fetchPositions = async () => {
    try {
      const r = await axios.get(`${API}/liquidity/positions`);
      const data = r.data;
      if (Array.isArray(data)) {
        setPositionsData(data);
        const uniquePools = new Map<string, Pool>();
        data.forEach((item: PositionWithPool) => {
          if (!uniquePools.has(item.pool.poolId)) uniquePools.set(item.pool.poolId, item.pool);
        });
        setPools(Array.from(uniquePools.values()));
      }
    } catch {}
  };

  const fetchBalances = async (poolId: string) => {
    if (!poolId) return;
    try {
      const r = await axios.get(`${API}/liquidity/pool/balance/${poolId}`);
      setBalances(r.data);
    } catch { setBalances({}); }
  };

  const fetchTokenPrices = async (symbols: string[]) => {
    try {
      const r = await axios.get(`${API}/liquidity/token/price`, { params: { symbols: symbols.join(',') } });
      setTokenPrices(prev => ({ ...prev, ...r.data }));
      return r.data;
    } catch { return {}; }
  };

  const fetchMonitoringStats = async () => {
    try {
      const r = await axios.get(`${API}/monitoring/stats`);
      if (r.data.success) setMonitoringStats(r.data.stats);
    } catch {}
  };

  const fetchTransactionHistory = async () => {
    try {
      const r = await axios.get(`${API}/transaction/grouped?limit=50`);
      setTransactions(r.data.transactions || []);
    } catch {}
  };

  const fetchHistoryStats = async () => {
    try {
      const r = await axios.get(`${API}/transaction/statistics`);
      setHistoryStats(r.data);
    } catch {}
  };

  const fetchILAnalysis = async () => {
    try {
      const r = await axios.get(`${API}/analytics/positions`, { params: { status: 'CLOSED', limit: 100, sort: 'closedAt' } });
      const positions = r.data.positions || [];
      setILPositions(positions);
      if (Array.isArray(positions) && positions.length > 0) {
        const valid = positions.filter((p: ILPosition) =>
          p.apr != null && p.impermanentLoss != null && p.feesEarned != null);
        if (valid.length > 0) {
          const withAPR = valid.filter((p: ILPosition) => p.apr && !isNaN(parseFloat(String(p.apr))));
          const avgAPR  = withAPR.length > 0 ? withAPR.reduce((s: number, p: ILPosition) => s + parseFloat(String(p.apr)), 0) / withAPR.length : 0;
          const totalFees = valid.reduce((s: number, p: ILPosition) => s + p.feesEarned, 0);
          const avgIL   = valid.reduce((s: number, p: ILPosition) => s + p.impermanentLoss, 0) / valid.length;
          const totalIL = valid.reduce((s: number, p: ILPosition) => s + p.impermanentLoss, 0);
          const sortedAPR = [...valid].sort((a, b) => parseFloat(String(b.apr)) - parseFloat(String(a.apr)));
          const sortedIL  = [...valid].sort((a, b) => b.impermanentLoss - a.impermanentLoss);
          setILStats({
            totalClosed: valid.length, avgAPR, totalFees, avgIL, totalIL,
            positiveILCount: valid.filter((p: ILPosition) => p.impermanentLoss > 0).length,
            negativeILCount: valid.filter((p: ILPosition) => p.impermanentLoss <= 0).length,
            bestPosition:  sortedAPR[0] ? { id: sortedAPR[0].id, apr: parseFloat(String(sortedAPR[0].apr)) || 0, fees: sortedAPR[0].feesEarned } : null,
            worstPosition: sortedIL[0]  ? { id: sortedIL[0].id,  apr: parseFloat(String(sortedIL[0].apr))  || 0, il:   sortedIL[0].impermanentLoss  } : null,
          });
        }
      }
    } catch {}
  };

  const fetchPositionConfigs = async () => {
    try {
      const r = await axios.get(`${API}/position-config`);
      setPositionConfigs(r.data.configs || []);
    } catch {}
  };

  const fetchProfitAnalytics = async () => {
    try {
      const r = await axios.get(`${API}/transaction/all-time`);
      if (r.data.success) setProfitStats(r.data.stats);
    } catch {}
  };

  const fetchMonthlyProfit = async (year: number, month: number) => {
    try {
      const r = await axios.get(`${API}/transaction/monthly/${year}/${month}`);
      if (r.data.success) setMonthlyProfit(r.data.stats);
    } catch {}
  };

  // ── Legacy handlers ──
  const handlePoolChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const poolId = e.target.value;
    setSelectedPool(poolId);
    const pool = pools.find(p => p.poolId === poolId);
    if (pool) {
      setBaseMint(pool.baseMint); setQuoteMint(pool.quoteMint);
      await fetchTokenPrices([pool.baseMint, pool.quoteMint]);
      fetchBalances(poolId);
    } else {
      setBaseMint(''); setQuoteMint(''); setBalances({}); setTokenPrices({});
    }
  };

  const getTokenAddress = (symbol: string): string => ({
    SOL:  'So11111111111111111111111111111111111111112',
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    ETH:  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    RAY:  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  }[symbol] || symbol);

  const handleSetupLiquidity = async () => {
    if (!selectedPool || !inputAmount) { setMessage('Please select a trading pair and enter an amount'); return; }
    setLoading(true);
    try {
      await axios.post(`${API}/liquidity/setup-position`, {
        poolId: selectedPool, baseMint: getTokenAddress(baseMint),
        quoteMint: getTokenAddress(quoteMint), priceRangePercent, inputAmount: Number(inputAmount),
      });
      setMessage('Position created successfully!');
      await Promise.all([fetchPositions(), fetchTransactionHistory(), fetchHistoryStats()]);
      fetchBalances(selectedPool);
    } catch (e: any) {
      setMessage(`Error: ${axios.isAxiosError(e) ? e.response?.data?.message || e.message : 'Unknown error'}`);
    } finally { setLoading(false); }
  };

  const handleRemoveLiquidity = async (positionId: string) => {
    setLoading(true);
    try {
      await axios.post(`${API}/liquidity/close-position`, { nftMint: positionId });
      await Promise.all([fetchPositions(), fetchTransactionHistory(), fetchHistoryStats()]);
      setMessage(`Liquidity removed for position ${positionId.slice(0, 8)}...`);
      fetchBalances(selectedPool);
    } catch (e: any) {
      setMessage(`Error: ${axios.isAxiosError(e) ? e.message : 'Unknown error'}`);
    } finally { setLoading(false); }
  };

  const handleStartMonitoring = async () => {
    setLoading(true);
    try {
      const r = await axios.post(`${API}/monitoring/start`);
      setMessage(r.data.message);
      await fetchMonitoringStats();
    } catch (e: any) {
      setMessage(`Error: ${axios.isAxiosError(e) ? e.message : 'Unknown error'}`);
    } finally { setLoading(false); }
  };

  const handleStopMonitoring = async () => {
    setLoading(true);
    try {
      const r = await axios.post(`${API}/monitoring/stop`);
      setMessage(r.data.message);
      await fetchMonitoringStats();
    } catch (e: any) {
      setMessage(`Error: ${axios.isAxiosError(e) ? e.message : 'Unknown error'}`);
    } finally { setLoading(false); }
  };

  const handleCheckNow = async () => {
    setLoading(true);
    try {
      const r = await axios.post(`${API}/monitoring/check-now`);
      setMessage(r.data.message);
      await fetchMonitoringStats(); await fetchPositions();
    } catch (e: any) {
      setMessage(`Error: ${axios.isAxiosError(e) ? e.message : 'Unknown error'}`);
    } finally { setLoading(false); }
  };

  const handleTriggerSnapshot = async () => {
    setLoading(true);
    try {
      const r = await axios.post(`${API}/snapshots/trigger`);
      setMessage(r.data.message || 'Snapshot created successfully!');
    } catch (e: any) {
      setMessage(`Error: ${axios.isAxiosError(e) ? e.response?.data?.message || e.message : 'Unknown error'}`);
    } finally { setLoading(false); }
  };

  const handleBackfillAll = async () => {
    setLoading(true);
    try {
      const r = await axios.post(`${API}/volatility/backfill-all?days=30`);
      setMessage(r.data.message || 'Backfill completed successfully!');
    } catch (e: any) {
      setMessage(`Error: ${axios.isAxiosError(e) ? e.response?.data?.message || e.message : 'Unknown error'}`);
    } finally { setLoading(false); }
  };

  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
    if (tab === 'il-analysis') fetchILAnalysis();
    if (tab === 'profit')      fetchProfitAnalytics();
    if (tab === 'settings')    fetchPositionConfigs();
  };

  const toggleSwapGroup = (groupId: string) => {
    setExpandedSwapGroups(prev => {
      const s = new Set(prev);
      s.has(groupId) ? s.delete(groupId) : s.add(groupId);
      return s;
    });
  };

  const handleMonthSelect = (year: number, month: number) => {
    setSelectedMonth({ year, month }); fetchMonthlyProfit(year, month);
  };

  const handleMonthClose = () => { setSelectedMonth(null); setMonthlyProfit(null); };

  const handleConfigPoolSelect = (poolId: string) => {
    setSelectedConfigPool(poolId);
    const existing = positionConfigs.find(c => c.poolId === poolId);
    if (existing) { setLowerRangePercent(Number(existing.lowerRangePercent)); setUpperRangePercent(Number(existing.upperRangePercent)); }
    else { setLowerRangePercent(10); setUpperRangePercent(10); }
  };

  const handleSaveConfig = async () => {
    if (!selectedConfigPool) { setMessage('Please select a pool'); return; }
    setLoading(true);
    try {
      await axios.post(`${API}/position-config`, { poolId: selectedConfigPool, lowerRangePercent, upperRangePercent });
      setMessage(`✅ Config saved: Lower ${lowerRangePercent}%, Upper ${upperRangePercent}%`);
      await fetchPositionConfigs();
    } catch (e: any) {
      setMessage(`Error: ${axios.isAxiosError(e) ? e.response?.data?.message || e.message : 'Unknown error'}`);
    } finally { setLoading(false); }
  };

  const handleDeleteConfig = async (poolId: string) => {
    if (!confirm(`Delete config for pool ${poolId}?`)) return;
    setLoading(true);
    try {
      await axios.delete(`${API}/position-config/${poolId}`);
      setMessage(`✅ Config deleted for pool ${poolId}`);
      await fetchPositionConfigs();
    } catch (e: any) {
      setMessage(`Error: ${axios.isAxiosError(e) ? e.message : 'Unknown error'}`);
    } finally { setLoading(false); }
  };

  const handleEditConfig = (config: PositionConfigData) => {
    setSelectedConfigPool(config.poolId);
    setLowerRangePercent(Number(config.lowerRangePercent));
    setUpperRangePercent(Number(config.upperRangePercent));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const formatUptime = (ms: number): string => {
    const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d > 0) return `${d}d ${h % 24}h`;
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
  };

  // ── RENDER ──

  // 1. Not connected
  if (!isConnected) {
    return (
      <div className="max-w-6xl mx-auto p-6 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-purple-500/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Connect Your Wallet</h2>
          <p className="text-gray-400 text-sm mb-6 max-w-xs mx-auto">Connect Phantom or Solflare to access your PRO account</p>
          <appkit-button />
          <div className="mt-4">
            <button onClick={onLogout} className="text-sm text-gray-500 hover:text-red-400 transition-colors">
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Loading status
  if (statusLoading && !status) {
    return <div className="text-gray-400 text-sm text-center py-24">Loading your account…</div>;
  }

  // 3. Onboarding (not registered)
  if (status && !status.registered) {
    return (
      <>
        <div className="fixed top-0 right-0 p-4 flex items-center gap-3 z-10">
          <appkit-button />
          <button onClick={onLogout} className="text-sm text-gray-500 hover:text-red-400">Logout</button>
        </div>
        <OnboardingFlow
          address={address!}
          connection={connection}
          walletProvider={walletProvider as unknown as SolanaProvider}
          onDone={fetchStatus}
        />
      </>
    );
  }

  // 4. Registered → full legacy dashboard
  return (
    <div className="max-w-6xl mx-auto p-6 min-h-screen">
      {/* PRO user info bar */}
      <ProHeaderBar
        user={user}
        address={address}
        solBalance={solBalance}
        walletPda={status?.walletPda ?? ''}
        onLogout={onLogout}
      />

      {/* Fund wallet banner (shown when no active position) */}
      {showFundBanner && address && (
        <FundWalletBanner
          address={address}
          connection={connection}
          walletProvider={walletProvider as unknown as SolanaProvider}
          onFunded={() => { setShowFundBanner(false); fetchStatus(); }}
        />
      )}

      {/* Original legacy interface — identical to App.tsx fallback */}
      <Header
        monitoringStats={monitoringStats}
        loading={loading}
        onStartMonitoring={handleStartMonitoring}
        onStopMonitoring={handleStopMonitoring}
      />

      <Navigation
        activeTab={activeTab}
        monitoringStats={monitoringStats}
        onTabChange={handleTabChange}
      />

      {activeTab === 'positions' && (
        <PositionsTab
          positionsData={positionsData}
          pools={pools}
          selectedPool={selectedPool}
          baseMint={baseMint}
          quoteMint={quoteMint}
          inputAmount={inputAmount}
          priceRangePercent={priceRangePercent}
          usdValue={usdValue}
          balances={balances}
          loading={loading}
          onPoolChange={handlePoolChange}
          onInputAmountChange={setInputAmount}
          onPriceRangeChange={setPriceRangePercent}
          onSetupLiquidity={handleSetupLiquidity}
          onRemoveLiquidity={handleRemoveLiquidity}
        />
      )}

      {activeTab === 'history' && (
        <HistoryTab
          transactions={transactions}
          historyStats={historyStats}
          expandedSwapGroups={expandedSwapGroups}
          onToggleSwapGroup={toggleSwapGroup}
        />
      )}

      {activeTab === 'il-analysis' && (
        <ILAnalysisTab ilPositions={ilPositions} ilStats={ilStats} />
      )}

      {activeTab === 'profit' && (
        <ProfitTab
          profitStats={profitStats}
          selectedMonth={selectedMonth}
          monthlyProfit={monthlyProfit}
          onMonthSelect={handleMonthSelect}
          onMonthClose={handleMonthClose}
        />
      )}

      {activeTab === 'snapshot' && (
        <SnapshotTab loading={loading} onTriggerSnapshot={handleTriggerSnapshot} />
      )}

      {activeTab === 'volatility' && (
        <VolatilityTab loading={loading} onBackfillAll={handleBackfillAll} />
      )}

      {activeTab === 'settings' && (
        <SettingsTab
          positionConfigs={positionConfigs}
          pools={pools}
          selectedConfigPool={selectedConfigPool}
          lowerRangePercent={lowerRangePercent}
          upperRangePercent={upperRangePercent}
          loading={loading}
          onPoolSelect={handleConfigPoolSelect}
          onLowerRangeChange={setLowerRangePercent}
          onUpperRangeChange={setUpperRangePercent}
          onSaveConfig={handleSaveConfig}
          onDeleteConfig={handleDeleteConfig}
          onEditConfig={handleEditConfig}
        />
      )}

      {activeTab === 'monitoring' && (
        <MonitoringTab
          monitoringStats={monitoringStats}
          loading={loading}
          onStartMonitoring={handleStartMonitoring}
          onStopMonitoring={handleStopMonitoring}
          onCheckNow={handleCheckNow}
          formatUptime={formatUptime}
        />
      )}

      {message && (
        <div className={`mt-4 p-4 rounded-lg border animate-fade-in ${
          message.includes('Error') || message.includes('failed')
            ? 'bg-red-500/10 text-red-400 border-red-500/20'
            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
        }`}>
          {message}
        </div>
      )}
    </div>
  );
};
