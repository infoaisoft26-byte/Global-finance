import React, { useState, useEffect } from 'react';
import { 
  Package, 
  Search, 
  RefreshCw, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  Eye, 
  X, 
  ShieldCheck, 
  Sparkles,
  Layers,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext.tsx';
import { 
  adminGetAllPackageActivationRequests, 
  adminUpdatePackageActivationStatus 
} from '../../../services/packageActivationService.ts';
import { DataTable, type Column } from '../../common/DataTable.tsx';
import type { PackageActivationRequest, PackageActivationStatus } from '../../../types/index.ts';

export const AdminPackageActivations: React.FC = () => {
  const { user: currentAdmin } = useAuth();
  const [requests, setRequests] = useState<PackageActivationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Inspection modal
  const [selectedReq, setSelectedReq] = useState<PackageActivationRequest | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);
  const [actionError, setActionError] = useState('');

  const loadRequests = async () => {
    setLoading(true);
    try {
      const data = await adminGetAllPackageActivationRequests();
      setRequests(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleUpdateStatus = async (targetStatus: PackageActivationStatus) => {
    if (!selectedReq || !currentAdmin) return;
    setSubmittingAction(true);
    setActionError('');

    try {
      const res = await adminUpdatePackageActivationStatus(
        currentAdmin.uid,
        currentAdmin.email || undefined,
        selectedReq.id,
        targetStatus,
        adminNote.trim()
      );

      if (res.success) {
        setSelectedReq(null);
        setAdminNote('');
        await loadRequests();
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to update package activation status.');
    } finally {
      setSubmittingAction(false);
    }
  };

  const filtered = requests.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        r.reference.toLowerCase().includes(q) ||
        r.packageName.toLowerCase().includes(q) ||
        (r.userName && r.userName.toLowerCase().includes(q)) ||
        (r.userReferralCode && r.userReferralCode.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const columns: Column<PackageActivationRequest>[] = [
    {
      key: 'createdAt',
      header: 'Request Date',
      render: (item) => (
        <span className="text-xs text-slate-300 font-mono">
          {new Date(item.createdAt).toLocaleString('en-IN', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </span>
      )
    },
    {
      key: 'reference',
      header: 'Reference',
      render: (item) => (
        <span className="font-mono text-cyan-400 text-xs font-bold">
          {item.reference}
        </span>
      )
    },
    {
      key: 'userName',
      header: 'Member Info',
      render: (item) => (
        <div>
          <span className="text-xs font-semibold text-white block">
            {item.userName || item.userEmail}
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            {item.userReferralCode || 'GF—'}
          </span>
        </div>
      )
    },
    {
      key: 'packageName',
      header: 'Package Title',
      render: (item) => (
        <div>
          <span className="text-xs font-bold text-white block">{item.packageName}</span>
          <span className="text-[10px] font-mono uppercase text-slate-400">{item.packageType} Series</span>
        </div>
      )
    },
    {
      key: 'amountRupees',
      header: 'Capital Subscribed',
      render: (item) => (
        <span className="font-mono text-xs font-bold text-cyan-300">
          ₹{item.amountRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </span>
      )
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => {
        if (item.status === 'active') {
          return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 className="w-3 h-3" />
              <span>Active</span>
            </span>
          );
        }
        if (item.status === 'rejected' || item.status === 'cancelled') {
          return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
              <XCircle className="w-3 h-3" />
              <span>{item.status.toUpperCase()}</span>
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Clock className="w-3 h-3 animate-pulse" />
            <span className="capitalize">{item.status.replace('_', ' ')}</span>
          </span>
        );
      }
    },
    {
      key: 'id',
      header: 'Actions',
      render: (item) => (
        <button
          onClick={() => {
            setSelectedReq(item);
            setAdminNote(item.adminNote || '');
            setActionError('');
          }}
          className="px-3 py-1 rounded-xl bg-blue-600/30 hover:bg-blue-600/50 text-cyan-300 font-semibold text-xs border border-cyan-500/30 transition-colors flex items-center gap-1.5"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Inspect</span>
        </button>
      )
    }
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-blue-500/20">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Package Activation Queue</h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Adjudicate incoming member requests for Basic Growth and Fixed Deposit (FD) investment allocations.
          </p>
        </div>

        <button
          onClick={loadRequests}
          disabled={loading}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0e173a] hover:bg-[#142250] border border-blue-500/30 text-xs font-semibold text-white transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-lg flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by Reference ID, GF Code, or Package Title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl bg-[#060b1c] border border-blue-500/30 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400 shrink-0">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl bg-[#060b1c] border border-blue-500/30 text-white focus:outline-none focus:border-cyan-400"
          >
            <option value="all">All Statuses ({requests.length})</option>
            <option value="pending">Pending</option>
            <option value="under_review">Under Review</option>
            <option value="active">Active</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-[#091129] border border-blue-500/25 p-5 shadow-xl">
        <DataTable
          columns={columns}
          data={filtered}
          emptyMessage="No package activation requests matching filter."
        />
      </div>

      {/* Inspection Modal */}
      {selectedReq && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0b132b] border border-blue-500/40 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-blue-500/20">
              <div>
                <h3 className="text-base font-bold text-white">Review Package Subscription</h3>
                <span className="font-mono text-xs text-cyan-300 font-bold">{selectedReq.reference}</span>
              </div>
              <button
                onClick={() => setSelectedReq(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {actionError && (
              <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20">
                <span className="text-slate-400 block text-[11px]">Member Name</span>
                <span className="text-white font-bold">{selectedReq.userName}</span>
              </div>
              <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20">
                <span className="text-slate-400 block text-[11px]">Member GF Code</span>
                <span className="font-mono text-cyan-400 font-bold">{selectedReq.userReferralCode || 'GF—'}</span>
              </div>
              <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20">
                <span className="text-slate-400 block text-[11px]">Package Name</span>
                <span className="text-white font-bold">{selectedReq.packageName}</span>
              </div>
              <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20">
                <span className="text-slate-400 block text-[11px]">Capital Amount</span>
                <span className="text-cyan-300 font-mono font-bold">₹{selectedReq.amountRupees.toFixed(2)}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Compliance Officer Notes (Optional / Reason)
              </label>
              <textarea
                rows={2}
                placeholder="Enter review notes..."
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-[#060b1c] border border-blue-500/30 text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-blue-500/20">
              <button
                type="button"
                disabled={submittingAction}
                onClick={() => handleUpdateStatus('rejected')}
                className="px-4 py-2 rounded-xl bg-rose-600/30 hover:bg-rose-600/50 text-rose-300 border border-rose-500/40 text-xs font-bold"
              >
                Reject Request
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={submittingAction}
                  onClick={() => handleUpdateStatus('under_review')}
                  className="px-3.5 py-2 rounded-xl bg-[#111a3d] text-amber-300 text-xs font-semibold hover:bg-[#172554]"
                >
                  Mark Under Review
                </button>
                <button
                  type="button"
                  disabled={submittingAction}
                  onClick={() => handleUpdateStatus('active')}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md"
                >
                  Activate & Debit Ledger
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
