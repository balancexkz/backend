import React, { useState, useEffect } from 'react';
import { RangeSuggestion, VolatilityHistory } from '../types/interfaces';

interface VolatilityTabProps {
  loading: boolean;
  onBackfillAll: () => Promise<void>;
}

export const VolatilityTab: React.FC<VolatilityTabProps> = ({ loading, onBackfillAll }) => {
  const [activeView, setActiveView] = useState<'suggestions' | 'single' | 'history'>('suggestions');
  const [suggestions, setSuggestions] = useState<RangeSuggestion[]>([]);
  const [singleSuggestion, setSingleSuggestion] = useState<RangeSuggestion | null>(null);
  const [history, setHistory] = useState<VolatilityHistory | null>(null);
  const [fetchLoading, setFetchLoading] = useState(false);
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
  const [poolId, setPoolId] = useState('');
  const [days, setDays] = useState(30);
  const [sigmas, setSigmas] = useState(2);

  const fetchAllSuggestions = async () => {
    setFetchLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_BASE_URL}/volatility/suggestions?days=${days}&sigmas=${sigmas}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await response.json();
      if (data.success) setSuggestions(data.suggestions);
      else console.error('Error:', data.error);
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
    } finally {
      setFetchLoading(false);
    }
  };

  const fetchSingleSuggestion = async () => {
    if (!poolId.trim()) { alert('Please enter Pool ID'); return; }
    setFetchLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_BASE_URL}/volatility/suggest/${poolId}?days=${days}&sigmas=${sigmas}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await response.json();
      if (data.success) setSingleSuggestion(data.suggestion);
      else alert(`Error: ${data.error}`);
    } catch (error) {
      console.error('Failed to fetch suggestion:', error);
      alert('Failed to fetch suggestion');
    } finally {
      setFetchLoading(false);
    }
  };

  const fetchHistory = async () => {
    setFetchLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_BASE_URL}/volatility/history/SOL?days=${days}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await response.json();
      if (data.success) setHistory(data.history);
      else alert(`Error: ${data.error}`);
    } catch (error) {
      console.error('Failed to fetch history:', error);
      alert('Failed to fetch history');
    } finally {
      setFetchLoading(false);
    }
  };

  useEffect(() => {
    if (activeView === 'suggestions') fetchAllSuggestions();
    else if (activeView === 'history') fetchHistory();
  }, [activeView, days, sigmas]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-200">
          Volatility-Based Ranges
        </h2>
        <button
          onClick={onBackfillAll}
          disabled={loading}
          className="px-4 py-2 bg-accent-500 text-white rounded-lg hover:bg-accent-400 disabled:bg-gray-700 disabled:text-gray-500 transition-all"
        >
          {loading ? 'Loading...' : 'Backfill All Pools'}
        </button>
      </div>

      {/* Info */}
      <div className="bg-accent-500/5 border border-accent-500/20 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-gray-200 mb-2">
          About Volatility-Based Ranges
        </h3>
        <p className="text-sm text-gray-400">
          This system calculates <strong className="text-gray-300">optimal price ranges</strong> based on SOL's historical volatility using the <strong className="text-gray-300">Markowitz method</strong>.
          Instead of guessing 5%, 10%, or 20%, get mathematically calculated ranges with <strong className="text-gray-300">95% confidence</strong> (2σ).
        </p>
        <div className="mt-3 text-sm text-gray-400">
          <strong className="text-gray-300">How it works:</strong>
          <ol className="list-decimal ml-5 mt-1 space-y-1">
            <li>Collects SOL prices every 12 hours (00:00 & 12:00 Almaty time)</li>
            <li>Calculates standard deviation (σ) from 30 days of price data</li>
            <li>Suggests range: Current Price ± 2σ (95% confidence interval)</li>
          </ol>
        </div>
      </div>

      {/* View Tabs */}
      <div className="flex space-x-2 border-b border-dark-border">
        <button
          onClick={() => setActiveView('suggestions')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeView === 'suggestions'
              ? 'text-accent-400 border-b-2 border-accent-500'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          All Suggestions
        </button>
        <button
          onClick={() => setActiveView('single')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeView === 'single'
              ? 'text-accent-400 border-b-2 border-accent-500'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Single Pool
        </button>
        <button
          onClick={() => setActiveView('history')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeView === 'history'
              ? 'text-accent-400 border-b-2 border-accent-500'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          SOL History
        </button>
      </div>

      {/* Parameters */}
      <div className="bg-dark-card border border-dark-border rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-400 mb-3">Parameters</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Days</label>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-full px-3 py-2 bg-dark-input border border-dark-border text-gray-200 rounded-lg focus:outline-none focus:border-accent-500"
            >
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Confidence (σ)</label>
            <select
              value={sigmas}
              onChange={(e) => setSigmas(Number(e.target.value))}
              className="w-full px-3 py-2 bg-dark-input border border-dark-border text-gray-200 rounded-lg focus:outline-none focus:border-accent-500"
            >
              <option value={1}>1σ (68%)</option>
              <option value={2}>2σ (95%)</option>
              <option value={3}>3σ (99.7%)</option>
            </select>
          </div>
        </div>
      </div>

      {/* All Suggestions */}
      {activeView === 'suggestions' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-200">
              All Pool Suggestions ({suggestions.length})
            </h3>
            <button
              onClick={fetchAllSuggestions}
              disabled={fetchLoading}
              className="px-3 py-1 text-sm bg-accent-500/10 text-accent-400 rounded-lg hover:bg-accent-500/20 disabled:opacity-50 border border-accent-500/20"
            >
              {fetchLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {fetchLoading ? (
            <div className="text-center py-8 text-gray-500">Loading suggestions...</div>
          ) : suggestions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No suggestions available. Click "Backfill All Pools" to load historical data.
            </div>
          ) : (
            <div className="space-y-3">
              {suggestions.map((suggestion) => (
                <SuggestionCard key={suggestion.poolId} suggestion={suggestion} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Single Pool */}
      {activeView === 'single' && (
        <div className="space-y-4">
          <div className="bg-dark-card border border-dark-border rounded-lg p-4">
            <label className="block text-sm font-semibold text-gray-300 mb-2">
              Pool ID
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={poolId}
                onChange={(e) => setPoolId(e.target.value)}
                placeholder="Enter Pool ID..."
                className="flex-1 px-4 py-2 bg-dark-input border border-dark-border text-gray-200 rounded-lg focus:outline-none focus:border-accent-500 placeholder-gray-600"
              />
              <button
                onClick={fetchSingleSuggestion}
                disabled={fetchLoading || !poolId.trim()}
                className="px-6 py-2 bg-accent-500 text-white rounded-lg hover:bg-accent-400 disabled:bg-gray-700 disabled:text-gray-500"
              >
                {fetchLoading ? 'Loading...' : 'Search'}
              </button>
            </div>
          </div>

          {singleSuggestion && (
            <SuggestionCard suggestion={singleSuggestion} detailed />
          )}
        </div>
      )}

      {/* SOL History */}
      {activeView === 'history' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-200">SOL Price History</h3>
            <button
              onClick={fetchHistory}
              disabled={fetchLoading}
              className="px-3 py-1 text-sm bg-accent-500/10 text-accent-400 rounded-lg hover:bg-accent-500/20 disabled:opacity-50 border border-accent-500/20"
            >
              {fetchLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {fetchLoading ? (
            <div className="text-center py-8 text-gray-500">Loading history...</div>
          ) : history ? (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <StatCard label="Current Price" value={`$${history.currentPrice.toFixed(2)}`} color="accent" />
                <StatCard label="Volatility (σ)" value={`${history.volatility.toFixed(2)}%`} color="purple" />
                <StatCard label="Period" value={history.period} color="accent" />
                <StatCard label="Data Points" value={history.dataPoints.toString()} color="emerald" />
              </div>

              <div className="bg-dark-card border border-dark-border rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full">
                    <thead className="bg-dark-table-header sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Date & Time</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Price (USD)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dark-border">
                      {history.priceHistory.slice(0, 100).map((point, idx) => (
                        <tr key={idx} className="hover:bg-dark-card-hover">
                          <td className="px-4 py-2 text-sm text-gray-400">
                            {new Date(point.timestamp).toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-sm font-medium text-gray-200">
                            ${point.price.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {history.priceHistory.length > 100 && (
                  <div className="px-4 py-2 bg-dark-table-header text-xs text-gray-500 text-center">
                    Showing first 100 of {history.priceHistory.length} data points
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No history data available. Click Refresh to load.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface SuggestionCardProps {
  suggestion: RangeSuggestion;
  detailed?: boolean;
}

const SuggestionCard: React.FC<SuggestionCardProps> = ({ suggestion, detailed = false }) => {
  return (
    <div className="bg-dark-card border border-dark-border rounded-lg p-4 hover:border-accent-500/30 transition-colors">
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="text-xs text-gray-500 mb-1">Pool ID</p>
          <p className="text-sm font-mono text-gray-400">
            {suggestion.poolId.slice(0, 8)}...{suggestion.poolId.slice(-6)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500 mb-1">Current Price</p>
          <p className="text-lg font-bold text-gray-200">
            ${suggestion.currentPrice.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="bg-accent-500/5 border border-accent-500/20 rounded-lg p-3">
          <p className="text-xs text-accent-400 mb-1">Volatility (σ)</p>
          <p className="text-lg font-bold text-accent-300">{suggestion.volatility}%</p>
        </div>
        <div className="bg-dark-input border border-dark-border rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Confidence</p>
          <p className="text-lg font-bold text-gray-300">{suggestion.confidence}</p>
        </div>
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
          <p className="text-xs text-emerald-400 mb-1">Data Points</p>
          <p className="text-lg font-bold text-emerald-300">{suggestion.dataPoints}</p>
        </div>
      </div>

      <div className="bg-accent-500/5 border border-accent-500/20 rounded-lg p-4">
        <p className="text-sm font-semibold text-gray-300 mb-3">Suggested Range:</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Lower Bound</p>
            <p className="text-xl font-bold text-accent-400">
              ${suggestion.suggestedRange.lower.toFixed(2)}
            </p>
            <p className="text-xs text-accent-500">
              -{suggestion.suggestedRange.lowerPercent.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Upper Bound</p>
            <p className="text-xl font-bold text-accent-300">
              ${suggestion.suggestedRange.upper.toFixed(2)}
            </p>
            <p className="text-xs text-accent-500">
              +{suggestion.suggestedRange.upperPercent.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      {detailed && (
        <div className="mt-3 pt-3 border-t border-dark-border">
          <p className="text-xs text-gray-500">
            Period: {suggestion.period} · Base Token: {suggestion.baseToken.slice(0, 8)}...
          </p>
        </div>
      )}
    </div>
  );
};

interface StatCardProps {
  label: string;
  value: string;
  color: 'accent' | 'purple' | 'emerald';
}

const StatCard: React.FC<StatCardProps> = ({ label, value, color }) => {
  const colorClasses = {
    accent: 'bg-accent-500/5 text-accent-400 border-accent-500/20',
    purple: 'bg-purple-500/5 text-purple-400 border-purple-500/20',
    emerald: 'bg-emerald-500/5 text-emerald-400 border-emerald-500/20',
  };

  return (
    <div className={`border rounded-lg p-3 ${colorClasses[color]}`}>
      <p className="text-xs opacity-80 mb-1">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
};
