import React, { useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, Trophy, Users, Wallet, AlertCircle, TrendingUp, Radio } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext.tsx';

type LevelSummary = { level:number; totalIncome:number; creditCount:number; memberCount:number };
type MemberLevel = { level:number; creditCount:number; totalIncome:number; lastCreditAt:string|null };
type MemberRow = {
  userId:string; name:string; email:string; gfId:string; status:string;
  totalInvested:number; investmentCount:number; lastInvestmentAt:string|null;
  levels:MemberLevel[]; levelIncomeTotal:number;
};
type Report = {
  generatedAt:string;
  summary:{ totalInvested:number; investmentCount:number; investedMembers:number; totalLevelIncome:number; totalCredits:number; creditedMembers:number; unassignedIncome:number };
  levels:LevelSummary[];
  members:MemberRow[];
};
const money=(value:unknown)=>Number(value||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:8});
const dateTime=(value?:string|null)=>value?new Date(value).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'—';

export const AdminIncomeLeaderboard:React.FC=()=>{
  const {user}=useAuth();
  const [report,setReport]=useState<Report|null>(null);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [error,setError]=useState('');
  const [search,setSearch]=useState('');
  const [levelFilter,setLevelFilter]=useState('all');

  const load=async(showLoader=true)=>{
    if(!user)return;
    if(showLoader&&!report)setLoading(true);
    setRefreshing(true);setError('');
    try{
      const token=await user.getIdToken();
      const response=await fetch('/api/admin-income-leaderboard',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Unable to load investment leaderboard.');
      setReport(data);
    }catch(e){
      setError(e instanceof Error?e.message:'Unable to load investment leaderboard.');
    }finally{setLoading(false);setRefreshing(false);}
  };

  useEffect(()=>{
    if(!user)return;
    void load(true);
    const timer=window.setInterval(()=>void load(false),15000);
    return ()=>window.clearInterval(timer);
  },[user?.uid]);

  const rankedMembers=useMemo(()=>[...(report?.members||[])]
    .filter(r=>r.totalInvested>0)
    .sort((a,b)=>b.totalInvested-a.totalInvested||a.name.localeCompare(b.name)),[report]);
  const rankById=useMemo(()=>new Map(rankedMembers.map((r,i)=>[r.userId,i+1])),[rankedMembers]);
  const rows=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return rankedMembers
      .filter(r=>levelFilter==='all'||r.levels.some(x=>String(x.level)===levelFilter))
      .filter(r=>!q||[r.name,r.email,r.gfId,r.userId,...r.levels.map(x=>'level '+x.level)].some(v=>String(v||'').toLowerCase().includes(q)));
  },[rankedMembers,search,levelFilter]);

  const exportCsv=()=>{
    const headers=['Investment Rank','GF ID','Member Name','Email','Total Investment USDT','Investment Count','Income Levels','Level Income Total USDT','Last Investment'];
    const csv=[headers.join(','),...rows.map(r=>[
      rankById.get(r.userId)||'',r.gfId,r.name,r.email,r.totalInvested,r.investmentCount,
      r.levels.map(x=>'L'+x.level).join(' '),r.levelIncomeTotal,r.lastInvestmentAt||''
    ].map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(','))].join('\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
    const a=document.createElement('a');a.href=url;a.download='global-finance-investment-leaderboard-'+new Date().toISOString().slice(0,10)+'.csv';a.click();URL.revokeObjectURL(url);
  };
  const summary=report?.summary;
  return <section className="space-y-6">
    <header className="flex flex-col gap-3 border-b border-blue-500/20 pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-400"/><h1 className="text-xl font-extrabold text-white">Income Leaderboard</h1></div>
        <p className="mt-1 text-xs text-slate-400">Rank is based on verified completed package investments. Level 1–15 shows which commission levels each member has actually received.</p>
        <p className="mt-1 flex items-center gap-1 text-[10px] text-cyan-300"><Radio className="h-3 w-3"/>Auto-refresh every 15 seconds · Last updated: {dateTime(report?.generatedAt)}</p>
      </div>
      <div className="flex gap-2">
        <button onClick={exportCsv} disabled={!rows.length} className="flex items-center gap-2 rounded-xl border border-blue-500/30 bg-[#0e173a] px-3 py-2 text-xs font-bold text-white disabled:opacity-40"><Download className="h-4 w-4"/>Export CSV</button>
        <button onClick={()=>void load(false)} disabled={refreshing} className="flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><RefreshCw className={'h-4 w-4 '+(refreshing?'animate-spin':'')}/>Refresh now</button>
      </div>
    </header>
    {error&&<div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200"><AlertCircle className="h-4 w-4 shrink-0"/><span>{error}</span></div>}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl border border-amber-500/25 bg-[#091129] p-4"><TrendingUp className="mb-2 h-4 w-4 text-amber-300"/><p className="text-xs text-slate-400">Total Verified Investment</p><p className="mt-1 text-xl font-extrabold text-white">{money(summary?.totalInvested)} USDT</p></div>
      <div className="rounded-2xl border border-cyan-500/25 bg-[#091129] p-4"><Wallet className="mb-2 h-4 w-4 text-cyan-300"/><p className="text-xs text-slate-400">Investment Transactions</p><p className="mt-1 text-xl font-extrabold text-white">{Number(summary?.investmentCount||0).toLocaleString('en-US')}</p></div>
      <div className="rounded-2xl border border-emerald-500/25 bg-[#091129] p-4"><Users className="mb-2 h-4 w-4 text-emerald-300"/><p className="text-xs text-slate-400">Members Who Invested</p><p className="mt-1 text-xl font-extrabold text-white">{Number(summary?.investedMembers||0).toLocaleString('en-US')}</p></div>
      <div className="rounded-2xl border border-violet-500/25 bg-[#091129] p-4"><Trophy className="mb-2 h-4 w-4 text-violet-300"/><p className="text-xs text-slate-400">Level Income Credited</p><p className="mt-1 text-xl font-extrabold text-white">{money(summary?.totalLevelIncome)} USDT</p><p className="mt-1 text-[10px] text-slate-500">{Number(summary?.totalCredits||0).toLocaleString('en-US')} completed credits</p></div>
    </div>
    <div>
      <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-sm font-extrabold text-white">Live Level 1–15</h2><span className="text-[10px] text-slate-500">Select a level to see its members below</span></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {(report?.levels||Array.from({length:15},(_,i)=>({level:i+1,totalIncome:0,creditCount:0,memberCount:0}))).map(item=><button key={item.level} onClick={()=>setLevelFilter(levelFilter===String(item.level)?'all':String(item.level))} className={'rounded-xl border p-3 text-left transition-colors '+(levelFilter===String(item.level)?'border-amber-400/60 bg-amber-500/10':'border-blue-500/20 bg-[#091129] hover:border-blue-400/40')}><p className="text-xs font-bold text-amber-300">Level {item.level}</p><p className="mt-1 break-words text-sm font-extrabold text-white">{money(item.totalIncome)} USDT</p><p className="mt-1 text-[10px] text-slate-400">{item.memberCount} members · {item.creditCount} credits</p></button>)}
      </div>
    </div>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search GF ID, name, email or level..." className="w-full rounded-xl border border-blue-500/30 bg-[#060b1c] px-3 py-2 text-sm text-white placeholder:text-slate-500 sm:max-w-md"/>
      <div className="flex gap-2"><select value={levelFilter} onChange={e=>setLevelFilter(e.target.value)} className="rounded-xl border border-blue-500/30 bg-[#060b1c] px-3 py-2 text-xs text-white"><option value="all">All levels</option>{Array.from({length:15},(_,i)=><option key={i+1} value={String(i+1)}>Level {i+1}</option>)}</select><button onClick={()=>{setLevelFilter('all');setSearch('');}} className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-200">Clear</button></div>
    </div>
    <div className="overflow-x-auto rounded-2xl border border-blue-500/20 bg-[#091129]">
      {loading?<div className="p-10 text-center text-sm text-slate-400">Loading verified investment records…</div>:rows.length===0?<div className="p-10 text-center text-sm text-slate-400">No verified investments match this filter.</div>:<table className="w-full min-w-[900px] text-left text-xs"><thead className="bg-[#060b1c] text-slate-400"><tr><th className="p-3">Rank</th><th className="p-3">Member</th><th className="p-3">GF ID</th><th className="p-3 text-right">Total Investment (USDT)</th><th className="p-3 text-right">Investments</th><th className="p-3">Income Levels</th><th className="p-3 text-right">Level Income (USDT)</th><th className="p-3">Last Investment</th></tr></thead><tbody>{rows.map(r=><tr key={r.userId} className="border-t border-blue-500/10 hover:bg-white/[0.02]"><td className="p-3 font-bold text-amber-300">#{rankById.get(r.userId)||'—'}</td><td className="p-3"><p className="font-bold text-white">{r.name}</p><p className="mt-1 text-[10px] text-slate-400">{r.email||r.userId}</p></td><td className="p-3 font-mono text-cyan-300">{r.gfId||'—'}</td><td className="p-3 text-right font-mono font-bold text-emerald-300">{money(r.totalInvested)}</td><td className="p-3 text-right text-slate-200">{r.investmentCount}</td><td className="p-3"><div className="flex max-w-[220px] flex-wrap gap-1">{r.levels.length?r.levels.map(x=><button key={x.level} title={money(x.totalIncome)+' USDT level income'} onClick={()=>setLevelFilter(String(x.level))} className="rounded-md border border-cyan-500/25 bg-cyan-500/10 px-1.5 py-1 text-[10px] font-bold text-cyan-200">L{x.level}</button>):<span className="text-slate-500">No level credits</span>}</div></td><td className="p-3 text-right font-mono text-slate-200">{money(r.levelIncomeTotal)}</td><td className="p-3 text-slate-400">{dateTime(r.lastInvestmentAt)}</td></tr>)}</tbody></table>}
    </div>
    <p className="text-[10px] leading-5 text-slate-500">Investment rank uses completed package-purchase debit entries from the ledger, not recharge amounts or wallet balance. Level cards count credited income-ledger records for each stored Level 1–15 identifier. Data refreshes automatically every 15 seconds.</p>
  </section>;
};
