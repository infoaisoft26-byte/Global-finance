import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

type ReportRow = { id:string; period?:string; periodKey?:string; roiIncome:number; levelIncome:number; referralIncome:number; salaryIncome:number; totalIncome:number; entryCount:number };
const money = (value:number) => Number(value||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:8});

export const DailyIncomeReport: React.FC = () => {
  const { user } = useAuth();
  const [rows,setRows]=useState<ReportRow[]>([]);
  const [total,setTotal]=useState(0);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [lastUpdated,setLastUpdated]=useState<Date|null>(null);
  const load=useCallback(async(silent=false)=>{
    if(!user)return;
    if(!silent)setLoading(true);setError('');
    try{
      const token=await user.getIdToken();
      const res=await fetch('/api/member-finance-report?report=daily',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
      const body=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(body.error||'Unable to load daily report');
      setRows(Array.isArray(body.rows)?body.rows:[]);
      setTotal(Number(body.summary?.totalIncome||0));
      setLastUpdated(new Date());
    }catch(e:any){setError(e?.message||'Unable to load daily report');}
    finally{if(!silent)setLoading(false);}
  },[user]);
  useEffect(()=>{ void load(); const timer=window.setInterval(()=>{ void load(true); },15000); return ()=>window.clearInterval(timer); },[load]);
  return <div className="space-y-6">
    <div className="p-6 rounded-2xl bg-[#091129]/90 border border-blue-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div><p className="text-xs uppercase tracking-wider text-cyan-400">Financial Statements · IST</p><h2 className="text-2xl font-extrabold text-white mt-1">Daily Income Report</h2><p className="text-sm text-slate-400 mt-1">Daily ROI, referral, level and salary credits from the verified Neon ledger.</p></div>
      <div className="p-4 rounded-xl bg-[#0e173a] border border-emerald-500/30"><p className="text-xs text-slate-400">Lifetime recorded income · Auto-sync 15s</p><p className="text-2xl font-extrabold text-emerald-400">USDT {money(total)}</p><button onClick={()=>void load()} className="mt-2 text-xs text-cyan-300 flex items-center gap-2"><RefreshCw className={`w-3 h-3 ${loading?'animate-spin':''}`}/> Refresh report</button>{lastUpdated&&<p className="mt-1 text-[10px] text-slate-500">Last sync: {lastUpdated.toLocaleTimeString('en-IN')}</p>}</div>
    </div>
    {error&&<div className="p-3 rounded-xl border border-rose-500/30 text-rose-300 text-sm">{error}</div>}
    <div className="rounded-2xl overflow-x-auto border border-blue-500/20 bg-[#091129]"><table className="w-full min-w-[800px] text-xs"><thead className="bg-[#060b1c] text-slate-400"><tr>{['Date','ROI Income','Level Income','Direct Referral','Salary','Total Day Income','Entries'].map(x=><th key={x} className="p-3 text-right first:text-left">{x}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id} className="border-t border-blue-500/10 text-right text-slate-200"><td className="p-3 text-left">{r.period}</td><td className="p-3">USDT {money(r.roiIncome)}</td><td className="p-3">USDT {money(r.levelIncome)}</td><td className="p-3">USDT {money(r.referralIncome)}</td><td className="p-3">USDT {money(r.salaryIncome)}</td><td className="p-3 font-bold text-emerald-300">USDT {money(r.totalIncome)}</td><td className="p-3">{r.entryCount}</td></tr>)}</tbody></table>{!loading&&!rows.length&&<p className="p-8 text-center text-slate-400 text-sm">No completed income credits are recorded yet.</p>}{loading&&<p className="p-8 text-center text-slate-400">Loading report…</p>}</div>
  </div>;
};
