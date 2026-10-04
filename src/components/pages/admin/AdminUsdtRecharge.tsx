import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, RefreshCw, Search, XCircle, ExternalLink } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext.tsx';
import { listUsdtRecharges, reviewUsdtRecharge, type UsdtRechargeRequest } from '../../../services/usdtRechargeService.ts';

export const AdminUsdtRecharge: React.FC = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<UsdtRechargeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [search, setSearch] = useState('');
  const [note, setNote] = useState<Record<string, string>>({});
  const [credit, setCredit] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const data = await listUsdtRecharges(user, 'admin');
      setRequests(data.requests || []);
    } catch (err: any) {
      setError(err?.message || 'Unable to load recharge requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user?.uid]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((r) =>
      [r.id, r.userName, r.userEmail, r.referralCode, r.txHash, r.status]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [requests, search]);

  const review = async (r: UsdtRechargeRequest, action: 'approve' | 'reject') => {
    if (!user) return;
    const reviewNote = (note[r.id] || '').trim();

    let reviewedCredit = '';
    if (action === 'approve') {
      reviewedCredit = (credit[r.id] || r.amountUsdt || '').trim();
      if (!/^(?:0|[1-9][0-9]{0,12})\\.[0-9]{2}$/.test(reviewedCredit) || Number(reviewedCredit) <= 0) {
        setError('For approval, enter the wallet credit with exactly two decimals, e.g. 50.00.');
        return;
      }
    }

    if (!window.confirm(action === 'approve'
      ? `Approve ${r.id} and credit ${reviewedCredit} to the member Fund Wallet?`
      : `Reject ${r.id}?`)) return;

    setBusyId(r.id);
    setError('');
    try {
      await reviewUsdtRecharge(user, r.id, action, reviewNote, action === 'approve' ? reviewedCredit : undefined);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Recharge review failed.');
    } finally {
      setBusyId('');
    }
  };

  const pending = requests.filter(r => r.status === 'pending').length;
  const approved = requests.filter(r => r.status === 'approved').length;
  const rejected = requests.filter(r => r.status === 'rejected').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-blue-500/20 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white">USDT Recharge Requests</h2>
          <p className="text-xs text-slate-400 mt-1">Real database requests only. Approve or reject member BEP20 payment confirmations.</p>
        </div>
        <button onClick={load} disabled={loading} className="px-3 py-2 rounded-xl border border-blue-500/25 bg-[#0d1530] text-cyan-300 text-xs font-semibold flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl bg-[#091129] border border-amber-500/20"><div className="text-[10px] uppercase text-slate-500">Pending</div><div className="text-2xl font-bold text-amber-300 mt-1">{pending}</div></div>
        <div className="p-4 rounded-xl bg-[#091129] border border-emerald-500/20"><div className="text-[10px] uppercase text-slate-500">Approved</div><div className="text-2xl font-bold text-emerald-300 mt-1">{approved}</div></div>
        <div className="p-4 rounded-xl bg-[#091129] border border-rose-500/20"><div className="text-[10px] uppercase text-slate-500">Rejected</div><div className="text-2xl font-bold text-rose-300 mt-1">{rejected}</div></div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ID, name, email, referral code or TXID..." className="w-full pl-9 pr-3 py-3 rounded-xl bg-[#091129] border border-blue-500/25 text-sm text-white" />
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-500 text-xs"><RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />Loading real recharge data…</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center rounded-2xl bg-[#091129] border border-blue-500/20 text-slate-500 text-xs">No recharge requests found in the database.</div>
      ) : (
        <div className="space-y-4">
          {filtered.map(r => (
            <div key={r.id} className="p-5 rounded-2xl bg-[#091129] border border-blue-500/20 shadow-lg">
              <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-cyan-300">{r.id}</span>
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${r.status === 'pending' ? 'bg-amber-500/10 text-amber-300' : r.status === 'approved' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>{r.status}</span>
                  </div>
                  <div className="text-sm font-semibold text-white">{r.userName || 'Unknown member'}</div>
                  <div className="text-xs text-slate-400">{r.userEmail || '—'} {r.referralCode ? `• ${r.referralCode}` : ''}</div>
                  <div className="text-xs text-slate-300">Amount: <strong className="text-cyan-300">{r.amountUsdt} USDT</strong> • {new Date(r.createdAt).toLocaleString('en-IN')}</div>
                  <div className="text-[11px] text-slate-500 break-all">TXID: {r.txHash}</div>
                  {r.proofUrl && <a href={r.proofUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:text-white">Open payment proof <ExternalLink className="w-3 h-3" /></a>}
                  {r.reviewNote && <div className="text-[11px] text-slate-400">Review: {r.reviewNote}</div>}
                </div>

                {r.status === 'pending' && (
                  <div className="w-full xl:w-80 space-y-2">
                    <input value={credit[r.id] ?? r.amountUsdt.replace(/^(\\d+)$/, '$1.00')} onChange={e => setCredit(v => ({...v, [r.id]: e.target.value}))} placeholder="Wallet credit e.g. 50.00" className="w-full px-3 py-2.5 rounded-xl border border-blue-500/25 bg-[#060b1c] text-xs text-white" />
                    <textarea value={note[r.id] || ''} onChange={e => setNote(v => ({...v, [r.id]: e.target.value}))} placeholder="Admin review note..." rows={2} className="w-full px-3 py-2.5 rounded-xl border border-blue-500/25 bg-[#060b1c] text-xs text-white resize-none" />
                    <div className="grid grid-cols-2 gap-2">
                      <button disabled={busyId === r.id} onClick={() => review(r, 'approve')} className="py-2.5 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold disabled:opacity-50"><CheckCircle2 className="w-4 h-4 inline mr-1" />Approve</button>
                      <button disabled={busyId === r.id} onClick={() => review(r, 'reject')} className="py-2.5 rounded-xl bg-rose-600/20 border border-rose-500/30 text-rose-300 text-xs font-bold disabled:opacity-50"><XCircle className="w-4 h-4 inline mr-1" />Reject</button>
                    </div>
                  </div>
                )}

                {r.status !== 'pending' && <div className="flex items-center gap-2 text-xs text-slate-500"><Clock3 className="w-4 h-4" /> Reviewed {r.reviewedAt ? new Date(r.reviewedAt).toLocaleString('en-IN') : '—'}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
