import React, { useState } from 'react';

interface Snapshot {
  date: string;
  positionValue: string;
  feesCollected: string;
  totalValue: string;
  dailyChange: string | null;
  dailyChangePercent: string | null;
  dailyFeesEarned: string | null;
  status: string;
  price: string;
}

interface RecentSnapshot {
  date: string;
  positions: number;
  totalValue: string;
  totalFees: string;
  totalDailyChange: string;
}

interface PeriodStatistics {
  totalPositions: number;
  totalValue: string;
  totalFees: string;
  totalChange: string;
  avgDailyChange: string;
}

interface SnapshotTabProps {
  loading: boolean;
  onTriggerSnapshot: () => Promise<void>;
}

export const SnapshotTab: React.FC<SnapshotTabProps> = ({
  loading,
  onTriggerSnapshot,
}) => {
  const [positionId, setPositionId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [days, setDays] = useState(7);
  const [positionSnapshots, setPositionSnapshots] = useState<Snapshot[]>([]);
  const [recentSnapshots, setRecentSnapshots] = useState<RecentSnapshot[]>([]);
  const [statistics, setStatistics] = useState<PeriodStatistics | null>(null);
  const [activeView, setActiveView] = useState<'position' | 'recent' | 'stats'>('recent');
  const [fetchLoading, setFetchLoading] = useState(false);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  const fetchPositionSnapshots = async () => {
    if (!positionId) {
      alert('Please enter Position ID');
      return;
    }

    setFetchLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const response = await fetch(
        `${API_BASE_URL}/snapshots/position/${positionId}?${params}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );
      const data = await response.json();

      if (data.success) {
        setPositionSnapshots(data.snapshots);
      }
    } catch (error) {
      console.error('Error fetching position snapshots:', error);
    } finally {
      setFetchLoading(false);
    }
  };

  const fetchRecentSnapshots = async () => {
    setFetchLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/snapshots/recent?days=${days}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );
      const data = await response.json();

      if (data.success) {
        setRecentSnapshots(data.snapshots);
      }
    } catch (error) {
      console.error('Error fetching recent snapshots:', error);
    } finally {
      setFetchLoading(false);
    }
  };

  const fetchStatistics = async () => {
    setFetchLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const response = await fetch(
        `${API_BASE_URL}/snapshots/statistics?${params}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );
      const data = await response.json();

      if (data.success) {
        setStatistics(data.statistics);
      }
    } catch (error) {
      console.error('Error fetching statistics:', error);
    } finally {
      setFetchLoading(false);
    }
  };

  React.useEffect(() => {
    if (activeView === 'recent') {
      fetchRecentSnapshots();
    } else if (activeView === 'stats') {
      fetchStatistics();
    }
  }, [activeView]);

  return (
    <>
      {/* Header */}
      <div className="bg-dark-card p-6 rounded-lg shadow-lg shadow-black/10 mb-6 border border-accent-500/20">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-semibold text-gray-200">
              Daily Position Snapshots
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Track position value, fees, and daily changes over time
            </p>
          </div>
          <button
            onClick={onTriggerSnapshot}
            disabled={loading}
            className="bg-accent-500 hover:bg-accent-400 text-white px-6 py-3 rounded-lg font-semibold disabled:bg-gray-700 disabled:text-gray-500 transition"
          >
            {loading ? 'Creating...' : 'Trigger Snapshot'}
          </button>
        </div>
      </div>

      {/* View Selector */}
      <div className="bg-dark-card rounded-lg mb-6 border border-dark-border">
        <div className="flex border-b border-dark-border">
          <button
            onClick={() => setActiveView('recent')}
            className={`flex-1 py-3 px-4 text-center text-sm font-medium transition-colors ${
              activeView === 'recent'
                ? 'border-b-2 border-accent-500 text-accent-400 bg-accent-500/5'
                : 'text-gray-500 hover:text-gray-300 hover:bg-dark-card-hover'
            }`}
          >
            Recent Snapshots
          </button>
          <button
            onClick={() => setActiveView('position')}
            className={`flex-1 py-3 px-4 text-center text-sm font-medium transition-colors ${
              activeView === 'position'
                ? 'border-b-2 border-accent-500 text-accent-400 bg-accent-500/5'
                : 'text-gray-500 hover:text-gray-300 hover:bg-dark-card-hover'
            }`}
          >
            Position History
          </button>
          <button
            onClick={() => setActiveView('stats')}
            className={`flex-1 py-3 px-4 text-center text-sm font-medium transition-colors ${
              activeView === 'stats'
                ? 'border-b-2 border-accent-500 text-accent-400 bg-accent-500/5'
                : 'text-gray-500 hover:text-gray-300 hover:bg-dark-card-hover'
            }`}
          >
            Statistics
          </button>
        </div>
      </div>

      {/* Recent Snapshots */}
      {activeView === 'recent' && (
        <div className="bg-dark-card p-6 rounded-lg shadow-lg shadow-black/10 border border-dark-border">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-gray-200">Recent Snapshots</h3>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500">Days:</label>
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="bg-dark-input border border-dark-border text-gray-300 p-2 rounded-lg"
              >
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
              </select>
              <button
                onClick={fetchRecentSnapshots}
                disabled={fetchLoading}
                className="bg-accent-500 hover:bg-accent-400 text-white px-4 py-2 rounded-lg transition disabled:bg-gray-700 disabled:text-gray-500"
              >
                {fetchLoading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>

          {recentSnapshots.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">No snapshots yet</p>
              <p className="text-gray-600 text-sm mt-2">Snapshots are created daily at 12:00 PM</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-dark-table-header border-b border-dark-border">
                  <tr>
                    <th className="text-left p-3 font-semibold text-gray-400">Date</th>
                    <th className="text-right p-3 font-semibold text-accent-400">Positions</th>
                    <th className="text-right p-3 font-semibold text-emerald-400">Total Value</th>
                    <th className="text-right p-3 font-semibold text-yellow-400">Total Fees</th>
                    <th className="text-right p-3 font-semibold text-gray-400">Daily Change</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSnapshots.map((snap, index) => {
                    const changeValue = parseFloat(snap.totalDailyChange.replace('$', ''));
                    return (
                      <tr key={snap.date} className={`border-b border-dark-border hover:bg-dark-card-hover transition ${index % 2 === 0 ? 'bg-dark-input' : 'bg-dark-card'}`}>
                        <td className="p-3 font-semibold text-gray-300">{snap.date}</td>
                        <td className="p-3 text-right text-accent-400 font-bold">{snap.positions}</td>
                        <td className="p-3 text-right text-emerald-400 font-bold text-lg">{snap.totalValue}</td>
                        <td className="p-3 text-right text-yellow-400 font-bold">{snap.totalFees}</td>
                        <td className="p-3 text-right">
                          <span className={`font-bold text-lg ${changeValue >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {snap.totalDailyChange}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Position History */}
      {activeView === 'position' && (
        <div className="bg-dark-card p-6 rounded-lg shadow-lg shadow-black/10 border border-dark-border">
          <h3 className="text-xl font-semibold text-gray-200 mb-4">Position Snapshot History</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <input
              type="text"
              value={positionId}
              onChange={(e) => setPositionId(e.target.value)}
              placeholder="Position ID"
              className="bg-dark-input border border-dark-border text-gray-200 p-3 rounded-lg w-full focus:outline-none focus:border-accent-500 transition-colors placeholder-gray-600"
            />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-dark-input border border-dark-border text-gray-200 p-3 rounded-lg w-full focus:outline-none focus:border-accent-500 transition-colors"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-dark-input border border-dark-border text-gray-200 p-3 rounded-lg w-full focus:outline-none focus:border-accent-500 transition-colors"
            />
          </div>

          <button
            onClick={fetchPositionSnapshots}
            disabled={fetchLoading}
            className="bg-accent-500 hover:bg-accent-400 text-white px-6 py-3 rounded-lg font-semibold disabled:bg-gray-700 disabled:text-gray-500 transition w-full mb-4"
          >
            {fetchLoading ? 'Loading...' : 'Search'}
          </button>

          {positionSnapshots.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">Enter a Position ID to view snapshots</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-dark-table-header border-b border-dark-border">
                  <tr>
                    <th className="text-left p-3 font-semibold text-gray-400">Date</th>
                    <th className="text-right p-3 font-semibold text-accent-400">Position Value</th>
                    <th className="text-right p-3 font-semibold text-yellow-400">Fees</th>
                    <th className="text-right p-3 font-semibold text-emerald-400">Total Value</th>
                    <th className="text-right p-3 font-semibold text-gray-400">Daily Change</th>
                    <th className="text-right p-3 font-semibold text-gray-400">Daily Fees</th>
                  </tr>
                </thead>
                <tbody>
                  {positionSnapshots.map((snap, index) => {
                    const changeValue = snap.dailyChange ? parseFloat(snap.dailyChange.replace(/[\$\+]/g, '')) : 0;
                    return (
                      <tr key={snap.date} className={`border-b border-dark-border hover:bg-dark-card-hover transition ${index % 2 === 0 ? 'bg-dark-input' : 'bg-dark-card'}`}>
                        <td className="p-3 font-semibold text-gray-300">{snap.date}</td>
                        <td className="p-3 text-right text-accent-400 font-bold">{snap.positionValue}</td>
                        <td className="p-3 text-right text-yellow-400 font-bold">{snap.feesCollected}</td>
                        <td className="p-3 text-right text-emerald-400 font-bold text-lg">{snap.totalValue}</td>
                        <td className="p-3 text-right">
                          {snap.dailyChange ? (
                            <div>
                              <span className={`font-bold ${changeValue >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {snap.dailyChange}
                              </span>
                              <br />
                              <span className="text-xs text-gray-500">{snap.dailyChangePercent}</span>
                            </div>
                          ) : (
                            <span className="text-gray-600 text-xs">N/A</span>
                          )}
                        </td>
                        <td className="p-3 text-right text-orange-400 font-bold">
                          {snap.dailyFeesEarned || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Statistics */}
      {activeView === 'stats' && (
        <div className="bg-dark-card p-6 rounded-lg shadow-lg shadow-black/10 border border-dark-border">
          <h3 className="text-xl font-semibold text-gray-200 mb-4">Period Statistics</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-dark-input border border-dark-border text-gray-200 p-3 rounded-lg w-full focus:outline-none focus:border-accent-500 transition-colors"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-dark-input border border-dark-border text-gray-200 p-3 rounded-lg w-full focus:outline-none focus:border-accent-500 transition-colors"
            />
          </div>

          <button
            onClick={fetchStatistics}
            disabled={fetchLoading}
            className="bg-accent-500 hover:bg-accent-400 text-white px-6 py-3 rounded-lg font-semibold disabled:bg-gray-700 disabled:text-gray-500 transition w-full mb-6"
          >
            {fetchLoading ? 'Loading...' : 'Calculate Statistics'}
          </button>

          {statistics && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="border border-accent-500/20 p-4 rounded-lg bg-accent-500/5">
                <p className="text-xs text-gray-500 mb-1 font-medium">Total Positions</p>
                <p className="text-3xl font-bold text-accent-400">{statistics.totalPositions}</p>
              </div>

              <div className="border border-emerald-500/20 p-4 rounded-lg bg-emerald-500/5">
                <p className="text-xs text-gray-500 mb-1 font-medium">Total Value</p>
                <p className="text-2xl font-bold text-emerald-400">{statistics.totalValue}</p>
              </div>

              <div className="border border-yellow-500/20 p-4 rounded-lg bg-yellow-500/5">
                <p className="text-xs text-gray-500 mb-1 font-medium">Total Fees</p>
                <p className="text-2xl font-bold text-yellow-400">{statistics.totalFees}</p>
              </div>

              <div className="border border-dark-border p-4 rounded-lg bg-dark-input">
                <p className="text-xs text-gray-500 mb-1 font-medium">Total Change</p>
                <p className={`text-2xl font-bold ${parseFloat(statistics.totalChange.replace(/[\$\+]/g, '')) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {statistics.totalChange}
                </p>
              </div>

              <div className="border border-dark-border p-4 rounded-lg bg-dark-input">
                <p className="text-xs text-gray-500 mb-1 font-medium">Avg Daily Change</p>
                <p className={`text-2xl font-bold ${parseFloat(statistics.avgDailyChange.replace(/[\%\+]/g, '')) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {statistics.avgDailyChange}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Info */}
      <div className="bg-dark-card border border-dark-border p-6 rounded-lg shadow-lg shadow-black/10 mt-6">
        <h3 className="text-lg font-semibold text-gray-300 mb-3">
          About Daily Snapshots
        </h3>
        <div className="space-y-3 text-sm text-gray-400">
          <div className="bg-dark-input p-3 rounded-lg border border-dark-border">
            <p className="font-semibold mb-1 text-gray-300">Automatic Creation</p>
            <p className="text-xs">Snapshots are automatically created daily at 12:00 PM (Asia/Almaty timezone)</p>
          </div>
          <div className="bg-dark-input p-3 rounded-lg border border-dark-border">
            <p className="font-semibold mb-1 text-gray-300">Tracking</p>
            <p className="text-xs">Each snapshot records: position value, fees collected, daily change (USD & %), and daily fees earned</p>
          </div>
          <div className="bg-dark-input p-3 rounded-lg border border-dark-border">
            <p className="font-semibold mb-1 text-gray-300">Manual Trigger</p>
            <p className="text-xs">You can manually trigger a snapshot creation using the button at the top</p>
          </div>
        </div>
      </div>
    </>
  );
};
