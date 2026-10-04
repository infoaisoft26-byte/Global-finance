import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Package, RefreshCw, Wallet } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { adminGetPackages } from '../../services/financeService.ts';
import { getPackagePurchaseHistory, purchasePackageWithUsdt } from '../../services/packagePurchaseApi.ts';
import {
  BASIC_PACKAGE_TEMPLATES,
  getBasicPlanDailyReturn,
  getBasicPlanScheduledReturn,
  getBasicPlanMaturityValue
} from '../../data/basicPackageTemplates.ts';
import { DataTable, type Column } from '../common/DataTable.tsx';
import type { PackageActivationRequest, PackageDefinition } from '../../types/index.ts';

export const BasicPackage: React.FC<{ onNavigateToRecharge: () => void }> = ({ onNavigateToRecharge }) => {
  const { wallet, refreshWallet, user } = useAuth();
  const [packages, setPackages] = useState<PackageDefinition[]>(BASIC_PACKAGE_TEMPLATES);
  const [requests, setRequests] = useState<PackageActivationRequest[]>([]);
  const [submittingId, setSubmittingId] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadData = async (showRefresh = false) => {
    if (!user) return;
    if (showRefresh) setRefreshing(true);
    try {
      const [saved, history] = await Promise.all([
        adminGetPackages().catch(() => [] as PackageDefinition[]),
        getPackagePurchaseHistory(user).catch(() => [] as PackageActivationRequest[]),
      ]);
      if (saved.length) {
        const savedBasic = saved.filter(p => p.type === 'basic');
        const byCode = new Map(savedBasic.map(p => [p.code, p]));
        const merged = BASIC_PACKAGE_TEMPLATES.map(t => byCode.get(t.code) || t).filter(p => p.active);
        const custom = savedBasic.filter(p => p.active && !BASIC_PACKAGE_TEMPLATES.some(t => t.code === p.code));
        setPackages([...merged, ...custom]);
      }
      setRequests(history.filter(r => r.packageType === 'basic'));
    } finally {
      if (showRefresh) setRefreshing(false);
    }
  };

  useEffect(() => { void loadData(false); }, [user?.uid]);

  const purchase = async (pkg: PackageDefinition) => {
    if (!user) return;
    setError(''); setMessage('');
    if (Number(wallet?.fundWallet || 0) < pkg.minAmount) {
      setMessage(`USDT ${pkg.minAmount.toFixed(2)} required. Opening Recharge…`);
      onNavigateToRecharge();
      return;
    }
    setSubmittingId(pkg.id);
    try {
      const result = await purchasePackageWithUsdt(user, pkg.id);
      setMessage(result.message);
      await refreshWallet();
      await loadData(false);
    } catch (err: any) {
      const text = err?.message || 'Package purchase failed.';
      if (/insufficient/i.test(text)) {
        setMessage('Available USDT is insufficient. Opening Recharge…');
        onNavigateToRecharge();
      } else setError(text);
    } finally { setSubmittingId(''); }
  };

  const columns: Column<PackageActivationRequest>[] = useMemo(() => [
    { key: 'createdAt', header: 'Date', render: item => <span className="text-xs">{new Date(item.createdAt).toLocaleString('en-IN')}</span> },
    { key: 'packageName', header: 'Package', render: item => <span className="text-xs font-semibold">{item.packageName}</span> },
    { key: 'amountRupees', header: 'USDT Amount', render: item => <span className="text-xs font-mono">USDT {item.amountRupees.toFixed(2)}</span> },
    { key: 'status', header: 'Status', render: item => <span className="inline-flex px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-500">{item.status.toUpperCase()}</span> }
  ], []);

  return <div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div><h2 className="text-xl font-bold">Basic Package</h2><p className="text-xs mt-1">Choose a plan and see the daily income, total profit and maturity amount before purchase.</p></div>
      <div className="flex items-center gap-2">
        <div className="px-4 py-2.5 rounded-xl bg-[#091129] border border-blue-500/25 flex items-center gap-2"><Wallet className="w-4 h-4 text-cyan-400"/><div><div className="text-[9px] uppercase">Available USDT</div><div className="font-mono text-sm font-bold">{Number(wallet?.fundWallet || 0).toFixed(2)}</div></div></div>
        <button onClick={onNavigateToRecharge} className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold">Add USDT</button>
      </div>
    </div>
    {message && <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/>{message}</div>}
    {error && <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs flex items-center gap-2"><AlertCircle className="w-4 h-4"/>{error}</div>}
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {packages.map(pkg => {
        const waiting = submittingId === pkg.id;
        const dailyIncome = getBasicPlanDailyReturn(pkg);
        const totalProfit = getBasicPlanScheduledReturn(pkg);
        const maturityAmount = getBasicPlanMaturityValue(pkg);
        return <div key={pkg.id} className="rounded-2xl bg-[#091129] border border-blue-500/25 overflow-hidden shadow-lg">
          <div className="p-4 border-b border-blue-500/15 flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center"><Package className="w-5 h-5 text-white"/></div><div><h3 className="font-bold">{pkg.name}</h3><span className="text-[10px] font-mono text-cyan-500">{pkg.code}</span></div></div>
          <div className="p-4 space-y-2 text-xs">
            <div className="flex justify-between"><span>Plan Amount</span><b className="font-mono">USDT {pkg.minAmount.toFixed(2)}</b></div>
            <div className="flex justify-between"><span>Daily Return</span><b className="font-mono text-cyan-400">{pkg.roiRate}%</b></div>
            <div className="flex justify-between"><span>Daily Income</span><b className="font-mono text-emerald-400">USDT {dailyIncome.toFixed(2)}</b></div>
            <div className="flex justify-between"><span>Days</span><b>{pkg.durationDays}</b></div>
            <div className="flex justify-between pt-2 border-t border-blue-500/15"><span>Total Profit</span><b className="font-mono text-emerald-400">USDT {totalProfit.toFixed(2)}</b></div>
            <div className="mt-3 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-3">
              <div className="text-[10px] uppercase tracking-wide text-cyan-300">Maturity Amount</div>
              <div className="mt-1 text-xl font-bold font-mono text-white">$2</div>
              <div className="mt-1 text-[10px] text-slate-400">Principal + total profit after {pkg.durationDays} days</div>
            </div>
          </div>
          <button onClick={() => purchase(pkg)} disabled={waiting} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2">{waiting ? <><RefreshCw className="w-3.5 h-3.5 animate-spin"/>Processing…</> : 'Purchase with USDT'}</button>
        </div>;
      })}
    </div>
    <div className="rounded-2xl bg-[#091129] border border-blue-500/25 p-5"><div className="flex items-center justify-between mb-3"><h3 className="text-sm font-bold flex items-center gap-2"><Clock className="w-4 h-4 text-cyan-400"/>Purchase History</h3><button onClick={() => loadData(true)} disabled={refreshing} className="text-xs text-cyan-500 flex items-center gap-1"><RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}/>Refresh</button></div><DataTable columns={columns} data={requests} emptyMessage="No basic package purchases yet." /></div>
  </div>;
};
