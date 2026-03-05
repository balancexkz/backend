import React from 'react';
import { PositionWithPool, Pool, BalanceResponse } from '../types/interfaces';

interface PositionsTabProps {
  positionsData: PositionWithPool[];
  pools: Pool[];
  selectedPool: string;
  baseMint: string;
  quoteMint: string;
  inputAmount: number;
  priceRangePercent: number;
  usdValue: number;
  balances: BalanceResponse;
  loading: boolean;
  onPoolChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onInputAmountChange: (value: number) => void;
  onPriceRangeChange: (value: number) => void;
  onSetupLiquidity: () => void;
  onRemoveLiquidity: (positionId: string) => void;
}

export const PositionsTab: React.FC<PositionsTabProps> = ({
  positionsData,
  pools,
  selectedPool,
  baseMint,
  quoteMint,
  inputAmount,
  priceRangePercent,
  usdValue,
  balances,
  loading,
  onPoolChange,
  onInputAmountChange,
  onPriceRangeChange,
  onSetupLiquidity,
  onRemoveLiquidity,
}) => {
  return (
    <>
      <div className="bg-dark-card p-6 rounded-lg shadow-lg shadow-black/10 mb-6 border border-dark-border">
        <h2 className="text-xl font-semibold mb-4 text-gray-200">Setup Liquidity Position</h2>
        <div className="grid grid-cols-1 gap-4">
          <select value={selectedPool} onChange={onPoolChange} className="bg-dark-input border border-dark-border text-gray-200 p-3 rounded-lg w-full focus:outline-none focus:border-accent-500 transition-colors">
            <option value="">Select a trading pair</option>
            {pools.map((pool) => (
              <option key={pool.poolId} value={pool.poolId}>
                {pool.baseMint}/{pool.quoteMint}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-4">
            <input
              type="text"
              value={baseMint}
              readOnly
              placeholder="Base Mint"
              className="bg-dark-input border border-dark-border text-gray-400 p-3 rounded-lg w-full"
            />
            <input
              type="text"
              value={quoteMint}
              readOnly
              placeholder="Quote Mint"
              className="bg-dark-input border border-dark-border text-gray-400 p-3 rounded-lg w-full"
            />
          </div>
          <div className="relative">
            <input
              type="number"
              value={inputAmount}
              onChange={(e) => onInputAmountChange(Number(e.target.value))}
              placeholder="Amount"
              className="bg-dark-input border border-dark-border text-gray-200 p-3 rounded-lg w-full pr-32 focus:outline-none focus:border-accent-500 transition-colors"
              step="0.000001"
            />
            {usdValue > 0 && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-gray-500">
                ≈ ${usdValue.toFixed(2)}
              </div>
            )}
          </div>
          <select
            value={priceRangePercent}
            onChange={(e) => onPriceRangeChange(Number(e.target.value))}
            className="bg-dark-input border border-dark-border text-gray-200 p-3 rounded-lg w-full focus:outline-none focus:border-accent-500 transition-colors"
          >
            <option value={1}>1%</option>
            <option value={5}>5%</option>
            <option value={10}>10%</option>
            <option value={20}>20%</option>
          </select>
          <button
            onClick={onSetupLiquidity}
            disabled={loading}
            className="bg-accent-500 text-white p-3 rounded-lg font-semibold hover:bg-accent-400 disabled:bg-gray-700 disabled:text-gray-500 transition-colors"
          >
            {loading ? 'Loading...' : 'Setup Liquidity'}
          </button>
        </div>
      </div>

      <div className="bg-dark-card p-6 rounded-lg shadow-lg shadow-black/10 mb-6 border border-dark-border">
        <h2 className="text-xl font-semibold mb-4 text-gray-200">Wallet Balances</h2>
        {Object.keys(balances).length > 0 ? (
          <div className="grid grid-cols-2 gap-4">
            {Object.entries(balances).map(([token, data]) => (
              <div key={token} className="border border-dark-border p-4 rounded-lg bg-dark-input">
                <p className="text-gray-200">
                  <strong>{token}:</strong> {data.amount.toFixed(token === 'SOL' || token === 'WSOL' ? 4 : 2)}
                </p>
                <p className="text-gray-500 text-sm">${data.valueInUSD.toFixed(2)} USD</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">Select a pool to see balances</p>
        )}
      </div>

      <div className="bg-dark-card p-6 rounded-lg shadow-lg shadow-black/10 mb-6 border border-dark-border">
        <h2 className="text-xl font-semibold mb-4 text-gray-200">Active Positions</h2>
        {positionsData.length === 0 ? (
          <p className="text-gray-500">No active positions</p>
        ) : (
          <ul className="space-y-4">
            {positionsData.map(({ position, pool, hasInitialValue }) => (
              <li key={position.positionId} className="border border-dark-border p-4 rounded-lg bg-dark-input hover:bg-dark-card-hover transition">
                <div className="flex justify-between items-start mb-2">
                  <p className="text-sm text-gray-400">
                    <strong className="text-gray-300">Pool:</strong> {pool.baseMint}/{pool.quoteMint}
                  </p>
                  {!hasInitialValue && (
                    <span className="bg-yellow-500/10 text-yellow-400 text-xs px-2 py-1 rounded border border-yellow-500/20">
                      External
                    </span>
                  )}
                </div>
                <p className="text-gray-400 text-sm mb-1">
                  <strong className="text-gray-300">ID:</strong> {position.positionId.substring(0, 20)}...
                </p>
                <div className="grid grid-cols-2 gap-4 mb-2">
                  <p className="text-gray-300">
                    <strong>{pool.baseMint}:</strong> {Number(position.baseAmount).toFixed(6)}
                  </p>
                  <p className="text-gray-300">
                    <strong>{pool.quoteMint}:</strong> {Number(position.quoteAmount).toFixed(6)}
                  </p>
                </div>
                <p className="text-gray-300">
                  <strong>Range:</strong> [{position.priceRange.lower.toFixed(2)}, {position.priceRange.upper.toFixed(2)}]
                </p>
                <p className="text-gray-300">
                  <strong>Current:</strong> ${pool.currentPrice.toFixed(2)}
                </p>
                <p className="text-gray-300">
                  <strong>Status:</strong>{' '}
                  <span className={pool.currentPrice >= position.priceRange.lower && pool.currentPrice <= position.priceRange.upper ? 'text-emerald-400' : 'text-red-400'}>
                    {pool.currentPrice >= position.priceRange.lower && pool.currentPrice <= position.priceRange.upper ? 'In Range' : 'Out of Range'}
                  </span>
                </p>
                {position.actionHistory.length > 0 && (
                  <div className="mt-2">
                    <p className="text-gray-400 text-sm"><strong className="text-gray-300">Fees:</strong></p>
                    <ul className="list-disc pl-5">
                      {position.actionHistory.map((action, index) => (
                        <li key={index} className="text-xs text-gray-500">{action}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="mt-3">
                  <button
                    onClick={() => onRemoveLiquidity(position.positionId)}
                    disabled={loading}
                    className="bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1 text-sm rounded-lg hover:bg-red-500/30 disabled:opacity-40 transition-colors"
                  >
                    Remove Liquidity
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
};
