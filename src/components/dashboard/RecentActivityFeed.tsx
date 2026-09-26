import React, { useState, useMemo } from 'react';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  ArrowLeftRight, 
  Package, 
  Layers, 
  CreditCard, 
  TrendingUp, 
  Sparkles, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Copy, 
  Check, 
  Search, 
  RefreshCw, 
  ChevronRight, 
  FileText,
  ShieldCheck,
  Printer,
  X,
  RotateCcw
} from 'lucide-react';
import type { TransactionLedger } from '../../types/index.ts';
import { 
  ActivityFilterType, 
  filterTransactionsByType,
  ActivityFilter
} from './ActivityFilter.tsx';

interface RecentActivityFeedProps {
  transactions: TransactionLedger[];
  onRefresh: () => void;
  isLoading: boolean;
  activeTypeFilter?: ActivityFilterType;
  onFilterChange?: (filter: ActivityFilterType) => void;
  showInlineFilter?: boolean;
}

/**
 * Normalizes database status string into 'completed' | 'pending' | 'failed'
 */
export function getNormalizedStatus(rawStatus?: string): 'completed' | 'pending' | 'failed' {
  if (!rawStatus) return 'completed';
  const s = rawStatus.toLowerCase().trim();
  if (s === 'pending' || s === 'processing' || s === 'in_progress' || s === 'waiting') {
    return 'pending';
  }
  if (s === 'failed' || s === 'rejected' || s === 'cancelled' || s === 'declined' || s === 'error') {
    return 'failed';
  }
  return 'completed';
}

/**
 * Color-coded status badge component:
 * - 'Completed' in green
 * - 'Pending' in yellow
 * - 'Failed' in red
 */
export const renderStatusBadge = (rawStatus?: string) => {
  const norm = getNormalizedStatus(rawStatus);

  switch (norm) {
    case 'completed':
      return (
        <span 
          data-testid="status-badge-completed"
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 shadow-xs"
        >
          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
          <span>Completed</span>
        </span>
      );

    case 'pending':
      return (
        <span 
          data-testid="status-badge-pending"
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-yellow-500/15 text-yellow-400 border border-yellow-500/40 shadow-xs"
        >
          <Clock className="w-3 h-3 text-yellow-400 animate-pulse shrink-0" />
          <span>Pending</span>
        </span>
      );

    case 'failed':
      return (
        <span 
          data-testid="status-badge-failed"
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-500/15 text-red-400 border border-red-500/40 shadow-xs"
        >
          <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />
          <span>Failed</span>
        </span>
      );
  }
};

export const RecentActivityFeed: React.FC<RecentActivityFeedProps> = ({
  transactions,
  onRefresh,
  isLoading,
  activeTypeFilter,
  onFilterChange,
  showInlineFilter = false
}) => {
  // If no external filter is controlled, manage internally
  const [internalFilter, setInternalFilter] = useState<ActivityFilterType>('all');
  const currentFilter = activeTypeFilter !== undefined ? activeTypeFilter : internalFilter;
  const handleFilterChange = (filter: ActivityFilterType) => {
    if (onFilterChange) {
      onFilterChange(filter);
    } else {
      setInternalFilter(filter);
    }
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedTxn, setSelectedTxn] = useState<TransactionLedger | null>(null);

  // 1. Filter by transaction type: 'all' | 'deposits' | 'withdrawals' | 'transfers'
  const typeFiltered = useMemo(() => {
    return filterTransactionsByType(transactions, currentFilter);
  }, [transactions, currentFilter]);

  // 2. Filter by search query & sort chronologically
  const filteredTxns = useMemo(() => {
    let result = [...typeFiltered];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t => 
        t.id.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        (t.referenceId && t.referenceId.toLowerCase().includes(q)) ||
        t.type.toLowerCase().includes(q) ||
        (t.status && t.status.toLowerCase().includes(q))
      );
    }

    // Sort chronologically newest first
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [typeFiltered, searchQuery]);

  // Group transactions by date relative labels: "Today", "Yesterday", "Earlier Transactions"
  const groupedTxns = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups: { label: string; items: TransactionLedger[] }[] = [];
    const todayItems: TransactionLedger[] = [];
    const yesterdayItems: TransactionLedger[] = [];
    const earlierItems: TransactionLedger[] = [];

    filteredTxns.forEach(t => {
      const tDate = new Date(t.createdAt);
      tDate.setHours(0, 0, 0, 0);

      if (tDate.getTime() === today.getTime()) {
        todayItems.push(t);
      } else if (tDate.getTime() === yesterday.getTime()) {
        yesterdayItems.push(t);
      } else {
        earlierItems.push(t);
      }
    });

    if (todayItems.length > 0) groups.push({ label: 'Today', items: todayItems });
    if (yesterdayItems.length > 0) groups.push({ label: 'Yesterday', items: yesterdayItems });
    if (earlierItems.length > 0) groups.push({ label: 'Earlier Transactions', items: earlierItems });

    return groups;
  }, [filteredTxns]);

  const handleCopy = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  // Helper for transaction icon
  const getIconForType = (type: string, flow: string) => {
    switch (type) {
      case 'recharge':
        return <ArrowDownLeft className="w-4 h-4 text-emerald-400" />;
      case 'withdrawal':
        return <ArrowUpRight className="w-4 h-4 text-rose-400" />;
      case 'p2p_transfer':
        return <ArrowLeftRight className="w-4 h-4 text-indigo-400" />;
      case 'income_to_fund':
        return <RefreshCw className="w-4 h-4 text-cyan-400" />;
      case 'package_activation':
        return <Package className="w-4 h-4 text-cyan-400" />;
      case 'basic_roi':
      case 'fd_roi':
        return <TrendingUp className="w-4 h-4 text-amber-400" />;
      case 'basic_level':
      case 'fd_level':
      case 'rd_level':
        return <Layers className="w-4 h-4 text-teal-400" />;
      case 'basic_referral':
      case 'fd_referral':
      case 'salary':
      default:
        return flow === 'credit' 
          ? <Sparkles className="w-4 h-4 text-emerald-400" />
          : <ArrowUpRight className="w-4 h-4 text-rose-400" />;
    }
  };

  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-[#091129]/90 border border-blue-500/25 shadow-xl backdrop-blur-md space-y-5">
      {/* Optional Inline Filter Component (when rendered independently) */}
      {showInlineFilter && (
        <ActivityFilter
          activeFilter={currentFilter}
          onFilterChange={handleFilterChange}
          transactions={transactions}
        />
      )}

      {/* Feed Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pb-4 border-b border-blue-500/20">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Clock className="w-4 h-4" />
            </span>
            <h3 className="text-base font-bold text-white tracking-tight">
              Recent Activity Feed
            </h3>
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-blue-500/20 text-cyan-300 font-mono">
              Live Feed
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time chronological timeline of financial deposits, payouts, transfers, and ledger movements.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Refresh button */}
          <button
            onClick={onRefresh}
            disabled={isLoading}
            title="Refresh Activities"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0e173a] hover:bg-[#142250] text-slate-300 hover:text-white border border-blue-500/30 text-xs font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter Info Bar & Quick Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#060b1c]/80 p-2.5 rounded-xl border border-blue-500/20">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-400">Active View:</span>
          <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-blue-500/20 text-cyan-300 border border-cyan-500/30 capitalize">
            {currentFilter} ({filteredTxns.length})
          </span>

          {/* If filtering or searching, show reset button */}
          {(currentFilter !== 'all' || searchQuery) && (
            <button
              onClick={() => {
                handleFilterChange('all');
                setSearchQuery('');
              }}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-300 px-2 py-0.5 rounded hover:bg-rose-500/10 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset filter</span>
            </button>
          )}
        </div>

        {/* Quick Search Bar */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by ID, note, UTR..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-60 pl-8 pr-3 py-1.5 text-xs rounded-lg bg-[#091129] border border-blue-500/30 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Activity Timeline List */}
      <div className="space-y-6 pt-1">
        {isLoading ? (
          <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
            <span className="text-xs">Fetching latest ledger activities...</span>
          </div>
        ) : filteredTxns.length === 0 ? (
          <div className="p-8 rounded-xl bg-[#0b132f]/60 border border-blue-500/15 text-center text-slate-400 space-y-3">
            <Clock className="w-9 h-9 mx-auto text-slate-500 opacity-60" />
            <div>
              <p className="text-sm font-semibold text-slate-200">
                No {currentFilter !== 'all' ? currentFilter : 'recent'} transactions found
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {searchQuery 
                  ? 'No entries match your search query.' 
                  : currentFilter !== 'all' 
                    ? `No ${currentFilter} have been recorded yet.` 
                    : 'Recharge, transfer, or activate a package to start seeing live updates.'}
              </p>
            </div>
            {currentFilter !== 'all' && (
              <button
                onClick={() => handleFilterChange('all')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/30 hover:bg-blue-600/50 text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-colors"
              >
                <span>View All Activity ({transactions.length})</span>
              </button>
            )}
          </div>
        ) : (
          groupedTxns.map((group) => (
            <div key={group.label} className="space-y-2.5">
              {/* Chronological Section Label */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400 font-mono">
                  {group.label}
                </span>
                <div className="flex-1 h-px bg-gradient-to-r from-blue-500/30 to-transparent" />
                <span className="text-[10px] text-slate-500">
                  {group.items.length} {group.items.length === 1 ? 'event' : 'events'}
                </span>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                {group.items.map((txn) => {
                  const isCredit = txn.flow === 'credit';
                  const normStatus = getNormalizedStatus(txn.status);

                  // Color-coded left bar based on status & flow
                  let leftBarColor = 'bg-cyan-500 shadow-cyan-500/50';
                  if (normStatus === 'failed') {
                    leftBarColor = 'bg-red-500 shadow-red-500/50';
                  } else if (normStatus === 'pending') {
                    leftBarColor = 'bg-yellow-400 shadow-yellow-500/50';
                  } else if (isCredit) {
                    leftBarColor = 'bg-emerald-400 shadow-emerald-500/50';
                  } else {
                    leftBarColor = 'bg-rose-500 shadow-rose-500/50';
                  }

                  return (
                    <div
                      key={txn.id}
                      onClick={() => setSelectedTxn(txn)}
                      className="cursor-pointer group p-3.5 sm:p-4 rounded-xl bg-[#0c1538]/70 hover:bg-[#111e4e] border border-blue-500/20 hover:border-cyan-400/40 transition-all shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 relative overflow-hidden"
                    >
                      {/* Left color-coded edge indicator */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${leftBarColor}`} />

                      {/* Left: Icon, Description & Status Badge */}
                      <div className="flex items-start sm:items-center gap-3 pl-2 min-w-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                          isCredit 
                            ? 'bg-emerald-500/10 border-emerald-500/30' 
                            : 'bg-rose-500/10 border-rose-500/30'
                        }`}>
                          {getIconForType(txn.type, txn.flow)}
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs sm:text-sm font-bold text-white group-hover:text-cyan-300 transition-colors truncate">
                              {txn.description}
                            </span>
                            {/* Color-coded status badge from database */}
                            {renderStatusBadge(txn.status)}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-400">
                            {/* Reference ID with copy */}
                            <button
                              onClick={(e) => handleCopy(txn.id, e)}
                              className="font-mono text-cyan-400/90 hover:text-cyan-300 flex items-center gap-1 font-semibold"
                              title="Copy Reference ID"
                            >
                              <span>{txn.id}</span>
                              {copiedId === txn.id ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3 opacity-60 group-hover:opacity-100" />
                              )}
                            </button>

                            <span>•</span>
                            <span className="capitalize text-slate-400">
                              {txn.category === 'fund_wallet' ? 'Available Fund' : 'Available Balance'}
                            </span>

                            <span>•</span>
                            <span className="text-slate-500 font-mono">
                              {new Date(txn.createdAt).toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Amount & Detail Chevron */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-blue-500/10 pl-2 sm:pl-0">
                        <div className="text-right">
                          <div className={`font-mono text-sm sm:text-base font-extrabold tracking-tight tabular-nums ${
                            isCredit ? 'text-emerald-400' : 'text-rose-400'
                          }`}>
                            {isCredit ? '+' : '-'}₹{txn.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          {txn.fee > 0 && (
                            <span className="text-[10px] text-rose-300/80 font-mono block">
                              Fee: -₹{txn.fee.toFixed(2)}
                            </span>
                          )}
                        </div>

                        <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Transaction Details Modal / Receipt Drawer */}
      {selectedTxn && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b132b] border border-blue-500/30 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-blue-500/20">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-cyan-400" />
                <h4 className="text-base font-bold text-white">Transaction Receipt & Details</h4>
              </div>
              <button
                onClick={() => setSelectedTxn(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Amount Banner & Status */}
            <div className="p-4 rounded-xl bg-[#060b1c] border border-blue-500/20 text-center space-y-1.5">
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                {selectedTxn.flow === 'credit' ? 'Total Inflow Credited' : 'Total Outflow Debited'}
              </span>
              <div className={`text-2xl sm:text-3xl font-extrabold font-mono tabular-nums ${
                selectedTxn.flow === 'credit' ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {selectedTxn.flow === 'credit' ? '+' : '-'}₹{selectedTxn.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div className="pt-1 flex justify-center">
                {renderStatusBadge(selectedTxn.status)}
              </div>
            </div>

            {/* Key-Value Details */}
            <div className="space-y-2.5 text-xs text-slate-300">
              <div className="flex justify-between py-1.5 border-b border-blue-500/10">
                <span className="text-slate-400">Reference ID:</span>
                <span className="font-mono text-cyan-400 font-bold">{selectedTxn.id}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-blue-500/10">
                <span className="text-slate-400">Status Verification:</span>
                <div>{renderStatusBadge(selectedTxn.status)}</div>
              </div>
              <div className="flex justify-between py-1.5 border-b border-blue-500/10">
                <span className="text-slate-400">Operation Type:</span>
                <span className="capitalize font-semibold text-white">{selectedTxn.type.replace(/_/g, ' ')}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-blue-500/10">
                <span className="text-slate-400">Wallet Target:</span>
                <span className="text-slate-200">
                  {selectedTxn.category === 'fund_wallet' ? 'Available Fund' : 'Available Balance'}
                </span>
              </div>
              {selectedTxn.fee > 0 && (
                <div className="flex justify-between py-1.5 border-b border-blue-500/10">
                  <span className="text-slate-400">Deduction / TDS:</span>
                  <span className="font-mono text-rose-400">-₹{selectedTxn.fee.toFixed(2)}</span>
                </div>
              )}
              {selectedTxn.netAmount !== selectedTxn.amount && (
                <div className="flex justify-between py-1.5 border-b border-blue-500/10">
                  <span className="text-slate-400">Net Disbursal:</span>
                  <span className="font-mono text-emerald-400 font-bold">₹{selectedTxn.netAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between py-1.5 border-b border-blue-500/10">
                <span className="text-slate-400">Timestamp:</span>
                <span className="font-mono text-slate-200">
                  {new Date(selectedTxn.createdAt).toLocaleString('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'medium'
                  })}
                </span>
              </div>
              <div className="py-1.5">
                <span className="text-slate-400 block mb-1">Description:</span>
                <p className="p-2.5 rounded-lg bg-[#0e173a] text-slate-200 font-medium">
                  {selectedTxn.description}
                </p>
              </div>
            </div>

            {/* Cryptographic Ledger Verification Stamp */}
            <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-500/30 flex items-center gap-2 text-[11px] text-cyan-300">
              <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>Immutable cryptographic record confirmed on the server ledger.</span>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2 rounded-xl bg-[#121e48] hover:bg-[#182963] text-white font-semibold text-xs border border-blue-500/30 flex items-center justify-center gap-1.5 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Receipt</span>
              </button>
              <button
                onClick={() => setSelectedTxn(null)}
                className="flex-1 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-xs transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
