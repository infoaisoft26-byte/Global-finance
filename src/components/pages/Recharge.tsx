import React, { useEffect, useMemo, useState } from 'react';
import { Wallet, Copy, Check, RefreshCw, ShieldCheck, Coins, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { getSystemSettings } from '../../services/settingsService.ts';
import type { SystemSettings } from '../../types/index.ts';

type CryptoSettings = SystemSettings & {
  trxDepositAddress?: string;
  usdtTrc20DepositAddress?: string;
  depositNetworkNotice?: string;
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
    try {
      setSettings((await getSystemSettings()) as CryptoSettings);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const address = useMemo(() => {
    if (!settings) return '';
    return asset === 'USDT'
      ? (settings.usdtTrc20DepositAddress || '')
      : (settings.trxDepositAddress || '');
  }, [asset, settings]);

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-blue-500/20 pb-3">
        <div>
          <h2 className="text-xl font-bold text-white">Crypto Deposit</h2>
          <p className="text-xs text-slate-400 mt-1">TRON network only — TRX and USDT (TRC20). INR, bank transfer, UPI and HDFC details are not shown.</p>
        </div>
        <div className="p-3 rounded-xl bg-[#091129] border border-blue-500/25 flex items-center gap-3">
          <Wallet className="w-5 h-5 text-cyan-400" />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Platform Fund Balance</div>
            <div className="text-sm font-bold font-mono text-cyan-300">{Number(wallet?.fundWallet || 0).toFixed(2)}</div>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-[#0c1638] border border-blue-500/30 flex gap-3 text-xs text-slate-300">
        <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-cyan-300 block mb-1">Admin-controlled deposit destination</strong>
          <span>{settings?.depositNetworkNotice || 'Send only the selected TRON asset to the matching address.'}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 p-5 sm:p-6 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Select Asset</h3>
            <button onClick={load} disabled={loading} className="p-2 rounded-lg bg-[#0e173a] border border-blue-500/20 text-cyan-400 disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {(['USDT','TRX'] as Asset[]).map((item) => (
              <button key={item} onClick={() => setAsset(item)} className={`p-4 rounded-xl border text-left transition-all ${asset === item ? 'bg-blue-600/20 border-cyan-400' : 'bg-[#060b1c] border-blue-500/20 hover:border-blue-500/40'}`}>
                <div className="flex items-center gap-2"><Coins className="w-4 h-4 text-cyan-400" /><span className="font-bold text-white">{item}</span></div>
                <div className="text-[11px] text-slate-400 mt-1">{item === 'USDT' ? 'USDT • TRC20' : 'TRX • TRON'}</div>
              </button>
            ))}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Admin Deposit Address</label>
            {address ? (
              <div className="flex gap-2">
                <div className="flex-1 px-3.5 py-3 rounded-xl bg-[#060b1c] border border-blue-500/30 text-cyan-300 font-mono text-xs break-all">{address}</div>
                <button onClick={copyAddress} className="px-3 rounded-xl bg-blue-600/20 border border-blue-500/30 text-cyan-300">{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</button>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-200 text-xs flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>No {asset} deposit address is configured yet. Admin must add the address in System Settings before users can make a deposit.</span>
              </div>
            )}
          </div>

          <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20 text-[11px] text-slate-400 leading-relaxed">
            Deposit submission/auto-credit remains disabled until the payment provider or verified on-chain reconciliation flow is configured. This prevents accidental real-money credits from unverified transfers.
          </div>
        </div>

        <div className="lg:col-span-5 p-5 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Network Rules</h3>
          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/15"><span className="text-slate-500 block text-[10px] uppercase">USDT</span><strong className="text-white">TRC20 only</strong></div>
            <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/15"><span className="text-slate-500 block text-[10px] uppercase">TRX</span><strong className="text-white">TRON network only</strong></div>
            <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/15"><span className="text-slate-500 block text-[10px] uppercase">INR / Bank / UPI</span><strong className="text-rose-300">Disabled / Hidden</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
};
