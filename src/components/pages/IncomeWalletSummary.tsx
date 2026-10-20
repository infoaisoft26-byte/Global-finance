import React, { useState, useEffect } from 'react';
import { CreditCard, TrendingUp, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { getTransactions } from '../../services/financeService.ts';
import { DataTable, type Column } from '../common/DataTable.tsx';
import type { TransactionLedger } from '../../types/index.ts';
import { auth } from '../../lib/firebase.ts';

const displayUsdtText = (value: unknown) => String(value ?? '').replace(/₹/g, 'USDT ').replace(/\bINR\b/gi, 'USDT');

export const IncomeWalletSummary: React.FC = () => {
  const { profile, wallet, refreshWallet } = useAuth();
  const [transactions, setTransactions] = useState<TransactionLedger[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Authentication required');
      const token = await currentUser.getIdToken();
      const response = await fetch('/api/member-income-history', {
        method: 'GET',
        credentials: 'include',
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(payload.transactions)) {
        throw new Error(payload.error || 'Unable to load income history');
      }
      setTransactions(payload.transactions as TransactionLedger[]);
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
      header: 'Income Type',
      render: (item) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          {String(item.type) === 'joining_bonus' ? 'Registration Bonus' : String(item.type || 'other income').replace(/_/g, ' ')}
        </span>
      )
    },
    {
      key: 'description',
      header: 'Ledger Description',
      render: (item) => (
        <span className="text-xs text-slate-200">
          {displayUsdtText(item.description)}
        </span>
      )
    },
    {
      key: 'amount',
      header: 'Amount (USDT)',
      render: (item) => {
        const isCredit = item.flow === 'credit';
        return (
          <span className={`font-mono text-xs font-bold ${isCredit ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isCredit ? '+' : '-'}USDT {item.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
          </span>
        );
      }
    },
    {
      key: 'status',
      header: 'Ledger Status',
      render: (item) => {
        const status = String(item.status || 'unknown').toUpperCase();
        const complete = ['COMPLETED', 'APPROVED', 'CREDITED'].includes(status);
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${complete ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-300 border-amber-500/20'}`}>
            {status}
          </span>
        );
      }
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
            Income History
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            All actual Income Wallet ledger entries: registration bonus, ROI, referral, level, salary, transfers and other recorded credits/debits.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#0e173a] border border-emerald-500/30 text-right">
          <span className="text-xs text-slate-400">Current Available Balance</span>
          <div className="text-xl sm:text-2xl font-extrabold text-emerald-400 font-mono tabular-nums">
            USDT {(wallet?.incomeWallet || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400">
            Complete Income History
          </h3>
          <span className="text-xs text-slate-500">Immutable ledger trail</span>
        </div>

        <DataTable
          title="Income Wallet Summary"
          columns={columns}
          data={transactions}
          onRefresh={handleRefresh}
          isLoading={loading}
          emptyMessage="No actual Income Wallet ledger entries have been recorded yet."
        />
      </div>
    </div>
  );
};
