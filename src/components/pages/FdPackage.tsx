import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Package, RefreshCw, Wallet } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { adminGetPackages } from '../../services/financeService.ts';
import { getPackagePurchaseHistory, purchasePackageWithUsdt } from '../../services/packagePurchaseApi.ts';
import { FD_PACKAGE_TEMPLATES, getFdPlanDailyReturn, getFdPlanScheduledReturn, getFdPlanMaturityValue } from '../../data/fdPackageTemplates.ts';
import { DataTable, type Column } from '../common/DataTable.tsx';
import type { PackageActivationRequest, PackageDefinition } from '../../types/index.ts';

export const FdPackage: React.FC<{ onNavigateToRecharge: () => void }> = ({ onNavigateToRecharge }) => {
  const { wallet, refreshWallet, user } = useAuth();
  const [packages, setPackages] = useState<PackageDefinition[]>(FD_PACKAGE_TEMPLATES);
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
        const savedFd = saved.filter(p => p.type === 'fd');
        const byCode = new Map(savedFd.map(p => [p.code, p]));
        const merged = FD_PACKAGE_TEMPLATES.map(t => byCode.get(t.code) || t).filter(p => p.active);
        const custom = savedFd.filter(p => p.active && !FD_PACKAGE_TEMPLATES.some(t => t.code === p.code));
        setPackages([...merged, ...custom]);
      }
      setRequests(history.filter(r => r.packageType === 'fd'));
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
      const text = err?.message || 'FD package purchase failed.';
      if (/insufficient/i.test(text)) {
        setMessage('Available USDT is insufficient. Opening Recharge…');
        onNavigateToRecharge();
      } else setError(text);
    } finally { setSubmittingId(''); }
  };

  const columns: Column<PackageActivationRequest>[] = useMemo(() => [
    { key:'createdAt', header:'Date', render:item => <span className="text-xs">{new Date(item.createdAt).toLocaleString('en-IN')}</span> },
    { key:'packageName', header:'FD Plan', render:item => <span className="text-xs font-semibold">{item.packageName}</span> },
    { key:'amountRupees', header:'USDT Amount', render:item => <span className="text-xs font-mono">USDT {item.amountRupees.toFixed(2)}</span> },
    { key:'status', header:'Status', render:item => <span className="inline-flex px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-500">{item.status.toUpperCase()}</span> }
  ], []);

  return <div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div><h2 className="text-xl font-bold">FD Package</h2><p className="text-xs mt-1">Choose an active FD plan and review its daily income, total profit and maturity amount before purchase.</p></div>
      <div className="flex items-center gap-2"><div className="px-4 py-2.5 rounded-xl bg-[#091129] border border-blue-500/25 flex items-center gap-2"><Wallet className="w-4 h-4 text-cyan-400"/><div><div className="text-[9px] uppercase">Available USDT</div><div className="font-mono text-sm font-bold">{Number(wallet?.fundWallet || 0).toFixed(2)}</div></div></div><button onClick={onNavigateToRecharge} className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold">Add USDT</button></div>
    </div>
    {message && <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/>{message}</div>}
    {error && <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs flex items-center gap-2"><AlertCircle className="w-4 h-4"/>{error}</div>}
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {packages.map(pkg => {
        const prime = pkg.name.toLowerCase().includes('prime');
        const waiting = submittingId === pkg.id;
        const daily = getFdPlanDailyReturn(pkg);
        const profit = getFdPlanScheduledReturn(pkg);
        const maturity = getFdPlanMaturityValue(pkg);
        return <div key={pkg.id} className={`rounded-2xl bg-[#091129] border overflow-hidden shadow-lg ${prime ? 'border-violet-500/30' : 'border-blue-500/25'}`}>
          <div className="p-4 border-b border-blue-500/15 flex items-center gap-3"><div className={`w-10 h-10 rounded-xl flex items-center justify-center ${prime ? 'bg-gradient-to-br from-violet-600 to-fuchsia-500' : 'bg-gradient-to-br from-blue-600 to-cyan-500'}`}><Package className="w-5 h-5 text-white"/></div><div><h3 className="font-bold">{pkg.name}</h3><span className="text-[10px] font-mono text-cyan-500">{pkg.code}</span></div></div>
          <div className="p-4 space-y-2 text-xs">
            <div className="flex justify-between"><span>Plan Amount</span><b className="font-mono">USDT {pkg.minAmount.toFixed(2)}</b></div>
            <div className="flex justify-between"><span>Daily Return</span><b className="font-mono text-emerald-400">{pkg.roiRate}% = USDT {daily.toFixed(2)}</b></div>
            <div className="flex justify-between"><span>Days</span><b>{pkg.durationDays}</b></div>
            <div className="flex justify-between"><span>Total Profit</span><b className="font-mono text-emerald-300">USDT {profit.toFixed(2)}</b></div>
            <div className={`flex justify-between pt-3 mt-1 border-t ${prime ? 'border-violet-500/20' : 'border-blue-500/20'}`}><span className="font-semibold">Maturity Amount</span><b className="font-mono text-base">USDT {maturity.toFixed(2)}</b></div>
          </div>
          <button onClick={() => purchase(pkg)} disabled={waiting} className={`w-full py-3 text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2 ${prime ? 'bg-violet-600 hover:bg-violet-500' : 'bg-blue-600 hover:bg-blue-500'}`}>{waiting ? <><RefreshCw className="w-3.5 h-3.5 animate-spin"/>Processing…</> : 'Purchase with USDT'}</button>
        </div>;
      })}
    </div>
    <div className="rounded-2xl bg-[#091129] border border-blue-500/25 p-5"><div className="flex items-center justify-between mb-3"><h3 className="text-sm font-bold flex items-center gap-2"><Clock className="w-4 h-4 text-cyan-400"/>FD Purchase History</h3><button onClick={() => loadData(true)} disabled={refreshing} className="text-xs text-cyan-500 flex items-center gap-1"><RefreshCw className={`w-3.5 h-3.5 ${refreshing?'animate-spin':''}`}/>Refresh</button></div><DataTable columns={columns} data={requests} emptyMessage="No FD package purchases yet." /></div>
  </div>;
};
