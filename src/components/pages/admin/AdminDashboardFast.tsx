import React, { useEffect, useState } from 'react';
import {
  Users, ShieldCheck, Clock, Package, FileText, TrendingUp, RefreshCw,
  ChevronRight, ShieldAlert
} from 'lucide-react';
import { adminGetDashboardMetrics } from '../../../services/financeService.ts';
import type { ActivePage } from '../../../types/index.ts';

interface AdminDashboardProps {
  onNavigate: (page: ActivePage) => void;
}

type Metrics = {
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
};

const EMPTY: Metrics = {
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
  ledgerTransactionCount: 0,
};

const CACHE_KEY = 'gf_admin_metrics_v2';
const CACHE_TTL = 30_000;

async function loadMetrics(): Promise<Metrics> {
  return adminGetDashboardMetrics();
}

export const AdminDashboardFast: React.FC<AdminDashboardProps> = ({ onNavigate }) => {
  const [metrics, setMetrics] = useState<Metrics>(() => {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return EMPTY;
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.at > CACHE_TTL) return parsed.metrics || EMPTY;
      return parsed.metrics || EMPTY;
    } catch {
      return EMPTY;
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchMetrics = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setError('');
    try {
      const data = await loadMetrics();
      setMetrics(data);
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), metrics: data }));
    } catch (err) {
      console.error('Failed to load admin metrics:', err);
      setError('Some metrics could not be refreshed. Showing last available values.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchMetrics(false); }, []);

  const card = (title: string, value: React.ReactNode, subtitle: React.ReactNode, icon: React.ReactNode, target: ActivePage) => (
    <button onClick={() => onNavigate(target)} className="text-left p-5 rounded-2xl bg-[#091129]/95 border border-blue-500/25 hover:border-cyan-400/50 shadow-lg transition-all">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{title}</span>
        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">{icon}</div>
      </div>
      <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white mt-2">{value}</div>
      <div className="mt-2 text-xs text-slate-400">{subtitle}</div>
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[#0d1636] to-[#080d24] border border-blue-500/30 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-700 flex items-center justify-center border border-cyan-400/40"><ShieldAlert className="w-6 h-6 text-white" /></div>
          <div><div className="flex items-center gap-2"><h2 className="text-xl font-bold text-white">GLOBAL FINANCE Admin Control Desk</h2><span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30">Staff Only</span></div><p className="text-xs text-cyan-300/80 mt-0.5">Fast aggregate metrics without downloading full collections</p></div>
        </div>
        <button onClick={() => fetchMetrics(true)} disabled={loading} className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0f1b3e] hover:bg-[#152554] border border-blue-500/30 text-xs font-semibold text-white disabled:opacity-50"><RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${loading ? 'animate-spin' : ''}`} /><span>{loading ? 'Refreshing…' : 'Refresh Metrics'}</span></button>
      </div>

      {error && <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-amber-300 text-xs">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {card('Total Users', metrics.totalUsers, <><span className="text-emerald-400">{metrics.activeUsers} Active</span> · <span className="text-rose-400">{metrics.suspendedUsers} Suspended</span></>, <Users className="w-4 h-4 text-cyan-400" />, 'admin-users')}
        {card('KYC Compliance', <span className="text-amber-400">{metrics.pendingKyc}</span>, <><span className="text-emerald-400">{metrics.verifiedKyc} Verified</span> · <span className="text-rose-400">{metrics.rejectedKyc} Rejected</span></>, <ShieldCheck className="w-4 h-4 text-emerald-400" />, 'admin-kyc')}
        {card('Support Desk', <span className="text-cyan-400">{metrics.openTickets}</span>, <>{metrics.inProgressTickets} In Progress · {metrics.closedTickets} Closed</>, <Clock className="w-4 h-4 text-amber-400" />, 'admin-tickets')}
        {card('Ledger Count', metrics.ledgerTransactionCount, 'Aggregate count only', <FileText className="w-4 h-4 text-teal-400" />, 'admin-reports')}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button onClick={() => onNavigate('admin-package-activations')} className="p-5 rounded-2xl bg-[#091129]/95 border border-blue-500/25 hover:border-cyan-400/40 shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-3"><Package className="w-6 h-6 text-cyan-400" /><div className="text-left"><span className="text-xs text-slate-400 block">Basic Package Activations</span><span className="text-2xl font-bold font-mono text-white">{metrics.totalBasicActivations}</span><span className="text-[10px] text-cyan-400">Open member investment records →</span></div></div><ChevronRight className="w-5 h-5 text-slate-500" />
        </button>
        <button onClick={() => onNavigate('admin-package-activations')} className="p-5 rounded-2xl bg-[#091129]/95 border border-blue-500/25 hover:border-amber-400/40 shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-3"><TrendingUp className="w-6 h-6 text-amber-400" /><div className="text-left"><span className="text-xs text-slate-400 block">FD Package Activations</span><span className="text-2xl font-bold font-mono text-white">{metrics.totalFdActivations}</span><span className="text-[10px] text-amber-400">Open member investment records →</span></div></div><ChevronRight className="w-5 h-5 text-slate-500" />
        </button>
      </div>
    </div>
  );
};
