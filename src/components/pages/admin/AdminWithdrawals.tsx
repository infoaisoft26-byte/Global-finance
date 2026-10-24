import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, CheckCircle2, Clock3, RefreshCw, Search, ShieldCheck, X, XCircle, Copy } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext.tsx';
import { adminGetAllTransactionRequests, adminUpdateTransactionRequestStatus } from '../../../services/transactionRequestService.ts';
import { DataTable, type Column } from '../../common/DataTable.tsx';
import type { TransactionRequest, TransactionRequestStatus } from '../../../types/index.ts';

type StatusFilter = 'all' | 'pending' | 'under_review' | 'approved' | 'rejected' | 'completed' | 'processing' | 'failed';
const money = (n: number) => `USDT ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`;
const statusTone: Record<string, string> = {
  pending: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  under_review: 'text-sky-300 bg-sky-500/10 border-sky-500/30',
  approved: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  rejected: 'text-rose-300 bg-rose-500/10 border-rose-500/30',
  completed: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  processing: 'text-violet-300 bg-violet-500/10 border-violet-500/30',
  failed: 'text-rose-300 bg-rose-500/10 border-rose-500/30',
};

export const AdminWithdrawals: React.FC = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<TransactionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selected, setSelected] = useState<TransactionRequest | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await adminGetAllTransactionRequests({ requestType: 'withdrawal' });
      setRequests(rows.filter(r => r.requestType === 'withdrawal'));
    } catch (e: any) {
      setError(e?.message || 'Withdrawal requests could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter(r => {
      const statusOk = statusFilter === 'all' || r.status === statusFilter;
      const m = (r.metadata || {}) as Record<string, any>;
      const address = String(m.destinationWalletAddress || m.walletAddress || m.destination || '');
      const searchOk = !q || [r.reference, r.id, r.userName, r.userEmail, r.userReferralCode, r.status, address]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(q));
      return statusOk && searchOk;
    });
  }, [requests, search, statusFilter]);

  const counts = useMemo(() => ({
    pending: requests.filter(r => ['pending', 'under_review'].includes(r.status)).length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
    completed: requests.filter(r => r.status === 'completed').length,
    refunded: requests.filter(r => Boolean(r.metadata?.refundIssued || r.metadata?.refundedAt)).length,
    total: requests.length,
    requested: requests.reduce((sum, r) => sum + Number(r.amountRupees || 0), 0),
    fees: requests.filter(r => !r.metadata?.refundIssued).reduce((sum, r) => sum + Number(r.feeRupees || r.metadata?.feeAmountUsdt || 0), 0),
    net: requests.filter(r => !r.metadata?.refundIssued).reduce((sum, r) => sum + Number(r.netAmountRupees ?? r.metadata?.netPayoutUsdt ?? 0), 0),
    refundedAmount: requests.filter(r => Boolean(r.metadata?.refundIssued || r.metadata?.refundedAt)).reduce((sum, r) => sum + Number(r.amountRupees || 0), 0),
  }), [requests]);

  const review = async (status: Extract<TransactionRequestStatus, 'approved' | 'rejected'>) => {
    if (!selected || !user || busy) return;
    if (status === 'rejected' && !window.confirm('Reject this withdrawal? The system will attempt an idempotent refund only after verifying the matching wallet debit.')) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await adminUpdateTransactionRequestStatus(user.uid, user.email || undefined, selected.id, status, note.trim() || undefined, undefined, await user.getIdToken());
      setNotice(status === 'rejected'
        ? 'Withdrawal rejected. The server completed or confirmed the safe refund flow.'
        : 'Withdrawal marked approved. No second wallet debit was made.');
      setSelected(null);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Withdrawal review failed. Do not retry repeatedly; verify the wallet and ledger first.');
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<TransactionRequest>[] = [
    { key: 'createdAt', header: 'Requested', render: r => <span className="text-xs text-slate-300">{r.createdAt ? new Date(r.createdAt).toLocaleString('en-IN') : '—'}</span> },
    { key: 'reference', header: 'Reference', render: r => <span className="font-mono text-xs text-cyan-300">{r.reference || r.id}</span> },
    { key: 'member', header: 'Member', render: r => <div><div className="text-xs font-bold text-white">{r.userName || r.userEmail || 'Member'}</div><div className="text-[10px] text-cyan-300">{r.userReferralCode || '—'}</div></div> },
    { key: 'amountRupees', header: 'Amount', render: r => <span className="font-mono text-xs font-bold text-white">{money(r.amountRupees)}</span> },
    { key: 'feeRupees', header: 'Fee / Net Payout', render: r => { const refunded = Boolean(r.metadata?.refundIssued || r.metadata?.refundedAt); const fee = Number(r.feeRupees ?? r.metadata?.feeAmountUsdt ?? 0); const net = Number(r.netAmountRupees ?? r.metadata?.netPayoutUsdt ?? (Number(r.amountRupees || 0) - fee)); return <div className="text-[11px]"><div className="text-slate-300">Fee ({Number(r.metadata?.feePercent ?? 5)}%): {money(fee)}</div><div className="font-bold text-emerald-300">Net: {money(net)}</div>{refunded && <div className="mt-1 font-bold text-emerald-300">Refunded: {money(r.amountRupees)}</div>}</div>; } },
    { key: 'wallet', header: 'Destination Wallet', render: r => {
      const m = (r.metadata || {}) as Record<string, any>;
      const address = String(m.destinationWalletAddress || m.walletAddress || m.destination || '');
      return <div className="max-w-[190px]"><div className="break-all font-mono text-[10px] text-cyan-200" title={address}>{address || 'Wallet address missing'}</div>{address && <button type="button" onClick={() => void navigator.clipboard?.writeText(address)} className="mt-1 inline-flex items-center gap-1 text-[10px] text-blue-300 underline"><Copy className="h-3 w-3" />Copy</button>}</div>;
    }},
    { key: 'status', header: 'Status / Review', render: r => <div className="space-y-2"><span className={`inline-flex rounded-lg border px-2 py-1 text-[10px] font-bold uppercase ${statusTone[r.status] || 'text-slate-300 border-slate-600'}`}>{r.status.replace(/_/g, ' ')}</span><div><button type="button" onClick={() => { setSelected(r); setNote(r.adminNote || ''); setError(''); setNotice(''); }} className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-[10px] font-bold text-cyan-200">Review</button></div></div> },
  ];

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-500/20 pb-4">
      <div className="flex items-center gap-3"><div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3"><Banknote className="h-6 w-6 text-cyan-300" /></div><div><h2 className="text-xl font-extrabold text-white">Withdrawal Management</h2><p className="mt-1 text-xs text-slate-400">Dedicated queue for withdrawal review, destination wallet, approval and safe rejection/refund.</p></div></div>
      <button type="button" onClick={() => void load()} disabled={loading || busy} className="inline-flex items-center gap-2 rounded-xl border border-blue-500/30 bg-[#0e173a] px-4 py-2.5 text-xs font-bold text-white"><RefreshCw className={`h-4 w-4 text-cyan-300 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
    </div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <button type="button" onClick={() => setStatusFilter('all')} className={`rounded-2xl border p-4 text-left ${statusFilter === 'all' ? 'border-cyan-400/60 bg-cyan-500/10' : 'border-blue-500/20 bg-[#091129]'}`}><div className="text-xs text-slate-400">All withdrawals</div><div className="mt-1 text-2xl font-extrabold text-white">{counts.total}</div></button>
      <button type="button" onClick={() => setStatusFilter('pending')} className={`rounded-2xl border p-4 text-left ${statusFilter === 'pending' ? 'border-amber-400/60 bg-amber-500/10' : 'border-blue-500/20 bg-[#091129]'}`}><div className="flex items-center gap-1 text-xs text-amber-200"><Clock3 className="h-3.5 w-3.5" />Pending</div><div className="mt-1 text-2xl font-extrabold text-white">{requests.filter(r => r.status === 'pending').length}</div><div className="text-[10px] text-slate-500">Under review: {requests.filter(r => r.status === 'under_review').length}</div></button>
      <button type="button" onClick={() => setStatusFilter('approved')} className={`rounded-2xl border p-4 text-left ${statusFilter === 'approved' ? 'border-emerald-400/60 bg-emerald-500/10' : 'border-blue-500/20 bg-[#091129]'}`}><div className="flex items-center gap-1 text-xs text-emerald-200"><CheckCircle2 className="h-3.5 w-3.5" />Approved</div><div className="mt-1 text-2xl font-extrabold text-white">{counts.approved}</div></button>
      <button type="button" onClick={() => setStatusFilter('rejected')} className={`rounded-2xl border p-4 text-left ${statusFilter === 'rejected' ? 'border-rose-400/60 bg-rose-500/10' : 'border-blue-500/20 bg-[#091129]'}`}><div className="flex items-center gap-1 text-xs text-rose-200"><XCircle className="h-3.5 w-3.5" />Rejected</div><div className="mt-1 text-2xl font-extrabold text-white">{counts.rejected}</div></button>
    </div>

    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <div className="rounded-xl border border-blue-500/20 bg-[#091129] p-3"><div className="text-[10px] text-slate-400">Total requested</div><div className="mt-1 text-lg font-extrabold text-white">{money(counts.requested)}</div><div className="text-[10px] text-slate-500">{counts.total} requests</div></div>
      <div className="rounded-xl border border-amber-500/20 bg-[#091129] p-3"><div className="text-[10px] text-slate-400">Potential fees (not refunded)</div><div className="mt-1 text-lg font-extrabold text-amber-200">{money(counts.fees)}</div><div className="text-[10px] text-slate-500">5% default, per request record</div></div>
      <div className="rounded-xl border border-emerald-500/20 bg-[#091129] p-3"><div className="text-[10px] text-slate-400">Estimated net payout</div><div className="mt-1 text-lg font-extrabold text-emerald-200">{money(counts.net)}</div><div className="text-[10px] text-slate-500">Excludes requests marked refunded</div></div>
      <div className="rounded-xl border border-rose-500/20 bg-[#091129] p-3"><div className="text-[10px] text-slate-400">Refunded total</div><div className="mt-1 text-lg font-extrabold text-white">{money(counts.refundedAmount)}</div><div className="text-[10px] text-slate-500">{counts.refunded} refunded requests · {counts.rejected} rejected</div></div>
    </div>

    {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">{error}</div>}
    {notice && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">{notice}</div>}

    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, GF ID, reference or wallet address..." className="w-full rounded-xl border border-blue-500/25 bg-[#091129] py-3 pl-9 pr-3 text-xs text-white outline-none focus:border-cyan-400/60" /></div>
      <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)} className="rounded-xl border border-blue-500/25 bg-[#091129] px-3 py-3 text-xs text-white"><option value="all">All statuses</option><option value="pending">Pending</option><option value="under_review">Under review</option><option value="approved">Approved</option><option value="processing">Processing</option><option value="completed">Completed</option><option value="rejected">Rejected</option><option value="failed">Failed</option></select>
    </div>

    <div className="overflow-hidden rounded-2xl border border-blue-500/20 bg-[#080f24]">
      <div className="flex items-center justify-between border-b border-blue-500/15 px-4 py-3"><div className="text-sm font-bold text-white">Withdrawal Requests <span className="ml-1 text-xs font-normal text-slate-400">({filtered.length})</span></div><div className="text-[10px] text-slate-500">Data refreshes when you press Refresh</div></div>
      <DataTable columns={columns} data={filtered} emptyMessage={loading ? 'Loading withdrawal requests…' : 'No withdrawal requests match this filter.'} />
    </div>

    {selected && <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/80 p-3 sm:p-5"><div className="my-auto w-full max-w-2xl space-y-4 rounded-2xl border border-cyan-500/25 bg-[#0b132b] p-5 shadow-2xl sm:p-6">
      <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-cyan-300" /><h3 className="text-lg font-extrabold text-white">Review Withdrawal</h3></div><p className="mt-1 font-mono text-xs text-cyan-300">{selected.reference || selected.id}</p></div><button type="button" onClick={() => setSelected(null)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"><X className="h-5 w-5" /></button></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-blue-500/15 bg-[#070d1e] p-3"><div className="text-[10px] uppercase text-slate-500">Member / GF ID</div><div className="mt-1 text-sm font-bold text-white">{selected.userName || selected.userEmail || 'Member'}</div><div className="text-xs text-cyan-300">{selected.userReferralCode || '—'}</div></div>
        <div className="rounded-xl border border-blue-500/15 bg-[#070d1e] p-3"><div className="text-[10px] uppercase text-slate-500">Requested amount</div><div className="mt-1 text-lg font-extrabold text-white">{money(selected.amountRupees)}</div><div className="text-[11px] text-slate-400">Fee {money(selected.feeRupees)} · Net {money(selected.netAmountRupees)}</div></div>
        <div className="rounded-xl border border-blue-500/15 bg-[#070d1e] p-3 sm:col-span-2"><div className="text-[10px] uppercase text-slate-500">Destination USDT wallet</div><div className="mt-2 break-all font-mono text-xs text-cyan-200">{String((selected.metadata || {}).destinationWalletAddress || (selected.metadata || {}).walletAddress || (selected.metadata || {}).destination || 'Wallet address missing')}</div><button type="button" onClick={() => { const m = selected.metadata || {}; const address = String(m.destinationWalletAddress || m.walletAddress || m.destination || ''); if (address) void navigator.clipboard?.writeText(address); }} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 px-3 py-1.5 text-[10px] text-cyan-200"><Copy className="h-3 w-3" />Copy wallet address</button></div>
        <div className="rounded-xl border border-blue-500/15 bg-[#070d1e] p-3"><div className="text-[10px] uppercase text-slate-500">Current status</div><div className={`mt-1 inline-flex rounded-lg border px-2 py-1 text-xs font-bold uppercase ${statusTone[selected.status] || 'text-slate-300 border-slate-600'}`}>{selected.status.replace(/_/g, ' ')}</div></div>
        <div className="rounded-xl border border-blue-500/15 bg-[#070d1e] p-3"><div className="text-[10px] uppercase text-slate-500">Submitted</div><div className="mt-1 text-xs text-white">{selected.createdAt ? new Date(selected.createdAt).toLocaleString('en-IN') : '—'}</div><div className="mt-1 break-all text-[10px] text-slate-500">{selected.userEmail || ''}</div></div>
      </div>
      <label className="block text-xs font-semibold text-slate-300">Admin note (optional)<textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Add review note or rejection reason…" className="mt-2 w-full rounded-xl border border-blue-500/25 bg-[#070d1e] p-3 text-xs text-white outline-none focus:border-cyan-400/60" /></label>
      {['pending', 'under_review', 'approved'].includes(selected.status) ? <div className="flex flex-col-reverse gap-2 border-t border-blue-500/15 pt-4 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={() => void review('rejected')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs font-bold text-rose-200 disabled:opacity-50"><XCircle className="h-4 w-4" />Reject &amp; Refund</button>{selected.status !== 'approved' && <button type="button" disabled={busy} onClick={() => void review('approved')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs font-bold text-emerald-200 disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />Approve Withdrawal</button>}</div> : <div className="rounded-xl border border-slate-500/20 bg-slate-500/5 p-3 text-xs text-slate-400">This request is in a final or non-reviewable status.</div>}
      {busy && <div className="flex items-center gap-2 text-xs text-cyan-200"><RefreshCw className="h-4 w-4 animate-spin" />Saving securely… please do not close this window.</div>}
      <p className="text-[10px] leading-relaxed text-slate-500">Approval does not debit the member wallet again. Rejection uses the server-side matching debit/refund check; if records do not match, it stops safely instead of issuing an unverified credit.</p>
    </div></div>}
  </div>;
};
