import React from 'react';
import { ActiveTab, MonitoringStats } from '../types/interfaces';

interface NavigationProps {
  activeTab: ActiveTab;
  monitoringStats: MonitoringStats | null;
  onTabChange: (tab: ActiveTab) => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  monitoringStats,
  onTabChange,
}) => {
  const tabs = [
    { id: 'positions' as ActiveTab, label: 'Positions' },
    { id: 'history' as ActiveTab, label: 'History' },
    { id: 'il-analysis' as ActiveTab, label: 'IL Analysis' },
    { id: 'profit' as ActiveTab, label: 'Profit' },
    { id: 'snapshot' as ActiveTab, label: 'Snapshot' },
    { id: 'volatility' as ActiveTab, label: 'Volatility' },
    { id: 'settings' as ActiveTab, label: 'Settings' },
    { id: 'monitoring' as ActiveTab, label: 'Monitoring' },
  ];

  return (
    <div className="bg-dark-card rounded-lg mb-6 border border-dark-border">
      <div className="flex border-b border-dark-border overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 py-3 px-4 text-center text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-b-2 border-accent-500 text-accent-400 bg-accent-500/5'
                : 'text-gray-500 hover:text-gray-300 hover:bg-dark-card-hover'
            }`}
          >
            {tab.label}
            {tab.id === 'monitoring' && monitoringStats?.isActive && (
              <span className="ml-2 inline-block w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};
