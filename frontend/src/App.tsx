// App.tsx - ПОЛНАЯ ВЕРСИЯ С VOLATILITY TAB

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './config/appkit';

// Импорт типов
import {
  Pool, PositionWithPool, BalanceResponse, Transaction,
  MonitoringStats, TransactionHistoryStats, ILPosition, ILStats,
  PositionConfigData, ProfitStats, MonthlyProfitStats, ActiveTab,
  User, UserRole, AuthPage
} from './components/types/interfaces';

// Импорт общих компонентов
import { LoginForm } from './components/common/LoginForm';
import { RegisterForm } from './components/common/RegisterForm';
import { Header } from './components/common/Header';
import { Navigation } from './components/common/Navigation';

// Импорт страниц по ролям
import { VaultDashboard } from './components/pages/VaultDashboard';
import { ProDashboard } from './components/pages/ProDashboard';
import { AdminDashboard } from './components/pages/AdminDashboard';

// Импорт компонентов табов
import { PositionsTab } from './components/tabs/PositionsTab';
import { HistoryTab } from './components/tabs/HistoryTab';
import { ILAnalysisTab } from './components/tabs/ILAnalysisTab';
import { ProfitTab } from './components/tabs/ProfitTab';
import { SnapshotTab } from './components/tabs/SnapshotTab';
import { VolatilityTab } from './components/tabs/VolatilityTab';
import { SettingsTab } from './components/tabs/SettingsTab';
import { MonitoringTab } from './components/tabs/MonitoringTab';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const App: React.FC = () => {
  // ==================== STATE ====================
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authPage, setAuthPage] = useState<AuthPage>('login');
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('positions');
  
  // Positions state
  const [positionsData, setPositionsData] = useState<PositionWithPool[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [selectedPool, setSelectedPool] = useState('');
  const [baseMint, setBaseMint] = useState('');
  const [quoteMint, setQuoteMint] = useState('');
  const [priceRangePercent, setPriceRangePercent] = useState<number>(10);
  const [inputAmount, setInputAmount] = useState<number>(0);
  const [balances, setBalances] = useState<BalanceResponse>({});
  const [tokenPrices, setTokenPrices] = useState<{ [key: string]: number }>({});
  const [usdValue, setUsdValue] = useState<number>(0);
  
  // History state
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [historyStats, setHistoryStats] = useState<TransactionHistoryStats | null>(null);
  const [expandedSwapGroups, setExpandedSwapGroups] = useState<Set<string>>(new Set());
  
  // IL Analysis state
  const [ilPositions, setILPositions] = useState<ILPosition[]>([]);
  const [ilStats, setILStats] = useState<ILStats | null>(null);
  
  // Settings state
  const [positionConfigs, setPositionConfigs] = useState<PositionConfigData[]>([]);
  const [selectedConfigPool, setSelectedConfigPool] = useState('');
  const [lowerRangePercent, setLowerRangePercent] = useState<number>(10);
  const [upperRangePercent, setUpperRangePercent] = useState<number>(10);
  
  // Monitoring state
  const [monitoringStats, setMonitoringStats] = useState<MonitoringStats | null>(null);
  
  // Profit state
  const [profitStats, setProfitStats] = useState<ProfitStats | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<{ year: number; month: number } | null>(null);
  const [monthlyProfit, setMonthlyProfit] = useState<MonthlyProfitStats | null>(null);

  // ==================== EFFECTS ====================
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('token');
          delete axios.defaults.headers.common['Authorization'];
          setIsAuthenticated(false);
          setMessage('Session expired. Please login again.');
          setTimeout(() => window.location.reload(), 100);
        }
        return Promise.reject(error);
      }
    );

    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUserMe().then((userData) => {
        if (userData) {
          setIsAuthenticated(true);
          if (userData.role === 'admin') {
            fetchAllData();
          }
        }
      });
    }

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'admin') return;

    const interval = setInterval(() => {
      fetchMonitoringStats();
      if (activeTab === 'history') fetchTransactionHistory();
      else if (activeTab === 'il-analysis') fetchILAnalysis();
      else if (activeTab === 'profit') fetchProfitAnalytics();
    }, 10000);

    return () => clearInterval(interval);
  }, [isAuthenticated, user, activeTab]);

  useEffect(() => {
    if (inputAmount && baseMint && tokenPrices[baseMint]) {
      setUsdValue(inputAmount * tokenPrices[baseMint]);
    } else {
      setUsdValue(0);
    }
  }, [inputAmount, baseMint, tokenPrices]);

  // ==================== API CALLS ====================
  const fetchUserMe = async (): Promise<User | null> => {
    try {
      const response = await axios.get(`${API_BASE_URL}/user/me`);
      const userData: User = response.data;
      setUser(userData);
      return userData;
    } catch (error) {
      console.error('Error fetching user info:', error);
      localStorage.removeItem('token');
      delete axios.defaults.headers.common['Authorization'];
      setIsAuthenticated(false);
      return null;
    }
  };

  const fetchAllData = async () => {
    await Promise.all([
      fetchPositions(),
      fetchMonitoringStats(),
      fetchTransactionHistory(),
      fetchHistoryStats(),
      fetchILAnalysis(),
      fetchPositionConfigs(),
      fetchProfitAnalytics(),
    ]);
  };

  const fetchPositions = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/liquidity/positions`);
      const data = response.data;
      if (Array.isArray(data)) {
        setPositionsData(data);
        const uniquePools = new Map<string, Pool>();
        data.forEach((item: PositionWithPool) => {
          if (!uniquePools.has(item.pool.poolId)) {
            uniquePools.set(item.pool.poolId, item.pool);
          }
        });
        setPools(Array.from(uniquePools.values()));
      }
    } catch (error) {
      console.error('Error fetching positions:', error);
    }
  };

  const fetchBalances = async (poolId: string) => {
    if (!poolId) return;
    try {
      const response = await axios.get(`${API_BASE_URL}/liquidity/pool/balance/${poolId}`);
      setBalances(response.data);
    } catch (error) {
      setMessage(`Error fetching balances: ${axios.isAxiosError(error) ? error.message : 'Unknown error'}`);
      setBalances({});
    }
  };

  const fetchTokenPrices = async (symbols: string[]) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/liquidity/token/price`, {
        params: { symbols: symbols.join(',') },
      });
      setTokenPrices((prev) => ({ ...prev, ...response.data }));
      return response.data;
    } catch (error) {
      console.error('Error fetching prices:', error);
      return {};
    }
  };

  const fetchMonitoringStats = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/monitoring/stats`);
      if (response.data.success) {
        setMonitoringStats(response.data.stats);
      }
    } catch (error) {
      console.error('Error fetching monitoring stats:', error);
    }
  };

  const fetchTransactionHistory = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/transaction/grouped?limit=50`);
      setTransactions(response.data.transactions || []);
    } catch (error) {
      console.error('Error fetching transaction history:', error);
    }
  };

  const fetchHistoryStats = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/transaction/statistics`);
      setHistoryStats(response.data);
    } catch (error) {
      console.error('Error fetching history stats:', error);
    }
  };

  const fetchILAnalysis = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/analytics/positions`, {
        params: { status: 'CLOSED', limit: 100, sort: 'closedAt' }
      });
      const positions = response.data.positions || [];
      setILPositions(positions);
      
      // Calculate IL stats
      if (Array.isArray(positions) && positions.length > 0) {
        const validPositions = positions.filter((p: ILPosition) => 
          p.apr !== null && p.apr !== undefined && 
          p.impermanentLoss !== null && p.impermanentLoss !== undefined &&
          p.feesEarned !== null && p.feesEarned !== undefined
        );

        if (validPositions.length > 0) {
          const positionsWithAPR = validPositions.filter((p: ILPosition) => 
            p.apr && !isNaN(parseFloat(String(p.apr)))
          );
          const avgAPR = positionsWithAPR.length > 0
            ? positionsWithAPR.reduce((sum: number, p: ILPosition) => sum + parseFloat(String(p.apr)), 0) / positionsWithAPR.length
            : 0;
          
          const totalFees = validPositions.reduce((sum: number, p: ILPosition) => sum + p.feesEarned, 0);
          const avgIL = validPositions.reduce((sum: number, p: ILPosition) => sum + p.impermanentLoss, 0) / validPositions.length;
          const totalIL = validPositions.reduce((sum: number, p: ILPosition) => sum + p.impermanentLoss, 0);
          
          const positiveILCount = validPositions.filter((p: ILPosition) => p.impermanentLoss > 0).length;
          const negativeILCount = validPositions.filter((p: ILPosition) => p.impermanentLoss <= 0).length;
          
          const sortedByAPR = [...validPositions].sort((a, b) => 
            parseFloat(String(b.apr)) - parseFloat(String(a.apr))
          );
          
          const sortedByIL = [...validPositions].sort((a, b) => b.impermanentLoss - a.impermanentLoss);
          
          setILStats({
            totalClosed: validPositions.length,
            avgAPR,
            totalFees,
            avgIL,
            totalIL,
            positiveILCount,
            negativeILCount,
            bestPosition: sortedByAPR[0] ? {
              id: sortedByAPR[0].id,
              apr: parseFloat(String(sortedByAPR[0].apr)) || 0,
              fees: sortedByAPR[0].feesEarned,
            } : null,
            worstPosition: sortedByIL[0] ? {
              id: sortedByIL[0].id,
              apr: parseFloat(String(sortedByIL[0].apr)) || 0,
              il: sortedByIL[0].impermanentLoss,
            } : null,
          });
        }
      }
    } catch (error) {
      console.error('Error fetching IL analysis:', error);
    }
  };

  const fetchPositionConfigs = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/position-config`);
      setPositionConfigs(response.data.configs || []);
    } catch (error) {
      console.error('Error fetching configs:', error);
    }
  };

  const fetchProfitAnalytics = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/transaction/all-time`);
      if (response.data.success) {
        setProfitStats(response.data.stats);
      }
    } catch (error) {
      console.error('Error fetching profit analytics:', error);
    }
  };

  const fetchMonthlyProfit = async (year: number, month: number) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/transaction/monthly/${year}/${month}`);
      if (response.data.success) {
        setMonthlyProfit(response.data.stats);
      }
    } catch (error) {
      console.error('Error fetching monthly profit:', error);
    }
  };

  // ==================== HANDLERS ====================
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/auth/login`, { username, password });
      const token = response.data.accessToken || response.data.token;
      localStorage.setItem('token', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      const userData = await fetchUserMe();
      if (userData) {
        setIsAuthenticated(true);
        setMessage('Login successful!');
        if (userData.role === 'admin') {
          await fetchAllData();
        }
      }
    } catch (error) {
      setMessage(`Login failed: ${axios.isAxiosError(error) ? error.response?.data?.message || error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (regUsername: string, regPassword: string, role: UserRole) => {
    setLoading(true);
    setMessage('');
    try {
      await axios.post(`${API_BASE_URL}/auth/register`, {
        username: regUsername,
        password: regPassword,
        role,
      });
      setMessage('Account created successfully! Please sign in.');
      setAuthPage('login');
    } catch (error) {
      setMessage(`Registration failed: ${axios.isAxiosError(error) ? error.response?.data?.message || error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setIsAuthenticated(false);
    setUser(null);
    setAuthPage('login');
    setMessage('');
  };

  const handlePoolChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const poolId = e.target.value;
    setSelectedPool(poolId);
    const pool = pools.find((p) => p.poolId === poolId);
    if (pool) {
      setBaseMint(pool.baseMint);
      setQuoteMint(pool.quoteMint);
      await fetchTokenPrices([pool.baseMint, pool.quoteMint]);
      fetchBalances(poolId);
    } else {
      setBaseMint('');
      setQuoteMint('');
      setBalances({});
      setTokenPrices({});
    }
  };

  const getTokenAddress = (symbol: string): string => {
    const tokenAddresses: { [key: string]: string } = {
      SOL: 'So11111111111111111111111111111111111111112',
      USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      ETH: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
      USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
    };
    return tokenAddresses[symbol] || symbol;
  };

  const handleSetupLiquidity = async () => {
    if (!selectedPool || !inputAmount) {
      setMessage('Please select a trading pair and enter an amount');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API_BASE_URL}/liquidity/setup-position`, {
        poolId: selectedPool,
        baseMint: getTokenAddress(baseMint),
        quoteMint: getTokenAddress(quoteMint),
        priceRangePercent,
        inputAmount: Number(inputAmount),
      });
      setMessage('Position created successfully!');
      await Promise.all([fetchPositions(), fetchTransactionHistory(), fetchHistoryStats()]);
      fetchBalances(selectedPool);
    } catch (error) {
      setMessage(`Error: ${axios.isAxiosError(error) ? error.response?.data?.message || error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveLiquidity = async (positionId: string) => {
    setLoading(true);
    try {
      await axios.post(`${API_BASE_URL}/liquidity/close-position`, { nftMint: positionId });
      await Promise.all([fetchPositions(), fetchTransactionHistory(), fetchHistoryStats()]);
      setMessage(`Liquidity removed for position ${positionId.slice(0, 8)}...`);
      fetchBalances(selectedPool);
    } catch (error) {
      setMessage(`Error: ${axios.isAxiosError(error) ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleStartMonitoring = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/monitoring/start`);
      setMessage(response.data.message);
      await fetchMonitoringStats();
    } catch (error) {
      setMessage(`Error: ${axios.isAxiosError(error) ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleStopMonitoring = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/monitoring/stop`);
      setMessage(response.data.message);
      await fetchMonitoringStats();
    } catch (error) {
      setMessage(`Error: ${axios.isAxiosError(error) ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckNow = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/monitoring/check-now`);
      setMessage(response.data.message);
      await fetchMonitoringStats();
      await fetchPositions();
    } catch (error) {
      setMessage(`Error: ${axios.isAxiosError(error) ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerSnapshot = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/snapshots/trigger`);
      setMessage(response.data.message || 'Snapshot created successfully!');
    } catch (error) {
      setMessage(`Error: ${axios.isAxiosError(error) ? error.response?.data?.message || error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * VOLATILITY: Backfill all pools
   */
  const handleBackfillAll = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/volatility/backfill-all?days=30`);
      setMessage(response.data.message || 'Backfill completed successfully!');
    } catch (error) {
      setMessage(
        `Error: ${
          axios.isAxiosError(error)
            ? error.response?.data?.message || error.message
            : 'Unknown error'
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
    if (tab === 'il-analysis') fetchILAnalysis();
    if (tab === 'profit') fetchProfitAnalytics();
    if (tab === 'settings') fetchPositionConfigs();
  };

  const toggleSwapGroup = (groupId: string) => {
    setExpandedSwapGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  const handleMonthSelect = (year: number, month: number) => {
    setSelectedMonth({ year, month });
    fetchMonthlyProfit(year, month);
  };

  const handleMonthClose = () => {
    setSelectedMonth(null);
    setMonthlyProfit(null);
  };

  const handleConfigPoolSelect = (poolId: string) => {
    setSelectedConfigPool(poolId);
    const existing = positionConfigs.find(c => c.poolId === poolId);
    if (existing) {
      setLowerRangePercent(Number(existing.lowerRangePercent));
      setUpperRangePercent(Number(existing.upperRangePercent));
    } else {
      setLowerRangePercent(10);
      setUpperRangePercent(10);
    }
  };

  const handleSaveConfig = async () => {
    if (!selectedConfigPool) {
      setMessage('Please select a pool');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API_BASE_URL}/position-config`, {
        poolId: selectedConfigPool,
        lowerRangePercent,
        upperRangePercent,
      });
      setMessage(`✅ Config saved: Lower ${lowerRangePercent}%, Upper ${upperRangePercent}%`);
      await fetchPositionConfigs();
    } catch (error) {
      setMessage(`Error: ${axios.isAxiosError(error) ? error.response?.data?.message || error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConfig = async (poolId: string) => {
    if (!confirm(`Delete config for pool ${poolId}?`)) return;
    setLoading(true);
    try {
      await axios.delete(`${API_BASE_URL}/position-config/${poolId}`);
      setMessage(`✅ Config deleted for pool ${poolId}`);
      await fetchPositionConfigs();
    } catch (error) {
      setMessage(`Error: ${axios.isAxiosError(error) ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEditConfig = (config: PositionConfigData) => {
    setSelectedConfigPool(config.poolId);
    setLowerRangePercent(Number(config.lowerRangePercent));
    setUpperRangePercent(Number(config.upperRangePercent));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const formatUptime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  // ==================== RENDER ====================
  if (!isAuthenticated) {
    if (authPage === 'register') {
      return (
        <RegisterForm
          loading={loading}
          message={message}
          onRegister={handleRegister}
          onBackToLogin={() => { setAuthPage('login'); setMessage(''); }}
        />
      );
    }
    return (
      <LoginForm
        username={username}
        password={password}
        loading={loading}
        message={message}
        onUsernameChange={setUsername}
        onPasswordChange={setPassword}
        onSubmit={handleLogin}
        onRegisterClick={() => { setAuthPage('register'); setMessage(''); }}
      />
    );
  }

  // Role-based routing
  if (user?.role === 'vault') {
    return <VaultDashboard user={user} onLogout={handleLogout} />;
  }

  if (user?.role === 'pro') {
    return <ProDashboard user={user} onLogout={handleLogout} />;
  }

  if (user?.role === 'admin') {
    return <AdminDashboard user={user} onLogout={handleLogout} />;
  }

  // Fallback — current full dashboard (legacy)
  return (
    <div className="max-w-6xl mx-auto p-6 min-h-screen">
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
        <ILAnalysisTab
          ilPositions={ilPositions}
          ilStats={ilStats}
        />
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
        <SnapshotTab
          loading={loading}
          onTriggerSnapshot={handleTriggerSnapshot}
        />
      )}

      {activeTab === 'volatility' && (
        <VolatilityTab
          loading={loading}
          onBackfillAll={handleBackfillAll}
        />
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
        <div className={`p-4 rounded-lg border animate-fade-in ${
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

export default App;