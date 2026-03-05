import React from 'react';
import { MonitoringStats } from '../types/interfaces';

interface MonitoringTabProps {
  monitoringStats: MonitoringStats | null;
  loading: boolean;
  onStartMonitoring: () => void;
  onStopMonitoring: () => void;
  onCheckNow: () => void;
  formatUptime: (ms: number) => string;
}

export const MonitoringTab: React.FC<MonitoringTabProps> = ({
  monitoringStats,
  loading,
  onStartMonitoring,
  onStopMonitoring,
  onCheckNow,
  formatUptime,
}) => {
  return (
    <>
      {monitoringStats && (
        <div className="bg-dark-card p-6 rounded-lg shadow-lg shadow-black/10 mb-6 border border-dark-border">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-200">Monitoring Dashboard</h2>
            <span className={`px-3 py-1 rounded-lg text-sm font-medium ${
              monitoringStats.isActive
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              {monitoringStats.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="border border-dark-border p-3 rounded-lg bg-accent-500/5">
              <p className="text-xs text-gray-500">Active Positions</p>
              <p className="text-2xl font-bold text-accent-400">{monitoringStats.activePositions}</p>
            </div>
            <div className="border border-dark-border p-3 rounded-lg bg-emerald-500/5">
              <p className="text-xs text-gray-500">Checked</p>
              <p className="text-2xl font-bold text-emerald-400">{monitoringStats.positionsChecked}</p>
            </div>
            <div className="border border-dark-border p-3 rounded-lg bg-accent-500/5">
              <p className="text-xs text-gray-500">Closed</p>
              <p className="text-2xl font-bold text-accent-300">{monitoringStats.positionsClosed}</p>
            </div>
            <div className="border border-dark-border p-3 rounded-lg bg-yellow-500/5">
              <p className="text-xs text-gray-500">Reopened</p>
              <p className="text-2xl font-bold text-yellow-400">{monitoringStats.positionsReopened}</p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="border border-dark-border p-3 rounded-lg bg-dark-input">
              <p className="text-xs text-gray-500">Swaps</p>
              <p className="text-lg font-bold text-gray-300">{monitoringStats.swapsExecuted}</p>
            </div>
            <div className="border border-dark-border p-3 rounded-lg bg-dark-input">
              <p className="text-xs text-gray-500">Liquidity Added</p>
              <p className="text-lg font-bold text-gray-300">{monitoringStats.liquidityAdded}</p>
            </div>
            <div className="border border-dark-border p-3 rounded-lg bg-orange-500/5">
              <p className="text-xs text-gray-500">Retries</p>
              <p className="text-lg font-bold text-orange-400">{monitoringStats.liquidityRetries}</p>
            </div>
            <div className="border border-dark-border p-3 rounded-lg bg-red-500/5">
              <p className="text-xs text-gray-500">Errors</p>
              <p className="text-lg font-bold text-red-400">{monitoringStats.errors}</p>
            </div>
          </div>

          <div className="border border-dark-border p-3 rounded-lg bg-accent-500/5 mb-4">
            <p className="text-xs text-gray-500">Uptime</p>
            <p className="text-xl font-bold text-accent-400">
              {monitoringStats.uptime ? formatUptime(monitoringStats.uptime) : 'N/A'}
            </p>
          </div>

          {monitoringStats.lastCheck && (
            <p className="text-xs text-gray-500 mb-4">
              Last check: {new Date(monitoringStats.lastCheck).toLocaleString()}
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={monitoringStats.isActive ? onStopMonitoring : onStartMonitoring}
              disabled={loading}
              className={`flex-1 p-3 rounded-lg text-white font-medium disabled:bg-gray-700 disabled:text-gray-500 transition-all ${
                monitoringStats.isActive
                  ? 'bg-red-500/80 hover:bg-red-500'
                  : 'bg-emerald-600 hover:bg-emerald-500'
              }`}
            >
              {loading ? 'Loading...' : (monitoringStats.isActive ? 'Stop Monitoring' : 'Start Monitoring')}
            </button>
            <button
              onClick={onCheckNow}
              disabled={loading}
              className="flex-1 bg-accent-500 text-white p-3 rounded-lg font-medium hover:bg-accent-400 disabled:bg-gray-700 disabled:text-gray-500 transition-all"
            >
              {loading ? 'Checking...' : 'Check Now'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
