import React, { useEffect, useMemo, useState } from 'react';
import { Check, Edit3, Package, Plus, RefreshCw, Sparkles, X } from 'lucide-react';
import { adminGetPackageDefinitions, adminSavePackageDefinition } from '../../../services/financeService.ts';
import {
  BASIC_PACKAGE_TEMPLATES,
  getBasicPlanDailyReturn,
  getBasicPlanScheduledReturn,
  getBasicPlanMaturityValue
} from '../../../data/basicPackageTemplates.ts';
import {
  FD_PACKAGE_TEMPLATES,
  getFdPlanDailyReturn,
  getFdPlanScheduledReturn,
  getFdPlanMaturityValue
} from '../../../data/fdPackageTemplates.ts';
import { useAuth } from '../../../context/AuthContext.tsx';
import type { PackageDefinition } from '../../../types/index.ts';

const FAST_READ_TIMEOUT = 3500;
const withTimeout = async <T,>(promise: Promise<T>, fallback: T): Promise<T> => Promise.race([
  promise,
  new Promise<T>((resolve) => setTimeout(() => resolve(fallback), FAST_READ_TIMEOUT))
]);

const templates = [...BASIC_PACKAGE_TEMPLATES, ...FD_PACKAGE_TEMPLATES];

const calcDaily = (pkg: PackageDefinition) => pkg.type === 'fd' ? getFdPlanDailyReturn(pkg) : getBasicPlanDailyReturn(pkg);
const calcProfit = (pkg: PackageDefinition) => pkg.type === 'fd' ? getFdPlanScheduledReturn(pkg) : getBasicPlanScheduledReturn(pkg);
const calcMaturity = (pkg: PackageDefinition) => pkg.type === 'fd' ? getFdPlanMaturityValue(pkg) : getBasicPlanMaturityValue(pkg);

export const AdminPackages: React.FC = () => {
  const { user: currentAdmin } = useAuth();
  const [packages, setPackages] = useState<PackageDefinition[]>(templates);
  const [activeTab, setActiveTab] = useState<'basic' | 'fd'>('basic');
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [editingPkg, setEditingPkg] = useState<PackageDefinition | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const mergeWithTemplates = (saved: PackageDefinition[]) => {
    const byCode = new Map(saved.map(p => [p.code, p]));
    const defaults = templates.map(t => byCode.get(t.code) || t);
    const custom = saved.filter(p => !templates.some(t => t.code === p.code));
    return [...defaults, ...custom];
  };

  const loadPackages = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const saved = await withTimeout(adminGetPackageDefinitions(), [] as PackageDefinition[]);
      setPackages(saved.length ? mergeWithTemplates(saved) : templates);
    } catch (err: any) {
      console.warn('Package background refresh failed:', err);
    } finally {
      if (showRefresh) setRefreshing(false);
    }
  };

  useEffect(() => { void loadPackages(false); }, []);

  const seedPlans = async (type: 'basic' | 'fd') => {
    if (!currentAdmin) return;
    setSeeding(true);
    setError('');
    setMessage('');
    try {
      const existing = await withTimeout(adminGetPackageDefinitions(), [] as PackageDefinition[]);
      const existingCodes = new Set(existing.map(p => p.code));
      const source = type === 'fd' ? FD_PACKAGE_TEMPLATES : BASIC_PACKAGE_TEMPLATES;
      const missing = source.filter(p => !existingCodes.has(p.code));
      for (const pkg of missing) {
        await adminSavePackageDefinition(currentAdmin.uid, { ...pkg, updatedAt: new Date().toISOString() });
      }
      setMessage(missing.length ? `${missing.length} ${type === 'fd' ? 'FD' : 'Basic'} plans published successfully.` : `All ${type === 'fd' ? 'FD' : 'Basic'} plans are already published.`);
      await loadPackages(true);
    } catch (err: any) {
      setError(err?.message || `Unable to publish ${type === 'fd' ? 'FD' : 'Basic'} plans.`);
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
      const updated = { ...editingPkg, updatedAt: new Date().toISOString() };
      setPackages(prev => mergeWithTemplates(prev.map(p => p.id === updated.id ? updated : p)));
      setEditingPkg(null);
      setMessage('Saving package in background...');
      await adminSavePackageDefinition(currentAdmin.uid, updated);
      setMessage('Package saved successfully.');
      void loadPackages(false);
    } catch (err: any) {
      setError(err?.message || 'Unable to save package.');
    } finally {
      setSaving(false);
    }
  };

  const createCustom = () => {
    const now = new Date().toISOString();
    const isFd = activeTab === 'fd';
    setEditingPkg({
      id: `pkg-${Date.now()}`,
      name: isFd ? 'New FD Package' : 'New Basic Package',
      code: `${isFd ? 'GF_FD_CUSTOM' : 'GF_CUSTOM'}_${Date.now().toString().slice(-4)}`,
      type: activeTab,
      minAmount: isFd ? 1000 : 200,
      maxAmount: isFd ? 1000 : 200,
      roiRate: isFd ? 1 : 1,
      durationDays: isFd ? 365 : 25,
      description: 'Admin-configured package.',
      terms: 'Configure plan terms before publishing.',
      active: false,
      createdAt: now,
      updatedAt: now
    });
  };

  const visiblePackages = useMemo(() => packages.filter(p => p.type === activeTab), [packages, activeTab]);
  const basicCount = packages.filter(p => p.type === 'basic' && p.active).length;
  const fdCount = packages.filter(p => p.type === 'fd' && p.active).length;
  const previewDaily = editingPkg ? calcDaily(editingPkg) : 0;
  const previewProfit = editingPkg ? calcProfit(editingPkg) : 0;
  const previewMaturity = editingPkg ? calcMaturity(editingPkg) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><Package className="w-5 h-5 text-cyan-400"/><h2 className="text-xl font-bold text-white">Package Management</h2></div>
          <p className="text-xs text-slate-400 mt-1">Manage both Basic and FD plans. Amount, daily return, days, profit and maturity are calculated automatically.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => seedPlans(activeTab)} disabled={seeding || !currentAdmin} className="px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50">
            <Sparkles className="w-4 h-4"/>{seeding ? 'Publishing...' : `Publish ${activeTab === 'fd' ? 'FD' : 'Basic'} Plans`}
          </button>
          <button onClick={createCustom} className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-2"><Plus className="w-4 h-4"/>New {activeTab === 'fd' ? 'FD' : 'Basic'} Package</button>
          <button onClick={() => loadPackages(true)} disabled={refreshing} className="p-2 rounded-xl bg-[#0e173a] border border-blue-500/30 text-cyan-400"><RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}/></button>
        </div>
      </div>

      <div className="flex gap-2 p-1 rounded-xl bg-[#081027] border border-blue-500/20 w-fit">
        <button onClick={() => setActiveTab('basic')} className={`px-4 py-2 rounded-lg text-xs font-bold ${activeTab === 'basic' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>Basic Packages</button>
        <button onClick={() => setActiveTab('fd')} className={`px-4 py-2 rounded-lg text-xs font-bold ${activeTab === 'fd' ? 'bg-cyan-600 text-white' : 'text-slate-400'}`}>FD Packages</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-2xl bg-[#091129] border border-blue-500/20"><div className="text-[10px] uppercase text-slate-500">Active Basic Plans</div><div className="text-2xl font-bold text-white">{basicCount}</div></div>
        <div className="p-4 rounded-2xl bg-[#091129] border border-cyan-500/20"><div className="text-[10px] uppercase text-slate-500">Active FD Plans</div><div className="text-2xl font-bold text-cyan-300">{fdCount}</div></div>
        <div className="p-4 rounded-2xl bg-[#091129] border border-blue-500/20"><div className="text-[10px] uppercase text-slate-500">Calculation Mode</div><div className="text-sm font-bold text-white mt-1">Simple daily return</div></div>
      </div>

      {message && <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex gap-2"><Check className="w-4 h-4"/>{message}</div>}
      {error && <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {visiblePackages.map(pkg => {
          const daily = calcDaily(pkg);
          const profit = calcProfit(pkg);
          const maturity = calcMaturity(pkg);
          return <div key={pkg.id} className={`p-5 rounded-2xl border ${pkg.active ? 'bg-[#091129] border-blue-500/25' : 'bg-[#080d20] border-slate-700/40 opacity-70'}`}>
            <div className="flex items-start justify-between gap-2">
              <div><div className="text-base font-bold text-white">{pkg.name}</div><div className="text-[11px] text-cyan-400 font-mono">{pkg.code}</div></div>
              <button onClick={() => setEditingPkg(pkg)} className="p-2 rounded-lg bg-[#0e173a] text-cyan-400 border border-blue-500/30"><Edit3 className="w-3.5 h-3.5"/></button>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
              <div className="p-2.5 rounded-xl bg-[#060b1c]"><span className="text-slate-500 block text-[10px]">Plan Amount</span><b className="text-white">{pkg.minAmount.toLocaleString('en-IN')}</b></div>
              <div className="p-2.5 rounded-xl bg-[#060b1c]"><span className="text-slate-500 block text-[10px]">Daily Return</span><b className="text-emerald-400">{pkg.roiRate}% = {daily.toLocaleString('en-IN')}</b></div>
              <div className="p-2.5 rounded-xl bg-[#060b1c]"><span className="text-slate-500 block text-[10px]">Days</span><b className="text-cyan-300">{pkg.durationDays}</b></div>
              <div className="p-2.5 rounded-xl bg-[#060b1c]"><span className="text-slate-500 block text-[10px]">Total Profit</span><b className="text-emerald-300">{profit.toLocaleString('en-IN')}</b></div>
            </div>
            <div className="mt-2 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Maturity Amount</span>
              <b className="text-lg text-white">{maturity.toLocaleString('en-IN')}</b>
            </div>
            <div className="mt-3 text-[11px] text-slate-400">{pkg.active ? 'Active & visible to members' : 'Inactive / hidden from members'}</div>
          </div>;
        })}
      </div>

      {editingPkg && <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
        <div className="w-full max-w-lg max-h-[90vh] overflow-auto rounded-2xl bg-[#0b132b] border border-blue-500/40 p-5">
          <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-white">Edit {editingPkg.type === 'fd' ? 'FD' : 'Basic'} Package</h3><button onClick={() => setEditingPkg(null)}><X className="w-5 h-5 text-slate-400"/></button></div>
          <form onSubmit={savePackage} className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3"><input value={editingPkg.name} onChange={e=>setEditingPkg({...editingPkg,name:e.target.value})} className="px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white" placeholder="Package name"/><input value={editingPkg.code} onChange={e=>setEditingPkg({...editingPkg,code:e.target.value.toUpperCase()})} className="px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white" placeholder="Code"/></div>
            <div className="grid grid-cols-2 gap-3"><select value={editingPkg.type} onChange={e=>setEditingPkg({...editingPkg,type:e.target.value as 'basic'|'fd'})} className="px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white"><option value="basic">Basic</option><option value="fd">FD</option></select><select value={editingPkg.active?'yes':'no'} onChange={e=>setEditingPkg({...editingPkg,active:e.target.value==='yes'})} className="px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white"><option value="yes">Active</option><option value="no">Inactive</option></select></div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-slate-400">Plan amount<input type="number" min="0" step="0.01" value={editingPkg.minAmount} onChange={e=>{const amount=Number(e.target.value);setEditingPkg({...editingPkg,minAmount:amount,maxAmount:amount});}} className="mt-1 w-full px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white"/></label>
              <label className="text-slate-400">Daily return %<input type="number" min="0" step="0.01" value={editingPkg.roiRate} onChange={e=>setEditingPkg({...editingPkg,roiRate:Number(e.target.value)})} className="mt-1 w-full px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white"/></label>
            </div>
            <label className="text-slate-400 block">Days<input type="number" min="1" value={editingPkg.durationDays} onChange={e=>setEditingPkg({...editingPkg,durationDays:Number(e.target.value)})} className="mt-1 w-full px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white"/></label>

            <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-[#060b1c] border border-cyan-500/20">
              <div><span className="text-[10px] text-slate-500 block">Daily Income</span><b className="text-cyan-300">{previewDaily.toLocaleString('en-IN')}</b></div>
              <div><span className="text-[10px] text-slate-500 block">Total Profit</span><b className="text-emerald-300">{previewProfit.toLocaleString('en-IN')}</b></div>
              <div><span className="text-[10px] text-slate-500 block mt-2">Principal</span><b className="text-white">{Number(editingPkg.minAmount || 0).toLocaleString('en-IN')}</b></div>
              <div><span className="text-[10px] text-slate-500 block mt-2">Maturity Amount</span><b className="text-lg text-white">{previewMaturity.toLocaleString('en-IN')}</b></div>
              <div className="col-span-2 mt-2 text-[10px] text-slate-500">Formula: Amount + (Amount × Daily % ÷ 100 × Days)</div>
            </div>

            <textarea rows={2} value={editingPkg.description} onChange={e=>setEditingPkg({...editingPkg,description:e.target.value})} className="w-full px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white" placeholder="Description"/>
            <textarea rows={2} value={editingPkg.terms} onChange={e=>setEditingPkg({...editingPkg,terms:e.target.value})} className="w-full px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white" placeholder="Terms"/>
            <button disabled={saving} className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50">{saving ? 'Saving...' : 'Save Package'}</button>
          </form>
        </div>
      </div>}
    </div>
  );
};