import React from 'react';
import { ProfitStats, MonthlyProfitStats } from '../types/interfaces';

interface ProfitTabProps {
  profitStats: ProfitStats | null;
  selectedMonth: { year: number; month: number } | null;
  monthlyProfit: MonthlyProfitStats | null;
  onMonthSelect: (year: number, month: number) => void;
  onMonthClose: () => void;
}

export const ProfitTab: React.FC<ProfitTabProps> = ({
  profitStats,
  selectedMonth,
  monthlyProfit,
  onMonthSelect,
  onMonthClose,
}) => {
  return (
    <>
      <div className="bg-dark-card p-6 rounded-lg shadow-lg shadow-black/10 mb-6 border border-accent-500/20">
        <h2 className="text-2xl font-semibold mb-4 text-gray-200">
          All-Time Profit Analytics
        </h2>

        {profitStats ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <div className="border border-emerald-500/20 p-4 rounded-lg bg-emerald-500/5">
                <p className="text-xs text-gray-500 mb-1 font-medium">Total Net Profit</p>
                <p className={`text-3xl font-bold ${parseFloat(profitStats.totalNetProfit.replace('$', '')) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {profitStats.totalNetProfit}
                </p>
              </div>

              <div className="border border-accent-500/20 p-4 rounded-lg bg-accent-500/5">
                <p className="text-xs text-gray-500 mb-1 font-medium">Average Profit</p>
                <p className="text-2xl font-bold text-accent-400">{profitStats.avgProfit}</p>
                <p className="text-xs text-gray-500 mt-1">per operation</p>
              </div>

              <div className="border border-dark-border p-4 rounded-lg bg-dark-input">
                <p className="text-xs text-gray-500 mb-1 font-medium">Total Operations</p>
                <p className="text-2xl font-bold text-gray-300">{profitStats.operations}</p>
                <p className="text-xs text-gray-500 mt-1">completed</p>
              </div>

              <div className="border border-yellow-500/20 p-4 rounded-lg bg-yellow-500/5">
                <p className="text-xs text-gray-500 mb-1 font-medium">Success Rate</p>
                <p className="text-2xl font-bold text-yellow-400">{profitStats.successRate}</p>
                <p className="text-xs text-gray-500 mt-1">profitable</p>
              </div>

              <div className="border border-dark-border p-4 rounded-lg bg-dark-input">
                <p className="text-xs text-gray-500 mb-1 font-medium">Win / Loss</p>
                <div className="flex items-center justify-center gap-2">
                  <div className="text-center">
                    <p className="text-xl font-bold text-emerald-400">{profitStats.profitableOps}</p>
                    <p className="text-xs text-gray-500">wins</p>
                  </div>
                  <span className="text-gray-600">/</span>
                  <div className="text-center">
                    <p className="text-xl font-bold text-red-400">{profitStats.lossOps}</p>
                    <p className="text-xs text-gray-500">loss</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-dark-input p-6 rounded-lg border border-dark-border">
              <h3 className="text-xl font-semibold mb-4 text-gray-200">
                Monthly Breakdown
              </h3>

              {profitStats.monthlyBreakdown.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">No monthly data available</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-dark-table-header border-b border-dark-border">
                      <tr>
                        <th className="text-left p-3 font-semibold text-gray-400">Month</th>
                        <th className="text-right p-3 font-semibold text-emerald-400">Net Profit</th>
                        <th className="text-right p-3 font-semibold text-accent-400">Operations</th>
                        <th className="text-right p-3 font-semibold text-gray-400">Avg Profit</th>
                        <th className="text-center p-3 font-semibold text-gray-400">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profitStats.monthlyBreakdown.map((month, index) => {
                        const profit = parseFloat(month.profit.replace('$', ''));
                        return (
                          <tr key={`${month.year}-${month.month}`} className={`border-b border-dark-border hover:bg-dark-card-hover transition ${index % 2 === 0 ? 'bg-dark-input' : 'bg-dark-card'}`}>
                            <td className="p-3">
                              <div className="flex flex-col">
                                <span className="font-semibold text-gray-200">{month.monthName} {month.year}</span>
                                <span className="text-xs text-gray-500">{month.month}/{month.year}</span>
                              </div>
                            </td>
                            <td className="p-3 text-right">
                              <span className={`text-xl font-bold ${profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {profit >= 0 ? '+' : ''}{month.profit}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              <span className="text-lg font-semibold text-accent-400">{month.operations}</span>
                              <span className="text-xs text-gray-500 ml-1">ops</span>
                            </td>
                            <td className="p-3 text-right">
                              <span className="text-lg font-semibold text-gray-300">{month.avgProfit}</span>
                              <span className="text-xs text-gray-500 block">per op</span>
                            </td>
                            <td className="p-3 text-center">
                              <button
                                onClick={() => onMonthSelect(month.year, month.month)}
                                className="bg-accent-500 hover:bg-accent-400 text-white px-4 py-2 rounded-lg text-xs font-medium transition"
                              >
                                Details
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">Loading profit analytics...</p>
            <p className="text-gray-600 text-sm mt-2">No data available yet</p>
          </div>
        )}
      </div>

      {selectedMonth && monthlyProfit && (
        <div className="bg-dark-card p-6 rounded-lg shadow-lg shadow-black/10 mb-6 border border-accent-500/30 animate-fade-in">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-2xl font-semibold text-accent-300">
              {monthlyProfit.month}/{monthlyProfit.year} Detailed Stats
            </h3>
            <button
              onClick={onMonthClose}
              className="text-gray-500 hover:text-gray-300 text-2xl font-bold transition"
              title="Close"
            >
              ×
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            <div className="border border-emerald-500/20 p-4 rounded-lg bg-emerald-500/5">
              <p className="text-xs text-gray-500 mb-1 font-medium">Net Profit</p>
              <p className="text-3xl font-bold text-emerald-400">{monthlyProfit.totalNetProfit}</p>
            </div>
            <div className="border border-accent-500/20 p-4 rounded-lg bg-accent-500/5">
              <p className="text-xs text-gray-500 mb-1 font-medium">Average Profit</p>
              <p className="text-2xl font-bold text-accent-400">{monthlyProfit.avgProfit}</p>
              <p className="text-xs text-gray-500 mt-1">per operation</p>
            </div>
            <div className="border border-dark-border p-4 rounded-lg bg-dark-input">
              <p className="text-xs text-gray-500 mb-1 font-medium">Total Operations</p>
              <p className="text-2xl font-bold text-gray-300">{monthlyProfit.operations}</p>
            </div>
            <div className="border border-emerald-500/20 p-4 rounded-lg bg-emerald-500/10">
              <p className="text-xs text-gray-500 mb-1 font-medium">Profitable Ops</p>
              <p className="text-xl font-bold text-emerald-400">{monthlyProfit.profitableOps}</p>
              <p className="text-xs text-emerald-500 mt-1">Wins</p>
            </div>
            <div className="border border-red-500/20 p-4 rounded-lg bg-red-500/10">
              <p className="text-xs text-gray-500 mb-1 font-medium">Loss Operations</p>
              <p className="text-xl font-bold text-red-400">{monthlyProfit.lossOps}</p>
              <p className="text-xs text-red-500 mt-1">Losses</p>
            </div>
            <div className="border border-yellow-500/20 p-4 rounded-lg bg-yellow-500/5">
              <p className="text-xs text-gray-500 mb-1 font-medium">Success Rate</p>
              <p className="text-xl font-bold text-yellow-400">{monthlyProfit.successRate}</p>
              <p className="text-xs text-gray-500 mt-1">win rate</p>
            </div>
          </div>

          <div className="bg-accent-500/5 p-4 rounded-lg border border-accent-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-300 mb-1">Performance</p>
                <p className="text-xs text-gray-500">{monthlyProfit.profitableOps} profitable out of {monthlyProfit.operations} operations</p>
              </div>
              <div className="text-right">
                <p className={`text-lg font-bold ${
                  parseFloat(monthlyProfit.successRate.replace('%', '')) >= 80 ? 'text-emerald-400' :
                  parseFloat(monthlyProfit.successRate.replace('%', '')) >= 60 ? 'text-accent-400' :
                  parseFloat(monthlyProfit.successRate.replace('%', '')) >= 40 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {parseFloat(monthlyProfit.successRate.replace('%', '')) >= 80 ? 'Excellent' :
                   parseFloat(monthlyProfit.successRate.replace('%', '')) >= 60 ? 'Good' :
                   parseFloat(monthlyProfit.successRate.replace('%', '')) >= 40 ? 'Fair' : 'Poor'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-dark-card border border-dark-border p-6 rounded-lg shadow-lg shadow-black/10">
        <h3 className="text-lg font-semibold text-gray-300 mb-3">
          Understanding Profit Analytics
        </h3>
        <div className="space-y-3 text-sm text-gray-400">
          <div className="bg-dark-input p-3 rounded-lg border border-dark-border">
            <p className="font-semibold mb-1 text-gray-300">Total Net Profit</p>
            <p className="text-xs">Sum of all profitable and loss operations. Shows your overall earnings from the bot.</p>
          </div>
          <div className="bg-dark-input p-3 rounded-lg border border-dark-border">
            <p className="font-semibold mb-1 text-gray-300">Average Profit</p>
            <p className="text-xs">Average profit per operation. Higher is better - indicates efficient trading strategy.</p>
          </div>
          <div className="bg-dark-input p-3 rounded-lg border border-dark-border">
            <p className="font-semibold mb-1 text-gray-300">Success Rate</p>
            <p className="text-xs">Percentage of profitable operations. Above 70% is excellent, 50-70% is good.</p>
          </div>
          <div className="bg-dark-input p-3 rounded-lg border border-dark-border">
            <p className="font-semibold mb-1 text-gray-300">Monthly Breakdown</p>
            <p className="text-xs">Compare performance across different months. Identify best strategies and market conditions.</p>
          </div>
        </div>
      </div>
    </>
  );
};
