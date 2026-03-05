import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_BASE_URL;

// ─── Types ────────────────────────────────────────────────────────────────────

interface User { username: string; role: string; }

interface VaultStatus {
  tvlUsd: number; solPrice: number; isPaused: boolean;
  treasury: { sol: number; usdc: number };
  position: {
    hasActive: boolean; positionMint: string | null;
    tickLower: number | null; tickUpper: number | null;
    priceLower: number | null; priceUpper: number | null;
    solAmount: number; usdcAmount: number;
  } | null;
}

interface Depositor {
  ownerPubkey: string; deposits: number; totalSolUsd: number; lastActivity: string;
}

interface ProPosition {
  id: number; ownerPubkey: string; poolId: string;
  positionNftMint: string | null; tickLower: number | null; tickUpper: number | null;
  priceRangePercent: number; monitoringEnabled: boolean;
  rebalanceCount: number; lastError: string | null; updatedAt: string;
}

interface VaultTx {
  id: number; type: string; ownerPubkey: string | null; txHash: string | null;
  solAmount: number | null; usdcAmount: number | null; totalValueUsd: number | null;
  createdAt: string;
}

interface ProfitSummary {
  totalFeesUsd: number; totalRebalances: number;
  openPositionsValueUsd: number; closePositionsValueUsd: number;
}

interface ProStats {
  usersChecked: number; positionsOutOfRange: number;
  rebalancesTriggered: number; rebalancesSucceeded: number;
  rebalancesFailed: number; errors: number; inProgress: number;
}

type AdminTab = 'vault' | 'pro' | 'history' | 'pnl';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number | string | null | undefined, dec = 2) => {
  if (n == null) return '—';
  const num = Number(n);
  return isNaN(num) ? '—' : num.toFixed(dec);
};

const short = (s: string | null | undefined) =>
  s ? `${s.slice(0, 6)}…${s.slice(-4)}` : '—';

const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const Card: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <div className={`bg-dark-card border border-dark-border rounded-2xl p-5 ${className}`}>
    <h3 className="text-gray-400 text-xs uppercase tracking-wider mb-4">{title}</h3>
    {children}
  </div>
);

const Stat: React.FC<{ label: string; value: React.ReactNode; sub?: string }> = ({ label, value, sub }) => (
  <div>
    <p className="text-gray-500 text-xs mb-1">{label}</p>
    <p className="text-white font-semibold text-lg">{value}</p>
    {sub && <p className="text-gray-500 text-xs mt-0.5">{sub}</p>}
  </div>
);

const ActionBtn: React.FC<{
  label: string; onClick: () => void; loading?: boolean;
  variant?: 'default' | 'danger' | 'warn';
}> = ({ label, onClick, loading, variant = 'default' }) => {
  const colors = {
    default: 'bg-accent-500 hover:bg-accent-600 text-white',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    warn: 'bg-yellow-600 hover:bg-yellow-700 text-white',
  };
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${colors[variant]}`}
    >
      {loading ? '…' : label}
    </button>
  );
};

// ─── Vault Tab ────────────────────────────────────────────────────────────────

const VaultTab: React.FC = () => {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [depositors, setDepositors] = useState<Depositor[]>([]);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const [s, d] = await Promise.all([
      axios.get(`${API}/monitoring/vault/status`),
      axios.get(`${API}/monitoring/vault/depositors?limit=100`),
    ]);
    setStatus(s.data);
    setDepositors(d.data.depositors ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (key: string, fn: () => Promise<void>) => {
    setLoading(l => ({ ...l, [key]: true }));
    setMsg('');
    try { await fn(); setMsg(`✅ Done`); await load(); }
    catch (e: any) { setMsg(`❌ ${e.response?.data?.message ?? e.message}`); }
    finally { setLoading(l => ({ ...l, [key]: false })); }
  };

  if (!status) return <p className="text-gray-500 text-sm">Loading…</p>;

  const pos = status.position;

  return (
    <div className="space-y-4">
      {/* Actions */}
      <Card title="Actions">
        <div className="flex flex-wrap gap-3">
          <ActionBtn
            label={status.isPaused ? '▶ Unpause Vault' : '⏸ Pause Vault'}
            loading={loading.pause}
            variant={status.isPaused ? 'default' : 'warn'}
            onClick={() => act('pause', () =>
              axios.post(`${API}/monitoring/vault/pause`, { paused: !status.isPaused }).then(() => {})
            )}
          />
          <ActionBtn
            label="↻ Force TVL Update"
            loading={loading.tvl}
            onClick={() => act('tvl', () =>
              axios.post(`${API}/monitoring/vault/update-tvl`).then(() => {})
            )}
          />
        </div>
        {msg && <p className="text-sm mt-3 text-gray-300">{msg}</p>}
      </Card>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card title="TVL">
          <Stat label="" value={`$${fmt(status.tvlUsd)}`} />
        </Card>
        <Card title="SOL Price">
          <Stat label="" value={`$${fmt(status.solPrice)}`} />
        </Card>
        <Card title="Treasury SOL">
          <Stat label="" value={`${fmt(status.treasury.sol, 4)} SOL`}
            sub={`$${fmt(status.treasury.sol * status.solPrice)}`} />
        </Card>
        <Card title="Treasury USDC">
          <Stat label="" value={`${fmt(status.treasury.usdc)} USDC`} />
        </Card>
      </div>

      {/* Status badge */}
      <div className="flex gap-3">
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${status.isPaused ? 'bg-red-900 text-red-300' : 'bg-green-900 text-green-300'}`}>
          {status.isPaused ? '⏸ PAUSED' : '▶ ACTIVE'}
        </span>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${pos?.hasActive ? 'bg-blue-900 text-blue-300' : 'bg-gray-800 text-gray-400'}`}>
          {pos?.hasActive ? '🟢 Position Open' : '⚪ No Position'}
        </span>
      </div>

      {/* Position */}
      {pos?.hasActive && (
        <Card title="CLMM Position">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Mint" value={<span className="font-mono text-xs">{short(pos.positionMint)}</span>} />
            <Stat label="Range" value={`$${fmt(pos.priceLower)} – $${fmt(pos.priceUpper)}`} />
            <Stat label="SOL in position" value={`${fmt(pos.solAmount, 4)} SOL`} />
            <Stat label="USDC in position" value={`${fmt(pos.usdcAmount)} USDC`} />
          </div>
          <p className="text-gray-600 text-xs mt-3 font-mono">
            Tick {pos.tickLower} → {pos.tickUpper}
          </p>
        </Card>
      )}

      {/* Depositors */}
      <Card title={`Depositors (${depositors.length})`}>
        {depositors.length === 0 ? (
          <p className="text-gray-500 text-sm">No depositors yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b border-dark-border">
                  <th className="text-left pb-2">Pubkey</th>
                  <th className="text-right pb-2">Deposits</th>
                  <th className="text-right pb-2">Total USD</th>
                  <th className="text-right pb-2">Last Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-border">
                {depositors.map(d => (
                  <tr key={d.ownerPubkey} className="hover:bg-dark-border/20">
                    <td className="py-2 font-mono text-xs text-gray-300">{short(d.ownerPubkey)}</td>
                    <td className="py-2 text-right text-gray-300">{d.deposits}</td>
                    <td className="py-2 text-right text-accent-400">${fmt(d.totalSolUsd)}</td>
                    <td className="py-2 text-right text-gray-500 text-xs">{timeAgo(d.lastActivity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

// ─── PRO Tab ──────────────────────────────────────────────────────────────────

const ProTab: React.FC = () => {
  const [positions, setPositions] = useState<ProPosition[]>([]);
  const [stats, setStats] = useState<ProStats | null>(null);
  const [rebalancing, setRebalancing] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const [p, s] = await Promise.all([
      axios.get(`${API}/monitoring/pro/positions`),
      axios.get(`${API}/monitoring/pro/status`),
    ]);
    setPositions(p.data.positions ?? []);
    setStats(s.data.stats ?? null);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleMonitoring = async (pubkey: string, enabled: boolean) => {
    try {
      await axios.put(`${API}/monitoring/pro/${pubkey}/monitoring`, { enabled });
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e.response?.data?.message ?? e.message}`);
    }
  };

  const rebalance = async (pubkey: string) => {
    setRebalancing(r => ({ ...r, [pubkey]: true }));
    setMsg('');
    try {
      await axios.post(`${API}/monitoring/pro/rebalance/${pubkey}`);
      setMsg(`✅ Rebalance triggered for ${short(pubkey)}`);
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e.response?.data?.message ?? e.message}`);
    } finally {
      setRebalancing(r => ({ ...r, [pubkey]: false }));
    }
  };

  const openPosition = async (pubkey: string) => {
    setRebalancing(r => ({ ...r, [`open_${pubkey}`]: true }));
    setMsg('');
    try {
      await axios.post(`${API}/pro/${pubkey}/position/open`);
      setMsg(`✅ Opening position for ${short(pubkey)}`);
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e.response?.data?.message ?? e.message}`);
    } finally {
      setRebalancing(r => ({ ...r, [`open_${pubkey}`]: false }));
    }
  };

  return (
    <div className="space-y-4">
      {/* Monitor stats */}
      {stats && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { label: 'Checked', val: stats.usersChecked },
            { label: 'Out of range', val: stats.positionsOutOfRange },
            { label: 'Triggered', val: stats.rebalancesTriggered },
            { label: 'Succeeded', val: stats.rebalancesSucceeded },
            { label: 'Failed', val: stats.rebalancesFailed },
            { label: 'In progress', val: stats.inProgress },
          ].map(s => (
            <div key={s.label} className="bg-dark-card border border-dark-border rounded-xl p-3 text-center">
              <p className="text-gray-500 text-xs">{s.label}</p>
              <p className="text-white font-bold text-xl mt-1">{s.val}</p>
            </div>
          ))}
        </div>
      )}

      {msg && <p className="text-sm text-gray-300 bg-dark-card border border-dark-border rounded-lg px-4 py-2">{msg}</p>}

      {/* Positions table */}
      <Card title={`PRO Positions (${positions.length})`}>
        {positions.length === 0 ? (
          <p className="text-gray-500 text-sm">No PRO users registered</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b border-dark-border">
                  <th className="text-left pb-2">Owner</th>
                  <th className="text-left pb-2">Position NFT</th>
                  <th className="text-right pb-2">Range %</th>
                  <th className="text-right pb-2">Rebalances</th>
                  <th className="text-right pb-2">Monitor</th>
                  <th className="text-right pb-2">Updated</th>
                  <th className="text-right pb-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-border">
                {positions.map(p => (
                  <tr key={p.id} className="hover:bg-dark-border/20">
                    <td className="py-2 font-mono text-xs text-gray-300">{short(p.ownerPubkey)}</td>
                    <td className="py-2 font-mono text-xs">
                      {p.positionNftMint
                        ? <span className="text-blue-400">{short(p.positionNftMint)}</span>
                        : <span className="text-gray-600">none</span>}
                    </td>
                    <td className="py-2 text-right text-gray-300">±{p.priceRangePercent}%</td>
                    <td className="py-2 text-right text-gray-300">{p.rebalanceCount}</td>
                    <td className="py-2 text-right">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${p.monitoringEnabled ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-gray-500'}`}>
                        {p.monitoringEnabled ? 'ON' : 'OFF'}
                      </span>
                    </td>
                    <td className="py-2 text-right text-gray-500 text-xs">{timeAgo(p.updatedAt)}</td>
                    <td className="py-2 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => toggleMonitoring(p.ownerPubkey, !p.monitoringEnabled)}
                          className="px-2 py-1 rounded text-xs bg-dark-border hover:bg-gray-700 text-gray-300 transition-colors"
                        >
                          {p.monitoringEnabled ? 'Disable' : 'Enable'}
                        </button>
                        {!p.positionNftMint ? (
                          <button
                            onClick={() => openPosition(p.ownerPubkey)}
                            disabled={rebalancing[`open_${p.ownerPubkey}`]}
                            className="px-2 py-1 rounded text-xs bg-green-700 hover:bg-green-600 text-white transition-colors disabled:opacity-50"
                          >
                            {rebalancing[`open_${p.ownerPubkey}`] ? '…' : 'Open'}
                          </button>
                        ) : (
                          <button
                            onClick={() => rebalance(p.ownerPubkey)}
                            disabled={rebalancing[p.ownerPubkey]}
                            className="px-2 py-1 rounded text-xs bg-accent-500 hover:bg-accent-600 text-white transition-colors disabled:opacity-50"
                          >
                            {rebalancing[p.ownerPubkey] ? '…' : 'Rebalance'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {positions.some(p => p.lastError) && (
          <div className="mt-4 border-t border-dark-border pt-4 space-y-2">
            <p className="text-red-400 text-xs uppercase tracking-wider">Errors</p>
            {positions.filter(p => p.lastError).map(p => (
              <div key={p.id} className="text-xs text-red-300 bg-red-900/20 rounded px-3 py-2">
                <span className="font-mono text-gray-400">{short(p.ownerPubkey)}: </span>{p.lastError}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

// ─── History Tab ──────────────────────────────────────────────────────────────

const HistoryTab: React.FC = () => {
  const [txs, setTxs] = useState<VaultTx[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/monitoring/vault/history?limit=100`)
      .then(r => setTxs(r.data.transactions ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-500 text-sm">Loading…</p>;

  return (
    <Card title={`All Transactions (${txs.length})`}>
      {txs.length === 0 ? (
        <p className="text-gray-500 text-sm">No transactions</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs border-b border-dark-border">
                <th className="text-left pb-2">Type</th>
                <th className="text-left pb-2">Owner</th>
                <th className="text-right pb-2">SOL</th>
                <th className="text-right pb-2">USDC</th>
                <th className="text-right pb-2">Total USD</th>
                <th className="text-right pb-2">TX</th>
                <th className="text-right pb-2">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border">
              {txs.map(t => (
                <tr key={t.id} className="hover:bg-dark-border/20">
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      t.type === 'deposit' ? 'bg-green-900/50 text-green-300' :
                      t.type === 'withdraw' ? 'bg-red-900/50 text-red-300' :
                      t.type === 'open_position' ? 'bg-blue-900/50 text-blue-300' :
                      t.type === 'close_position' ? 'bg-purple-900/50 text-purple-300' :
                      t.type === 'collect_fees' ? 'bg-yellow-900/50 text-yellow-300' :
                      'bg-gray-800 text-gray-400'
                    }`}>{t.type}</span>
                  </td>
                  <td className="py-2 font-mono text-xs text-gray-400">{short(t.ownerPubkey)}</td>
                  <td className="py-2 text-right text-gray-300 text-xs">{t.solAmount != null ? fmt(t.solAmount, 4) : '—'}</td>
                  <td className="py-2 text-right text-gray-300 text-xs">{t.usdcAmount != null ? fmt(t.usdcAmount) : '—'}</td>
                  <td className="py-2 text-right text-accent-400 text-xs">{t.totalValueUsd != null ? `$${fmt(t.totalValueUsd)}` : '—'}</td>
                  <td className="py-2 text-right font-mono text-xs">
                    {t.txHash
                      ? <a href={`https://solscan.io/tx/${t.txHash}?cluster=devnet`} target="_blank" rel="noreferrer"
                          className="text-blue-400 hover:underline">{short(t.txHash)}</a>
                      : '—'}
                  </td>
                  <td className="py-2 text-right text-gray-500 text-xs">{timeAgo(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

// ─── P&L Tab ─────────────────────────────────────────────────────────────────

const PnlTab: React.FC = () => {
  const [vaultPnl, setVaultPnl] = useState<ProfitSummary | null>(null);

  useEffect(() => {
    axios.get(`${API}/monitoring/vault/profit`)
      .then(r => setVaultPnl(r.data.summary));
  }, []);

  return (
    <div className="space-y-4">
      <Card title="Vault P&L">
        {!vaultPnl ? (
          <p className="text-gray-500 text-sm">Loading…</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Total Fees USD" value={`$${fmt(vaultPnl.totalFeesUsd)}`} />
            <Stat label="Rebalances" value={vaultPnl.totalRebalances} />
            <Stat label="Positions Opened" value={`$${fmt(vaultPnl.openPositionsValueUsd)}`} />
            <Stat label="Positions Closed" value={`$${fmt(vaultPnl.closePositionsValueUsd)}`} />
          </div>
        )}
      </Card>
    </div>
  );
};

// ─── Main AdminDashboard ──────────────────────────────────────────────────────

interface Props { user: User; onLogout: () => void; }

export const AdminDashboard: React.FC<Props> = ({ user, onLogout }) => {
  const [tab, setTab] = useState<AdminTab>('vault');

  const tabs: { id: AdminTab; label: string }[] = [
    { id: 'vault', label: '🏦 Vault' },
    { id: 'pro', label: '⚡ PRO Users' },
    { id: 'history', label: '📋 History' },
    { id: 'pnl', label: '📈 P&L' },
  ];

  return (
    <div className="min-h-screen bg-dark-bg">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-accent-400 to-accent-200 bg-clip-text text-transparent">
              BalanceX Admin
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">Monitoring & Control Panel</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-400 text-sm">{user.username}</span>
            <span className="px-2 py-0.5 bg-purple-900 text-purple-300 rounded text-xs">admin</span>
            <button onClick={onLogout} className="text-sm text-gray-500 hover:text-red-400 transition-colors">
              Logout
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-dark-card border border-dark-border rounded-xl p-1">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-colors ${
                tab === t.id ? 'bg-accent-500 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === 'vault' && <VaultTab />}
        {tab === 'pro' && <ProTab />}
        {tab === 'history' && <HistoryTab />}
        {tab === 'pnl' && <PnlTab />}
      </div>
    </div>
  );
};
