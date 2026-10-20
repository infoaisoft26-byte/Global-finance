import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { auth } from '../../lib/firebase.ts';
import { DataTable, type Column } from '../common/DataTable.tsx';

interface MonthlyAggregate {
  id: string; monthYear: string; roiIncome: number; referralIncome: number; levelIncome: number;
  salaryIncome: number; registrationBonus: number; otherIncome: number; grossEarnings: number;
}
const money = (v: number) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 });
const completed = (t: any) => ['completed','approved','credited'].includes(String(t.status || '').toLowerCase());
const typeOf = (t: any) => String(t.type || '').toLowerCase();
const isRoi = (t: any) => /(^|_)(roi|daily_roi)(_|$)/.test(typeOf(t)) || typeOf(t) === 'roi_daily';
const isReferral = (t: any) => /referral/.test(typeOf(t)) || typeOf(t) === 'direct_referral';
const isLevel = (t: any) => /level/.test(typeOf(t)) || typeOf(t) === 'rd_level';
const isSalary = (t: any) => typeOf(t) === 'salary';
const isBonus = (t: any) => ['joining_bonus','registration_bonus','signup_bonus'].includes(typeOf(t));
export const MonthlyIncomeReport: React.FC = () => {
  const { profile, user, refreshWallet } = useAuth();
  const [monthlyData, setMonthlyData] = useState<MonthlyAggregate[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const loadMonthlyReport = useCallback(async (showSpinner = true) => {
    if (!profile || !user) return;
    if (showSpinner) setLoading(true);
    try {
      const token = await (auth.currentUser || user).getIdToken();
      const response = await fetch('/api/member-income-history', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(payload.transactions)) throw new Error(payload.error || 'Unable to load recorded income ledger');
      const groups: Record<string, MonthlyAggregate> = {};
      for (const t of payload.transactions) {
        if (t.flow !== 'credit' || !completed(t)) continue;
        const date = new Date(t.createdAt);
        if (Number.isNaN(date.getTime())) continue;
        const key = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata', month: '2-digit', year: 'numeric' });
        const label = date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'long', year: 'numeric' });
        if (!groups[key]) groups[key] = { id: key, monthYear: label, roiIncome: 0, referralIncome: 0, levelIncome: 0, salaryIncome: 0, registrationBonus: 0, otherIncome: 0, grossEarnings: 0 };
        const amount = Number(t.netAmount || t.amount || 0);
        if (!Number.isFinite(amount)) continue;
        if (isRoi(t)) groups[key].roiIncome += amount;
        else if (isReferral(t)) groups[key].referralIncome += amount;
        else if (isLevel(t)) groups[key].levelIncome += amount;
        else if (isSalary(t)) groups[key].salaryIncome += amount;
        else if (isBonus(t)) groups[key].registrationBonus += amount;
        else groups[key].otherIncome += amount;
        groups[key].grossEarnings += amount;
      }
      setMonthlyData(Object.values(groups).sort((a,b) => b.id.localeCompare(a.id)));
      setLastSync(new Date());
    } catch (err) { console.error('Monthly income report load failed:', err); }
    finally { if (showSpinner) setLoading(false); }
  }, [profile?.uid, user?.uid]);
  useEffect(() => {
    let cancelled = false; let inFlight = false;
    const refresh = async (spinner = false) => {
      if (cancelled || inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;
      try { await loadMonthlyReport(spinner); await refreshWallet(); } finally { inFlight = false; }
    };
    void refresh(true);
    const timer = window.setInterval(() => { void refresh(false); }, 60000);
    const visible = () => { if (document.visibilityState === 'visible') void refresh(false); };
    document.addEventListener('visibilitychange', visible);
    return () => { cancelled = true; window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [loadMonthlyReport, refreshWallet]);
  const columns: Column<MonthlyAggregate>[] = [
    { key:'monthYear', header:'Month & Year' },
    { key:'roiIncome', header:'ROI Income (USDT)', render:item => money(item.roiIncome) },
    { key:'referralIncome', header:'Referral Income (USDT)', render:item => money(item.referralIncome) },
    { key:'levelIncome', header:'Level Income (USDT)', render:item => money(item.levelIncome) },
    { key:'salaryIncome', header:'Salary (USDT)', render:item => money(item.salaryIncome) },
    { key:'registrationBonus', header:'Registration Bonus (USDT)', render:item => money(item.registrationBonus) },
    { key:'otherIncome', header:'Other Income (USDT)', render:item => money(item.otherIncome) },
    { key:'grossEarnings', header:'Total Credited (USDT)', render:item => <span className="font-bold text-emerald-300">{money(item.grossEarnings)}</span> }
  ];
  const recordedTotal = monthlyData.reduce((sum, month) => sum + month.grossEarnings, 0);
  return <div className="space-y-6">
    <div className="p-6 rounded-2xl bg-[#091129]/90 border border-blue-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div><h2 className="text-2xl font-extrabold text-white">Monthly Income Report</h2><p className="text-sm text-slate-400 mt-1">Calendar-month aggregates from actual completed income-wallet ledger credits. Cumulative wallet counters are not mixed into monthly totals.</p>{lastSync && <p className="text-[10px] text-cyan-400 mt-1">Last sync: {lastSync.toLocaleString('en-IN')}</p>}</div>
      <div className="text-right"><div className="text-xs text-slate-400">Recorded Income (USDT)</div><div className="text-2xl font-bold text-emerald-400">{money(recordedTotal)}</div></div>
    </div>
    <DataTable title="Monthly Income Report" columns={columns} data={monthlyData} onRefresh={() => loadMonthlyReport(true)} isLoading={loading} emptyMessage="No completed income credits have been recorded yet." />
  </div>;
};
