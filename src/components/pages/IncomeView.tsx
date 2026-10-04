import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  DollarSign, 
  Award, 
  Layers, 
  RefreshCw,
  Scale,
  Wallet,
  Percent
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
    description: 'Recorded income credited against active Basic Packages.',
    txnType: 'basic_roi' as TransactionType,
    getTodayAmount: (w) => w?.todayRoiIncome || 0,
    getTotalAmount: (w) => w?.totalRoiIncome || 0
  },
  'basic-referral': {
    title: 'Basic Referral Income',
    badge: 'DIRECT BONUS',
    description: 'Recorded sponsor/referral rewards from valid referral activity.',
    txnType: 'basic_referral' as TransactionType,
    getTodayAmount: (w) => 0,
    getTotalAmount: (w) => w?.referralIncome || 0
  },
  'basic-level': {
    title: 'Basic Level Income',
    badge: 'LEVEL BONUS',
    description: 'Recorded team level income across eligible downline activity.',
    txnType: 'basic_level' as TransactionType,
    getTodayAmount: (w) => w?.todayLevelIncome || 0,
    getTotalAmount: (w) => w?.totalLevelIncome || 0
  },
  'fd-roi': {
    title: 'FD ROI Income',
    badge: 'FD RECORDED RETURN',
    description: 'Recorded income entries associated with active FD packages.',
    txnType: 'fd_roi' as TransactionType,
    getTodayAmount: (w) => w?.fdTodayRoiIncome || 0,
    getTotalAmount: (w) => w?.fdTotalRoiIncome || 0
  },
  'fd-referral': {
    title: 'FD Referral Income',
    badge: 'FD DIRECT BONUS',
    description: 'Recorded referral income associated with eligible FD activity.',
    txnType: 'fd_referral' as TransactionType,
    getTodayAmount: (w) => 0,
    getTotalAmount: (w) => w?.fdReferralIncome || 0
  },
  'fd-level': {
    title: 'FD Level Income',
    badge: 'FD LEVEL BONUS',
    description: 'Recorded multi-level income associated with downline FD activity.',
    txnType: 'fd_level' as TransactionType,
    getTodayAmount: (w) => w?.fdTodayLevelIncome || 0,
    getTotalAmount: (w) => w?.fdTotalLevelIncome || 0
  },
  'rd-level': {
    title: 'RD Level Income',
    badge: 'RD BONUS',
    description: 'Recorded recurring-deposit downline income entries.',
    txnType: 'rd_level' as TransactionType,
    getTodayAmount: (w) => 0,
    getTotalAmount: (w) => 0
  },
  'salary-income': {
    title: 'Salary Income',
    badge: 'SALARY',
    description: 'Recorded salary income entries credited by the platform.',
    txnType: 'salary' as TransactionType,
    getTodayAmount: (w) => 0,
    getTotalAmount: (w) => w?.totalSalary || 0
  }
};

export const IncomeView: React.FC<{ page: ActivePage }> = ({ page }) => {
  const { profile, wallet, refreshWallet } = useAuth();
  const [records, setRecords] = useState<TransactionLedger[]>([]);
  const [allIncomeRecords, setAllIncomeRecords] = useState<TransactionLedger[]>([]);
  const [loading, setLoading] = useState(false);

  const config = incomeConfigs[page] || incomeConfigs['basic-roi']!;

  const loadIncomeRecords = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const allTxns = await getTransactions(profile.uid, 'income_wallet');
      setAllIncomeRecords(allTxns);
      setRecords(allTxns.filter((t) => String(t.type) === String(config.txnType)));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIncomeRecords();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadIncomeRecords();
        refreshWallet();
      }
    }, 10000);
    return () => window.clearInterval(timer);
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
      header: 'Income Description',
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
          +USDT {item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
        </span>
      )
    },
    {
      key: 'status',
      header: 'Status',
      render: () => (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          CREDITED
        </span>
      )
    }
  ];

  const todayLocal = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const ledgerTodayAmount = records
    .filter((t) => t.status === 'completed' && t.flow === 'credit')
    .filter((t) => new Date(t.createdAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === todayLocal)
    .reduce((sum, t) => sum + Number(t.netAmount || t.amount || 0), 0);

  const isCommissionView = ['basic_referral', 'basic_level', 'fd_referral', 'fd_level'].includes(String(config.txnType));
  const todayAmount = isCommissionView ? ledgerTodayAmount : config.getTodayAmount(wallet);
  const ledgerTotalAmount = records
    .filter((t) => t.status === 'completed' && t.flow === 'credit')
    .reduce((sum, t) => sum + Number(t.netAmount || t.amount || 0), 0);
  const configuredTotalAmount = config.getTotalAmount(wallet);
  const totalAmount = isCommissionView ? Math.max(Number(configuredTotalAmount || 0), ledgerTotalAmount) : configuredTotalAmount;

  const investedCapital = Number(wallet?.basicPackageActive || 0) + Number(wallet?.fdPackageActive || 0);
  const ledgerIncome = allIncomeRecords
    .filter((t) => t.status === 'completed' && t.flow === 'credit')
    .reduce((sum, t) => sum + Number(t.netAmount || t.amount || 0), 0);
  const recordedIncome = Math.max(Number(wallet?.totalIncome || 0), ledgerIncome);
  const recordedCharges = allIncomeRecords
    .filter((t) => t.status === 'completed')
    .reduce((sum, t) => sum + Number(t.fee || 0), 0);
  const realizedProfitLoss = Number((recordedIncome - recordedCharges).toFixed(2));
  const performancePercent = investedCapital > 0
    ? Number(((realizedProfitLoss / investedCapital) * 100).toFixed(2))
    : 0;

  const money = (value: number) => `USDT ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;

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
            <span className="text-xs text-slate-400">Today Recorded</span>
            <div className="text-xl sm:text-2xl font-extrabold text-cyan-300 font-mono tabular-nums">
              {money(todayAmount)}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[#0e173a] border border-emerald-500/30 text-right">
            <span className="text-xs text-slate-400">Total Recorded</span>
            <div className="text-xl sm:text-2xl font-extrabold text-emerald-400 font-mono tabular-nums">
              {money(totalAmount)}
            </div>
          </div>
        </div>
      </div>

      {/* Automatic Profit / Loss Snapshot */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400">Automatic Performance Snapshot</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Calculated from recorded wallet and completed ledger values; no projected or guaranteed return is included.</p>
          </div>
          <button onClick={handleRefresh} disabled={loading} className="p-2 rounded-lg bg-[#0e173a] border border-blue-500/25 text-cyan-400">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl bg-[#091129] border border-blue-500/25">
            <div className="flex items-center justify-between text-xs text-slate-400"><span>Invested Capital</span><Wallet className="w-4 h-4 text-cyan-400" /></div>
            <div className="mt-2 text-xl font-bold font-mono text-white">{money(investedCapital)}</div>
            <div className="text-[10px] text-slate-500 mt-1">Basic + FD active principal</div>
          </div>

          <div className="p-4 rounded-xl bg-[#091129] border border-emerald-500/25">
            <div className="flex items-center justify-between text-xs text-slate-400"><span>Recorded Earnings</span><TrendingUp className="w-4 h-4 text-emerald-400" /></div>
            <div className="mt-2 text-xl font-bold font-mono text-emerald-400">{money(recordedIncome)}</div>
            <div className="text-[10px] text-slate-500 mt-1">ROI + referral + level + other credited income</div>
          </div>

          <div className="p-4 rounded-xl bg-[#091129] border border-amber-500/25">
            <div className="flex items-center justify-between text-xs text-slate-400"><span>Recorded Charges</span><Scale className="w-4 h-4 text-amber-400" /></div>
            <div className="mt-2 text-xl font-bold font-mono text-amber-300">{money(recordedCharges)}</div>
            <div className="text-[10px] text-slate-500 mt-1">Only fees actually recorded in the ledger</div>
          </div>

          <div className={`p-4 rounded-xl bg-[#091129] border ${realizedProfitLoss >= 0 ? 'border-emerald-500/30' : 'border-rose-500/30'}`}>
            <div className="flex items-center justify-between text-xs text-slate-400"><span>Realized Profit / Loss</span><Percent className={`w-4 h-4 ${realizedProfitLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'}`} /></div>
            <div className={`mt-2 text-xl font-bold font-mono ${realizedProfitLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{money(realizedProfitLoss)}</div>
            <div className="text-[10px] text-slate-500 mt-1">{investedCapital > 0 ? `${performancePercent}% of active capital` : 'Activates automatically after capital is recorded'}</div>
          </div>
        </div>
      </div>

      {/* Income Records DataTable */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400">
            {config.title} Ledger History
          </h3>
          <span className="text-xs text-slate-500">Recorded credits only</span>
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
