import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  Calendar, 
  DollarSign, 
  Sparkles, 
  Award, 
  Layers, 
  RefreshCw 
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { getTransactions } from '../../services/financeService.ts';
import { DataTable, type Column } from '../common/DataTable.tsx';
import type { TransactionLedger, ActivePage, TransactionType } from '../../types/index.ts';

interface IncomeConfig {
  title: string;
  badge: string;
  description: string;
  txnType: TransactionType;
  getTodayAmount: (w: any) => number;
  getTotalAmount: (w: any) => number;
}

const incomeConfigs: Partial<Record<ActivePage, IncomeConfig>> = {
  'basic-roi': {
    title: 'Basic ROI Income',
    badge: 'DAILY ROI',
    description: 'Daily percentage return on active Basic Packages.',
    txnType: 'basic_roi',
    getTodayAmount: (w) => w?.todayRoiIncome || 0,
    getTotalAmount: (w) => w?.totalRoiIncome || 0
  },
  'basic-referral': {
    title: 'Basic Referral Income',
    badge: 'DIRECT BONUS',
    description: 'Instant 5% sponsor bonus earned when direct downline activates Basic Packages.',
    txnType: 'basic_referral',
    getTodayAmount: (w) => 0,
    getTotalAmount: (w) => w?.referralIncome || 0
  },
  'basic-level': {
    title: 'Basic Level Income',
    badge: 'LEVEL BONUS',
    description: 'Generational team level commissions earned across downline tiers.',
    txnType: 'basic_level',
    getTodayAmount: (w) => w?.todayLevelIncome || 0,
    getTotalAmount: (w) => w?.totalLevelIncome || 0
  },
  'fd-roi': {
    title: 'FD ROI Income',
    badge: 'FD DAILY RETURN',
    description: 'Daily returns accumulated on active Fixed Deposit contracts.',
    txnType: 'fd_roi',
    getTodayAmount: (w) => w?.fdTodayRoiIncome || 0,
    getTotalAmount: (w) => w?.fdTotalRoiIncome || 0
  },
  'fd-referral': {
    title: 'FD Referral Income',
    badge: 'FD DIRECT BONUS',
    description: 'Direct referral commissions earned from Fixed Deposit package activations.',
    txnType: 'fd_referral',
    getTodayAmount: (w) => 0,
    getTotalAmount: (w) => w?.fdReferralIncome || 0
  },
  'fd-level': {
    title: 'FD Level Income',
    badge: 'FD LEVEL BONUS',
    description: 'Multi-level generational commissions generated through downline FD investments.',
    txnType: 'fd_level',
    getTodayAmount: (w) => w?.fdTodayLevelIncome || 0,
    getTotalAmount: (w) => w?.fdTotalLevelIncome || 0
  },
  'rd-level': {
    title: 'RD Level Income',
    badge: 'RD BONUS',
    description: 'Recurring deposit downline generation income payouts.',
    txnType: 'rd_level',
    getTodayAmount: (w) => 0,
    getTotalAmount: (w) => 0
  },
  'salary-income': {
    title: 'Salary Income',
    badge: 'EXECUTIVE SALARY',
    description: 'Monthly leadership salary income for achieving team milestone targets.',
    txnType: 'salary',
    getTodayAmount: (w) => 0,
    getTotalAmount: (w) => w?.totalSalary || 0
  }
};

export const IncomeView: React.FC<{ page: ActivePage }> = ({ page }) => {
  const { profile, wallet, refreshWallet } = useAuth();
  const [records, setRecords] = useState<TransactionLedger[]>([]);
  const [loading, setLoading] = useState(false);

  const config = incomeConfigs[page] || incomeConfigs['basic-roi']!;

  const loadIncomeRecords = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const allTxns = await getTransactions(profile.uid, 'income_wallet', config.txnType);
      setRecords(allTxns);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIncomeRecords();
  }, [profile?.uid, page]);

  const handleRefresh = async () => {
    await refreshWallet();
    await loadIncomeRecords();
  };

  const columns: Column<TransactionLedger>[] = [
    {
      key: 'createdAt',
      header: 'Payout Date & Time',
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
      key: 'description',
      header: 'Commission Description',
      render: (item) => (
        <span className="text-xs text-slate-200">
          {item.description}
        </span>
      )
    },
    {
      key: 'amount',
      header: 'Amount Credited',
      render: (item) => (
        <span className="font-mono text-xs font-bold text-emerald-400">
          +₹{item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </span>
      )
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          CREDITED
        </span>
      )
    }
  ];

  const todayAmount = config.getTodayAmount(wallet);
  const totalAmount = config.getTotalAmount(wallet);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl bg-[#091129]/90 border border-blue-500/30 shadow-xl backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400 font-mono">
            {config.badge}
          </span>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight mt-0.5">
            {config.title}
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            {config.description}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="p-4 rounded-xl bg-[#0e173a] border border-blue-500/30 text-right">
            <span className="text-xs text-slate-400">Today Payout</span>
            <div className="text-xl sm:text-2xl font-extrabold text-cyan-300 font-mono tabular-nums">
              ₹{todayAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[#0e173a] border border-emerald-500/30 text-right">
            <span className="text-xs text-slate-400">Total Accumulated</span>
            <div className="text-xl sm:text-2xl font-extrabold text-emerald-400 font-mono tabular-nums">
              ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      {/* Income Records DataTable */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400">
            {config.title} Ledger History
          </h3>
          <span className="text-xs text-slate-500">Credited to Available Balance</span>
        </div>

        <DataTable
          title={config.title}
          columns={columns}
          data={records}
          onRefresh={handleRefresh}
          isLoading={loading}
          emptyMessage={`No ${config.title} entries recorded yet.`}
        />
      </div>
    </div>
  );
};
