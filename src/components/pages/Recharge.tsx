import React, { useEffect, useState } from 'react';
import { Wallet, Copy, Check, RefreshCw, ShieldCheck, AlertCircle, ExternalLink, QrCode } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { getSystemSettings } from '../../services/settingsService.ts';
import type { SystemSettings } from '../../types/index.ts';

type CryptoSettings = SystemSettings & {
  usdtBep20DepositAddress?: string;
  depositNetworkLabel?: string;
  depositNetworkNotice?: string;
  depositWalletLink?: string;
  depositQrImageUrl?: string;
  depositDisplayEnabled?: boolean;
};

export const Recharge: React.FC = () => {
  const { wallet } = useAuth();
  const [settings, setSettings] = useState<CryptoSettings | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setSettings((await getSystemSettings(true)) as CryptoSettings); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const address = settings?.usdtBep20DepositAddress || '';

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  if (settings?.depositDisplayEnabled === false) {
    return <div className="p-6 rounded-2xl bg-[#091129] border border-blue-500/25 text-center"><Wallet className="w-8 h-8 text-slate-500 mx-auto mb-3" /><h2 className="text-lg font-bold text-white">Deposit temporarily unavailable</h2><p className="text-xs text-slate-400 mt-2">Admin has temporarily hidden deposit wallet details.</p></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-blue-500/20 pb-3">
        <div><h2 className="text-xl font-bold text-white">Recharge — USDT BEP20</h2><p className="text-xs text-slate-400 mt-1">Scan the QR or copy the admin-provided USDT BEP20 wallet address.</p></div>
        <div className="p-3 rounded-xl bg-[#091129] border border-blue-500/25 flex items-center gap-3"><Wallet className="w-5 h-5 text-cyan-400" /><div><div className="text-[10px] uppercase tracking-wider text-slate-500">Fund Balance</div><div className="text-sm font-bold font-mono text-cyan-300">{Number(wallet?.fundWallet || 0).toFixed(2)}</div></div></div>
      </div>

      <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 flex gap-3 text-xs text-amber-100"><ShieldCheck className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" /><div><strong className="block mb-1">BNB Smart Chain (BEP20)</strong><span>{settings?.depositNetworkNotice || 'Send only USDT using the BNB Smart Chain (BEP20) network to this address.'}</span></div></div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 p-5 sm:p-6 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl space-y-5">
          <div className="flex items-center justify-between"><div><h3 className="text-sm font-bold text-white uppercase tracking-wider">Scan QR to Deposit USDT</h3><div className="text-[11px] text-cyan-300 mt-1">USDT • BEP20</div></div><button onClick={load} disabled={loading} className="p-2 rounded-lg bg-[#0e173a] border border-blue-500/20 text-cyan-400 disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button></div>

          <div className="p-4 rounded-xl bg-blue-950/20 border border-blue-500/25"><div className="text-[10px] uppercase text-slate-500">Accepted Asset</div><div className="text-base font-bold text-white mt-1">USDT</div><div className="text-xs text-cyan-300 mt-1">BNB Smart Chain (BEP20) only</div></div>

          {settings?.depositQrImageUrl ? <div className="flex justify-center"><div className="bg-white p-4 rounded-2xl shadow-lg"><img src={settings.depositQrImageUrl} alt="USDT BEP20 deposit QR code" className="w-52 h-52 object-contain" /></div></div> : <div className="p-8 rounded-2xl bg-[#060b1c] border border-dashed border-blue-500/30 text-center text-slate-500"><QrCode className="w-10 h-10 mx-auto mb-2" /><div className="text-xs">Admin has not added the BEP20 QR image yet.</div></div>}

          <div><label className="block text-xs font-semibold text-slate-300 mb-1.5">USDT BEP20 Wallet Address</label>{address ? <div className="flex gap-2"><div className="flex-1 px-3.5 py-3 rounded-xl bg-[#060b1c] border border-blue-500/30 text-cyan-300 font-mono text-xs break-all">{address}</div><button onClick={copyAddress} className="px-3 rounded-xl bg-blue-600/20 border border-blue-500/30 text-cyan-300">{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</button></div> : <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-200 text-xs flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" /><span>Admin has not configured the USDT BEP20 deposit address yet.</span></div>}</div>

          {settings?.depositWalletLink && <a href={settings.depositWalletLink} target="_blank" rel="noreferrer" className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-xs font-bold"><ExternalLink className="w-4 h-4" />Open Wallet / Payment Link</a>}
        </div>

        <div className="lg:col-span-5 p-5 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl space-y-4"><h3 className="text-sm font-bold text-white uppercase tracking-wider">Payment Instructions</h3><div className="space-y-3 text-xs"><div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/15"><span className="text-slate-500 block text-[10px] uppercase">Network</span><strong className="text-white">BNB Smart Chain (BEP20)</strong></div><div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/15"><span className="text-slate-500 block text-[10px] uppercase">Asset</span><strong className="text-white">USDT only</strong></div><div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/15"><span className="text-slate-500 block text-[10px] uppercase">Important</span><strong className="text-amber-300">Do not use TRC20, TRX, ERC20, Nile or Shasta on this deposit screen.</strong></div></div></div>
      </div>
    </div>
  );
};
