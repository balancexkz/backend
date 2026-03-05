import React from 'react';
import { MonitoringStats } from '../types/interfaces';

interface HeaderProps {
  monitoringStats: MonitoringStats | null;
  loading: boolean;
  onStartMonitoring: () => void;
  onStopMonitoring: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  monitoringStats,
  loading,
  onStartMonitoring,
  onStopMonitoring,
}) => {
  return (
    <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
      <h1 className="text-3xl font-bold bg-gradient-to-r from-accent-400 to-accent-200 bg-clip-text text-transparent">
        BalanceX
      </h1>

      {monitoringStats && (
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span className={`text-sm font-medium ${monitoringStats.isActive ? 'text-emerald-400' : 'text-red-400'}`}>
              {monitoringStats.isActive ? 'Monitoring Active' : 'Monitoring Inactive'}
            </span>
            {monitoringStats.lastCheck && (
              <span className="text-xs text-gray-500">
                Last: {new Date(monitoringStats.lastCheck).toLocaleTimeString()}
              </span>
            )}
          </div>
          <button
            onClick={monitoringStats.isActive ? onStopMonitoring : onStartMonitoring}
            disabled={loading}
            className={`px-6 py-3 rounded-lg font-medium text-white shadow-lg transition-all disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed ${
              monitoringStats.isActive
                ? 'bg-red-500/80 hover:bg-red-500'
                : 'bg-accent-500 hover:bg-accent-400 animate-pulse shadow-accent-500/20'
            }`}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Loading...
              </span>
            ) : monitoringStats.isActive ? (
              'Stop Monitoring'
            ) : (
              'Start Monitoring'
            )}
          </button>
        </div>
      )}
    </div>
  );
};
