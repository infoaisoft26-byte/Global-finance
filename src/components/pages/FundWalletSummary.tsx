import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

type Tx = {id:string;createdAt:string|null;type:string;flow:string;amount:number;netAmount:number;description:string;referenceId:string;status:string};
const money=(v:number)=>Number(v||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:8});
export const FundWalletSummary: React.FC = () => {
  const { user, refreshWallet } = useAuth();
  const [rows,setRows]=useState<Tx[]>([]);
  const [summary,setSummary]=useState<any>({});
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const load=useCallback(async()=>{
    if(!user)return;
    setLoading(true);setError('');
    try{
      const token=await user.getIdToken();
      const res=await fetch('/api/member-finance-report?report=fund',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
      const body=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(body.error||'Unable to load wallet summary');
      setRows(Array.isArray(body.rows)?body.rows:[]);setSummary(body.summary||{});
    }catch(e:any){setError(e?.message||'Unable to load wallet summary');}
    finally{setLoading(false);}
  },[user]);
  useEffect(()=>{void load();},[load]);
  const refresh=async()=>{await refreshWallet();await load();};
  return <div className="space-y-6">
    <div className="p-6 rounded-2xl bg-[#091129]/90 border border-blue-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div><p className="text-xs uppercase tracking-wider text-cyan-400">Wallet Auditing</p><h2 className="text-2xl font-extrabold text-white mt-1">Fund Wallet Summary</h2><p className="text-sm text-slate-400 mt-1">Deposits, package debits and transfers from the same verified ledger.</p></div>
      <button onClick={()=>void refresh()} disabled={loading} className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs flex items-center gap-2"><RefreshCw className={`w-4 h-4 ${loading?'animate-spin':''}`}/> Refresh</button>
    </div>
    {error&&<div className="p-3 rounded-xl border border-rose-500/30 text-rose-300 text-sm">{error}</div>}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {[{label:'Available Balance',value:summary.availableBalance},{label:'Total Credits',value:summary.totalCredits},{label:'Total Debits',value:summary.totalDebits},{label:'Completed Entries',value:summary.entryCount,plain:true}].map(card=><div key={card.label} className="p-4 rounded-xl bg-[#091129] border border-blue-500/20"><p className="text-[10px] uppercase text-slate-500">{card.label}</p><p className="mt-1 text-lg font-bold text-cyan-300">{card.plain?Number(card.value||0):'USDT '+money(Number(card.value||0))}</p></div>)}
    </div>
    <div className="rounded-2xl overflow-x-auto border border-blue-500/20 bg-[#091129]"><table className="w-full min-w-[900px] text-xs"><thead className="bg-[#060b1c] text-slate-400"><tr>{['Date & Time','Ledger Ref','Operation','Description','Flow','Amount (USDT)','Status'].map(x=><th key={x} className="p-3 text-left">{x}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id} className="border-t border-blue-500/10 text-slate-200"><td className="p-3">{r.createdAt?new Date(r.createdAt).toLocaleString('en-IN'):'—'}</td><td className="p-3 font-mono text-cyan-300">{r.id}</td><td className="p-3">{String(r.type||'').replace(/_/g,' ')}</td><td className="p-3 max-w-[260px]">{r.description||'—'}</td><td className={`p-3 font-bold ${r.flow==='credit'?'text-emerald-300':'text-rose-300'}`}>{r.flow}</td><td className="p-3 font-mono">USDT {money(r.amount)}</td><td className="p-3">{r.status}</td></tr>)}</tbody></table>{!loading&&!rows.length&&<p className="p-8 text-center text-slate-400 text-sm">No ledger entries recorded for this wallet yet.</p>}{loading&&<p className="p-8 text-center text-slate-400">Loading ledger…</p>}</div>
  </div>;
};
