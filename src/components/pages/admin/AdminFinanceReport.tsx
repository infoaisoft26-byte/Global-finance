import React, { useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, Wallet, ArrowDownToLine, PackageCheck, Activity } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext.tsx';

type Report = {
  generatedAt: string;
  summary: {
    totalDeposits: number;
    totalPackagePurchases: number;
    depositCount: number;
    purchaseCount: number;
    availableUsdt: number;
    incomeWallet: number;
    activeBasic: number;
    activeFd: number;
  };
  ledger: any[];
  purchases: any[];
  wallets: any[];
};

const money = (v: any) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const AdminFinanceReport: React.FC = () => {
  const { user } = useAuth();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'ledger' | 'purchases' | 'wallets'>('ledger');
  const [error, setError] = useState('');

  const load = async () => {
    if (!user) return;
    setLoading(true); setError('');
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin-finance-report', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to load finance report');
      setReport(data);
    } catch (e: any) { setError(e?.message || 'Unable to load report'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [user?.uid]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const source = report?.[tab] || [];
    if (!q) return source;
    return source.filter((r: any) => JSON.stringify(r).toLowerCase().includes(q));
  }, [report, tab, search]);

  const exportCsv = () => {
    if (!rows.length) return;
    const keys = Object.keys(rows[0]);
    const csv = [keys.join(','), ...rows.map((r:any) => keys.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `global-finance-${tab}-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const s = report?.summary;
  return <div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div><h2 className="text-xl font-bold text-white">End-to-End Finance Report</h2><p className="text-xs text-slate-400 mt-1">Verified USDT deposits → wallet credit → package purchase debit → active package records.</p></div>
      <div className="flex gap-2"><button onClick={exportCsv} className="px-3 py-2 rounded-xl bg-[#0e173a] border border-blue-500/30 text-xs text-white flex items-center gap-2"><Download className="w-4 h-4"/>Export CSV</button><button onClick={load} disabled={loading} className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs flex items-center gap-2"><RefreshCw className={`w-4 h-4 ${loading?'animate-spin':''}`}/>Refresh</button></div>
    </div>

    {error && <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs">{error}</div>}

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div className="p-4 rounded-2xl bg-[#091129] border border-cyan-500/25"><ArrowDownToLine className="w-4 h-4 text-cyan-400"/><div className="text-[10px] text-slate-500 uppercase mt-2">Verified Deposits</div><div className="text-lg font-bold text-white">USDT {money(s?.totalDeposits)}</div><div className="text-[10px] text-slate-500">{s?.depositCount || 0} deposits</div></div>
      <div className="p-4 rounded-2xl bg-[#091129] border border-violet-500/25"><PackageCheck className="w-4 h-4 text-violet-400"/><div className="text-[10px] text-slate-500 uppercase mt-2">Package Purchases</div><div className="text-lg font-bold text-white">USDT {money(s?.totalPackagePurchases)}</div><div className="text-[10px] text-slate-500">{s?.purchaseCount || 0} purchases</div></div>
      <div className="p-4 rounded-2xl bg-[#091129] border border-emerald-500/25"><Wallet className="w-4 h-4 text-emerald-400"/><div className="text-[10px] text-slate-500 uppercase mt-2">Available USDT</div><div className="text-lg font-bold text-white">USDT {money(s?.availableUsdt)}</div></div>
      <div className="p-4 rounded-2xl bg-[#091129] border border-amber-500/25"><Activity className="w-4 h-4 text-amber-400"/><div className="text-[10px] text-slate-500 uppercase mt-2">Active Packages</div><div className="text-lg font-bold text-white">USDT {money((s?.activeBasic || 0) + (s?.activeFd || 0))}</div><div className="text-[10px] text-slate-500">Basic {money(s?.activeBasic)} • FD {money(s?.activeFd)}</div></div>
    </div>

    <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
      <div className="flex gap-2">{(['ledger','purchases','wallets'] as const).map(x => <button key={x} onClick={()=>setTab(x)} className={`px-3 py-2 rounded-xl text-xs font-bold ${tab===x?'bg-blue-600 text-white':'bg-[#091129] border border-blue-500/20 text-slate-400'}`}>{x==='ledger'?'Ledger':x==='purchases'?'Package Purchases':'User Wallets'}</button>)}</div>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search member, tx hash, package..." className="px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white text-xs min-w-72" />
    </div>

    <div className="rounded-2xl bg-[#091129] border border-blue-500/25 overflow-x-auto">
      {loading ? <div className="p-12 text-center text-slate-400 text-xs">Loading live accounting…</div> : tab==='ledger' ? <table className="w-full min-w-[1000px] text-xs"><thead className="bg-[#060b1c] text-slate-400"><tr><th className="p-3 text-left">Date</th><th className="p-3 text-left">Member</th><th className="p-3 text-left">Type</th><th className="p-3 text-left">Flow</th><th className="p-3 text-right">USDT</th><th className="p-3 text-left">Reference</th><th className="p-3 text-left">Status</th></tr></thead><tbody>{rows.map((r:any)=><tr key={r.id} className="border-t border-blue-500/10"><td className="p-3 text-slate-400">{new Date(r.created_at).toLocaleString('en-IN')}</td><td className="p-3"><div className="font-semibold text-white">{r.name || 'Member'}</div><div className="text-[10px] text-cyan-400">{r.referral_code || r.user_id}</div></td><td className="p-3 text-white">{String(r.type).replace(/_/g,' ')}</td><td className={`p-3 font-bold ${r.flow==='credit'?'text-emerald-400':'text-rose-400'}`}>{r.flow}</td><td className="p-3 text-right font-mono text-white">{money(r.amount)}</td><td className="p-3 font-mono text-cyan-300 max-w-[240px] truncate">{r.reference_id || '—'}</td><td className="p-3 text-emerald-400">{r.status}</td></tr>)}</tbody></table> : tab==='purchases' ? <table className="w-full min-w-[900px] text-xs"><thead className="bg-[#060b1c] text-slate-400"><tr><th className="p-3 text-left">Activated</th><th className="p-3 text-left">Member</th><th className="p-3 text-left">Package</th><th className="p-3 text-left">Type</th><th className="p-3 text-right">USDT</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">Expiry</th></tr></thead><tbody>{rows.map((r:any)=><tr key={r.id} className="border-t border-blue-500/10"><td className="p-3 text-slate-400">{new Date(r.activated_at).toLocaleString('en-IN')}</td><td className="p-3"><div className="font-semibold text-white">{r.name || 'Member'}</div><div className="text-[10px] text-cyan-400">{r.referral_code || r.user_id}</div></td><td className="p-3 text-white">{r.package_name}</td><td className="p-3">{r.package_type}</td><td className="p-3 text-right font-mono text-white">{money(r.amount)}</td><td className="p-3 text-emerald-400">{r.status}</td><td className="p-3 text-slate-400">{new Date(r.expires_at).toLocaleDateString('en-IN')}</td></tr>)}</tbody></table> : <table className="w-full min-w-[900px] text-xs"><thead className="bg-[#060b1c] text-slate-400"><tr><th className="p-3 text-left">Member</th><th className="p-3 text-right">Available USDT</th><th className="p-3 text-right">Income</th><th className="p-3 text-right">Basic Active</th><th className="p-3 text-right">FD Active</th><th className="p-3 text-left">Updated</th></tr></thead><tbody>{rows.map((r:any)=><tr key={r.user_id} className="border-t border-blue-500/10"><td className="p-3"><div className="font-semibold text-white">{r.name || 'Member'}</div><div className="text-[10px] text-cyan-400">{r.referral_code || r.user_id}</div></td><td className="p-3 text-right font-mono text-white">{money(r.fund_wallet)}</td><td className="p-3 text-right font-mono">{money(r.income_wallet)}</td><td className="p-3 text-right font-mono">{money(r.basic_package_active)}</td><td className="p-3 text-right font-mono">{money(r.fd_package_active)}</td><td className="p-3 text-slate-400">{new Date(r.updated_at).toLocaleString('en-IN')}</td></tr>)}</tbody></table>}
    </div>
    {report?.generatedAt && <div className="text-[10px] text-slate-500">Generated from live PostgreSQL records: {new Date(report.generatedAt).toLocaleString('en-IN')}</div>}
  </div>;
};
