import React, { useState, useEffect } from 'react';
import { 
  ArrowLeftRight, 
  Search, 
  Filter, 
  RefreshCw, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  AlertCircle, 
  Eye, 
  X, 
  Check, 
  ShieldCheck, 
  Layers,
  FileText
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext.tsx';
import { 
  adminGetAllTransactionRequests, 
  adminUpdateTransactionRequestStatus,
  ALLOWED_TRANSITIONS 
} from '../../../services/transactionRequestService.ts';
import { DataTable, type Column } from '../../common/DataTable.tsx';
import type { TransactionRequest, TransactionRequestStatus, TransactionRequestType } from '../../../types/index.ts';

export const AdminTransactions: React.FC = () => {
  const { user: currentAdmin } = useAuth();
  const [requests, setRequests] = useState<TransactionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TransactionRequestType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<TransactionRequestStatus | 'all'>('all');

  // Selected request for inspection / state action
  const [selectedReq, setSelectedReq] = useState<TransactionRequest | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [providerRef, setProviderRef] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);
  const [actionError, setActionError] = useState('');

  const loadRequests = async () => {
    setLoading(true);
    try {
      const data = await adminGetAllTransactionRequests({
        requestType: typeFilter,
        status: statusFilter,
        search: searchQuery
      });
      setRequests(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [typeFilter, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadRequests();
  };

  const handleStateTransition = async (targetStatus: TransactionRequestStatus) => {
    if (!selectedReq || !currentAdmin) return;
    setSubmittingAction(true);
    setActionError('');

    try {
      const res = await adminUpdateTransactionRequestStatus(
        currentAdmin.uid,
        currentAdmin.email || undefined,
        selectedReq.id,
        targetStatus,
        adminNote.trim(),
        providerRef.trim() || undefined
      );

      if (res.success) {
        setSelectedReq(null);
        setAdminNote('');
        setProviderRef('');
        await loadRequests();
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to update transaction status.');
    } finally {
      setSubmittingAction(false);
    }
  };

  const columns: Column<TransactionRequest>[] = [
    {
      key: 'createdAt',
      header: 'Created At',
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
      key: 'requestType',
      header: 'Operation Type',
      render: (item) => (
        <span className="text-xs font-semibold uppercase font-mono text-cyan-300">
          {item.requestType.replace(/_/g, ' ')}
        </span>
      )
    },
    {
      key: 'amountRupees',
      header: 'Gross / Net',
      render: (item) => (
        <div>
          <span className="font-mono text-xs font-bold text-white block">
            ₹{item.amountRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
          <span className="font-mono text-[10px] text-slate-400">
            Net: ₹{item.netAmountRupees.toFixed(2)} ({item.amountPaise} p)
          </span>
        </div>
      )
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => {
        if (item.status === 'completed') {
          return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 className="w-3 h-3" />
              <span>Completed</span>
            </span>
          );
        }
        if (item.status === 'rejected' || item.status === 'failed') {
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
      header: 'Adjudicate',
      render: (item) => (
        <button
          onClick={() => {
            setSelectedReq(item);
            setAdminNote(item.adminNote || '');
            setProviderRef(item.providerReference || '');
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
            <ShieldCheck className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Transaction Adjudication Control</h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Compliance oversight desk enforcing strict transaction state machines and double-entry settlements.
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
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by Reference ID, GF Code, or Member Name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl bg-[#060b1c] border border-blue-500/30 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
          />
        </form>

        <div className="flex items-center gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="px-3 py-2 text-xs rounded-xl bg-[#060b1c] border border-blue-500/30 text-white focus:outline-none focus:border-cyan-400"
          >
            <option value="all">All Request Types</option>
            <option value="p2p_transfer">P2P Transfer</option>
            <option value="income_to_fund">Income to Fund</option>
            <option value="withdrawal">Withdrawal</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 text-xs rounded-xl bg-[#060b1c] border border-blue-500/30 text-white focus:outline-none focus:border-cyan-400"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="under_review">Under Review</option>
            <option value="approved">Approved</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="rounded-2xl bg-[#091129] border border-blue-500/25 p-5 shadow-xl">
        <DataTable
          columns={columns}
          data={requests}
          emptyMessage="No transaction requests matching filters."
        />
      </div>

      {/* Inspection & Adjudication Modal */}
      {selectedReq && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0b132b] border border-blue-500/40 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-blue-500/20">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-cyan-400" />
                <div>
                  <h3 className="text-base font-bold text-white">Transaction Request Details</h3>
                  <span className="font-mono text-xs text-cyan-300 font-bold">{selectedReq.reference}</span>
                </div>
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

            {/* Metadata Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20">
                <span className="text-slate-400 block text-[11px]">Member Name</span>
                <span className="text-white font-bold">{selectedReq.userName}</span>
              </div>
              <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20">
                <span className="text-slate-400 block text-[11px]">Member GF Code</span>
                <span className="font-mono text-cyan-400 font-bold">{selectedReq.userReferralCode || 'GF—'}</span>
              </div>
              <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20">
                <span className="text-slate-400 block text-[11px]">Current Status</span>
                <span className="font-bold uppercase text-amber-400 font-mono">{selectedReq.status}</span>
              </div>
              <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20">
                <span className="text-slate-400 block text-[11px]">Source Wallet</span>
                <span className="text-slate-200 capitalize">{selectedReq.sourceWalletType.replace('_', ' ')}</span>
              </div>
              <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20">
                <span className="text-slate-400 block text-[11px]">Destination</span>
                <span className="text-slate-200 capitalize">{selectedReq.destinationWalletType.replace('_', ' ')}</span>
              </div>
              <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20">
                <span className="text-slate-400 block text-[11px]">Gross Amount</span>
                <span className="text-white font-mono font-bold">₹{selectedReq.amountRupees.toFixed(2)}</span>
              </div>
            </div>

            {/* Note & Context */}
            {selectedReq.userNote && (
              <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20 text-xs">
                <span className="text-slate-400 block text-[11px] mb-0.5">Applicant Note / Settlement Coordinates:</span>
                <span className="text-slate-200">{selectedReq.userNote}</span>
              </div>
            )}

            {/* Allowed State Machine Transition Controls */}
            <div className="space-y-3 pt-2 border-t border-blue-500/20">
              <span className="text-xs font-bold text-white block">
                Audited Compliance Action & Transition:
              </span>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Internal Compliance / Rejection Note (Required for Rejection)
                </label>
                <textarea
                  rows={2}
                  placeholder="Enter reason or verification observation..."
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[#060b1c] border border-blue-500/30 text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              {selectedReq.status === 'processing' && (
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Settlement Provider UTR / Reference
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. CMS98218321098"
                    value={providerRef}
                    onChange={(e) => setProviderRef(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-[#060b1c] border border-blue-500/30 text-white font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>
              )}

              {/* Action Buttons dynamically enabled by state machine */}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                {ALLOWED_TRANSITIONS[selectedReq.status]?.includes('under_review') && (
                  <button
                    type="button"
                    disabled={submittingAction}
                    onClick={() => handleStateTransition('under_review')}
                    className="px-3.5 py-2 rounded-xl bg-[#111a3d] text-amber-300 text-xs font-semibold hover:bg-[#172554] border border-amber-500/30"
                  >
                    Move to Under Review
                  </button>
                )}

                {ALLOWED_TRANSITIONS[selectedReq.status]?.includes('approved') && (
                  <button
                    type="button"
                    disabled={submittingAction}
                    onClick={() => handleStateTransition('approved')}
                    className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md"
                  >
                    Approve Request
                  </button>
                )}

                {ALLOWED_TRANSITIONS[selectedReq.status]?.includes('processing') && (
                  <button
                    type="button"
                    disabled={submittingAction}
                    onClick={() => handleStateTransition('processing')}
                    className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-md"
                  >
                    Mark Processing
                  </button>
                )}

                {ALLOWED_TRANSITIONS[selectedReq.status]?.includes('completed') && (
                  <button
                    type="button"
                    disabled={submittingAction}
                    onClick={() => handleStateTransition('completed')}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md"
                  >
                    Confirm & Complete Ledger Credit
                  </button>
                )}

                {ALLOWED_TRANSITIONS[selectedReq.status]?.includes('rejected') && (
                  <button
                    type="button"
                    disabled={submittingAction}
                    onClick={() => handleStateTransition('rejected')}
                    className="px-4 py-2 rounded-xl bg-rose-600/30 hover:bg-rose-600/50 text-rose-300 border border-rose-500/40 text-xs font-bold"
                  >
                    Reject Request
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
