import React, { useState, useEffect } from 'react';
import { 
  Package, 
  Plus, 
  Edit3, 
  Check, 
  X, 
  TrendingUp, 
  ShieldCheck, 
  Percent, 
  Calendar, 
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { 
  adminGetPackageDefinitions, 
  adminSavePackageDefinition 
} from '../../../services/financeService.ts';
import { useAuth } from '../../../context/AuthContext.tsx';
import type { PackageDefinition } from '../../../types/index.ts';

export const AdminPackages: React.FC = () => {
  const { user: currentAdmin } = useAuth();
  const [packages, setPackages] = useState<PackageDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPkg, setEditingPkg] = useState<PackageDefinition | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const loadPackages = async () => {
    setLoading(true);
    try {
      const data = await adminGetPackageDefinitions();
      setPackages(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPackages();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPkg || !currentAdmin) return;

    setSaving(true);
    setErrorMsg('');
    try {
      await adminSavePackageDefinition(currentAdmin.uid, editingPkg);
      setSaveSuccess(`Package "${editingPkg.name}" updated successfully!`);
      setEditingPkg(null);
      await loadPackages();
      setTimeout(() => setSaveSuccess(''), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save package configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleAddNew = () => {
    const newPkg: PackageDefinition = {
      id: `pkg-${Date.now()}`,
      name: 'New Custom Package',
      code: `PKG_${Date.now().toString().slice(-4)}`,
      type: 'basic',
      minAmount: 1000,
      maxAmount: 100000,
      roiRate: 1.0,
      durationDays: 100,
      description: 'Custom database-configured financial yield package.',
      terms: 'Daily payout to Available Balance.',
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setEditingPkg(newPkg);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-indigo-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Database-Driven Package Configuration</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Configure Basic and FD package terms, limits, and ROI rates dynamically in PostgreSQL / Firestore.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleAddNew}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-xs shadow-md transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Package</span>
          </button>

          <button
            onClick={loadPackages}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0e173a] hover:bg-[#142250] border border-blue-500/30 text-xs font-semibold text-white transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{saveSuccess}</span>
        </div>
      )}

      {/* Package Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading ? (
          <div className="col-span-2 py-16 text-center text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-cyan-400 mb-2" />
            <span className="text-xs">Loading database package definitions...</span>
          </div>
        ) : (
          packages.map((pkg) => (
            <div
              key={pkg.id}
              className={`p-5 rounded-2xl border transition-all space-y-4 ${
                pkg.active
                  ? 'bg-[#091129] border-blue-500/25 shadow-lg'
                  : 'bg-[#080d20] border-slate-700/40 opacity-75'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">{pkg.name}</h3>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      pkg.type === 'basic' ? 'bg-cyan-500/20 text-cyan-300' : 'bg-amber-500/20 text-amber-300'
                    }`}>
                      {pkg.type.toUpperCase()}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-cyan-400">{pkg.code}</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    pkg.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'
                  }`}>
                    {pkg.active ? 'Active' : 'Inactive'}
                  </span>
                  <button
                    onClick={() => setEditingPkg(pkg)}
                    className="p-1.5 rounded-lg bg-[#0e173a] hover:bg-[#142250] text-cyan-400 border border-blue-500/30"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <p className="text-xs text-slate-300">{pkg.description}</p>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-2 border-t border-blue-500/10">
                <div className="p-2.5 rounded-xl bg-[#060b1c]">
                  <span className="text-slate-500 block text-[10px]">Min / Max Investment</span>
                  <span className="text-white font-bold">₹{pkg.minAmount} - ₹{pkg.maxAmount}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#060b1c]">
                  <span className="text-slate-500 block text-[10px]">Daily ROI Rate</span>
                  <span className="text-emerald-400 font-bold">{pkg.roiRate}% / day</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#060b1c]">
                  <span className="text-slate-500 block text-[10px]">Maturity Term</span>
                  <span className="text-cyan-400 font-bold">{pkg.durationDays} days</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#060b1c]">
                  <span className="text-slate-500 block text-[10px]">Status</span>
                  <span className="text-slate-300 font-bold">{pkg.active ? 'Available' : 'Paused'}</span>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 bg-[#060b1c] p-2.5 rounded-xl border border-blue-500/10">
                <span className="font-semibold text-slate-300">Terms: </span>
                {pkg.terms}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Edit Package Modal */}
      {editingPkg && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b132b] border border-blue-500/40 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-blue-500/20">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-cyan-400" />
                <h4 className="text-base font-bold text-white">Edit Package Configuration</h4>
              </div>
              <button onClick={() => setEditingPkg(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Package Name</label>
                  <input
                    type="text"
                    value={editingPkg.name}
                    onChange={(e) => setEditingPkg({ ...editingPkg, name: e.target.value })}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Package Code</label>
                  <input
                    type="text"
                    value={editingPkg.code}
                    onChange={(e) => setEditingPkg({ ...editingPkg, code: e.target.value.toUpperCase() })}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-cyan-300 font-mono focus:outline-none focus:border-cyan-400 uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Package Type</label>
                  <select
                    value={editingPkg.type}
                    onChange={(e) => setEditingPkg({ ...editingPkg, type: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white focus:outline-none focus:border-cyan-400"
                  >
                    <option value="basic">Basic Growth Package</option>
                    <option value="fd">Fixed Deposit (FD)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Active Status</label>
                  <select
                    value={editingPkg.active ? 'true' : 'false'}
                    onChange={(e) => setEditingPkg({ ...editingPkg, active: e.target.value === 'true' })}
                    className="w-full px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white focus:outline-none focus:border-cyan-400"
                  >
                    <option value="true">Active & Visible</option>
                    <option value="false">Paused / Inactive</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Min (₹)</label>
                  <input
                    type="number"
                    value={editingPkg.minAmount}
                    onChange={(e) => setEditingPkg({ ...editingPkg, minAmount: parseFloat(e.target.value) || 0 })}
                    required
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#060b1c] border border-blue-500/30 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Max (₹)</label>
                  <input
                    type="number"
                    value={editingPkg.maxAmount}
                    onChange={(e) => setEditingPkg({ ...editingPkg, maxAmount: parseFloat(e.target.value) || 0 })}
                    required
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#060b1c] border border-blue-500/30 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">ROI (%/day)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingPkg.roiRate}
                    onChange={(e) => setEditingPkg({ ...editingPkg, roiRate: parseFloat(e.target.value) || 0 })}
                    required
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#060b1c] border border-blue-500/30 text-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Days</label>
                  <input
                    type="number"
                    value={editingPkg.durationDays}
                    onChange={(e) => setEditingPkg({ ...editingPkg, durationDays: parseInt(e.target.value) || 0 })}
                    required
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#060b1c] border border-blue-500/30 text-cyan-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Marketing Description</label>
                <textarea
                  rows={2}
                  value={editingPkg.description}
                  onChange={(e) => setEditingPkg({ ...editingPkg, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Terms & Conditions</label>
                <textarea
                  rows={2}
                  value={editingPkg.terms}
                  onChange={(e) => setEditingPkg({ ...editingPkg, terms: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-blue-500/20">
                <button
                  type="button"
                  onClick={() => setEditingPkg(null)}
                  className="px-4 py-2 rounded-xl bg-[#101b3d] text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold shadow-md"
                >
                  {saving ? 'Writing to DB...' : 'Save Configuration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
