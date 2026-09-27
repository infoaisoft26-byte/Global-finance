import React, { useEffect, useMemo, useState } from 'react';
import { Wallet, Copy, Check, RefreshCw, ShieldCheck, Coins, AlertCircle, ExternalLink, QrCode } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { getSystemSettings } from '../../services/settingsService.ts';
import type { SystemSettings } from '../../types/index.ts';

type CryptoSettings = SystemSettings & {
  trxDepositAddress?: string;
  usdtTrc20DepositAddress?: string;
  depositNetworkLabel?: string;
  depositNetworkNotice?: string;
  depositWalletLink?: string;
  depositQrImageUrl?: string;
  depositDisplayEnabled?: boolean;
};

type Asset = 'USDT' | 'TRX';

export const Recharge: React.FC = () => {
  const { wallet } = useAuth();
  const [settings, setSettings] = useState<CryptoSettings | null>(null);
  const [asset, setAsset] = useState<Asset>('USDT');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setSettings((await getSystemSettings(true)) as CryptoSettings); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const address = useMemo(() => {
    if (!settings) return '';
    return asset === 'USDT' ? (settings.usdtTrc20DepositAddress || '') : (settings.trxDepositAddress || '');
  }, [asset, settings]);

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
        <div><h2 className="text-xl font-bold text-white">Recharge</h2><p className="text-xs text-slate-400 mt-1">Scan the admin-provided QR or copy the wallet address shown below.</p></div>
        <div className="p-3 rounded-xl bg-[#091129] border border-blue-500/25 flex items-center gap-3"><Wallet className="w-5 h-5 text-cyan-400" /><div><div className="text-[10px] uppercase tracking-wider text-slate-500">Fund Balance</div><div className="text-sm font-bold font-mono text-cyan-300">{Number(wallet?.fundWallet || 0).toFixed(2)}</div></div></div>
      </div>

      <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 flex gap-3 text-xs text-amber-100"><ShieldCheck className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" /><div><strong className="block mb-1">{settings?.depositNetworkLabel || 'TRON Testnet'}</strong><span>{settings?.depositNetworkNotice || 'Send only the selected testnet asset to the matching address.'}</span></div></div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 p-5 sm:p-6 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl space-y-5">
          <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-white uppercase tracking-wider">Scan QR to Deposit</h3><button onClick={load} disabled={loading} className="p-2 rounded-lg bg-[#0e173a] border border-blue-500/20 text-cyan-400 disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button></div>

          <div className="grid grid-cols-2 gap-3">{(['USDT','TRX'] as Asset[]).map((item) => <button key={item} onClick={() => setAsset(item)} className={`p-4 rounded-xl border text-left transition-all ${asset === item ? 'bg-blue-600/20 border-cyan-400' : 'bg-[#060b1c] border-blue-500/20 hover:border-blue-500/40'}`}><div className="flex items-center gap-2"><Coins className="w-4 h-4 text-cyan-400" /><span className="font-bold text-white">{item}</span></div><div className="text-[11px] text-slate-400 mt-1">{item === 'USDT' ? 'USDT • TRC20' : 'TRX • TRON'}</div></button>)}</div>

          {settings?.depositQrImageUrl ? <div className="flex justify-center"><div className="bg-white p-4 rounded-2xl shadow-lg"><img src={settings.depositQrImageUrl} alt="Deposit QR code" className="w-52 h-52 object-contain" /></div></div> : <div className="p-8 rounded-2xl bg-[#060b1c] border border-dashed border-blue-500/30 text-center text-slate-500"><QrCode className="w-10 h-10 mx-auto mb-2" /><div className="text-xs">Admin has not added a QR image yet.</div></div>}

          <div><label className="block text-xs font-semibold text-slate-300 mb-1.5">Deposit Wallet Address</label>{address ? <div className="flex gap-2"><div className="flex-1 px-3.5 py-3 rounded-xl bg-[#060b1c] border border-blue-500/30 text-cyan-300 font-mono text-xs break-all">{address}</div><button onClick={copyAddress} className="px-3 rounded-xl bg-blue-600/20 border border-blue-500/30 text-cyan-300">{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</button></div> : <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-200 text-xs flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" /><span>No {asset} deposit address is configured yet.</span></div>}</div>

          {settings?.depositWalletLink && <a href={settings.depositWalletLink} target="_blank" rel="noreferrer" className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-xs font-bold"><ExternalLink className="w-4 h-4" />Open Wallet / Payment Link</a>}

          <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20 text-[11px] text-slate-400 leading-relaxed">These wallet details are controlled by the admin and automatically update for all users. Real-money automatic credit is not enabled here; use the separate verified testnet reconciliation flow for automated testing.</div>
        </div>

        <div className="lg:col-span-5 p-5 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl space-y-4"><h3 className="text-sm font-bold text-white uppercase tracking-wider">Payment Instructions</h3><div className="space-y-3 text-xs"><div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/15"><span className="text-slate-500 block text-[10px] uppercase">Network</span><strong className="text-white">{settings?.depositNetworkLabel || 'Configured by admin'}</strong></div><div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/15"><span className="text-slate-500 block text-[10px] uppercase">USDT</span><strong className="text-white">TRC20 only when selected</strong></div><div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/15"><span className="text-slate-500 block text-[10px] uppercase">Status</span><strong className="text-amber-300">Use testnet verification flow for automatic confirmation</strong></div></div></div>
      </div>
    </div>
  );
};
