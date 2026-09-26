import React, { useState, useEffect } from 'react';
import { CreditCard, TrendingUp, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { getTransactions } from '../../services/financeService.ts';
import { DataTable, type Column } from '../common/DataTable.tsx';
import type { TransactionLedger } from '../../types/index.ts';

export const IncomeWalletSummary: React.FC = () => {
  const { profile, wallet, refreshWallet } = useAuth();
  const [transactions, setTransactions] = useState<TransactionLedger[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const data = await getTransactions(profile.uid, 'income_wallet');
      setTransactions(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [profile?.uid]);

  const handleRefresh = async () => {
    await refreshWallet();
    await loadData();
  };

  const columns: Column<TransactionLedger>[] = [
    {
      key: 'createdAt',
      header: 'Date & Time',
      render: (item) => (
        <span className="text-xs text-slate-300 font-mono">
          {new Date(item.createdAt).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short'
          })}
        </span>
      )
    },
    {
      key: 'id',
      header: 'Ledger Ref',
      render: (item) => (
        <span className="font-mono text-cyan-400 text-xs font-semibold">
          {item.id}
        </span>
      )
    },
    {
      key: 'type',
      header: 'Category',
      render: (item) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          {item.type.replace('_', ' ')}
        </span>
      )
    },
    {
      key: 'description',
      header: 'Ledger Description',
      render: (item) => (
        <span className="text-xs text-slate-200">
          {item.description}
        </span>
      )
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (item) => {
        const isCredit = item.flow === 'credit';
        return (
          <span className={`font-mono text-xs font-bold ${isCredit ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isCredit ? '+' : '-'}₹{item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
        );
      }
    },
    {
      key: 'status',
      header: 'Ledger Status',
      render: (item) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          RECORDED
        </span>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl bg-[#091129]/90 border border-blue-500/30 shadow-xl backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
            Wallet Auditing
          </span>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight mt-0.5">
            Income Wallet Summary
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Complete transaction ledger for all credited commissions, withdrawals, and balance conversions.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#0e173a] border border-emerald-500/30 text-right">
          <span className="text-xs text-slate-400">Current Available Balance</span>
          <div className="text-xl sm:text-2xl font-extrabold text-emerald-400 font-mono tabular-nums">
            ₹{(wallet?.incomeWallet || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400">
            Income Wallet Ledger Entries
          </h3>
          <span className="text-xs text-slate-500">Immutable ledger trail</span>
        </div>

        <DataTable
          title="Income Wallet Summary"
          columns={columns}
          data={transactions}
          onRefresh={handleRefresh}
          isLoading={loading}
          emptyMessage="No Income Wallet entries found."
        />
      </div>
    </div>
  );
};
