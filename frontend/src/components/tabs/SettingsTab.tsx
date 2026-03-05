import React from 'react';
import { PositionConfigData, Pool } from '../types/interfaces';

interface SettingsTabProps {
  positionConfigs: PositionConfigData[];
  pools: Pool[];
  selectedConfigPool: string;
  lowerRangePercent: number;
  upperRangePercent: number;
  loading: boolean;
  onPoolSelect: (poolId: string) => void;
  onLowerRangeChange: (value: number) => void;
  onUpperRangeChange: (value: number) => void;
  onSaveConfig: () => void;
  onDeleteConfig: (poolId: string) => void;
  onEditConfig: (config: PositionConfigData) => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  positionConfigs,
  pools,
  selectedConfigPool,
  lowerRangePercent,
  upperRangePercent,
  loading,
  onPoolSelect,
  onLowerRangeChange,
  onUpperRangeChange,
  onSaveConfig,
  onDeleteConfig,
  onEditConfig,
}) => {
  return (
    <>
      <div className="bg-accent-500/5 border border-accent-500/20 p-6 rounded-lg mb-6">
        <h3 className="text-lg font-semibold text-gray-200 mb-3">
          Asymmetric Price Ranges
        </h3>
        <div className="space-y-2 text-sm text-gray-400">
          <p>Configure different upper and lower boundaries for each pool:</p>
          <ul className="list-disc ml-5 space-y-1">
            <li><strong className="text-gray-300">Lower Range %:</strong> Distance below current price (e.g., -2.5%)</li>
            <li><strong className="text-gray-300">Upper Range %:</strong> Distance above current price (e.g., +3.3%)</li>
            <li><strong className="text-gray-300">Bullish:</strong> Smaller lower, larger upper (e.g., 1.5% / 5%)</li>
            <li><strong className="text-gray-300">Bearish:</strong> Larger lower, smaller upper (e.g., 5% / 1.5%)</li>
          </ul>
        </div>
      </div>

      <div className="bg-dark-card p-6 rounded-lg shadow-lg shadow-black/10 mb-6 border border-dark-border">
        <h2 className="text-xl font-semibold mb-4 text-gray-200">Configure Price Range</h2>

        <div className="grid grid-cols-1 gap-4">
          <select
            value={selectedConfigPool}
            onChange={(e) => onPoolSelect(e.target.value)}
            className="bg-dark-input border border-dark-border text-gray-200 p-3 rounded-lg w-full text-lg focus:outline-none focus:border-accent-500 transition-colors"
          >
            <option value="">Select a pool</option>
            {pools.map((pool) => (
              <option key={pool.poolId} value={pool.poolId}>
                {pool.baseMint}/{pool.quoteMint}
              </option>
            ))}
          </select>

          {selectedConfigPool && (
            <div className="grid grid-cols-2 gap-4 bg-dark-input p-4 rounded-lg border border-dark-border">
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">
                  Lower Range (below current price)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={lowerRangePercent}
                    onChange={(e) => onLowerRangeChange(Number(e.target.value))}
                    step="0.1"
                    min="0.1"
                    max="50"
                    className="bg-dark-bg border border-accent-500/30 text-gray-200 p-3 rounded-lg w-full text-lg font-semibold focus:outline-none focus:border-accent-500 transition-colors"
                  />
                  <span className="text-2xl font-bold text-accent-400">%</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Distance below current price</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">
                  Upper Range (above current price)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={upperRangePercent}
                    onChange={(e) => onUpperRangeChange(Number(e.target.value))}
                    step="0.1"
                    min="0.1"
                    max="50"
                    className="bg-dark-bg border border-emerald-500/30 text-gray-200 p-3 rounded-lg w-full text-lg font-semibold focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                  <span className="text-2xl font-bold text-emerald-400">%</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Distance above current price</p>
              </div>
            </div>
          )}

          {selectedConfigPool && (
            <div className="bg-dark-input p-4 rounded-lg border border-dark-border">
              <h3 className="text-sm font-semibold text-gray-400 mb-2">Preview:</h3>
              <div className="flex items-center justify-between">
                <div className="text-center">
                  <p className="text-xs text-gray-500">Lower Bound</p>
                  <p className="text-lg font-bold text-accent-400">-{lowerRangePercent}%</p>
                </div>
                <div className="flex-1 mx-4">
                  <div className="h-2 bg-gradient-to-r from-accent-500 via-dark-border to-emerald-500 rounded-full"></div>
                  <div className="text-center mt-1">
                    <p className="text-xs text-gray-500">Current Price</p>
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500">Upper Bound</p>
                  <p className="text-lg font-bold text-emerald-400">+{upperRangePercent}%</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2 text-center">
                Total Range: {(lowerRangePercent + upperRangePercent).toFixed(1)}%
              </p>
            </div>
          )}

          {selectedConfigPool && (
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => { onLowerRangeChange(5); onUpperRangeChange(1.5); }}
                className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 p-2 rounded-lg text-sm font-medium transition"
              >
                Bearish<br/>
                <span className="text-xs">5% / 1.5%</span>
              </button>
              <button
                onClick={() => { onLowerRangeChange(4.35); onUpperRangeChange(4.35); }}
                className="bg-dark-input hover:bg-dark-card-hover border border-dark-border text-gray-400 p-2 rounded-lg text-sm font-medium transition"
              >
                Neutral<br/>
                <span className="text-xs">4.35% / 4.35%</span>
              </button>
              <button
                onClick={() => { onLowerRangeChange(1.5); onUpperRangeChange(5); }}
                className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 p-2 rounded-lg text-sm font-medium transition"
              >
                Bullish<br/>
                <span className="text-xs">1.5% / 5%</span>
              </button>
            </div>
          )}

          <button
            onClick={onSaveConfig}
            disabled={loading || !selectedConfigPool}
            className="bg-accent-500 text-white p-3 rounded-lg text-lg font-semibold hover:bg-accent-400 disabled:bg-gray-700 disabled:text-gray-500 transition-colors"
          >
            {loading ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>

      <div className="bg-dark-card p-6 rounded-lg shadow-lg shadow-black/10 border border-dark-border">
        <h2 className="text-xl font-semibold mb-4 text-gray-200">Saved Configurations</h2>

        {positionConfigs.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No configurations yet</p>
            <p className="text-sm text-gray-600 mt-1">Create your first config above</p>
          </div>
        ) : (
          <div className="space-y-3">
            {positionConfigs.map((config) => {
              const pool = pools.find(p => p.poolId === config.poolId);
              return (
                <div
                  key={config.id}
                  className="border border-dark-border p-4 rounded-lg hover:border-accent-500/30 transition bg-dark-input"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-semibold text-lg text-gray-200">
                        {pool ? `${pool.baseMint}/${pool.quoteMint}` : config.poolId.slice(0, 12) + '...'}
                      </p>
                      <p className="text-xs text-gray-600 font-mono">{config.poolId}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                      config.isActive
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-dark-card text-gray-500 border border-dark-border'
                    }`}>
                      {config.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="bg-accent-500/5 p-3 rounded-lg border border-accent-500/20">
                      <p className="text-xs text-gray-500 mb-1">Lower</p>
                      <p className="text-xl font-bold text-accent-400">
                        {Number(config.lowerRangePercent).toFixed(2)}%
                      </p>
                    </div>
                    <div className="bg-dark-card p-3 rounded-lg border border-dark-border">
                      <p className="text-xs text-gray-500 mb-1">Total</p>
                      <p className="text-xl font-bold text-gray-300">
                        {(Number(config.lowerRangePercent) + Number(config.upperRangePercent)).toFixed(2)}%
                      </p>
                    </div>
                    <div className="bg-emerald-500/5 p-3 rounded-lg border border-emerald-500/20">
                      <p className="text-xs text-gray-500 mb-1">Upper</p>
                      <p className="text-xl font-bold text-emerald-400">
                        {Number(config.upperRangePercent).toFixed(2)}%
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-xs text-gray-600 mb-3">
                    <span>Created: {new Date(config.createdAt).toLocaleDateString()}</span>
                    <span>Updated: {new Date(config.updatedAt).toLocaleDateString()}</span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => onEditConfig(config)}
                      className="flex-1 bg-accent-500/20 hover:bg-accent-500/30 text-accent-400 border border-accent-500/30 px-3 py-2 rounded-lg text-sm font-medium transition"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onDeleteConfig(config.poolId)}
                      disabled={loading}
                      className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 px-3 py-2 rounded-lg text-sm font-medium transition disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-dark-card border border-dark-border p-6 rounded-lg shadow-lg shadow-black/10 mt-6">
        <h3 className="text-lg font-semibold text-gray-300 mb-4">
          How to Use
        </h3>
        <div className="space-y-3 text-sm text-gray-400">
          <div className="bg-dark-input p-4 rounded-lg border border-dark-border">
            <p className="font-semibold mb-2 text-gray-300">1. Create Configuration</p>
            <p className="text-xs">Select a pool, set lower/upper ranges, and save. This will be used automatically when reopening positions.</p>
          </div>
          <div className="bg-dark-input p-4 rounded-lg border border-dark-border">
            <p className="font-semibold mb-2 text-gray-300">2. Priority Order</p>
            <ul className="list-disc ml-4 space-y-1 text-xs">
              <li>Manual params in request (if provided)</li>
              <li>Saved config from database</li>
              <li>Default symmetric 10%/10%</li>
            </ul>
          </div>
          <div className="bg-dark-input p-4 rounded-lg border border-dark-border">
            <p className="font-semibold mb-2 text-gray-300">3. Strategy Tips</p>
            <ul className="list-disc ml-4 space-y-1 text-xs">
              <li><strong>Bullish:</strong> Small lower (1.5%), large upper (5%) - expect price to rise</li>
              <li><strong>Bearish:</strong> Large lower (5%), small upper (1.5%) - expect price to fall</li>
              <li><strong>Volatile:</strong> Both large (5%/5%) - give more room</li>
              <li><strong>Stable:</strong> Both small (1%/1%) - maximize fees in tight range</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
};
