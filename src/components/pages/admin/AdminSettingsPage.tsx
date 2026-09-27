import React, { useEffect, useState } from 'react';
import { Settings, Save, Check, RefreshCw, AlertTriangle, Layers, ShieldCheck, WalletCards } from 'lucide-react';
import { getSystemSettings, updateSystemSettings } from '../../../services/settingsService.ts';
import { useAuth } from '../../../context/AuthContext.tsx';
import type { SystemSettings } from '../../../types/index.ts';

type ExtendedSettings = SystemSettings & {
  trxDepositAddress?: string;
  usdtTrc20DepositAddress?: string;
  depositNetworkNotice?: string;
};

export const AdminSettingsPage: React.FC = () => {
  const { user: currentAdmin } = useAuth();
  const [settings, setSettings] = useState<ExtendedSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const loadSettings = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      setSettings((await getSystemSettings(true)) as ExtendedSettings);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSettings(); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings || !currentAdmin) return;
    setSaving(true);
    setErrorMsg('');
    try {
      const updated = await updateSystemSettings(currentAdmin.uid, currentAdmin.email || undefined, settings);
      setSettings(updated as ExtendedSettings);
      setSuccessMsg('Settings saved successfully.');
      setTimeout(() => setSuccessMsg(''), 2500);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-16 text-center text-slate-400"><RefreshCw className="w-6 h-6 animate-spin mx-auto text-cyan-400 mb-2" /><span className="text-xs">Loading configuration…</span></div>;
  }
  if (!settings) return null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between border-b border-blue-500/20 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center"><Settings className="w-5 h-5 text-white" /></div>
          <div><h2 className="text-xl font-bold text-white">System Settings</h2><p className="text-xs text-slate-400">Package visibility, testnet wallet display and platform safety.</p></div>
        </div>
        <button onClick={loadSettings} className="p-2 rounded-xl bg-[#0e173a] border border-blue-500/30 text-cyan-400"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {successMsg && <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex gap-2"><Check className="w-4 h-4" />{successMsg}</div>}
      {errorMsg && <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex gap-2"><AlertTriangle className="w-4 h-4" />{errorMsg}</div>}

      <form onSubmit={handleSave} className="space-y-6">
        <section className="p-5 rounded-2xl bg-[#091129] border border-blue-500/25 space-y-4">
          <div className="flex items-center gap-2 border-b border-blue-500/20 pb-2"><WalletCards className="w-4 h-4 text-cyan-400" /><h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400">TRON Testnet Display Details</h3></div>
          <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/30 text-xs text-amber-200">No bank, HDFC, UPI or INR details are prefilled. Enter only testnet TRON addresses here while payment execution remains disabled.</div>
          <div className="grid grid-cols-1 gap-4 text-xs">
            <div><label className="block text-slate-300 font-semibold mb-1">TRX Testnet Address</label><input value={settings.trxDepositAddress || ''} onChange={(e) => setSettings({ ...settings, trxDepositAddress: e.target.value.trim() })} placeholder="Enter TRON testnet address" className="w-full px-3.5 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white font-mono" /></div>
            <div><label className="block text-slate-300 font-semibold mb-1">USDT TRC20 Testnet Address</label><input value={settings.usdtTrc20DepositAddress || ''} onChange={(e) => setSettings({ ...settings, usdtTrc20DepositAddress: e.target.value.trim() })} placeholder="Enter testnet TRC20 address" className="w-full px-3.5 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white font-mono" /></div>
            <div><label className="block text-slate-300 font-semibold mb-1">Network Notice</label><input value={settings.depositNetworkNotice || ''} onChange={(e) => setSettings({ ...settings, depositNetworkNotice: e.target.value })} className="w-full px-3.5 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white" /></div>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 rounded-2xl bg-[#091129] border border-blue-500/25 space-y-3 text-xs">
            <div className="flex items-center gap-2 border-b border-blue-500/20 pb-2"><Layers className="w-4 h-4 text-cyan-400" /><h3 className="text-sm font-bold uppercase text-cyan-400">Package Visibility</h3></div>
            <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20"><span className="text-white font-semibold">Basic Package</span><div className="text-emerald-400 mt-1">LIVE / Visible to users</div></div>
            <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20"><span className="text-white font-semibold">FD Package</span><div className="text-emerald-400 mt-1">LIVE / Visible to users</div></div>
          </div>

          <div className="p-5 rounded-2xl bg-[#091129] border border-blue-500/25 space-y-3 text-xs">
            <div className="flex items-center gap-2 border-b border-blue-500/20 pb-2"><ShieldCheck className="w-4 h-4 text-cyan-400" /><h3 className="text-sm font-bold uppercase text-cyan-400">Safety Status</h3></div>
            <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20 flex justify-between"><span>Basic Package Enabled</span><span className={settings.basicPackageEnabled ? 'text-emerald-400' : 'text-rose-400'}>{settings.basicPackageEnabled ? 'YES' : 'NO'}</span></div>
            <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20 flex justify-between"><span>FD Package Enabled</span><span className={settings.fdPackageEnabled ? 'text-emerald-400' : 'text-rose-400'}>{settings.fdPackageEnabled ? 'YES' : 'NO'}</span></div>
            <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20 flex justify-between"><span>Real-money Payments</span><span className="text-rose-400">DISABLED</span></div>
          </div>
        </section>

        <div className="flex justify-end"><button type="submit" disabled={saving} className="px-7 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold text-xs flex items-center gap-2 disabled:opacity-50">{saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{saving ? 'Saving…' : 'Save Settings'}</button></div>
      </form>
    </div>
  );
};
