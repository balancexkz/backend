import React from 'react';
import { Transaction, TransactionHistoryStats } from '../types/interfaces';

interface HistoryTabProps {
  transactions: Transaction[];
  historyStats: TransactionHistoryStats | null;
  expandedSwapGroups: Set<string>;
  onToggleSwapGroup: (groupId: string) => void;
}

export const HistoryTab: React.FC<HistoryTabProps> = ({
  transactions,
  historyStats,
  expandedSwapGroups,
  onToggleSwapGroup,
}) => {
  return (
    <>
      {historyStats && (
        <div className="bg-dark-card p-6 rounded-lg shadow-lg shadow-black/10 mb-6 border border-dark-border">
          <h2 className="text-xl font-semibold mb-4 text-gray-200">Statistics</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="border border-dark-border p-3 rounded-lg bg-accent-500/5">
              <p className="text-xs text-gray-500">Total</p>
              <p className="text-2xl font-bold text-accent-400">{historyStats.totalTransactions}</p>
            </div>
            <div className="border border-dark-border p-3 rounded-lg bg-emerald-500/5">
              <p className="text-xs text-gray-500">Opened</p>
              <p className="text-2xl font-bold text-emerald-400">{historyStats.openPositions}</p>
            </div>
            <div className="border border-dark-border p-3 rounded-lg bg-red-500/5">
              <p className="text-xs text-gray-500">Closed</p>
              <p className="text-2xl font-bold text-red-400">{historyStats.closePositions}</p>
            </div>
            <div className="border border-dark-border p-3 rounded-lg bg-accent-500/5">
              <p className="text-xs text-gray-500">Profit</p>
              <p className={`text-2xl font-bold ${parseFloat(historyStats.totalProfit || '0') >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                ${parseFloat(historyStats.totalProfit || '0').toFixed(2)}
              </p>
            </div>
            <div className="border border-dark-border p-3 rounded-lg bg-yellow-500/5">
              <p className="text-xs text-gray-500">Volume</p>
              <p className="text-2xl font-bold text-yellow-400">${parseFloat(historyStats.totalVolume || '0').toFixed(2)}</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-dark-card p-6 rounded-lg shadow-lg shadow-black/10 mb-6 border border-dark-border">
        <h2 className="text-xl font-semibold mb-4 text-gray-200">Transaction History</h2>
        {transactions.length === 0 ? (
          <p className="text-gray-500">No transactions yet</p>
        ) : (
          <ul className="space-y-4">
            {transactions.map((tx) => {
              if (tx.type === 'SWAP_GROUP') {
                const isExpanded = expandedSwapGroups.has(tx.id);
                return (
                  <li key={tx.id} className="border border-accent-500/20 rounded-lg bg-accent-500/5 hover:bg-accent-500/10 transition">
                    <div
                      className="p-4 cursor-pointer"
                      onClick={() => onToggleSwapGroup(tx.id)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-1 rounded text-xs font-medium bg-accent-500/20 text-accent-300 border border-accent-500/30">
                              Position Swaps ({tx.swapCount})
                            </span>
                            <span className="text-xs text-gray-500">
                              {new Date(tx.date).toLocaleString()}
                            </span>
                            <button className="text-accent-400 hover:text-accent-300 text-sm font-medium">
                              {isExpanded ? 'Hide' : 'Show Details'}
                            </button>
                          </div>
                          <p className="text-xs text-gray-500 font-mono">
                            Position: {tx.positionId.slice(0, 16)}...
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`text-lg font-bold ${(tx.totalProfitUSD || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {(tx.totalProfitUSD || 0) >= 0 ? '+' : ''}${Number(tx.totalProfitUSD || 0).toFixed(2)}
                          </p>
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-xs text-gray-500 mt-2">
                        <span>SOL: <strong className="text-gray-400">${Number(tx.solPrice || 0).toFixed(2)}</strong></span>
                        <span>Wallet: <strong className="text-gray-400">${Number(tx.walletBalanceUSD || 0).toFixed(2)}</strong></span>
                      </div>
                    </div>

                    {isExpanded && tx.swaps && (
                      <div className="border-t border-accent-500/20 p-4 bg-dark-card">
                        <h4 className="font-semibold text-sm text-accent-300 mb-3">
                          Individual Swaps ({tx.swaps.length}):
                        </h4>
                        <div className="space-y-3">
                          {tx.swaps.map((swap) => (
                            <div key={swap.id} className="border border-dark-border rounded-lg p-3 bg-dark-input">
                              <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-accent-400">#{swap.index}</span>
                                  <span className="text-xs text-gray-500">{new Date(swap.date).toLocaleTimeString()}</span>
                                </div>
                                <span className={`text-sm font-bold ${swap.profitUSD >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {swap.profitUSD >= 0 ? '+' : ''}${Number(swap.profitUSD).toFixed(2)}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 text-sm">
                                <div className="flex-1 text-right">
                                  <p className="font-semibold text-gray-300">{Number(swap.inputAmount).toFixed(4)} {swap.inputToken}</p>
                                  <p className="text-xs text-gray-500">${Number(swap.inputValueUSD).toFixed(2)}</p>
                                </div>
                                <div className="text-accent-400 font-bold">→</div>
                                <div className="flex-1">
                                  <p className="font-semibold text-gray-300">{Number(swap.outputAmount).toFixed(4)} {swap.outputToken}</p>
                                  <p className="text-xs text-gray-500">${Number(swap.outputValueUSD).toFixed(2)}</p>
                                </div>
                              </div>

                              <p className="text-xs text-gray-600 font-mono mt-2">
                                {swap.txHash.slice(0, 16)}...
                                <a
                                  href={`https://solscan.io/tx/${swap.txHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ml-2 text-accent-400 hover:text-accent-300"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  View
                                </a>
                              </p>
                            </div>
                          ))}
                        </div>

                        <div className="mt-4 p-3 bg-accent-500/10 rounded-lg border border-accent-500/20">
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-accent-300">Total:</span>
                            <span className={`text-xl font-bold ${(tx.totalProfitUSD || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {(tx.totalProfitUSD || 0) >= 0 ? '+' : ''}${Number(tx.totalProfitUSD || 0).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </li>
                );
              }

              return (
                <li key={tx.id} className="border border-dark-border p-4 rounded-lg bg-dark-input hover:bg-dark-card-hover transition">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          tx.type === 'Add Liquidity' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}>
                          {tx.type}
                        </span>
                        <span className="text-xs text-gray-500">{new Date(tx.date).toLocaleString()}</span>
                      </div>
                      {tx.txHash && (
                        <p className="text-xs text-gray-600 font-mono break-all">
                          {tx.txHash.slice(0, 16)}...
                          <a
                            href={`https://solscan.io/tx/${tx.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 text-accent-400 hover:text-accent-300"
                          >
                            View
                          </a>
                        </p>
                      )}
                    </div>
                    {tx.profit && (
                      <div className="text-right">
                        <p className={`text-sm font-bold ${tx.profit.usd >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {tx.profit.usd >= 0 ? '+' : ''}${tx.profit.usd.toFixed(2)}
                        </p>
                      </div>
                    )}
                  </div>

                  {tx.baseToken && tx.quoteToken && (
                    <>
                      <div className="grid grid-cols-2 gap-4 text-sm mb-2">
                        <div className="border-l-2 border-accent-500 pl-2">
                          <p className="text-gray-300"><strong>{tx.baseToken.symbol}:</strong> {Number(tx.baseToken.amount).toFixed(4)}</p>
                          <p className="text-gray-500 text-xs">${Number(tx.baseToken.valueUSD).toFixed(2)}</p>
                        </div>
                        <div className="border-l-2 border-emerald-500 pl-2">
                          <p className="text-gray-300"><strong>{tx.quoteToken.symbol}:</strong> {Number(tx.quoteToken.amount).toFixed(4)}</p>
                          <p className="text-gray-500 text-xs">${Number(tx.quoteToken.valueUSD).toFixed(2)}</p>
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t border-dark-border text-xs text-gray-500">
                        <span>SOL: <strong className="text-gray-400">${Number(tx.solPrice || 0).toFixed(2)}</strong></span>
                        <span>Position: <strong className="text-gray-400">${Number(tx.positionBalanceUSD || 0).toFixed(2)}</strong></span>
                        <span>Wallet: <strong className="text-gray-400">${Number(tx.walletBalanceUSD || 0).toFixed(2)}</strong></span>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
};
