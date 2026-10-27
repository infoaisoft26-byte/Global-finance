import React, { useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, Trophy, Users, Wallet, AlertCircle } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext.tsx';

type LevelSummary = { level:number; totalIncome:number; creditCount:number; memberCount:number };
type MemberRow = { userId:string; name:string; email:string; gfId:string; level:number; creditCount:number; totalIncome:number; lastCreditAt:string|null };
type Report = {
  generatedAt:string;
  summary:{ totalLevelIncome:number; totalCredits:number; creditedMembers:number; unassignedIncome:number };
  levels:LevelSummary[];
  members:MemberRow[];
};
const money=(value:unknown)=>Number(value||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:8});
const dateTime=(value?:string|null)=>value?new Date(value).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'—';

export const AdminIncomeLeaderboard:React.FC=()=>{
  const {user}=useAuth();
  const [report,setReport]=useState<Report|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [search,setSearch]=useState('');
  const [levelFilter,setLevelFilter]=useState('all');

  const load=async()=>{
    if(!user)return;
    setLoading(true);setError('');
    try{
      const token=await user.getIdToken();
      const response=await fetch('/api/admin-network?mode=income-leaderboard',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Unable to load income leaderboard.');
      setReport(data);
    }catch(e){
      setError(e instanceof Error?e.message:'Unable to load income leaderboard.');
    }finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[user?.uid]);

  const rows=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return (report?.members||[])
      .filter(r=>levelFilter==='all'||String(r.level)===levelFilter)
      .filter(r=>!q||[r.name,r.email,r.gfId,r.userId,String(r.level)].some(v=>String(v||'').toLowerCase().includes(q)))
      .sort((a,b)=>b.totalIncome-a.totalIncome);
  },[report,search,levelFilter]);

  const exportCsv=()=>{
    const headers=['Rank','Level','GF ID','Member Name','Email','Total Income USDT','Credit Count','Last Credit'];
    const csv=[headers.join(','),...rows.map((r,i)=>[i+1,r.level||'Unassigned',r.gfId,r.name,r.email,r.totalIncome,r.creditCount,r.lastCreditAt||''].map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(','))].join('\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
    const a=document.createElement('a');a.href=url;a.download='global-finance-income-leaderboard-'+new Date().toISOString().slice(0,10)+'.csv';a.click();URL.revokeObjectURL(url);
  };
  const summary=report?.summary;
  return <section className="space-y-6">
    <header className="flex flex-col gap-3 border-b border-blue-500/20 pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-400"/><h1 className="text-xl font-extrabold text-white">Income Leaderboard</h1></div>
        <p className="mt-1 text-xs text-slate-400">Level 1–15 totals are calculated from completed income-ledger credits only. Pending, rejected and failed records are excluded.</p>
        {report?.generatedAt&&<p className="mt-1 text-[10px] text-cyan-300">Last refreshed: {dateTime(report.generatedAt)} · Manual refresh</p>}
      </div>
      <div className="flex gap-2">
        <button onClick={exportCsv} disabled={!rows.length} className="flex items-center gap-2 rounded-xl border border-blue-500/30 bg-[#0e173a] px-3 py-2 text-xs font-bold text-white disabled:opacity-40"><Download className="h-4 w-4"/>Export CSV</button>
        <button onClick={()=>void load()} disabled={loading} className="flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><RefreshCw className={'h-4 w-4 '+(loading?'animate-spin':'')}/>Refresh</button>
      </div>
    </header>
    {error&&<div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200"><AlertCircle className="h-4 w-4 shrink-0"/><span>{error}</span></div>}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl border border-amber-500/25 bg-[#091129] p-4"><Trophy className="mb-2 h-4 w-4 text-amber-300"/><p className="text-xs text-slate-400">Total Level Income</p><p className="mt-1 text-xl font-extrabold text-white">{money(summary?.totalLevelIncome)} USDT</p></div>
      <div className="rounded-2xl border border-cyan-500/25 bg-[#091129] p-4"><Wallet className="mb-2 h-4 w-4 text-cyan-300"/><p className="text-xs text-slate-400">Completed Credits</p><p className="mt-1 text-xl font-extrabold text-white">{Number(summary?.totalCredits||0).toLocaleString('en-US')}</p></div>
      <div className="rounded-2xl border border-emerald-500/25 bg-[#091129] p-4"><Users className="mb-2 h-4 w-4 text-emerald-300"/><p className="text-xs text-slate-400">Members with Level Income</p><p className="mt-1 text-xl font-extrabold text-white">{Number(summary?.creditedMembers||0).toLocaleString('en-US')}</p></div>
      <div className="rounded-2xl border border-violet-500/25 bg-[#091129] p-4"><AlertCircle className="mb-2 h-4 w-4 text-violet-300"/><p className="text-xs text-slate-400">Level Not Identified</p><p className="mt-1 text-xl font-extrabold text-white">{money(summary?.unassignedIncome)} USDT</p><p className="mt-1 text-[10px] text-slate-500">Not included in Level 1–15 totals</p></div>
    </div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      {(report?.levels||Array.from({length:15},(_,i)=>({level:i+1,totalIncome:0,creditCount:0,memberCount:0}))).map(item=><button key={item.level} onClick={()=>setLevelFilter(String(item.level))} className={'rounded-xl border p-3 text-left transition-colors '+(levelFilter===String(item.level)?'border-amber-400/60 bg-amber-500/10':'border-blue-500/20 bg-[#091129] hover:border-blue-400/40')}><p className="text-xs font-bold text-amber-300">Level {item.level}</p><p className="mt-1 break-words text-sm font-extrabold text-white">{money(item.totalIncome)} USDT</p><p className="mt-1 text-[10px] text-slate-400">{item.memberCount} members · {item.creditCount} credits</p></button>)}
    </div>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search GF ID, name, email..." className="w-full rounded-xl border border-blue-500/30 bg-[#060b1c] px-3 py-2 text-sm text-white placeholder:text-slate-500 sm:max-w-md"/>
      <div className="flex gap-2"><select value={levelFilter} onChange={e=>setLevelFilter(e.target.value)} className="rounded-xl border border-blue-500/30 bg-[#060b1c] px-3 py-2 text-xs text-white"><option value="all">All levels</option>{Array.from({length:15},(_,i)=><option key={i+1} value={String(i+1)}>Level {i+1}</option>)}<option value="0">Level not identified</option></select><button onClick={()=>{setLevelFilter('all');setSearch('');}} className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-200">Clear</button></div>
    </div>
    <div className="overflow-x-auto rounded-2xl border border-blue-500/20 bg-[#091129]">
      {loading?<div className="p-10 text-center text-sm text-slate-400">Loading verified income credits…</div>:rows.length===0?<div className="p-10 text-center text-sm text-slate-400">No completed level-income credits match this filter.</div>:<table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-[#060b1c] text-slate-400"><tr><th className="p-3">Rank</th><th className="p-3">Level</th><th className="p-3">Member</th><th className="p-3">GF ID</th><th className="p-3 text-right">Income (USDT)</th><th className="p-3 text-right">Credits</th><th className="p-3">Last credit</th></tr></thead><tbody>{rows.map((r,i)=><tr key={r.userId+'-'+r.level} className="border-t border-blue-500/10 hover:bg-white/[0.02]"><td className="p-3 font-bold text-amber-300">#{i+1}</td><td className="p-3 text-slate-200">{r.level>=1&&r.level<=15?'Level '+r.level:'Unidentified'}</td><td className="p-3"><p className="font-bold text-white">{r.name}</p><p className="mt-1 text-[10px] text-slate-400">{r.email||r.userId}</p></td><td className="p-3 font-mono text-cyan-300">{r.gfId||'—'}</td><td className="p-3 text-right font-mono font-bold text-emerald-300">{money(r.totalIncome)}</td><td className="p-3 text-right text-slate-200">{r.creditCount}</td><td className="p-3 text-slate-400">{dateTime(r.lastCreditAt)}</td></tr>)}</tbody></table>}
    </div>
    <p className="text-[10px] leading-5 text-slate-500">Amounts reflect eligible credited ledger records returned by the server. Credits without a stored Level 1–15 identifier are shown as unidentified rather than guessed.</p>
  </section>;
};
