import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserCheck, 
  UserX, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Package, 
  Layers, 
  ArrowLeftRight, 
  FileText, 
  TrendingUp, 
  DollarSign,
  Search,
  Filter,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  ShieldAlert
} from 'lucide-react';
import { adminGetDashboardMetrics } from '../../../services/financeService.ts';
import type { ActivePage } from '../../../types/index.ts';

interface AdminDashboardProps {
  onNavigate: (page: ActivePage) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigate }) => {
  const [metrics, setMetrics] = useState<{
    totalUsers: number;
    activeUsers: number;
    suspendedUsers: number;
    pendingKyc: number;
    verifiedKyc: number;
    rejectedKyc: number;
    openTickets: number;
    inProgressTickets: number;
    closedTickets: number;
    totalBasicActivations: number;
    totalFdActivations: number;
    ledgerTransactionCount: number;
  }>({
    totalUsers: 0,
    activeUsers: 0,
    suspendedUsers: 0,
    pendingKyc: 0,
    verifiedKyc: 0,
    rejectedKyc: 0,
    openTickets: 0,
    inProgressTickets: 0,
    closedTickets: 0,
    totalBasicActivations: 0,
    totalFdActivations: 0,
    ledgerTransactionCount: 0
  });

  const [loading, setLoading] = useState(true);

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const data = await adminGetDashboardMetrics();
      setMetrics(data);
    } catch (err) {
      console.error('Failed to load admin metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[#0d1636] to-[#080d24] border border-blue-500/30 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-xl shadow-cyan-500/20 border border-cyan-400/40">
            <ShieldAlert className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white tracking-tight">GLOBAL FINANCE Admin Control Desk</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30">
                Staff Only
              </span>
            </div>
            <p className="text-xs text-cyan-300/80 mt-0.5">
              Live audit and governance portal powered directly by PostgreSQL / Firestore ledger
            </p>
          </div>
        </div>

        <button
          onClick={fetchMetrics}
          disabled={loading}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0f1b3e] hover:bg-[#152554] border border-blue-500/30 text-xs font-semibold text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Real Metrics</span>
        </button>
      </div>

      {/* Primary KPI Grid (Never invented, derived strictly from real DB records) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Users */}
        <div 
          onClick={() => onNavigate('admin-users')}
          className="cursor-pointer group p-5 rounded-2xl bg-[#091129]/95 border border-blue-500/25 hover:border-cyan-400/50 shadow-lg transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Users</span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-cyan-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white mt-2">
            {metrics.totalUsers}
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs">
            <span className="text-emerald-400 font-semibold">{metrics.activeUsers} Active</span>
            <span className="text-slate-600">•</span>
            <span className="text-rose-400 font-semibold">{metrics.suspendedUsers} Suspended</span>
          </div>
        </div>

        {/* KYC Compliance Status */}
        <div 
          onClick={() => onNavigate('admin-kyc')}
          className="cursor-pointer group p-5 rounded-2xl bg-[#091129]/95 border border-blue-500/25 hover:border-cyan-400/50 shadow-lg transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">KYC Compliance</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-amber-400 mt-2">
            {metrics.pendingKyc} <span className="text-xs font-sans text-slate-400 font-normal">Pending</span>
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs">
            <span className="text-emerald-400 font-semibold">{metrics.verifiedKyc} Verified</span>
            <span className="text-slate-600">•</span>
            <span className="text-rose-400 font-semibold">{metrics.rejectedKyc} Rejected</span>
          </div>
        </div>

        {/* Support Tickets */}
        <div 
          onClick={() => onNavigate('admin-tickets')}
          className="cursor-pointer group p-5 rounded-2xl bg-[#091129]/95 border border-blue-500/25 hover:border-cyan-400/50 shadow-lg transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Support Desk</span>
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-cyan-400 mt-2">
            {metrics.openTickets} <span className="text-xs font-sans text-slate-400 font-normal">Open</span>
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs">
            <span className="text-amber-400 font-semibold">{metrics.inProgressTickets} In Progress</span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-400 font-semibold">{metrics.closedTickets} Closed</span>
          </div>
        </div>

        {/* Ledger Transaction Count */}
        <div 
          onClick={() => onNavigate('admin-reports')}
          className="cursor-pointer group p-5 rounded-2xl bg-[#091129]/95 border border-blue-500/25 hover:border-cyan-400/50 shadow-lg transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ledger Audit Count</span>
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-400">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white mt-2">
            {metrics.ledgerTransactionCount}
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
            <span>Immutable entries</span>
          </div>
        </div>
      </div>

      {/* Package Activations Real Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div 
          onClick={() => onNavigate('admin-packages')}
          className="cursor-pointer p-5 rounded-2xl bg-[#091129]/95 border border-blue-500/25 hover:border-cyan-400/40 shadow-lg transition-all flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs text-slate-400 font-semibold block">Total Basic Package Activations</span>
              <span className="text-2xl font-bold font-mono text-white">{metrics.totalBasicActivations}</span>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-500" />
        </div>

        <div 
          onClick={() => onNavigate('admin-packages')}
          className="cursor-pointer p-5 rounded-2xl bg-[#091129]/95 border border-blue-500/25 hover:border-amber-400/40 shadow-lg transition-all flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs text-slate-400 font-semibold block">Total FD Package Activations</span>
              <span className="text-2xl font-bold font-mono text-white">{metrics.totalFdActivations}</span>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-500" />
        </div>
      </div>

      {/* Quick Admin Actions Grid */}
      <div className="p-6 rounded-2xl bg-[#091129]/90 border border-blue-500/25 shadow-xl space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400">
          Executive Administrative Modules
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <button
            onClick={() => onNavigate('admin-users')}
            className="p-4 rounded-xl bg-[#0b1433] hover:bg-[#101c48] border border-blue-500/20 hover:border-cyan-400/40 text-left transition-all"
          >
            <Users className="w-5 h-5 text-cyan-400 mb-2" />
            <span className="text-xs font-bold text-white block">Users</span>
            <span className="text-[10px] text-slate-400">Manage accounts</span>
          </button>

          <button
            onClick={() => onNavigate('admin-kyc')}
            className="p-4 rounded-xl bg-[#0b1433] hover:bg-[#101c48] border border-blue-500/20 hover:border-cyan-400/40 text-left transition-all"
          >
            <ShieldCheck className="w-5 h-5 text-emerald-400 mb-2" />
            <span className="text-xs font-bold text-white block">KYC Review</span>
            <span className="text-[10px] text-slate-400">{metrics.pendingKyc} pending</span>
          </button>

          <button
            onClick={() => onNavigate('admin-tickets')}
            className="p-4 rounded-xl bg-[#0b1433] hover:bg-[#101c48] border border-blue-500/20 hover:border-cyan-400/40 text-left transition-all"
          >
            <Clock className="w-5 h-5 text-amber-400 mb-2" />
            <span className="text-xs font-bold text-white block">Tickets</span>
            <span className="text-[10px] text-slate-400">{metrics.openTickets} open</span>
          </button>

          <button
            onClick={() => onNavigate('admin-packages')}
            className="p-4 rounded-xl bg-[#0b1433] hover:bg-[#101c48] border border-blue-500/20 hover:border-cyan-400/40 text-left transition-all"
          >
            <Package className="w-5 h-5 text-indigo-400 mb-2" />
            <span className="text-xs font-bold text-white block">Packages</span>
            <span className="text-[10px] text-slate-400">DB configured</span>
          </button>

          <button
            onClick={() => onNavigate('admin-reports')}
            className="p-4 rounded-xl bg-[#0b1433] hover:bg-[#101c48] border border-blue-500/20 hover:border-cyan-400/40 text-left transition-all"
          >
            <FileText className="w-5 h-5 text-teal-400 mb-2" />
            <span className="text-xs font-bold text-white block">Reports</span>
            <span className="text-[10px] text-slate-400">CSV & PDF export</span>
          </button>

          <button
            onClick={() => onNavigate('admin-audit')}
            className="p-4 rounded-xl bg-[#0b1433] hover:bg-[#101c48] border border-blue-500/20 hover:border-cyan-400/40 text-left transition-all"
          >
            <ShieldAlert className="w-5 h-5 text-rose-400 mb-2" />
            <span className="text-xs font-bold text-white block">Audit Trail</span>
            <span className="text-[10px] text-slate-400">Immutable logs</span>
          </button>
        </div>
      </div>
    </div>
  );
};
