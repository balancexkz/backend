import React from 'react';
import { ILPosition, ILStats } from '../types/interfaces';

interface ILAnalysisTabProps {
  ilPositions: ILPosition[];
  ilStats: ILStats | null;
}

export const ILAnalysisTab: React.FC<ILAnalysisTabProps> = ({
  ilPositions,
  ilStats,
}) => {
  return (
    <>
      {ilStats && (
        <div className="bg-dark-card p-6 rounded-lg shadow-lg shadow-black/10 mb-6 border border-accent-500/20">
          <h2 className="text-xl font-semibold mb-4 text-gray-200">Performance Overview</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="border border-dark-border p-4 rounded-lg bg-dark-input">
              <p className="text-xs text-gray-500 mb-1">Total Positions</p>
              <p className="text-3xl font-bold text-accent-400">{ilStats.totalClosed}</p>
            </div>

            <div className="border border-dark-border p-4 rounded-lg bg-dark-input">
              <p className="text-xs text-gray-500 mb-1">Average APR</p>
              <p className="text-3xl font-bold text-accent-300">
                {!isNaN(ilStats.avgAPR) && ilStats.avgAPR > 0 ? `${ilStats.avgAPR.toFixed(0)}%` : 'N/A'}
              </p>
            </div>

            <div className="border border-dark-border p-4 rounded-lg bg-dark-input">
              <p className="text-xs text-gray-500 mb-1">Total Fees</p>
              <p className="text-3xl font-bold text-yellow-400">
                ${ilStats.totalFees.toFixed(2)}
              </p>
            </div>

            <div className="border border-dark-border p-4 rounded-lg bg-dark-input">
              <p className="text-xs text-gray-500 mb-1">Average IL</p>
              <p className={`text-3xl font-bold ${ilStats.avgIL <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                ${ilStats.avgIL.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            {ilStats.bestPosition && (
              <div className="border border-emerald-500/20 p-3 rounded-lg bg-emerald-500/5">
                <p className="text-xs text-gray-500 mb-1">Best APR</p>
                <p className="text-sm font-mono text-gray-400">{ilStats.bestPosition.id.slice(0, 12)}...</p>
                <p className="text-xl font-bold text-emerald-400">
                  {ilStats.bestPosition.apr.toFixed(0)}% APR
                </p>
                <p className="text-sm text-emerald-500">${ilStats.bestPosition.fees.toFixed(2)} fees</p>
              </div>
            )}
            {ilStats.worstPosition && (
              <div className="border border-red-500/20 p-3 rounded-lg bg-red-500/5">
                <p className="text-xs text-gray-500 mb-1">Highest IL</p>
                <p className="text-sm font-mono text-gray-400">{ilStats.worstPosition.id.slice(0, 12)}...</p>
                <p className="text-xl font-bold text-red-400">
                  ${ilStats.worstPosition.il.toFixed(2)} IL
                </p>
                <p className="text-sm text-red-500">{ilStats.worstPosition.apr.toFixed(0)}% APR</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-dark-card p-6 rounded-lg shadow-lg shadow-black/10 mb-6 border border-dark-border">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-200">Closed Positions</h2>
          <span className="text-sm text-gray-500">{ilPositions.length} positions</span>
        </div>

        {ilPositions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No closed positions yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-dark-table-header border-b border-dark-border">
                <tr>
                  <th className="text-left p-3 font-semibold text-gray-400">Position ID</th>
                  <th className="text-left p-3 font-semibold text-gray-400">Duration</th>
                  <th className="text-right p-3 font-semibold text-yellow-400">Fees Earned</th>
                  <th className="text-right p-3 font-semibold text-accent-400">APR</th>
                  <th className="text-right p-3 font-semibold text-gray-400">IL</th>
                </tr>
              </thead>
              <tbody>
                {ilPositions.map((pos, index) => {
                  const aprValue = parseFloat(String(pos.apr)) || 0;

                  return (
                    <tr key={pos.id} className={`border-b border-dark-border hover:bg-dark-card-hover transition ${index % 2 === 0 ? 'bg-dark-input' : 'bg-dark-card'}`}>
                      <td className="p-3">
                        <span className="font-mono text-xs text-accent-400 font-semibold">
                          {pos.id.slice(0, 12)}...
                        </span>
                        <br />
                        <span className="text-xs text-gray-600">
                          {new Date(pos.closedAt).toLocaleDateString()} {new Date(pos.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>

                      <td className="p-3">
                        <span className="text-gray-300 font-medium">{pos.duration}</span>
                      </td>

                      <td className="p-3 text-right">
                        <span className="font-bold text-lg text-yellow-400">
                          ${pos.feesEarned.toFixed(2)}
                        </span>
                      </td>

                      <td className="p-3 text-right">
                        <div className="flex flex-col items-end">
                          <span className={`text-xl font-bold ${aprValue >= 100 ? 'text-accent-400' : aprValue >= 0 ? 'text-accent-300' : 'text-gray-500'}`}>
                            {!isNaN(aprValue) && aprValue > 0 ? `${aprValue.toFixed(0)}%` : 'N/A'}
                          </span>
                          {!isNaN(aprValue) && aprValue > 1000 && (
                            <span className="text-xs text-orange-400">high</span>
                          )}
                        </div>
                      </td>

                      <td className="p-3 text-right">
                        <span className={`font-bold text-lg ${pos.impermanentLoss <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          ${Math.abs(pos.impermanentLoss).toFixed(2)}
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
    </>
  );
};
