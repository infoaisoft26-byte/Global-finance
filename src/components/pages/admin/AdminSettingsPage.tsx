import React, { useEffect, useState } from 'react';
import { Settings, Save, Check, RefreshCw, AlertTriangle, Layers, ShieldCheck, WalletCards, QrCode, Link2 } from 'lucide-react';
import { getCachedSystemSettings, refreshSystemSettings, updateSystemSettings } from '../../../services/settingsService.ts';
import { useAuth } from '../../../context/AuthContext.tsx';
import type { SystemSettings } from '../../../types/index.ts';

type ExtendedSettings = SystemSettings & {
  usdtBep20DepositAddress?: string;
  depositNetworkLabel?: string;
  depositNetworkNotice?: string;
  depositWalletLink?: string;
  depositQrImageUrl?: string;
  depositDisplayEnabled?: boolean;
};

export const AdminSettingsPage: React.FC = () => {
  const { user: currentAdmin } = useAuth();
  const [settings, setSettings] = useState<ExtendedSettings>(() => getCachedSystemSettings() as ExtendedSettings);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const loadSettings = async (showSpinner = true) => {
    if (showSpinner) setRefreshing(true);
    setErrorMsg('');
    try { setSettings((await refreshSystemSettings()) as ExtendedSettings); }
    catch (err: any) { setErrorMsg(err?.message || 'Unable to refresh settings'); }
    finally { if (showSpinner) setRefreshing(false); }
  };

  useEffect(() => {
    // Render cached/default settings immediately, then refresh in background.
    void loadSettings(false);
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings || !currentAdmin) return;
    setSaving(true); setErrorMsg('');
    try {
      const updated = await updateSystemSettings(currentAdmin.uid, currentAdmin.email || undefined, {
        ...settings,
        depositNetworkLabel: 'BNB Smart Chain (BEP20)'
      });
      setSettings(updated as ExtendedSettings);
      setSuccessMsg('USDT BEP20 deposit settings saved. All users will see these same details.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) { setErrorMsg(err?.message || 'Failed to save settings'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between border-b border-blue-500/20 pb-3">
        <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center"><Settings className="w-5 h-5 text-white" /></div><div><h2 className="text-xl font-bold text-white">System Settings</h2><p className="text-xs text-slate-400">Manage the USDT BEP20 wallet details shown to every user on Recharge.</p></div></div>
        <button onClick={() => loadSettings(true)} disabled={refreshing} className="p-2 rounded-xl bg-[#0e173a] border border-blue-500/30 text-cyan-400 disabled:opacity-50" title="Refresh settings"><RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /></button>
      </div>

      {refreshing && <div className="text-[11px] text-cyan-300">Refreshing latest configuration in background…</div>}
      {successMsg && <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex gap-2"><Check className="w-4 h-4" />{successMsg}</div>}
      {errorMsg && <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex gap-2"><AlertTriangle className="w-4 h-4" />{errorMsg}</div>}

      <form onSubmit={handleSave} className="space-y-6">
        <section className="p-5 rounded-2xl bg-[#091129] border border-blue-500/25 space-y-4">
          <div className="flex items-center justify-between gap-3 border-b border-blue-500/20 pb-3">
            <div className="flex items-center gap-2"><WalletCards className="w-4 h-4 text-cyan-400" /><h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400">USDT BEP20 Deposit Wallet</h3></div>
            <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={settings.depositDisplayEnabled !== false} onChange={(e) => setSettings({ ...settings, depositDisplayEnabled: e.target.checked })} /> Show to users</label>
          </div>

          <div className="p-3 rounded-xl bg-blue-950/30 border border-blue-500/30 text-xs text-blue-100">Only USDT on <strong>BNB Smart Chain (BEP20)</strong> is shown to users. TRX, TRC20, Nile and Shasta options have been removed from this deposit screen.</div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="md:col-span-2"><label className="block text-slate-300 font-semibold mb-1">USDT BEP20 Deposit Address</label><input value={settings.usdtBep20DepositAddress || ''} onChange={(e) => setSettings({ ...settings, usdtBep20DepositAddress: e.target.value.trim() })} placeholder="0x..." className="w-full px-3.5 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white font-mono" /></div>
            <div><label className="block text-slate-300 font-semibold mb-1">Network</label><div className="w-full px-3.5 py-2.5 rounded-xl bg-[#0a1026] border border-blue-500/20 text-cyan-300 font-semibold">BNB Smart Chain (BEP20)</div></div>
            <div><label className="block text-slate-300 font-semibold mb-1">Asset</label><div className="w-full px-3.5 py-2.5 rounded-xl bg-[#0a1026] border border-blue-500/20 text-white font-semibold">USDT</div></div>
            <div className="md:col-span-2"><label className="flex items-center gap-2 text-slate-300 font-semibold mb-1"><Link2 className="w-3.5 h-3.5" /> Wallet / Open Link</label><input value={settings.depositWalletLink || ''} onChange={(e) => setSettings({ ...settings, depositWalletLink: e.target.value.trim() })} placeholder="https://... or wallet deep link" className="w-full px-3.5 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white" /></div>
            <div className="md:col-span-2"><label className="flex items-center gap-2 text-slate-300 font-semibold mb-1"><QrCode className="w-3.5 h-3.5" /> QR Image URL</label><input value={settings.depositQrImageUrl || ''} onChange={(e) => setSettings({ ...settings, depositQrImageUrl: e.target.value.trim() })} placeholder="https://.../qr.png" className="w-full px-3.5 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white" /></div>
            <div className="md:col-span-2"><label className="block text-slate-300 font-semibold mb-1">Network Notice / Warning</label><input value={settings.depositNetworkNotice || ''} onChange={(e) => setSettings({ ...settings, depositNetworkNotice: e.target.value })} placeholder="Send only USDT using BEP20..." className="w-full px-3.5 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white" /></div>
          </div>

          {settings.depositQrImageUrl && <div className="flex justify-center"><div className="p-3 rounded-2xl bg-white"><img src={settings.depositQrImageUrl} alt="USDT BEP20 deposit QR preview" loading="lazy" decoding="async" className="w-44 h-44 object-contain" /></div></div>}
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 rounded-2xl bg-[#091129] border border-blue-500/25 space-y-3 text-xs"><div className="flex items-center gap-2 border-b border-blue-500/20 pb-2"><Layers className="w-4 h-4 text-cyan-400" /><h3 className="text-sm font-bold uppercase text-cyan-400">Package Visibility</h3></div><div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20"><span className="text-white font-semibold">Basic Package</span><div className="text-emerald-400 mt-1">LIVE / Visible to users</div></div><div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20"><span className="text-white font-semibold">FD Package</span><div className="text-emerald-400 mt-1">LIVE / Visible to users</div></div></div>
          <div className="p-5 rounded-2xl bg-[#091129] border border-blue-500/25 space-y-3 text-xs"><div className="flex items-center gap-2 border-b border-blue-500/20 pb-2"><ShieldCheck className="w-4 h-4 text-cyan-400" /><h3 className="text-sm font-bold uppercase text-cyan-400">Deposit Status</h3></div><div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20 flex justify-between"><span>USDT BEP20 Display</span><span className={settings.depositDisplayEnabled !== false ? 'text-emerald-400' : 'text-rose-400'}>{settings.depositDisplayEnabled !== false ? 'VISIBLE' : 'HIDDEN'}</span></div><div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20 flex justify-between"><span>Network</span><span className="text-cyan-300">BEP20 ONLY</span></div></div>
        </section>

        <div className="flex justify-end"><button type="submit" disabled={saving} className="px-7 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold text-xs flex items-center gap-2 disabled:opacity-50">{saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{saving ? 'Saving…' : 'Save USDT BEP20 Settings'}</button></div>
      </form>
    </div>
  );
};
