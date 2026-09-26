import React, { useState, useEffect } from 'react';
import { 
  Package, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  Sparkles, 
  Shield, 
  Clock, 
  TrendingUp,
  RefreshCw,
  Wallet
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { adminGetPackages } from '../../services/financeService.ts';
import { 
  createPackageActivationRequest, 
  getUserPackageActivationRequests 
} from '../../services/packageActivationService.ts';
import { DataTable, type Column } from '../common/DataTable.tsx';
import type { PackageDefinition, PackageActivationRequest } from '../../types/index.ts';

export const BasicPackage: React.FC<{ onNavigateToRecharge: () => void }> = ({ onNavigateToRecharge }) => {
  const { profile, wallet, refreshWallet } = useAuth();
  const [dbPackages, setDbPackages] = useState<PackageDefinition[]>([]);
  const [selectedPkg, setSelectedPkg] = useState<PackageDefinition | null>(null);
  const [amount, setAmount] = useState<number>(1000);
  const [userRequests, setUserRequests] = useState<PackageActivationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const loadData = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const [allPkgs, reqs] = await Promise.all([
        adminGetPackages(),
        getUserPackageActivationRequests(profile.uid)
      ]);
      const basicOnly = allPkgs.filter(p => p.type === 'basic' && p.active);
      setDbPackages(basicOnly);
      if (basicOnly.length > 0 && !selectedPkg) {
        setSelectedPkg(basicOnly[0]);
        setAmount(basicOnly[0].minAmount);
      }
      setUserRequests(reqs.filter(r => r.packageType === 'basic'));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [profile?.uid]);

  const handleSelectPackage = (pkg: PackageDefinition) => {
    setSelectedPkg(pkg);
    setAmount(pkg.minAmount);
    setErrorMsg('');
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !wallet || !selectedPkg) return;

    if ((wallet.fundWallet || 0) < amount) {
      setErrorMsg(
        `Insufficient Available Fund! You have ₹${(wallet.fundWallet || 0).toFixed(2)}, but ₹${amount.toFixed(2)} is required.`
      );
      return;
    }

    if (amount < selectedPkg.minAmount) {
      setErrorMsg(`Minimum activation amount is ₹${selectedPkg.minAmount.toFixed(2)}.`);
      return;
    }
    if (amount > selectedPkg.maxAmount) {
      setErrorMsg(`Maximum activation amount is ₹${selectedPkg.maxAmount.toFixed(2)}.`);
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await createPackageActivationRequest({
        userId: profile.uid,
        userEmail: profile.email,
        userName: profile.name,
        userReferralCode: profile.referralCode,
        packageId: selectedPkg.id,
        amountRupees: amount
      });

      if (res.success) {
        setSuccessMsg(res.message);
        await refreshWallet();
        await loadData();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Package activation request failed.');
    } finally {
      setSubmitting(false);
    }
  };

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
        <span className="text-xs font-semibold text-white">
          {item.packageName}
        </span>
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
          <h2 className="text-xl font-bold text-white tracking-tight">Basic Growth Packages</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Database-configured growth packages funded directly through your Available Fund.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-[#091129] border border-blue-500/25 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-cyan-400/40 flex items-center justify-center text-cyan-400">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Available Fund</span>
              <div className="text-sm font-bold font-mono text-cyan-300">
                ₹{(wallet?.fundWallet || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          <button
            onClick={onNavigateToRecharge}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors"
          >
            + Add Funds
          </button>
        </div>
      </div>

      {/* Package Selection Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {dbPackages.map((pkg) => (
          <div
            key={pkg.id}
            onClick={() => handleSelectPackage(pkg)}
            className={`p-5 rounded-2xl border cursor-pointer transition-all ${
              selectedPkg?.id === pkg.id
                ? 'bg-[#0f1d48] border-cyan-400 shadow-xl ring-2 ring-cyan-400/30'
                : 'bg-[#091129] border-blue-500/25 hover:border-blue-500/50'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider font-mono">
                {pkg.code}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-cyan-300 border border-blue-500/30">
                {pkg.durationDays} Days Term
              </span>
            </div>

            <h3 className="text-base font-bold text-white mb-1">{pkg.name}</h3>
            <p className="text-xs text-slate-400 mb-4 line-clamp-2">{pkg.description}</p>

            <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20 space-y-1.5 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">Min Amount:</span>
                <span className="text-white font-bold">₹{pkg.minAmount.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Max Amount:</span>
                <span className="text-white font-bold">₹{pkg.maxAmount.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Activation Request Form */}
      {selectedPkg && (
        <div className="rounded-2xl bg-[#091129] border border-blue-500/25 p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-blue-500/20 pb-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Package className="w-4 h-4 text-cyan-400" />
              <span>Submit Activation for: {selectedPkg.name}</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              Lock Period: {selectedPkg.durationDays} Days
            </span>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleActivate} className="space-y-4 max-w-xl">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Enter Activation Capital (₹{selectedPkg.minAmount} – ₹{selectedPkg.maxAmount})
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-cyan-400 font-bold text-sm">
                  ₹
                </span>
                <input
                  type="number"
                  min={selectedPkg.minAmount}
                  max={selectedPkg.maxAmount}
                  step="100"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  required
                  className="w-full pl-8 pr-3.5 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white font-mono text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20 text-xs space-y-1">
              <div className="flex justify-between text-slate-400">
                <span>Terms & Condition:</span>
                <span className="text-slate-200">{selectedPkg.terms}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Fund Source:</span>
                <span className="text-cyan-400 font-semibold">Available Fund Wallet</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-cyan-950/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Submitting Activation Request...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Confirm Package Activation Request</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* User Package Requests History */}
      <div className="rounded-2xl bg-[#091129] border border-blue-500/25 p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-blue-500/20">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Your Basic Package Activations
          </h3>
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        <DataTable
          columns={columns}
          data={userRequests}
          emptyMessage="No basic package activations yet."
        />
      </div>
    </div>
  );
};
