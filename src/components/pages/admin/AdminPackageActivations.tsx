import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Eye, Layers, RefreshCw, Search, X, XCircle } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext.tsx';
import { adminGetAllPackageActivationRequests, adminUpdatePackageActivationStatus } from '../../../services/packageActivationService.ts';
import { adminGetPackagePurchaseHistory } from '../../../services/packagePurchaseApi.ts';
import { DataTable, type Column } from '../../common/DataTable.tsx';
import type { PackageActivationRequest, PackageActivationStatus } from '../../../types/index.ts';

export const AdminPackageActivations: React.FC = () => {
  const { user: currentAdmin } = useAuth();
  const [requests, setRequests] = useState<PackageActivationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReq, setSelectedReq] = useState<PackageActivationRequest | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);
  const [actionError, setActionError] = useState('');

  const loadRequests = async () => {
    if (!currentAdmin) return;
    setLoading(true);
    try {
      const [legacy, neon] = await Promise.all([
        adminGetAllPackageActivationRequests().catch(() => [] as PackageActivationRequest[]),
        adminGetPackagePurchaseHistory(currentAdmin).catch((err) => {
          console.error('Failed to load Neon package activations:', err);
          return [] as PackageActivationRequest[];
        })
      ]);
      const byId = new Map<string, PackageActivationRequest>();
      [...legacy, ...neon].forEach(item => byId.set(item.id, item));
      setRequests(Array.from(byId.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch (err) {
      console.error('Failed to load package activations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadRequests(); }, [currentAdmin?.uid]);

  const summary = useMemo(() => {
    const amount = (list: PackageActivationRequest[]) => list.reduce((s, r) => s + Number(r.amountRupees || 0), 0);
    const active = requests.filter(r => r.status === 'active');
    const pending = requests.filter(r => r.status === 'pending' || r.status === 'under_review');
    const basic = active.filter(r => r.packageType === 'basic');
    const fd = active.filter(r => r.packageType === 'fd');
    return {
      totalRequests: requests.length,
      requestedAmount: amount(requests.filter(r => r.status !== 'rejected' && r.status !== 'cancelled')),
      activeAmount: amount(active),
      pendingAmount: amount(pending),
      basicAmount: amount(basic),
      fdAmount: amount(fd),
      activeCount: active.length,
      pendingCount: pending.length,
      uniqueMembers: new Set(requests.map(r => r.userId).filter(Boolean)).size
    };
  }, [requests]);

  const formatAmount = (value: number) => Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleUpdateStatus = async (targetStatus: PackageActivationStatus) => {
    if (!selectedReq || !currentAdmin) return;
    if (selectedReq.id.startsWith('PKG-')) {
      setActionError('This package was purchased directly with USDT and is already active. No manual approval is required.');
      return;
    }
    setSubmittingAction(true);
    setActionError('');
    try {
      const res = await adminUpdatePackageActivationStatus(currentAdmin.uid, currentAdmin.email || undefined, selectedReq.id, targetStatus, adminNote.trim());
      if (res.success) {
        setSelectedReq(null);
        setAdminNote('');
        await loadRequests();
      }
    } catch (err: any) {
      setActionError(err?.message || 'Failed to update package activation status.');
    } finally {
      setSubmittingAction(false);
    }
  };

  const filtered = requests.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return [r.reference, r.packageName, r.userName, r.userEmail, r.userReferralCode, r.packageType].some(v => String(v || '').toLowerCase().includes(q));
  });

  const columns: Column<PackageActivationRequest>[] = [
    { key: 'createdAt', header: 'Date', render: item => <span className="text-xs text-slate-300 font-mono">{new Date(item.createdAt).toLocaleString('en-IN')}</span> },
    { key: 'userName', header: 'Member / User', render: item => <div className="min-w-[180px]"><div className="text-xs font-bold text-white">{item.userName || 'Member'}</div><div className="text-[11px] text-slate-400 break-all">{item.userEmail || '—'}</div><div className="text-[11px] text-cyan-400 font-mono">{item.userReferralCode || 'GF—'}</div></div> },
    { key: 'packageName', header: 'Package', render: item => <div><div className="text-xs font-bold text-white">{item.packageName}</div><div className="text-[10px] uppercase font-mono text-slate-400">{item.packageType} • {item.packageId}</div></div> },
    { key: 'amountRupees', header: 'Amount Invested', render: item => <span className="font-mono text-sm font-bold text-cyan-300">{formatAmount(item.amountRupees)} USDT</span> },
    { key: 'fundingSource', header: 'Funding', render: item => <span className="text-[11px] uppercase text-slate-300">{String(item.fundingSource || 'fund_wallet').replace('_', ' ')}</span> },
    { key: 'status', header: 'Status', render: item => {
      if (item.status === 'active') return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"><CheckCircle2 className="w-3 h-3"/>ACTIVE</span>;
      if (item.status === 'rejected' || item.status === 'cancelled') return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30"><XCircle className="w-3 h-3"/>{item.status.toUpperCase()}</span>;
      return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30"><Clock className="w-3 h-3"/>{item.status.replace('_',' ').toUpperCase()}</span>;
    }},
    { key: 'reference', header: 'Reference', render: item => <span className="font-mono text-[11px] text-cyan-400">{item.reference}</span> },
    { key: 'id', header: 'Action', render: item => <button onClick={() => { setSelectedReq(item); setAdminNote(item.adminNote || ''); setActionError(''); }} className="px-3 py-1.5 rounded-lg bg-blue-600/30 border border-cyan-500/30 text-cyan-300 text-xs font-bold flex items-center gap-1.5"><Eye className="w-3.5 h-3.5"/>Details</button> }
  ];

  const Metric = ({ label, value, sub }: { label: string; value: string; sub?: string }) => <div className="p-4 rounded-2xl bg-[#091129] border border-blue-500/20"><div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div><div className="text-xl font-extrabold font-mono text-white mt-1">{value}</div>{sub && <div className="text-[10px] text-slate-500 mt-1">{sub}</div>}</div>;

  const selectedIsDirectPurchase = Boolean(selectedReq?.id?.startsWith('PKG-'));

  return <div className="space-y-5">
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"><div><div className="flex items-center gap-2"><Layers className="w-5 h-5 text-cyan-400"/><h2 className="text-xl font-bold text-white">Member Package Investments</h2></div><p className="text-xs text-slate-400 mt-1">Shows Basic and FD purchases from both the current USDT/Neon flow and legacy activation requests.</p></div><button onClick={loadRequests} disabled={loading} className="px-3.5 py-2 rounded-xl bg-[#0e173a] border border-blue-500/30 text-xs font-bold text-white flex items-center gap-2 disabled:opacity-50"><RefreshCw className={`w-4 h-4 text-cyan-400 ${loading ? 'animate-spin' : ''}`}/>Refresh</button></div>

    <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3"><Metric label="Members" value={String(summary.uniqueMembers)} sub={`${summary.totalRequests} total records`} /><Metric label="Active Invested" value={formatAmount(summary.activeAmount)} sub={`${summary.activeCount} active plans`} /><Metric label="Pending Amount" value={formatAmount(summary.pendingAmount)} sub={`${summary.pendingCount} awaiting review`} /><Metric label="Basic Active" value={formatAmount(summary.basicAmount)} /><Metric label="FD Active" value={formatAmount(summary.fdAmount)} /><Metric label="Total Requested" value={formatAmount(summary.requestedAmount)} /></div>

    <div className="p-4 rounded-2xl bg-[#091129] border border-blue-500/25 flex flex-col md:flex-row gap-3"><div className="relative flex-1"><Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"/><input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search name, email, GF code, package or reference..." className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white text-xs"/></div><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white text-xs"><option value="all">All Status ({requests.length})</option><option value="pending">Pending</option><option value="under_review">Under Review</option><option value="active">Active</option><option value="rejected">Rejected</option></select></div>

    <div className="rounded-2xl bg-[#091129] border border-blue-500/25 p-4 shadow-xl"><DataTable columns={columns} data={filtered} emptyMessage={loading ? 'Loading package investments...' : 'No package investment records found.'}/></div>

    {selectedReq && <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"><div className="bg-[#0b132b] border border-blue-500/40 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-auto"><div className="flex items-center justify-between border-b border-blue-500/20 pb-3"><div><h3 className="text-base font-bold text-white">Package Purchase Details</h3><span className="font-mono text-xs text-cyan-300">{selectedReq.reference}</span></div><button onClick={()=>setSelectedReq(null)}><X className="w-5 h-5 text-slate-400"/></button></div>{actionError && <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex gap-2"><AlertCircle className="w-4 h-4"/>{actionError}</div>}<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">{[['Member Name', selectedReq.userName || 'Member'], ['Email', selectedReq.userEmail || '—'], ['GF Code', selectedReq.userReferralCode || '—'], ['User ID', selectedReq.userId || '—'], ['Package', selectedReq.packageName], ['Type', String(selectedReq.packageType).toUpperCase()], ['Amount Invested', `${formatAmount(selectedReq.amountRupees)} USDT`], ['Funding Source', String(selectedReq.fundingSource || 'fund_wallet').replace('_',' ')], ['Status', selectedReq.status], ['Request Date', new Date(selectedReq.createdAt).toLocaleString('en-IN')]].map(([k,v]) => <div key={k} className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/15"><div className="text-[10px] uppercase text-slate-500">{k}</div><div className="text-white font-semibold mt-1 break-all">{v}</div></div>)}</div>{selectedIsDirectPurchase ? <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-xs">Direct USDT purchase. The package is already active and recorded in the Neon package_activations ledger.</div> : <><textarea rows={2} value={adminNote} onChange={e=>setAdminNote(e.target.value)} placeholder="Admin note / reason" className="w-full px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white text-xs"/><div className="flex flex-wrap justify-between gap-2 pt-2 border-t border-blue-500/20"><button disabled={submittingAction} onClick={()=>handleUpdateStatus('rejected')} className="px-4 py-2 rounded-xl bg-rose-600/25 border border-rose-500/40 text-rose-300 text-xs font-bold">Reject</button><div className="flex gap-2"><button disabled={submittingAction} onClick={()=>handleUpdateStatus('under_review')} className="px-4 py-2 rounded-xl bg-amber-600/20 text-amber-300 text-xs font-bold">Under Review</button><button disabled={submittingAction} onClick={()=>handleUpdateStatus('active')} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold">Activate & Debit Ledger</button></div></div></>}</div></div>}
  </div>;
};
