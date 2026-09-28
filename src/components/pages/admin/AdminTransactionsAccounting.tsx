import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, ExternalLink, Image as ImageIcon, RefreshCw, ReceiptText, WalletCards, XCircle } from 'lucide-react';
import { AdminTransactions } from './AdminTransactions.tsx';
import { adminGetAllTransactionRequests } from '../../../services/transactionRequestService.ts';
import type { TransactionRequest } from '../../../types/index.ts';

const money = (value: number) => Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const AdminTransactionsAccounting: React.FC = () => {
  const [recharges, setRecharges] = useState<TransactionRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRecharges = async () => {
    setLoading(true);
    try {
      const rows = await adminGetAllTransactionRequests({ requestType: 'recharge', status: 'all' });
      setRecharges(rows);
    } catch (err) {
      console.error('Admin recharge accounting load failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRecharges(); }, []);

  const accounting = useMemo(() => {
    const pendingStates = new Set(['pending', 'under_review', 'approved', 'processing']);
    return recharges.reduce((acc, item) => {
      const amount = Number(item.amountRupees || 0);
      acc.totalSubmitted += amount;
      if (pendingStates.has(item.status)) acc.pending += amount;
      if (item.status === 'completed') acc.completed += amount;
      if (item.status === 'rejected' || item.status === 'failed' || item.status === 'cancelled') acc.rejected += amount;
      if ((item.metadata as any)?.proofUploaded) acc.proofCount += 1;
      return acc;
    }, { totalSubmitted: 0, pending: 0, completed: 0, rejected: 0, proofCount: 0 });
  }, [recharges]);

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ReceiptText className="w-5 h-5 text-cyan-400" />
              <h2 className="text-xl font-bold text-white">Payment Accounting</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">Every member recharge submitted with a payment screenshot appears here for accounting and verification.</p>
          </div>
          <button onClick={loadRecharges} disabled={loading} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0e173a] border border-blue-500/30 text-xs font-semibold text-white disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 text-cyan-400 ${loading ? 'animate-spin' : ''}`} /> Refresh Accounting
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="p-4 rounded-2xl bg-[#091129] border border-blue-500/25"><div className="text-[10px] uppercase tracking-wider text-slate-500">Submitted</div><div className="text-lg font-bold text-white mt-1">USDT {money(accounting.totalSubmitted)}</div><div className="text-[10px] text-slate-500 mt-1">{recharges.length} recharge requests</div></div>
          <div className="p-4 rounded-2xl bg-[#091129] border border-amber-500/25"><div className="text-[10px] uppercase tracking-wider text-slate-500">Pending Verification</div><div className="text-lg font-bold text-amber-400 mt-1">USDT {money(accounting.pending)}</div></div>
          <div className="p-4 rounded-2xl bg-[#091129] border border-emerald-500/25"><div className="text-[10px] uppercase tracking-wider text-slate-500">Completed / Credited</div><div className="text-lg font-bold text-emerald-400 mt-1">USDT {money(accounting.completed)}</div></div>
          <div className="p-4 rounded-2xl bg-[#091129] border border-rose-500/25"><div className="text-[10px] uppercase tracking-wider text-slate-500">Rejected / Failed</div><div className="text-lg font-bold text-rose-400 mt-1">USDT {money(accounting.rejected)}</div></div>
          <div className="p-4 rounded-2xl bg-[#091129] border border-cyan-500/25"><div className="text-[10px] uppercase tracking-wider text-slate-500">Proof Uploaded</div><div className="text-lg font-bold text-cyan-400 mt-1">{accounting.proofCount}</div><div className="text-[10px] text-slate-500 mt-1">screenshots attached</div></div>
        </div>

        <div className="rounded-2xl bg-[#091129] border border-blue-500/25 overflow-hidden">
          <div className="px-4 py-3 border-b border-blue-500/20 flex items-center gap-2"><WalletCards className="w-4 h-4 text-cyan-400" /><span className="text-sm font-bold text-white">Recharge Payment Register</span></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-xs">
              <thead className="bg-[#060b1c] text-slate-400"><tr><th className="text-left px-4 py-3">Member</th><th className="text-left px-4 py-3">Reference</th><th className="text-right px-4 py-3">Amount</th><th className="text-left px-4 py-3">Payment Ref</th><th className="text-left px-4 py-3">Proof</th><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Submitted</th></tr></thead>
              <tbody className="divide-y divide-blue-500/10">
                {recharges.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">{loading ? 'Loading recharge accounting…' : 'No recharge payments submitted yet.'}</td></tr> : recharges.map(item => {
                  const meta = (item.metadata || {}) as any;
                  const proofUrl = meta.paymentProofUrl as string | undefined;
                  const paymentRef = meta.paymentReference as string | undefined;
                  return <tr key={item.id} className="hover:bg-blue-950/20">
                    <td className="px-4 py-3"><div className="font-semibold text-white">{item.userName || 'Member'}</div><div className="text-[10px] text-cyan-400 font-mono">{item.userReferralCode || 'GF—'}</div><div className="text-[10px] text-slate-500">{item.userEmail}</div></td>
                    <td className="px-4 py-3 font-mono text-cyan-300 font-bold">{item.reference}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-white">USDT {money(item.amountRupees)}</td>
                    <td className="px-4 py-3 font-mono text-slate-300 max-w-[180px] truncate" title={paymentRef || ''}>{paymentRef || '—'}</td>
                    <td className="px-4 py-3">{proofUrl ? <a href={proofUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/25 text-cyan-300 font-semibold"><ImageIcon className="w-3.5 h-3.5" /> View screenshot <ExternalLink className="w-3 h-3" /></a> : <span className="text-slate-500">No proof</span>}</td>
                    <td className="px-4 py-3">{item.status === 'completed' ? <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold"><CheckCircle2 className="w-3.5 h-3.5" /> Completed</span> : item.status === 'rejected' || item.status === 'failed' ? <span className="inline-flex items-center gap-1 text-rose-400 font-semibold"><XCircle className="w-3.5 h-3.5" /> {item.status}</span> : <span className="inline-flex items-center gap-1 text-amber-400 font-semibold"><Clock3 className="w-3.5 h-3.5" /> {item.status.replace(/_/g, ' ')}</span>}</td>
                    <td className="px-4 py-3 text-slate-400">{new Date(item.createdAt).toLocaleString('en-IN')}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-blue-500/20 text-[10px] text-slate-500">Accounting rule: screenshot submission creates a pending record only. Fund wallet is credited only when the admin completes the recharge verification workflow below.</div>
        </div>
      </section>

      <div className="border-t border-blue-500/20 pt-7">
        <AdminTransactions />
      </div>
    </div>
  );
};
