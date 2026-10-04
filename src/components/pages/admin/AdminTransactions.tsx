import React, { useEffect, useMemo, useState } from 'react';
import { Eye, RefreshCw, Search, ShieldCheck, ArrowDownLeft, ArrowUpRight, X } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext.tsx';
import { adminGetAllTransactionRequests, adminUpdateTransactionRequestStatus, ALLOWED_TRANSITIONS } from '../../../services/transactionRequestService.ts';
import { getLedgerTransactions, reconcileReferralIncome, type AdjudicationTransaction } from '../../../services/transactionHistoryService.ts';
import { DataTable, type Column } from '../../common/DataTable.tsx';
import type { TransactionRequest, TransactionRequestStatus } from '../../../types/index.ts';

const money=(n:number,type?:string)=>` ${type==='salary'?'₹':'USDT '}${Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:6})}`;
const isReferral=(t:string)=>t.includes('referral')||t.includes('level');

export const AdminTransactions: React.FC=()=>{
 const {user}=useAuth(); const [requests,setRequests]=useState<TransactionRequest[]>([]); const [ledger,setLedger]=useState<AdjudicationTransaction[]>([]);
 const [loading,setLoading]=useState(true); const [repairing,setRepairing]=useState(false); const [repairMessage,setRepairMessage]=useState(''); const [search,setSearch]=useState(''); const [tab,setTab]=useState<'requests'|'ledger'>('requests');
 const [selected,setSelected]=useState<TransactionRequest|null>(null); const [note,setNote]=useState(''); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
 const load=async()=>{setLoading(true);setError('');try{const [r,l]=await Promise.all([adminGetAllTransactionRequests({search}),getLedgerTransactions(undefined,1000)]);setRequests(r);setLedger(l);}catch(e:any){setError(e?.message||'Unable to load transaction control data.')}finally{setLoading(false)}};
 useEffect(()=>{
  load();
  const timer=window.setInterval(()=>{if(document.visibilityState==='visible')load()},10000);
  return()=>window.clearInterval(timer);
 },[]);
 const filteredLedger=useMemo(()=>{const q=search.trim().toLowerCase();if(!q)return ledger;return ledger.filter(t=>[t.id,t.referenceId,t.type,t.description,t.userName,t.userEmail,t.userReferralCode,t.referralLevel,t.referrerReferralCode,t.referredUserName].filter(Boolean).some(v=>String(v).toLowerCase().includes(q)))},[ledger,search]);
 const columns:Column<AdjudicationTransaction>[]=[
 {key:'createdAt',header:'Date',render:t=><span className="text-xs">{new Date(t.createdAt).toLocaleString('en-IN')}</span>},
 {key:'userName',header:'Member',render:t=><div><div className="text-xs font-bold text-white">{t.userName||'Member'}</div><div className="text-[10px] text-cyan-300">{t.userReferralCode||t.userEmail||'—'}</div></div>},
 {key:'referenceId',header:'Transaction ID',render:t=><div><div className="font-mono text-xs text-cyan-300">{t.referenceId||t.id}</div><div className="text-[10px] text-slate-500">{t.type}</div></div>},
 {key:'description',header:'Transaction / Referral Detail',render:t=><div className="max-w-lg text-xs text-slate-300"><div>{t.description}</div>{isReferral(String(t.type))&&<div className="mt-1 flex flex-wrap gap-2"><span className="px-2 py-0.5 rounded bg-violet-500/10 text-violet-300">Level {t.referralLevel??'—'}</span><span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300">Level Amount {money(t.referralAmount||t.amount,String(t.type))}</span>{t.referredUserName&&<span className="text-slate-400">Referred: {t.referredUserName}</span>}{t.referrerReferralCode&&<span className="text-slate-400">Referrer: {t.referrerReferralCode}</span>}</div>}</div>},
 {key:'amount',header:'Amount',render:t=><span className={`font-mono text-xs font-bold ${t.flow==='credit'?'text-emerald-400':'text-rose-400'}`}>{t.flow==='credit'?'+':'-'}{money(t.amount,String(t.type))}</span>},
 {key:'status',header:'Status',render:t=><span className="text-[10px] font-bold uppercase text-emerald-400">{t.status}</span>}
 ];
 const requestColumns:Column<TransactionRequest>[]=[
 {key:'createdAt',header:'Date',render:r=><span className="text-xs">{new Date(r.createdAt).toLocaleString('en-IN')}</span>},
 {key:'reference',header:'Reference',render:r=><span className="font-mono text-xs text-cyan-300">{r.reference}</span>},
 {key:'userName',header:'Member',render:r=><div><div className="text-xs font-bold text-white">{r.userName||r.userEmail}</div><div className="text-[10px] text-cyan-300">{r.userReferralCode||'—'}</div></div>},
 {key:'requestType',header:'Type',render:r=><span className="text-xs capitalize">{r.requestType.replace(/_/g,' ')}</span>},
 {key:'amountRupees',header:'Amount',render:r=><span className="font-mono text-xs font-bold">{money(r.amountRupees,r.requestType)}</span>},
 {key:'status',header:'Status / Action',render:r=><button onClick={()=>{setSelected(r);setNote(r.adminNote||'');setError('')}} className="px-2.5 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-cyan-300 text-[10px] font-bold"><Eye className="w-3 h-3 inline mr-1"/>Inspect</button>}
 ];
 const transition=async(status:TransactionRequestStatus)=>{if(!selected||!user)return;setBusy(true);setError('');try{await adminUpdateTransactionRequestStatus(user.uid,user.email||undefined,selected.id,status,note.trim()||undefined);setSelected(null);await load()}catch(e:any){setError(e?.message||'Action failed')}finally{setBusy(false)}};
 return <div className="space-y-6">
  <div className="flex justify-between gap-4 border-b border-blue-500/20 pb-4"><div><div className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-cyan-400"/><h2 className="text-xl font-bold text-white">Transaction Adjudication Control</h2></div><p className="text-xs text-slate-400 mt-1">All real requests, ledger transactions and recorded referral/level payouts.</p></div><div className="flex gap-2"><button onClick={async()=>{setRepairing(true);setRepairMessage('');setError('');try{const r=await reconcileReferralIncome();setRepairMessage(`Reconciled ${r.distributionsCreated} missing commission entries; USDT ${Number(r.amountCredited||0).toFixed(2)} credited.`);await load()}catch(e:any){setError(e?.message||'Referral reconciliation failed.')}finally{setRepairing(false)}}} disabled={repairing||loading} className="px-3 py-2 rounded-xl bg-violet-600/20 border border-violet-500/30 text-xs text-violet-200 flex items-center gap-2"><RefreshCw className={`w-4 h-4 ${repairing?'animate-spin':''}`}/>Reconcile Referral Income</button><button onClick={load} disabled={loading||repairing} className="px-3 py-2 rounded-xl bg-[#0e173a] border border-blue-500/30 text-xs text-white flex items-center gap-2"><RefreshCw className={`w-4 h-4 text-cyan-400 ${loading?'animate-spin':''}`}/>Refresh</button></div></div>
  {error&&<div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">{error}</div>}
  {repairMessage&&<div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">{repairMessage}</div>}
  <div className="flex gap-2"><button onClick={()=>setTab('requests')} className={`px-4 py-2 rounded-xl text-xs font-bold ${tab==='requests'?'bg-blue-600 text-white':'bg-[#091129] border border-blue-500/20 text-slate-400'}`}>Requests ({requests.length})</button><button onClick={()=>setTab('ledger')} className={`px-4 py-2 rounded-xl text-xs font-bold ${tab==='ledger'?'bg-blue-600 text-white':'bg-[#091129] border border-blue-500/20 text-slate-400'}`}>All Ledger & Referral ({ledger.length})</button></div>
  <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"/><input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>e.key==='Enter'&&load()} placeholder="Search member, email, GF code, transaction ID, referral level..." className="w-full pl-9 pr-3 py-3 rounded-xl bg-[#091129] border border-blue-500/25 text-xs text-white"/></div>
  {tab==='requests'?<DataTable columns={requestColumns} data={requests} emptyMessage="No transaction requests found."/>:<DataTable columns={columns} data={filteredLedger} emptyMessage="No ledger transactions found."/>}
  {selected&&<div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"><div className="max-w-xl w-full rounded-2xl bg-[#0b132b] border border-blue-500/30 p-6 space-y-4"><div className="flex justify-between"><h3 className="font-bold text-white">Adjudicate {selected.reference}</h3><button onClick={()=>setSelected(null)}><X className="w-5 h-5 text-slate-400"/></button></div><div className="grid grid-cols-2 gap-3 text-xs"><div><span className="text-slate-500">Member</span><div className="text-white font-bold">{selected.userName}</div></div><div><span className="text-slate-500">GF Code</span><div className="text-cyan-300">{selected.userReferralCode}</div></div><div><span className="text-slate-500">Type</span><div className="text-white">{selected.requestType}</div></div><div><span className="text-slate-500">Amount</span><div className="text-white">{money(selected.amountRupees)}</div></div></div><textarea value={note} onChange={e=>setNote(e.target.value)} rows={3} placeholder="Admin note / review observation..." className="w-full rounded-xl bg-[#060b1c] border border-blue-500/30 p-3 text-xs text-white"/><div className="flex flex-wrap justify-end gap-2">{ALLOWED_TRANSITIONS[selected.status]?.map(s=><button key={s} disabled={busy} onClick={()=>transition(s)} className="px-3 py-2 rounded-xl bg-blue-600/20 border border-blue-500/30 text-cyan-300 text-xs font-bold capitalize">{s.replace('_',' ')}</button>)}</div></div></div>}
 </div>;
};
