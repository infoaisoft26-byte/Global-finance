import React, { useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext.tsx';

const money=(v:any)=>Number(v||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});

export const AdminReports: React.FC=()=>{
  const {user}=useAuth();
  const [data,setData]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState<'ledger'|'purchases'|'wallets'>('ledger');
  const [search,setSearch]=useState('');
  const [error,setError]=useState('');

  const load=async()=>{
    if(!user)return;
    setLoading(true);setError('');
    try{
      const token=await user.getIdToken();
      const res=await fetch('/api/admin-network?mode=finance-report',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
      const body=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(body.error||'Unable to load finance report');
      setData(body);
    }catch(e:any){setError(e?.message||'Unable to load report');}
    finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[user?.uid]);

  const rows=useMemo(()=>{
    const source=data?.[tab]||[];const q=search.trim().toLowerCase();
    return q?source.filter((r:any)=>JSON.stringify(r).toLowerCase().includes(q)):source;
  },[data,tab,search]);

  const exportCsv=()=>{
    if(!rows.length)return;
    const keys=Object.keys(rows[0]);
    const csv=[keys.join(','),...rows.map((r:any)=>keys.map(k=>`"${String(r[k]??'').replace(/"/g,'""')}"`).join(','))].join('\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    const a=document.createElement('a');a.href=url;a.download=`global-finance-${tab}-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url);
  };

  const s=data?.summary||{};
  return <div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div><h2 className="text-xl font-bold text-white">End-to-End Finance Report</h2><p className="text-xs text-slate-400 mt-1">Verified USDT deposit → wallet credit → package purchase debit → active package.</p></div>
      <div className="flex gap-2"><button onClick={exportCsv} className="px-3 py-2 rounded-xl bg-[#0e173a] border border-blue-500/30 text-xs text-white flex items-center gap-2"><Download className="w-4 h-4"/>Export CSV</button><button onClick={load} disabled={loading} className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs flex items-center gap-2"><RefreshCw className={`w-4 h-4 ${loading?'animate-spin':''}`}/>Refresh</button></div>
    </div>
    {error&&<div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">{error}</div>}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div className="p-4 rounded-2xl bg-[#091129] border border-cyan-500/25"><div className="text-[10px] uppercase text-slate-500">Verified Deposits</div><div className="text-lg font-bold text-white">USDT {money(s.totalDeposits)}</div><div className="text-[10px] text-slate-500">{s.depositCount||0} deposits</div></div>
      <div className="p-4 rounded-2xl bg-[#091129] border border-violet-500/25"><div className="text-[10px] uppercase text-slate-500">Package Purchases</div><div className="text-lg font-bold text-white">USDT {money(s.totalPackagePurchases)}</div><div className="text-[10px] text-slate-500">{s.purchaseCount||0} purchases</div></div>
      <div className="p-4 rounded-2xl bg-[#091129] border border-emerald-500/25"><div className="text-[10px] uppercase text-slate-500">Available USDT</div><div className="text-lg font-bold text-white">USDT {money(s.availableUsdt)}</div></div>
      <div className="p-4 rounded-2xl bg-[#091129] border border-amber-500/25"><div className="text-[10px] uppercase text-slate-500">Active Packages</div><div className="text-lg font-bold text-white">USDT {money(Number(s.activeBasic||0)+Number(s.activeFd||0))}</div></div>
    </div>
    <div className="flex flex-col sm:flex-row gap-3 justify-between"><div className="flex gap-2">{(['ledger','purchases','wallets'] as const).map(x=><button key={x} onClick={()=>setTab(x)} className={`px-3 py-2 rounded-xl text-xs font-bold ${tab===x?'bg-blue-600 text-white':'bg-[#091129] border border-blue-500/20 text-slate-400'}`}>{x==='ledger'?'Ledger':x==='purchases'?'Purchases':'Wallets'}</button>)}</div><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search member, TXID, package..." className="px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white text-xs"/></div>
    <div className="rounded-2xl bg-[#091129] border border-blue-500/25 overflow-x-auto">
      {loading?<div className="p-12 text-center text-xs text-slate-400">Loading live records…</div>:<table className="w-full min-w-[900px] text-xs"><thead className="bg-[#060b1c] text-slate-400"><tr>{tab==='ledger'?<><th className="p-3 text-left">Date</th><th className="p-3 text-left">Member</th><th className="p-3 text-left">Type</th><th className="p-3 text-left">Flow</th><th className="p-3 text-right">USDT</th><th className="p-3 text-left">Reference</th></>:tab==='purchases'?<><th className="p-3 text-left">Date</th><th className="p-3 text-left">Member</th><th className="p-3 text-left">Package</th><th className="p-3 text-left">Type</th><th className="p-3 text-right">USDT</th><th className="p-3 text-left">Status</th></>:<><th className="p-3 text-left">Member</th><th className="p-3 text-right">Available USDT</th><th className="p-3 text-right">Income</th><th className="p-3 text-right">Basic</th><th className="p-3 text-right">FD</th><th className="p-3 text-left">Updated</th></>}</tr></thead><tbody>{rows.map((r:any)=><tr key={r.id||r.user_id} className="border-t border-blue-500/10">{tab==='ledger'?<><td className="p-3">{new Date(r.created_at).toLocaleString('en-IN')}</td><td className="p-3"><b className="text-white">{r.name||'Member'}</b><div className="text-[10px] text-cyan-400">{r.referral_code||r.user_id}</div></td><td className="p-3">{String(r.type).replace(/_/g,' ')}</td><td className={`p-3 font-bold ${r.flow==='credit'?'text-emerald-400':'text-rose-400'}`}>{r.flow}</td><td className="p-3 text-right font-mono">{money(r.amount)}</td><td className="p-3 font-mono max-w-[250px] truncate">{r.reference_id||'—'}</td></>:tab==='purchases'?<><td className="p-3">{new Date(r.activated_at).toLocaleString('en-IN')}</td><td className="p-3"><b className="text-white">{r.name||'Member'}</b><div className="text-[10px] text-cyan-400">{r.referral_code||r.user_id}</div></td><td className="p-3">{r.package_name}</td><td className="p-3">{r.package_type}</td><td className="p-3 text-right font-mono">{money(r.amount)}</td><td className="p-3 text-emerald-400">{r.status}</td></>:<><td className="p-3"><b className="text-white">{r.name||'Member'}</b><div className="text-[10px] text-cyan-400">{r.referral_code||r.user_id}</div></td><td className="p-3 text-right font-mono">{money(r.fund_wallet)}</td><td className="p-3 text-right font-mono">{money(r.income_wallet)}</td><td className="p-3 text-right font-mono">{money(r.basic_package_active)}</td><td className="p-3 text-right font-mono">{money(r.fd_package_active)}</td><td className="p-3">{new Date(r.updated_at).toLocaleString('en-IN')}</td></>}</tr>)}</tbody></table>}
    </div>
  </div>;
};
