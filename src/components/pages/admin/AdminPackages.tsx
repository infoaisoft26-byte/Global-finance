import React, { useEffect, useState } from 'react';
import { Check, Edit3, Package, Plus, RefreshCw, Sparkles, X } from 'lucide-react';
import { adminGetPackageDefinitions, adminSavePackageDefinition } from '../../../services/financeService.ts';
import { BASIC_PACKAGE_TEMPLATES, getBasicPlanDailyReturn, getBasicPlanTotalWithPrincipal } from '../../../data/basicPackageTemplates.ts';
import { useAuth } from '../../../context/AuthContext.tsx';
import type { PackageDefinition } from '../../../types/index.ts';

export const AdminPackages: React.FC = () => {
  const { user: currentAdmin } = useAuth();
  const [packages, setPackages] = useState<PackageDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [editingPkg, setEditingPkg] = useState<PackageDefinition | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadPackages = async () => {
    setLoading(true);
    try {
      setPackages(await adminGetPackageDefinitions());
    } catch (err: any) {
      setError(err?.message || 'Unable to load packages.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPackages(); }, []);

  const seedReferencePlans = async () => {
    if (!currentAdmin) return;
    setSeeding(true);
    setError('');
    setMessage('');
    try {
      const existing = await adminGetPackageDefinitions();
      const existingCodes = new Set(existing.map(p => p.code));
      const missing = BASIC_PACKAGE_TEMPLATES.filter(p => !existingCodes.has(p.code));
      for (const pkg of missing) {
        await adminSavePackageDefinition(currentAdmin.uid, { ...pkg, updatedAt: new Date().toISOString() });
      }
      setMessage(missing.length ? `${missing.length} Basic plans published successfully.` : 'All 11 Basic plans are already published.');
      await loadPackages();
    } catch (err: any) {
      setError(err?.message || 'Unable to publish Basic plans.');
    } finally {
      setSeeding(false);
    }
  };

  const savePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAdmin || !editingPkg) return;
    setSaving(true);
    setError('');
    try {
      await adminSavePackageDefinition(currentAdmin.uid, { ...editingPkg, updatedAt: new Date().toISOString() });
      setEditingPkg(null);
      setMessage('Package saved successfully.');
      await loadPackages();
    } catch (err: any) {
      setError(err?.message || 'Unable to save package.');
    } finally {
      setSaving(false);
    }
  };

  const createCustom = () => {
    const now = new Date().toISOString();
    setEditingPkg({
      id: `pkg-${Date.now()}`,
      name: 'New Custom Package',
      code: `GF_CUSTOM_${Date.now().toString().slice(-4)}`,
      type: 'basic', minAmount: 100, maxAmount: 100,
      roiRate: 0, durationDays: 1,
      description: 'Admin-configured package.',
      terms: 'Configure plan terms before publishing.',
      active: false, createdAt: now, updatedAt: now
    });
  };

  const basicCount = packages.filter(p => p.type === 'basic' && p.active).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><Package className="w-5 h-5 text-cyan-400"/><h2 className="text-xl font-bold text-white">Package Management</h2></div>
          <p className="text-xs text-slate-400 mt-1">Admin controls package amount, configured daily return, duration and visibility.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={seedReferencePlans} disabled={seeding || !currentAdmin} className="px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50">
            <Sparkles className="w-4 h-4"/>{seeding ? 'Publishing...' : 'Publish 11 Basic Plans'}
          </button>
          <button onClick={createCustom} className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-2"><Plus className="w-4 h-4"/>New Package</button>
          <button onClick={loadPackages} disabled={loading} className="p-2 rounded-xl bg-[#0e173a] border border-blue-500/30 text-cyan-400"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}/></button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-2xl bg-[#091129] border border-blue-500/20"><div className="text-[10px] uppercase text-slate-500">Active Basic Plans</div><div className="text-2xl font-bold text-white">{basicCount}</div></div>
        <div className="p-4 rounded-2xl bg-[#091129] border border-blue-500/20"><div className="text-[10px] uppercase text-slate-500">Reference Set</div><div className="text-2xl font-bold text-cyan-300">11</div></div>
        <div className="p-4 rounded-2xl bg-[#091129] border border-blue-500/20"><div className="text-[10px] uppercase text-slate-500">Payment Display</div><div className="text-sm font-bold text-white mt-1">TRX / USDT only</div></div>
      </div>

      {message && <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex gap-2"><Check className="w-4 h-4"/>{message}</div>}
      {error && <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs">{error}</div>}

      {loading ? <div className="py-16 text-center text-slate-400"><RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2"/>Loading packages...</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {packages.map(pkg => {
            const daily = getBasicPlanDailyReturn(pkg);
            const total = getBasicPlanTotalWithPrincipal(pkg);
            return <div key={pkg.id} className={`p-5 rounded-2xl border ${pkg.active ? 'bg-[#091129] border-blue-500/25' : 'bg-[#080d20] border-slate-700/40 opacity-70'}`}>
              <div className="flex items-start justify-between gap-2">
                <div><div className="text-base font-bold text-white">{pkg.name}</div><div className="text-[11px] text-cyan-400 font-mono">{pkg.code}</div></div>
                <button onClick={() => setEditingPkg(pkg)} className="p-2 rounded-lg bg-[#0e173a] text-cyan-400 border border-blue-500/30"><Edit3 className="w-3.5 h-3.5"/></button>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                <div className="p-2.5 rounded-xl bg-[#060b1c]"><span className="text-slate-500 block text-[10px]">Plan Amount</span><b className="text-white">{pkg.minAmount.toLocaleString('en-IN')}</b></div>
                <div className="p-2.5 rounded-xl bg-[#060b1c]"><span className="text-slate-500 block text-[10px]">Configured Daily</span><b className="text-emerald-400">{daily.toLocaleString('en-IN')}</b></div>
                <div className="p-2.5 rounded-xl bg-[#060b1c]"><span className="text-slate-500 block text-[10px]">Days</span><b className="text-cyan-300">{pkg.durationDays}</b></div>
                <div className="p-2.5 rounded-xl bg-[#060b1c]"><span className="text-slate-500 block text-[10px]">Scheduled Total</span><b className="text-white">{total.toLocaleString('en-IN')}</b></div>
              </div>
              <div className="mt-3 text-[11px] text-slate-400">{pkg.active ? 'Active & visible to members' : 'Inactive / hidden from members'}</div>
            </div>;
          })}
        </div>
      )}

      {editingPkg && <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
        <div className="w-full max-w-lg max-h-[90vh] overflow-auto rounded-2xl bg-[#0b132b] border border-blue-500/40 p-5">
          <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-white">Edit Package</h3><button onClick={() => setEditingPkg(null)}><X className="w-5 h-5 text-slate-400"/></button></div>
          <form onSubmit={savePackage} className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3"><input value={editingPkg.name} onChange={e=>setEditingPkg({...editingPkg,name:e.target.value})} className="px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white" placeholder="Package name"/><input value={editingPkg.code} onChange={e=>setEditingPkg({...editingPkg,code:e.target.value.toUpperCase()})} className="px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white" placeholder="Code"/></div>
            <div className="grid grid-cols-2 gap-3"><select value={editingPkg.type} onChange={e=>setEditingPkg({...editingPkg,type:e.target.value as 'basic'|'fd'})} className="px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white"><option value="basic">Basic</option><option value="fd">FD</option></select><select value={editingPkg.active?'yes':'no'} onChange={e=>setEditingPkg({...editingPkg,active:e.target.value==='yes'})} className="px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white"><option value="yes">Active</option><option value="no">Inactive</option></select></div>
            <div className="grid grid-cols-2 gap-3"><label className="text-slate-400">Min amount<input type="number" value={editingPkg.minAmount} onChange={e=>setEditingPkg({...editingPkg,minAmount:Number(e.target.value)})} className="mt-1 w-full px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white"/></label><label className="text-slate-400">Max amount<input type="number" value={editingPkg.maxAmount} onChange={e=>setEditingPkg({...editingPkg,maxAmount:Number(e.target.value)})} className="mt-1 w-full px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white"/></label></div>
            <div className="grid grid-cols-2 gap-3"><label className="text-slate-400">Daily return %<input type="number" step="0.01" value={editingPkg.roiRate} onChange={e=>setEditingPkg({...editingPkg,roiRate:Number(e.target.value)})} className="mt-1 w-full px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white"/></label><label className="text-slate-400">Days<input type="number" value={editingPkg.durationDays} onChange={e=>setEditingPkg({...editingPkg,durationDays:Number(e.target.value)})} className="mt-1 w-full px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white"/></label></div>
            <textarea rows={2} value={editingPkg.description} onChange={e=>setEditingPkg({...editingPkg,description:e.target.value})} className="w-full px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white" placeholder="Description"/>
            <textarea rows={2} value={editingPkg.terms} onChange={e=>setEditingPkg({...editingPkg,terms:e.target.value})} className="w-full px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white" placeholder="Terms"/>
            <button disabled={saving} className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50">{saving ? 'Saving...' : 'Save Package'}</button>
          </form>
        </div>
      </div>}
    </div>
  );
};
