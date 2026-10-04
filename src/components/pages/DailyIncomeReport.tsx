import React, { useState, useEffect } from 'react';
import { FileBarChart2, Calendar, TrendingUp, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { getTransactions } from '../../services/financeService.ts';
import { DataTable, type Column } from '../common/DataTable.tsx';
import type { TransactionLedger } from '../../types/index.ts';

interface DailyAggregate {
  id: string;
  date: string;
  roiIncome: number;
  levelIncome: number;
  referralIncome: number;
  salaryIncome: number;
  totalIncome: number;
}

export const DailyIncomeReport: React.FC = () => {
  const { profile, wallet } = useAuth();
  const [dailyData, setDailyData] = useState<DailyAggregate[]>([]);
  const [loading, setLoading] = useState(false);

  const loadDailyReport = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const txns = await getTransactions(profile.uid, 'income_wallet');
      const groups: Record<string, DailyAggregate> = {};

      for (const t of txns) {
        if (t.flow === 'credit') {
          const dStr = new Date(t.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' });
          if (!groups[dStr]) {
            groups[dStr] = {
              id: dStr,
              date: dStr,
              roiIncome: 0,
              levelIncome: 0,
              referralIncome: 0,
              salaryIncome: 0,
              totalIncome: 0
            };
          }
          if (t.type === 'basic_roi' || t.type === 'fd_roi') {
            groups[dStr].roiIncome += t.amount;
          } else if (t.type === 'basic_level' || t.type === 'fd_level' || t.type === 'rd_level') {
            groups[dStr].levelIncome += t.amount;
          } else if (t.type === 'basic_referral' || t.type === 'fd_referral') {
            groups[dStr].referralIncome += t.amount;
          } else if (t.type === 'salary') {
            groups[dStr].salaryIncome += t.amount;
          }
          if (t.type !== 'salary') groups[dStr].totalIncome += t.amount;
        }
      }

      setDailyData(Object.values(groups));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDailyReport();
  }, [profile?.uid, wallet]);

  const columns: Column<DailyAggregate>[] = [
    {
      key: 'date',
      header: 'Report Date',
      render: (item) => (
        <span className="text-xs text-white font-mono font-semibold">
          {item.date}
        </span>
      )
    },
    {
      key: 'roiIncome',
      header: 'Total ROI Income',
      render: (item) => (
        <span className="font-mono text-xs text-cyan-300">
          USDT {item.roiIncome.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
        </span>
      )
    },
    {
      key: 'levelIncome',
      header: 'Total Level Income',
      render: (item) => (
        <span className="font-mono text-xs text-teal-300">
          USDT {item.levelIncome.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
        </span>
      )
    },
    {
      key: 'referralIncome',
      header: 'Referral Direct Income',
      render: (item) => (
        <span className="font-mono text-xs text-emerald-300">
          USDT {item.referralIncome.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
        </span>
      )
    },
    {
      key: 'salaryIncome',
      header: 'Salary Bonus',
      render: (item) => (
        <span className="font-mono text-xs text-rose-300">
          ₹{item.salaryIncome.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      )
    },
    {
      key: 'totalIncome',
      header: 'Total Day Income',
      render: (item) => (
        <span className="font-mono text-xs font-bold text-white bg-blue-900/30 px-2 py-0.5 rounded border border-blue-500/30">
          USDT {item.totalIncome.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
        </span>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl bg-[#091129]/90 border border-blue-500/30 shadow-xl backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
            Financial Statements
          </span>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight mt-0.5">
            Daily Income Report
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Daily ROI, referral and level income are recorded from the live ledger. Level income is calculated on ROI income, not invested amount, with 1 active referral required at each level.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#0e173a] border border-blue-500/30 text-right">
          <span className="text-xs text-slate-400">Total Income</span>
          <div className="text-xl sm:text-2xl font-extrabold text-emerald-400 font-mono tabular-nums">
USDT {Number((wallet?.totalIncome || 0) - (wallet?.totalSalary || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400">
            Daily Breakdown Ledger
          </h3>
          <span className="text-xs text-slate-500">Day-level ledger aggregations</span>
        </div>

        <DataTable
          title="Daily Income Report"
          columns={columns}
          data={dailyData}
          onRefresh={loadDailyReport}
          isLoading={loading}
          emptyMessage="No daily income entries found."
        />
      </div>
    </div>
  );
};
