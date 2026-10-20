import React, { useMemo, useState } from 'react';
import { Download, RefreshCw, ArrowLeftRight, ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext.tsx';

type TransferRow = {
  id: string; reference: string; amount: number; fee: number; netAmount: number;
  status: string; description: string; note: string;
  senderUserId: string; senderName: string; senderEmail: string; senderGfId: string;
  recipientUserId: string; recipientName: string; recipientEmail: string; recipientGfId: string;
  creditLedgerId: string; creditedAmount: number | null; creditStatus: string;
  creditedAt: string | null; reconciliationStatus: string; createdAt: string;
};
type Report = {
  generatedAt: string;
  summary: { completedCount: number; completedAmount: number; nonCompletedCount: number; todayCount: number; todayAmount: number; reconciliationIssues: number; incomeToFundCount: number; incomeToFundAmount: number };
  transfers: TransferRow[];
};
const money = (value: unknown) => 'USDT ' + Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 });
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export const AdminP2PReport: React.FC = () => {
  const { user } = useAuth();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');

  const load = async () => {
    if (!user) return;
    setLoading(true); setError('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin-p2p-report', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to load P2P report.');
      setReport(data);
    } catch (e: any) {
      setError(e?.message || 'Unable to load P2P report.');
    } finally { setLoading(false); }
  };

  React.useEffect(() => { void load(); }, [user?.uid]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (report?.transfers || []).filter(row => {
      const matchesSearch = !q || [row.reference,row.senderName,row.senderEmail,row.senderGfId,row.recipientName,row.recipientEmail,row.recipientGfId,row.note,row.reconciliationStatus].some(v => String(v || '').toLowerCase().includes(q));
      return matchesSearch && (status === 'all' || row.reconciliationStatus === status);
    });
  }, [report, search, status]);

  const exportCsv = () => {
    const keys: (keyof TransferRow)[] = ['createdAt','reference','senderGfId','senderName','senderEmail','recipientGfId','recipientName','recipientEmail','amount','fee','netAmount','status','creditStatus','creditedAmount','reconciliationStatus','note','creditLedgerId'];
    const csv = [keys.join(','), ...rows.map(row => keys.map(key => `"${String(row[key] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = `global-finance-p2p-accounting-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const summary = report?.summary;
  return <div className="space-y-6">
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-blue-500/20 pb-4">
      <div><div className="flex items-center gap-2"><ArrowLeftRight className="w-5 h-5 text-cyan-400"/><h2 className="text-xl font-bold text-white">P2P & GF ID Fund Transfer Accounting</h2></div>
        <p className="text-xs text-slate-400 mt-1">Sender debit, recipient credit, ledger references and reconciliation status for direct GF ID to GF ID transfers.</p>
        {report?.generatedAt && <p className="text-[10px] text-cyan-400 mt-1">Report generated: {dateTime(report.generatedAt)} · Manual refresh only</p>}
      </div>
      <div className="flex gap-2"><button onClick={exportCsv} disabled={!rows.length} className="px-3 py-2 rounded-xl bg-[#0e173a] border border-blue-500/30 text-xs text-white flex items-center gap-2 disabled:opacity-40"><Download className="w-4 h-4"/>Export CSV</button>
      <button onClick={() => void load()} disabled={loading} className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs flex items-center gap-2 disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}/>Refresh</button></div>
    </div>
    {error && <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">{error}</div>}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div className="p-4 rounded-2xl bg-[#091129] border border-cyan-500/25"><div className="text-[10px] uppercase text-slate-500">Completed P2P</div><div className="text-lg font-bold text-white">{summary?.completedCount ?? '—'}</div><div className="text-xs text-cyan-300">{money(summary?.completedAmount)}</div></div>
      <div className="p-4 rounded-2xl bg-[#091129] border border-emerald-500/25"><div className="text-[10px] uppercase text-slate-500">Today (IST)</div><div className="text-lg font-bold text-white">{summary?.todayCount ?? '—'} transfers</div><div className="text-xs text-emerald-300">{money(summary?.todayAmount)}</div></div>
      <div className="p-4 rounded-2xl bg-[#091129] border border-violet-500/25"><div className="text-[10px] uppercase text-slate-500">Income → Fund transfers</div><div className="text-lg font-bold text-white">{summary?.incomeToFundCount ?? '—'}</div><div className="text-xs text-violet-300">{money(summary?.incomeToFundAmount)}</div></div>
      <div className={`p-4 rounded-2xl bg-[#091129] border ${(summary?.reconciliationIssues || 0) ? 'border-rose-500/40' : 'border-emerald-500/25'}`}><div className="text-[10px] uppercase text-slate-500">Ledger Reconciliation</div><div className="text-lg font-bold text-white">{summary?.reconciliationIssues ?? '—'} issues</div><div className="text-xs text-slate-400">{summary?.nonCompletedCount ?? 0} non-completed debits</div></div>
    </div>
    <div className="flex flex-col sm:flex-row gap-3 justify-between">
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search GF ID, name, email, reference…" className="w-full sm:max-w-md px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white text-xs"/>
      <select value={status} onChange={e => setStatus(e.target.value)} className="px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white text-xs">
        <option value="all">All reconciliation statuses</option><option value="balanced">Balanced</option><option value="missing_credit">Missing recipient credit</option><option value="credit_not_completed">Recipient credit not completed</option><option value="amount_mismatch">Amount mismatch</option><option value="debit_not_completed">Sender debit not completed</option>
      </select>
    </div>
    <div className="rounded-2xl bg-[#091129] border border-blue-500/25 overflow-x-auto">
      {loading && !report ? <div className="p-12 text-center text-xs text-slate-400">Loading P2P accounting records…</div> : <table className="w-full min-w-[1450px] text-xs">
        <thead className="bg-[#060b1c] text-slate-400"><tr>{['Date','Reference','Sender','Recipient','Amount','Recipient credit','Accounting check','Note'].map(h=><th key={h} className="p-3 text-left">{h}</th>)}</tr></thead>
        <tbody>{rows.map(row=><tr key={row.id} className="border-t border-blue-500/10 hover:bg-blue-500/5">
          <td className="p-3 whitespace-nowrap">{dateTime(row.createdAt)}</td>
          <td className="p-3"><div className="font-mono text-cyan-300">{row.reference || row.id}</div><div className="text-[10px] text-slate-500">Debit: {row.id}</div><div className="text-[10px] text-slate-500">Credit: {row.creditLedgerId || 'MISSING'}</div></td>
          <td className="p-3"><b className="text-white">{row.senderName}</b><div className="text-cyan-300">{row.senderGfId || '—'}</div><div className="text-[10px] text-slate-500">{row.senderEmail}</div></td>
          <td className="p-3"><b className="text-white">{row.recipientName}</b><div className="text-cyan-300">{row.recipientGfId || '—'}</div><div className="text-[10px] text-slate-500">{row.recipientEmail}</div></td>
          <td className="p-3 font-mono"><div className="text-rose-300">−{money(row.amount)}</div><div className="text-[10px] text-slate-500">Fee {money(row.fee)}</div><div className="text-emerald-300">Net {money(row.netAmount)}</div></td>
          <td className="p-3"><div className={row.creditStatus === 'completed' ? 'text-emerald-300' : 'text-rose-300'}>{row.creditStatus}</div><div className="font-mono">{row.creditedAmount == null ? '—' : money(row.creditedAmount)}</div><div className="text-[10px] text-slate-500">{dateTime(row.creditedAt)}</div></td>
          <td className="p-3">{row.reconciliationStatus === 'balanced' ? <span className="inline-flex items-center gap-1 text-emerald-300"><CheckCircle2 className="w-3 h-3"/>Balanced</span> : <span className="inline-flex items-center gap-1 text-rose-300"><AlertTriangle className="w-3 h-3"/>{row.reconciliationStatus.replace(/_/g,' ')}</span>}</td>
          <td className="p-3 max-w-[220px] whitespace-normal text-slate-300">{row.note || row.description || '—'}</td>
        </tr>)}</tbody>
      </table>}
      {!loading && report && rows.length === 0 && <div className="p-10 text-center text-xs text-slate-500">No matching P2P transfers found.</div>}
    </div>
    <div className="flex items-start gap-2 text-[11px] text-slate-500"><ShieldCheck className="w-4 h-4 shrink-0 text-cyan-400"/><p>Read-only audit report. It does not alter member balances or rewrite ledger entries. Investigate reconciliation exceptions before making any accounting correction.</p></div>
  </div>;
};
