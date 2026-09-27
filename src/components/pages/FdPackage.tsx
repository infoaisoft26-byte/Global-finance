import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Package, RefreshCw, Wallet } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { adminGetPackages } from '../../services/financeService.ts';
import { createPackageActivationRequest, getUserPackageActivationRequests } from '../../services/packageActivationService.ts';
import { FD_PACKAGE_TEMPLATES, getFdPlanDailyReturn, getFdPlanScheduledReturn } from '../../data/fdPackageTemplates.ts';
import { DataTable, type Column } from '../common/DataTable.tsx';
import type { PackageActivationRequest, PackageDefinition } from '../../types/index.ts';

const FAST_READ_TIMEOUT = 3500;
const withTimeout = async <T,>(promise: Promise<T>, fallback: T): Promise<T> => Promise.race([
  promise,
  new Promise<T>(resolve => setTimeout(() => resolve(fallback), FAST_READ_TIMEOUT))
]);

export const FdPackage: React.FC<{ onNavigateToRecharge: () => void }> = ({ onNavigateToRecharge }) => {
  const { profile, wallet, refreshWallet } = useAuth();
  const [packages, setPackages] = useState<PackageDefinition[]>(FD_PACKAGE_TEMPLATES);
  const [requests, setRequests] = useState<PackageActivationRequest[]>([]);
  const [submittingId, setSubmittingId] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const mergePackages = (saved: PackageDefinition[]) => {
    const savedFd = saved.filter(p => p.type === 'fd');
    const byCode = new Map(savedFd.map(p => [p.code, p]));
    const reference = FD_PACKAGE_TEMPLATES.map(t => byCode.get(t.code) || t).filter(p => p.active);
    const custom = savedFd.filter(p => p.active && !FD_PACKAGE_TEMPLATES.some(t => t.code === p.code));
    return [...reference, ...custom];
  };

  const loadData = async (showRefresh = false) => {
    if (!profile) return;
    if (showRefresh) setRefreshing(true);
    try {
      const [saved, reqs] = await Promise.all([
        withTimeout(adminGetPackages(), [] as PackageDefinition[]),
        withTimeout(getUserPackageActivationRequests(profile.uid), [] as PackageActivationRequest[])
      ]);
      if (saved.length) setPackages(mergePackages(saved));
      setRequests(reqs.filter(r => r.packageType === 'fd'));
    } catch (err:any) {
      console.warn('FD package background sync failed:', err);
      setError(err?.message || 'Unable to refresh FD package data.');
    } finally {
      if (showRefresh) setRefreshing(false);
    }
  };

  useEffect(() => { void loadData(false); }, [profile?.uid]);

  const purchase = async (pkg: PackageDefinition) => {
    if (!profile) return;
    setSubmittingId(pkg.id);
    setError('');
    setMessage('');
    try {
      const result = await createPackageActivationRequest({
        userId: profile.uid,
        userEmail: profile.email,
        userName: profile.name,
        userReferralCode: profile.referralCode,
        packageId: pkg.id,
        amountRupees: pkg.minAmount
      });
      setMessage(result.message);
      await refreshWallet();
      void loadData(false);
    } catch (err:any) {
      setError(err?.message || 'FD package activation request failed.');
    } finally {
      setSubmittingId('');
    }
  };

  const columns: Column<PackageActivationRequest>[] = useMemo(() => [
    { key:'createdAt', header:'Date', render:item => <span className="text-xs text-slate-300">{new Date(item.createdAt).toLocaleString('en-IN')}</span> },
    { key:'packageName', header:'FD Plan', render:item => <span className="text-xs font-semibold text-white">{item.packageName}</span> },
    { key:'amountRupees', header:'Amount', render:item => <span className="text-xs font-mono text-cyan-300">{item.amountRupees.toLocaleString('en-IN',{minimumFractionDigits:2})}</span> },
    { key:'status', header:'Status', render:item => <span className={`inline-flex px-2 py-1 rounded-full text-[10px] font-bold ${item.status==='active'?'bg-emerald-500/15 text-emerald-400':'bg-amber-500/15 text-amber-400'}`}>{item.status.replace('_',' ').toUpperCase()}</span> }
  ], []);

  return <div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 className="text-xl font-bold text-white">FD Package</h2>
        <p className="text-xs text-slate-400 mt-1">Base and Prime FD plans from the supplied reference. Funding display is TRX / USDT only.</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="px-4 py-2.5 rounded-xl bg-[#091129] border border-blue-500/25 flex items-center gap-2">
          <Wallet className="w-4 h-4 text-cyan-400"/>
          <div><div className="text-[9px] uppercase text-slate-500">Available Fund</div><div className="font-mono text-sm font-bold text-white">{(wallet?.fundWallet || 0).toLocaleString('en-IN',{minimumFractionDigits:2})}</div></div>
        </div>
        <button onClick={onNavigateToRecharge} className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold">Add TRX / USDT</button>
      </div>
    </div>

    {message && <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/>{message}</div>}
    {error && <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2"><AlertCircle className="w-4 h-4"/>{error}</div>}

    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {packages.map(pkg => {
        const daily = getFdPlanDailyReturn(pkg);
        const scheduled = getFdPlanScheduledReturn(pkg);
        const waiting = submittingId === pkg.id;
        const prime = pkg.name.toLowerCase().includes('prime');
        return <div key={pkg.id} className={`rounded-2xl bg-[#091129] border overflow-hidden shadow-lg transition-colors ${prime?'border-violet-500/30 hover:border-violet-400/60':'border-blue-500/25 hover:border-cyan-400/50'}`}>
          <div className="p-4 border-b border-blue-500/15 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${prime?'bg-gradient-to-br from-violet-600 to-fuchsia-500':'bg-gradient-to-br from-blue-600 to-cyan-500'}`}><Package className="w-5 h-5 text-white"/></div>
            <div><h3 className="font-bold text-white">{pkg.name}</h3><span className="text-[10px] font-mono text-cyan-400">{pkg.code}</span></div>
          </div>
          <div className="p-4 space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-slate-400">Amount</span><b className="text-white font-mono">{pkg.minAmount.toLocaleString('en-IN',{minimumFractionDigits:2})}</b></div>
            <div className="flex justify-between"><span className="text-slate-400">Configured Daily</span><b className="text-emerald-400 font-mono">{daily.toLocaleString('en-IN',{minimumFractionDigits:2})}</b></div>
            <div className="flex justify-between"><span className="text-slate-400">Days</span><b className="text-cyan-300">{pkg.durationDays}</b></div>
            <div className="flex justify-between pt-2 border-t border-blue-500/15"><span className="text-slate-300 font-semibold">Scheduled Return</span><b className="text-white font-mono">{scheduled.toLocaleString('en-IN',{minimumFractionDigits:2})}</b></div>
            <p className="text-[10px] text-slate-500 pt-1">Configured plan terms; actual credits depend on recorded platform transactions and admin controls.</p>
          </div>
          <button onClick={()=>purchase(pkg)} disabled={waiting} className={`w-full py-3 text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2 ${prime?'bg-violet-600 hover:bg-violet-500':'bg-blue-600 hover:bg-blue-500'}`}>
            {waiting ? <><RefreshCw className="w-3.5 h-3.5 animate-spin"/>Processing...</> : 'Purchase'}
          </button>
        </div>;
      })}
    </div>

    <div className="rounded-2xl bg-[#091129] border border-blue-500/25 p-5">
      <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-bold text-white flex items-center gap-2"><Clock className="w-4 h-4 text-cyan-400"/>FD Package History</h3><button onClick={()=>loadData(true)} disabled={refreshing} className="text-xs text-cyan-400 flex items-center gap-1"><RefreshCw className={`w-3.5 h-3.5 ${refreshing?'animate-spin':''}`}/>Refresh</button></div>
      <DataTable columns={columns} data={requests} emptyMessage="No FD package activations yet." />
    </div>
  </div>;
};
