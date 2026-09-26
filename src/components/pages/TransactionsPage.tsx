import React, { useState, useEffect } from 'react';
import { 
  ArrowLeftRight, 
  Search, 
  Filter, 
  RefreshCw, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  FileText, 
  Download, 
  ShieldCheck, 
  Eye,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { getTransactions } from '../../services/financeService.ts';
import { getUserTransactionRequests } from '../../services/transactionRequestService.ts';
import { DataTable, type Column } from '../common/DataTable.tsx';
import type { TransactionLedger, TransactionRequest } from '../../types/index.ts';

export const TransactionsPage: React.FC = () => {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'requests' | 'ledger'>('requests');
  const [requests, setRequests] = useState<TransactionRequest[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<TransactionLedger[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const loadData = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const [reqs, txns] = await Promise.all([
        getUserTransactionRequests(profile.uid),
        getTransactions(profile.uid)
      ]);
      setRequests(reqs);
      setLedgerEntries(txns);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [profile?.uid]);

  const filteredRequests = requests.filter(r => {
    if (typeFilter !== 'all' && r.requestType !== typeFilter) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        r.reference.toLowerCase().includes(q) ||
        (r.userNote && r.userNote.toLowerCase().includes(q)) ||
        (r.beneficiaryReferralCode && r.beneficiaryReferralCode.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const filteredLedger = ledgerEntries.filter(l => {
    if (typeFilter !== 'all' && l.type !== typeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        l.referenceId.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const requestColumns: Column<TransactionRequest>[] = [
    {
      key: 'createdAt',
      header: 'Date & Time',
      render: (item) => (
        <span className="text-xs text-slate-300 font-mono">
          {new Date(item.createdAt).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short'
          })}
        </span>
      )
    },
    {
      key: 'reference',
      header: 'Reference ID',
      render: (item) => (
        <span className="font-mono text-cyan-400 text-xs font-bold">
          {item.reference}
        </span>
      )
    },
    {
      key: 'requestType',
      header: 'Operation Type',
      render: (item) => (
        <span className="text-xs font-semibold capitalize text-slate-200">
          {item.requestType.replace(/_/g, ' ')}
        </span>
      )
    },
    {
      key: 'amountRupees',
      header: 'Amount',
      render: (item) => (
        <span className="font-mono text-xs font-bold text-white">
          ₹{item.amountRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </span>
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
    }
  ];

  const ledgerColumns: Column<TransactionLedger>[] = [
    {
      key: 'createdAt',
      header: 'Timestamp',
      render: (item) => (
        <span className="text-xs text-slate-300 font-mono">
          {new Date(item.createdAt).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short'
          })}
        </span>
      )
    },
    {
      key: 'referenceId',
      header: 'Ledger Reference',
      render: (item) => (
        <span className="font-mono text-cyan-400 text-xs font-bold">
          {item.referenceId}
        </span>
      )
    },
    {
      key: 'category',
      header: 'Wallet',
      render: (item) => (
        <span className="text-xs font-semibold capitalize text-slate-400">
          {item.category === 'fund_wallet' ? 'Available Fund' : 'Available Balance'}
        </span>
      )
    },
    {
      key: 'description',
      header: 'Audit Description',
      render: (item) => (
        <span className="text-xs text-slate-300 max-w-sm truncate block">
          {item.description}
        </span>
      )
    },
    {
      key: 'amount',
      header: 'Accounting Flow',
      render: (item) => {
        const isCredit = item.flow === 'credit';
        return (
          <span className={`font-mono text-xs font-bold ${isCredit ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isCredit ? '+' : '-'}₹{item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
        );
      }
    }
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-blue-500/20">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Financial Transactions & Request Desk</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time status tracking for deposits, withdrawals, P2P transfers, and append-only ledger journals.
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0e173a] hover:bg-[#142250] border border-blue-500/30 text-xs font-semibold text-white transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-3 border-b border-blue-500/20 pb-2">
        <button
          onClick={() => setActiveTab('requests')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'requests'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-[#091129] text-slate-400 hover:text-white border border-blue-500/20'
          }`}
        >
          Transaction Requests ({requests.length})
        </button>
        <button
          onClick={() => setActiveTab('ledger')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'ledger'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-[#091129] text-slate-400 hover:text-white border border-blue-500/20'
          }`}
        >
          Immutable Ledger Entries ({ledgerEntries.length})
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-lg flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by reference ID, note, or recipient..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl bg-[#060b1c] border border-blue-500/30 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl bg-[#060b1c] border border-blue-500/30 text-white focus:outline-none focus:border-cyan-400"
          >
            <option value="all">All Types</option>
            <option value="recharge">Recharge / Deposit</option>
            <option value="p2p_transfer">P2P Transfer</option>
            <option value="income_to_fund">Income to Fund</option>
            <option value="withdrawal">Withdrawal</option>
            <option value="package_activation">Package Activation</option>
          </select>

          {activeTab === 'requests' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
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
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="rounded-2xl bg-[#091129] border border-blue-500/25 p-5 shadow-xl">
        {activeTab === 'requests' ? (
          <DataTable
            columns={requestColumns}
            data={filteredRequests}
            emptyMessage="No transaction requests found."
          />
        ) : (
          <DataTable
            columns={ledgerColumns}
            data={filteredLedger}
            emptyMessage="No ledger entries found."
          />
        )}
      </div>
    </div>
  );
};
