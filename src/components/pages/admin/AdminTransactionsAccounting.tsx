import React, { useEffect, useState } from 'react';
import { RefreshCw, ExternalLink, CheckCircle2, XCircle, Clock3 } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext.tsx';
import { listUsdtRecharges, reviewUsdtRecharge, type UsdtRechargeRequest } from '../../../services/usdtRechargeService.ts';
import { AdminTransactions } from './AdminTransactions.tsx';

export const AdminTransactionsAccounting: React.FC = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<UsdtRechargeRequest[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState<Record<string,string>>({});
  const [credit, setCredit] = useState<Record<string,string>>({});

  const load = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const result = await listUsdtRecharges(user,'admin');
      setRows(result.requests); setEnabled(result.enabled); setError('');
    } catch (err: any) { setError(err?.message || 'Unable to load recharge accounting'); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, [user?.uid]);

  const review = async (row: UsdtRechargeRequest, action: 'approve' | 'reject') => {
    if (!user) return;
    setBusy(true); setError('');
    try {
      await reviewUsdtRecharge(user,row.id,action,note[row.id] || '',credit[row.id]);
      await load();
    } catch (err: any) { setError(err?.message || 'Review failed'); }
    finally { setBusy(false); }
  };

  const total = (status?: string) => rows.filter(r => !status || r.status === status).reduce((sum,r) => sum + Number(r.amountUsdt),0).toFixed(2);
  return <div className="space-y-8">
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-white">USDT BEP20 Recharge Accounting</h2><p className="text-xs text-slate-400">Server-side BSC verification, admin review, and INR fund credit.</p></div><button onClick={load} disabled={busy} className="px-3 py-2 rounded-xl border border-blue-500/30 text-xs text-white flex items-center gap-2"><RefreshCw className={`w-4 h-4 ${busy?'animate-spin':''}`}/>Refresh</button></div>
      {error && <div role="alert" className="p-3 rounded-xl border border-rose-500/40 text-rose-300 text-xs">{error}</div>}
      {!enabled && <div className="p-3 rounded-xl border border-amber-500/40 text-amber-300 text-xs">Recharge approval is disabled until the server payment settings and BSC RPC are configured.</div>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[['Submitted',total()],['Pending',total('pending')],['Approved',total('approved')],['Rejected',total('rejected')]].map(([label,value])=><div key={label} className="p-4 rounded-xl bg-[#091129] border border-blue-500/25"><div className="text-xs text-slate-400">{label}</div><div className="mt-1 font-bold text-white">USDT {value}</div></div>)}</div>
      <div className="space-y-3">{rows.map(row=><div key={row.id} className="p-4 rounded-2xl bg-[#091129] border border-blue-500/25 text-xs">
        <div className="flex flex-wrap justify-between gap-3"><div className="text-white font-bold">{row.userName || row.userEmail} <span className="text-cyan-400">{row.referralCode}</span></div><span className={row.status==='approved'?'text-emerald-400':row.status==='rejected'?'text-rose-400':'text-amber-400'}>{row.status==='approved'?<CheckCircle2 className="w-4 h-4 inline mr-1"/>:row.status==='rejected'?<XCircle className="w-4 h-4 inline mr-1"/>:<Clock3 className="w-4 h-4 inline mr-1"/>}{row.status.toUpperCase()}</span></div>
        <div className="mt-2 text-slate-300">{row.id} • USDT {row.amountUsdt} • {new Date(row.createdAt).toLocaleString('en-IN')}{row.creditInr?` • ₹${row.creditInr} credited`:''}</div>
        <a href={`https://bscscan.com/tx/${row.txHash}`} target="_blank" rel="noreferrer" className="mt-2 break-all font-mono text-cyan-300 underline inline-flex items-center gap-1">{row.txHash}<ExternalLink className="w-3 h-3"/></a>
        {row.proofUrl && <a href={row.proofUrl} target="_blank" rel="noreferrer" className="ml-3 text-cyan-300 underline">View screenshot</a>}
        {row.status==='pending' && enabled && <div className="mt-4 grid gap-2 md:grid-cols-[1fr_160px_auto_auto]">
          <input aria-label="Review note and conversion basis" value={note[row.id]||''} onChange={e=>setNote(p=>({...p,[row.id]:e.target.value}))} placeholder="Verification note and INR rate basis" className="p-2 rounded-lg bg-[#060b1c] border border-blue-500/30 text-white"/>
          <input aria-label="INR fund credit" value={credit[row.id]||''} onChange={e=>setCredit(p=>({...p,[row.id]:e.target.value}))} placeholder="INR credit e.g. 850.00" className="p-2 rounded-lg bg-[#060b1c] border border-blue-500/30 text-white"/>
          <button disabled={busy} onClick={()=>review(row,'approve')} className="px-3 py-2 rounded-lg bg-emerald-700 text-white disabled:opacity-50">Approve + Credit</button>
          <button disabled={busy} onClick={()=>review(row,'reject')} className="px-3 py-2 rounded-lg bg-rose-700 text-white disabled:opacity-50">Reject</button>
        </div>}
        {row.reviewNote && <div className="mt-2 text-slate-400">Review: {row.reviewNote}</div>}
      </div>)}{!rows.length && <div className="p-8 text-center text-slate-500 text-xs">{busy?'Loading…':'No USDT recharge requests.'}</div>}</div>
    </section>
    <div className="border-t border-blue-500/20 pt-7"><AdminTransactions /></div>
  </div>;
};
