import React, { useState, useEffect } from 'react';
import { 
  Package, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  RefreshCw, 
  Layers, 
  TrendingUp, 
  ShieldCheck, 
  Calendar,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { getUserPackageActivationRequests } from '../../services/packageActivationService.ts';
import { DataTable, type Column } from '../common/DataTable.tsx';
import type { PackageActivationRequest } from '../../types/index.ts';

export const PackageActivationsPage: React.FC<{ onNavigateToPackages: () => void }> = ({ onNavigateToPackages }) => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<PackageActivationRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRequests = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getUserPackageActivationRequests(user.uid);
      setRequests(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [user?.uid]);

  const columns: Column<PackageActivationRequest>[] = [
    {
      key: 'createdAt',
      header: 'Request Date',
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
      key: 'packageName',
      header: 'Package Title',
      render: (item) => (
        <div>
          <span className="text-xs font-bold text-white block">
            {item.packageName}
          </span>
          <span className="text-[10px] font-mono uppercase text-slate-400">
            {item.packageType} Series
          </span>
        </div>
      )
    },
    {
      key: 'amountRupees',
      header: 'Capital Amount',
      render: (item) => (
        <span className="font-mono text-xs font-bold text-cyan-300">
          ₹{item.amountRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </span>
      )
    },
    {
      key: 'status',
      header: 'Activation Status',
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
    }
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-blue-500/20">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Package Activation Records</h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Transparent tracking for your Basic Growth and Fixed Deposit (FD) investment requests.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadRequests}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0e173a] hover:bg-[#142250] border border-blue-500/30 text-xs font-semibold text-white transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={onNavigateToPackages}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-xs shadow-md shadow-blue-900/40"
          >
            Explore Packages
          </button>
        </div>
      </div>

      {/* Compliance / Accounting Notice */}
      <div className="p-4 rounded-xl bg-[#091129] border border-blue-500/25 flex items-start gap-3 text-xs text-slate-300">
        <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-white font-bold block mb-0.5">
            Verified Capital Allocation Protocol
          </strong>
          <span className="text-slate-400 leading-relaxed">
            All package activations debit your Available Fund and credit the platform's capital reserve via an immutable double-entry journal. Daily return calculation adheres to verified legal business rules with zero synthetic or fake income generated.
          </span>
        </div>
      </div>

      {/* Main Table */}
      <div className="rounded-2xl bg-[#091129] border border-blue-500/25 p-5 shadow-xl">
        <DataTable
          columns={columns}
          data={requests}
          emptyMessage="No package activation requests submitted yet."
        />
      </div>
    </div>
  );
};
