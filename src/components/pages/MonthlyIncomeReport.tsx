import React, { useState, useEffect } from 'react';
import { FileBarChart2, Calendar, TrendingUp, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { getTransactions } from '../../services/financeService.ts';
import { DataTable, type Column } from '../common/DataTable.tsx';
import type { TransactionLedger } from '../../types/index.ts';

interface MonthlyAggregate {
  id: string;
  monthYear: string;
  basicRoi: number;
  fdRoi: number;
  referral: number;
  level: number;
  salary: number;
  grossEarnings: number;
}

export const MonthlyIncomeReport: React.FC = () => {
  const { profile, wallet } = useAuth();
  const [monthlyData, setMonthlyData] = useState<MonthlyAggregate[]>([]);
  const [loading, setLoading] = useState(false);

  const loadMonthlyReport = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const txns = await getTransactions(profile.uid, 'income_wallet');
      const groups: Record<string, MonthlyAggregate> = {};

      const currentMonthStr = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      groups[currentMonthStr] = {
        id: currentMonthStr,
        monthYear: currentMonthStr,
        basicRoi: wallet?.totalRoiIncome || 0,
        fdRoi: wallet?.fdTotalRoiIncome || 0,
        referral: (wallet?.referralIncome || 0) + (wallet?.fdReferralIncome || 0),
        level: (wallet?.totalLevelIncome || 0) + (wallet?.fdTotalLevelIncome || 0),
        salary: wallet?.totalSalary || 0,
        grossEarnings: (wallet?.totalIncome || 0)
      };

      for (const t of txns) {
        if (t.flow === 'credit') {
          const mStr = new Date(t.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
          if (!groups[mStr]) {
            groups[mStr] = {
              id: mStr,
              monthYear: mStr,
              basicRoi: 0,
              fdRoi: 0,
              referral: 0,
              level: 0,
              salary: 0,
              grossEarnings: 0
            };
          }
          if (t.type === 'basic_roi') groups[mStr].basicRoi += t.amount;
          else if (t.type === 'fd_roi') groups[mStr].fdRoi += t.amount;
          else if (t.type === 'basic_referral' || t.type === 'fd_referral') groups[mStr].referral += t.amount;
          else if (t.type === 'basic_level' || t.type === 'fd_level' || t.type === 'rd_level') groups[mStr].level += t.amount;
          else if (t.type === 'salary') groups[mStr].salary += t.amount;

          groups[mStr].grossEarnings += t.amount;
        }
      }

      setMonthlyData(Object.values(groups));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMonthlyReport();
  }, [profile?.uid, wallet]);

  const columns: Column<MonthlyAggregate>[] = [
    {
      key: 'monthYear',
      header: 'Month & Year',
      render: (item) => (
        <span className="text-xs text-white font-mono font-semibold">
          {item.monthYear}
        </span>
      )
    },
    {
      key: 'basicRoi',
      header: 'Basic ROI Total',
      render: (item) => (
        <span className="font-mono text-xs text-cyan-300">
          ₹{item.basicRoi.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </span>
      )
    },
    {
      key: 'fdRoi',
      header: 'FD ROI Total',
      render: (item) => (
        <span className="font-mono text-xs text-amber-300">
          ₹{item.fdRoi.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </span>
      )
    },
    {
      key: 'referral',
      header: 'Referral Direct Income',
      render: (item) => (
        <span className="font-mono text-xs text-emerald-300">
          ₹{item.referral.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </span>
      )
    },
    {
      key: 'level',
      header: 'Level Generations',
      render: (item) => (
        <span className="font-mono text-xs text-teal-300">
          ₹{item.level.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </span>
      )
    },
    {
      key: 'salary',
      header: 'Monthly Salary',
      render: (item) => (
        <span className="font-mono text-xs text-rose-300">
          ₹{item.salary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </span>
      )
    },
    {
      key: 'grossEarnings',
      header: 'Gross Monthly Earnings',
      render: (item) => (
        <span className="font-mono text-xs font-bold text-white bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-500/30">
          ₹{item.grossEarnings.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
            Monthly Income Report
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Comprehensive calendar month aggregates and gross earnings statements.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#0e173a] border border-blue-500/30 text-right">
          <span className="text-xs text-slate-400">Cumulative Income</span>
          <div className="text-xl sm:text-2xl font-extrabold text-emerald-400 font-mono tabular-nums">
            ₹{(wallet?.totalIncome || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400">
            Monthly Aggregate Statement
          </h3>
          <span className="text-xs text-slate-500">Monthly fiscal statements</span>
        </div>

        <DataTable
          title="Monthly Income Report"
          columns={columns}
          data={monthlyData}
          onRefresh={loadMonthlyReport}
          isLoading={loading}
          emptyMessage="No monthly income aggregates found."
        />
      </div>
    </div>
  );
};
