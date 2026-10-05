import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Clock, RefreshCw, Search, CheckCircle2, XCircle, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { getTransactions } from '../../services/financeService.ts';
import { getUserTransactionRequests } from '../../services/transactionRequestService.ts';
import { getLedgerTransactions, type AdjudicationTransaction } from '../../services/transactionHistoryService.ts';
import { DataTable, type Column } from '../common/DataTable.tsx';
import type { TransactionLedger, TransactionRequest } from '../../types/index.ts';

const money = (n: number, type?: string) => {
  const prefix = type === 'salary' ? '₹' : '';
  return `${prefix}${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
};
const referralType = (t: string) => ['referral_bonus','level_bonus','basic_referral','fd_referral','basic_level','fd_level','rd_level'].includes(t) || t.includes('referral') || t.includes('level');

export const TransactionsPage: React.FC = () => {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<TransactionRequest[]>([]);
  const [ledger, setLedger] = useState<AdjudicationTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'all'|'referral'|'requests'>('all');
  const [search, setSearch] = useState('');

  const load = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const [reqs, txns] = await Promise.all([
        getUserTransactionRequests(profile.uid),
        getLedgerTransactions(profile.uid, 500)
      ]);
      setRequests(reqs);
      setLedger(txns);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [profile?.uid]);

  const filteredLedger = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ledger.filter(t => {
      if (tab === 'referral' && !referralType(String(t.type))) return false;
      if (!q) return true;
      return [t.id,t.referenceId,t.type,t.description,t.referredUserName,t.referrerReferralCode,t.referralLevel]
        .filter(v => v !== undefined && v !== null).some(v => String(v).toLowerCase().includes(q));
    });
  }, [ledger, tab, search]);

  const columns: Column<AdjudicationTransaction>[] = [
    { key:'createdAt', header:'Date & Time', render:t=><span className="text-xs text-slate-300 font-mono">{new Date(t.createdAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}</span> },
    { key:'referenceId', header:'Transaction ID', render:t=><div><div className="font-mono text-xs font-bold text-cyan-300">{t.referenceId || t.id}</div><div className="text-[10px] text-slate-500">{t.id}</div></div> },
    { key:'type', header:'Type', render:t=><span className="text-xs font-semibold text-slate-200 capitalize">{String(t.type).replace(/_/g,' ')}</span> },
    { key:'description', header:'Details', render:t=><div className="max-w-md"><div className="text-xs text-slate-300">{t.description}</div>{referralType(String(t.type)) && <div className="mt-1 flex flex-wrap gap-2 text-[10px]"><span className="px-2 py-0.5 rounded bg-violet-500/10 text-violet-300">Level {t.referralLevel ?? '—'}</span><span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300">Level Amount {money(t.referralAmount || t.amount, String(t.type))}</span>{t.referredUserName && <span className="text-slate-400">From: {t.referredUserName}</span>}</div>}</div> },
    { key:'flow', header:'Flow', render:t=><span className={`inline-flex items-center gap-1 text-xs font-bold ${t.flow==='credit'?'text-emerald-400':'text-rose-400'}`}>{t.flow==='credit'?<ArrowDownLeft className="w-3 h-3"/>:<ArrowUpRight className="w-3 h-3"/>}{t.flow==='credit'?'+':'-'}{money(t.amount, String(t.type))}</span> },
    { key:'status', header:'Status', render:t=><span className="text-[10px] font-bold uppercase text-emerald-400">{t.status}</span> }
  ];

  const requestColumns: Column<TransactionRequest>[] = [
    { key:'createdAt',header:'Date & Time',render:r=><span className="text-xs text-slate-300">{new Date(r.createdAt).toLocaleString('en-IN')}</span> },
    { key:'reference',header:'Request ID',render:r=><span className="font-mono text-xs text-cyan-300">{r.reference}</span> },
    { key:'requestType',header:'Type',render:r=><span className="text-xs capitalize">{r.requestType.replace(/_/g,' ')}</span> },
    { key:'amountRupees',header:'Amount',render:r=><span className="font-mono text-xs font-bold">{money(r.amountRupees, r.requestType)}</span> },
    { key:'status',header:'Status',render:r=><span className="text-xs font-bold uppercase">{r.status}</span> }
  ];

  return <div className="space-y-6">
    <div className="flex flex-col sm:flex-row justify-between gap-4 border-b border-blue-500/20 pb-4">
      <div><h2 className="text-xl font-bold text-white">Transaction History</h2><p className="text-xs text-slate-400 mt-1">Complete real account ledger, requests and referral/level earnings.</p></div>
      <button onClick={load} disabled={loading} className="px-3 py-2 rounded-xl bg-[#0e173a] border border-blue-500/30 text-xs text-white flex items-center gap-2"><RefreshCw className={`w-4 h-4 text-cyan-400 ${loading?'animate-spin':''}`}/>Refresh</button>
    </div>
    <div className="flex flex-wrap gap-2">
      {([['all','All Transactions'],['referral','Referral & Level'],['requests','Transaction Requests']] as const).map(([id,label])=><button key={id} onClick={()=>setTab(id)} className={`px-4 py-2 rounded-xl text-xs font-bold ${tab===id?'bg-blue-600 text-white':'bg-[#091129] border border-blue-500/20 text-slate-400'}`}>{label}</button>)}
    </div>
    <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search transaction ID, type, referral, member..." className="w-full pl-9 pr-3 py-3 rounded-xl bg-[#091129] border border-blue-500/25 text-xs text-white"/></div>
    {tab==='requests' ? <DataTable columns={requestColumns} data={requests} emptyMessage="No transaction requests found."/> : <DataTable columns={columns} data={filteredLedger} emptyMessage="No ledger transactions recorded yet."/>}
    {!loading && tab!=='requests' && <div className="p-4 rounded-2xl bg-[#091129] border border-blue-500/20 text-[11px] text-slate-500 flex gap-2"><Users className="w-4 h-4 text-violet-400 shrink-0"/>Referral/level fields are shown from the recorded transaction metadata. No referral amount is invented when the ledger does not contain it.</div>}
  </div>;
};
