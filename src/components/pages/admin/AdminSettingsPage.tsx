import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  ShieldAlert, 
  Save, 
  Check, 
  RefreshCw, 
  ToggleLeft, 
  ToggleRight,
  AlertTriangle,
  Layers,
  FileCheck,
  LifeBuoy,
  CreditCard,
  Building,
  ShieldCheck,
  Sliders
} from 'lucide-react';
import { getSystemSettings, updateSystemSettings } from '../../../services/settingsService.ts';
import { useAuth } from '../../../context/AuthContext.tsx';
import type { SystemSettings } from '../../../types/index.ts';

export const AdminSettingsPage: React.FC = () => {
  const { user: currentAdmin } = useAuth();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await getSystemSettings();
      setSettings(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings || !currentAdmin) return;
    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const updated = await updateSystemSettings(
        currentAdmin.uid,
        currentAdmin.email || undefined,
        settings
      );
      setSettings(updated);
      setSuccessMsg('Global system parameters and compliance settings saved and audited successfully!');
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update system settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-cyan-400 mb-2" />
        <span className="text-xs">Loading platform configuration...</span>
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-blue-500/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white shadow-md">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">System & Transaction Controls</h2>
            <p className="text-xs text-slate-400">
              Configure platform parameters, financial execution gates, KYC rules, and maintenance status.
            </p>
          </div>
        </div>

        <button
          onClick={loadSettings}
          className="p-2 rounded-xl bg-[#0e173a] hover:bg-[#142250] border border-blue-500/30 text-cyan-400 transition-colors"
          title="Refresh Settings"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* A. General Settings */}
        <div className="p-5 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-blue-500/20">
            <Building className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400">
              A. General Brand & Maintenance Control
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Platform Name</label>
              <input
                type="text"
                value={settings.platformName}
                onChange={(e) => setSettings({ ...settings, platformName: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Tagline</label>
              <input
                type="text"
                value={settings.tagline}
                onChange={(e) => setSettings({ ...settings, tagline: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Support Email</label>
              <input
                type="email"
                value={settings.supportEmail}
                onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white"
              />
            </div>

            {/* Maintenance Mode Toggle */}
            <div className="p-3.5 rounded-xl bg-[#060b1c] border border-blue-500/20 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-white block">Maintenance Mode</span>
                <span className="text-[11px] text-slate-400">
                  Suspends member portal access while keeping admin control live
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, maintenanceMode: !settings.maintenanceMode })}
                className={`p-1 rounded-full transition-colors ${
                  settings.maintenanceMode ? 'text-amber-400' : 'text-slate-600'
                }`}
              >
                {settings.maintenanceMode ? (
                  <ToggleRight className="w-8 h-8" />
                ) : (
                  <ToggleLeft className="w-8 h-8" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* B. Transaction Workflows & Gates */}
        <div className="p-5 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-blue-500/20">
            <CreditCard className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400">
              B. Transaction Operation Gates & Bounds
            </h3>
          </div>

          {/* Operation Enabled Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20 flex items-center justify-between">
              <span className="font-semibold text-white">Recharge</span>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, rechargeEnabled: !settings.rechargeEnabled })}
                className={settings.rechargeEnabled ? 'text-emerald-400' : 'text-slate-600'}
              >
                {settings.rechargeEnabled ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
              </button>
            </div>

            <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20 flex items-center justify-between">
              <span className="font-semibold text-white">P2P Transfers</span>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, p2pEnabled: !settings.p2pEnabled })}
                className={settings.p2pEnabled ? 'text-emerald-400' : 'text-slate-600'}
              >
                {settings.p2pEnabled ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
              </button>
            </div>

            <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20 flex items-center justify-between">
              <span className="font-semibold text-white">Income to Fund</span>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, incomeToFundEnabled: !settings.incomeToFundEnabled })}
                className={settings.incomeToFundEnabled ? 'text-emerald-400' : 'text-slate-600'}
              >
                {settings.incomeToFundEnabled ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
              </button>
            </div>

            <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20 flex items-center justify-between">
              <span className="font-semibold text-white">Withdrawal (Payout)</span>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, withdrawalEnabled: !settings.withdrawalEnabled })}
                className={settings.withdrawalEnabled ? 'text-emerald-400' : 'text-slate-600'}
              >
                {settings.withdrawalEnabled ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
              </button>
            </div>
          </div>

          {/* Limits Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2">
            <div>
              <label className="block text-slate-400 mb-1 text-[11px]">Min Recharge (₹)</label>
              <input
                type="number"
                value={settings.minRecharge}
                onChange={(e) => setSettings({ ...settings, minRecharge: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1 text-[11px]">Max Recharge (₹)</label>
              <input
                type="number"
                value={settings.maxRecharge}
                onChange={(e) => setSettings({ ...settings, maxRecharge: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1 text-[11px]">Min P2P (₹)</label>
              <input
                type="number"
                value={settings.minP2p}
                onChange={(e) => setSettings({ ...settings, minP2p: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1 text-[11px]">Max P2P (₹)</label>
              <input
                type="number"
                value={settings.maxP2p}
                onChange={(e) => setSettings({ ...settings, maxP2p: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1 text-[11px]">Min Income Shift (₹)</label>
              <input
                type="number"
                value={settings.minIncomeTransfer}
                onChange={(e) => setSettings({ ...settings, minIncomeTransfer: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1 text-[11px]">Max Income Shift (₹)</label>
              <input
                type="number"
                value={settings.maxIncomeTransfer}
                onChange={(e) => setSettings({ ...settings, maxIncomeTransfer: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1 text-[11px]">Min Withdrawal (₹)</label>
              <input
                type="number"
                value={settings.minWithdrawal}
                onChange={(e) => setSettings({ ...settings, minWithdrawal: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1 text-[11px]">Withdrawal TDS Fee (%)</label>
              <input
                type="number"
                step="0.5"
                value={settings.withdrawalFeePercent}
                onChange={(e) => setSettings({ ...settings, withdrawalFeePercent: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white font-mono"
              />
            </div>
          </div>
        </div>

        {/* C. Package Controls & D. KYC Rules */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* C. Package Controls */}
          <div className="p-5 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl space-y-4 text-xs">
            <div className="flex items-center gap-2 pb-2 border-b border-blue-500/20">
              <Layers className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400">
                C. Package Activation Controls
              </h3>
            </div>

            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20 flex items-center justify-between">
                <span>Basic Package Availability</span>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, basicPackageEnabled: !settings.basicPackageEnabled })}
                  className={settings.basicPackageEnabled ? 'text-emerald-400' : 'text-slate-600'}
                >
                  {settings.basicPackageEnabled ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
                </button>
              </div>

              <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20 flex items-center justify-between">
                <span>Fixed Deposit (FD) Package Availability</span>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, fdPackageEnabled: !settings.fdPackageEnabled })}
                  className={settings.fdPackageEnabled ? 'text-emerald-400' : 'text-slate-600'}
                >
                  {settings.fdPackageEnabled ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
                </button>
              </div>

              <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20 flex items-center justify-between">
                <span>Admin Approval Required for Activations</span>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, packageActivationApprovalRequired: !settings.packageActivationApprovalRequired })}
                  className={settings.packageActivationApprovalRequired ? 'text-amber-400' : 'text-slate-600'}
                >
                  {settings.packageActivationApprovalRequired ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
                </button>
              </div>
            </div>
          </div>

          {/* D. KYC & Compliance Rules */}
          <div className="p-5 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl space-y-4 text-xs">
            <div className="flex items-center gap-2 pb-2 border-b border-blue-500/20">
              <FileCheck className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400">
                D. KYC Compliance Verification Gates
              </h3>
            </div>

            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20 flex items-center justify-between">
                <span>Require KYC for Fund Withdrawals</span>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, requireKycForWithdrawal: !settings.requireKycForWithdrawal })}
                  className={settings.requireKycForWithdrawal ? 'text-emerald-400' : 'text-slate-600'}
                >
                  {settings.requireKycForWithdrawal ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
                </button>
              </div>

              <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20 flex items-center justify-between">
                <span>Require KYC for P2P Transfers</span>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, requireKycForP2p: !settings.requireKycForP2p })}
                  className={settings.requireKycForP2p ? 'text-emerald-400' : 'text-slate-600'}
                >
                  {settings.requireKycForP2p ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
                </button>
              </div>

              <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20 flex items-center justify-between">
                <span>Require KYC for Package Activations</span>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, requireKycForPackageActivation: !settings.requireKycForPackageActivation })}
                  className={settings.requireKycForPackageActivation ? 'text-emerald-400' : 'text-slate-600'}
                >
                  {settings.requireKycForPackageActivation ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* E. Helpdesk & Support */}
        <div className="p-5 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <LifeBuoy className="w-5 h-5 text-cyan-400" />
            <div>
              <strong className="text-white block font-bold">Support Ticket System Gateway</strong>
              <span className="text-slate-400">Enable or disable member support ticket submissions</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSettings({ ...settings, supportTicketsEnabled: !settings.supportTicketsEnabled })}
            className={settings.supportTicketsEnabled ? 'text-emerald-400' : 'text-slate-600'}
          >
            {settings.supportTicketsEnabled ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
          </button>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-8 py-3 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-600 hover:from-blue-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-cyan-950/40 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Auditing and Writing Settings...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save All Global Settings</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
