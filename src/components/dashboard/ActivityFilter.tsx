import React from 'react';
import { 
  Layers, 
  ArrowDownLeft, 
  ArrowUpRight, 
  ArrowLeftRight 
} from 'lucide-react';
import type { TransactionLedger } from '../../types/index.ts';

export type ActivityFilterType = 'all' | 'deposits' | 'withdrawals' | 'transfers';

export function isDepositTransaction(t: TransactionLedger): boolean {
  if (t.type === 'recharge') return true;
  const desc = t.description?.toLowerCase() || '';
  return desc.includes('deposit') || desc.includes('recharge');
}

export function isWithdrawalTransaction(t: TransactionLedger): boolean {
  if (t.type === 'withdrawal') return true;
  const desc = t.description?.toLowerCase() || '';
  return desc.includes('withdrawal') || desc.includes('payout');
}

export function isTransferTransaction(t: TransactionLedger): boolean {
  if (t.type === 'p2p_transfer' || t.type === 'income_to_fund') return true;
  const desc = t.description?.toLowerCase() || '';
  return desc.includes('transfer') || desc.includes('p2p') || desc.includes('convert');
}

export function filterTransactionsByType(
  transactions: TransactionLedger[],
  filterType: ActivityFilterType
): TransactionLedger[] {
  if (filterType === 'all') return transactions;
  if (filterType === 'deposits') return transactions.filter(isDepositTransaction);
  if (filterType === 'withdrawals') return transactions.filter(isWithdrawalTransaction);
  if (filterType === 'transfers') return transactions.filter(isTransferTransaction);
  return transactions;
}

interface ActivityFilterProps {
  activeFilter: ActivityFilterType;
  onFilterChange: (filter: ActivityFilterType) => void;
  transactions?: TransactionLedger[];
  className?: string;
}

export const ActivityFilter: React.FC<ActivityFilterProps> = ({
  activeFilter,
  onFilterChange,
  transactions = [],
  className = ''
}) => {
  // Compute counts for each filter option
  const counts = React.useMemo(() => {
    let deposits = 0;
    let withdrawals = 0;
    let transfers = 0;

    for (const t of transactions) {
      if (isDepositTransaction(t)) deposits++;
      if (isWithdrawalTransaction(t)) withdrawals++;
      if (isTransferTransaction(t)) transfers++;
    }

    return {
      all: transactions.length,
      deposits,
      withdrawals,
      transfers
    };
  }, [transactions]);

  const filterTabs: Array<{
    id: ActivityFilterType;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count: number;
    activeClass: string;
    badgeActiveClass: string;
    iconColor: string;
  }> = [
    {
      id: 'all',
      label: 'All',
      icon: Layers,
      count: counts.all,
      activeClass: 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg shadow-cyan-500/20 border-cyan-400/40',
      badgeActiveClass: 'bg-white/20 text-white',
      iconColor: 'text-cyan-400'
    },
    {
      id: 'deposits',
      label: 'Deposits',
      icon: ArrowDownLeft,
      count: counts.deposits,
      activeClass: 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/20 border-emerald-400/40',
      badgeActiveClass: 'bg-white/20 text-white',
      iconColor: 'text-emerald-400'
    },
    {
      id: 'withdrawals',
      label: 'Withdrawals',
      icon: ArrowUpRight,
      count: counts.withdrawals,
      activeClass: 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-lg shadow-rose-500/20 border-rose-400/40',
      badgeActiveClass: 'bg-white/20 text-white',
      iconColor: 'text-rose-400'
    },
    {
      id: 'transfers',
      label: 'Transfers',
      icon: ArrowLeftRight,
      count: counts.transfers,
      activeClass: 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-500/20 border-indigo-400/40',
      badgeActiveClass: 'bg-white/20 text-white',
      iconColor: 'text-indigo-400'
    }
  ];

  return (
    <div className={`p-2 sm:p-2.5 rounded-2xl bg-[#091129]/95 border border-blue-500/25 shadow-xl backdrop-blur-md ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Label & Description on Left */}
        <div className="flex items-center gap-2 px-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
            Transaction Filter:
          </span>
          <span className="text-xs font-medium text-cyan-300">
            {activeFilter === 'all' && 'All Activity'}
            {activeFilter === 'deposits' && 'Recharges & Deposits'}
            {activeFilter === 'withdrawals' && 'Payouts & Withdrawals'}
            {activeFilter === 'transfers' && 'P2P & Wallet Transfers'}
          </span>
        </div>

        {/* 4 Interactive Toggle Buttons: All, Deposits, Withdrawals, Transfers */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 p-1 rounded-xl bg-[#060b1c] border border-blue-500/20">
          {filterTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeFilter === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onFilterChange(tab.id)}
                className={`relative flex items-center justify-center sm:justify-start gap-2 px-3 py-1.5 sm:py-2 rounded-lg text-xs font-bold transition-all duration-200 border ${
                  isActive
                    ? tab.activeClass
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#0f1b3e]'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : tab.iconColor}`} />
                <span>{tab.label}</span>
                <span
                  className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums font-semibold transition-colors ${
                    isActive
                      ? tab.badgeActiveClass
                      : 'bg-[#132247] text-slate-400 group-hover:text-slate-200'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
