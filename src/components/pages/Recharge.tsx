import React, { useEffect, useMemo, useState } from 'react';
import { Wallet, Copy, Check, RefreshCw, ShieldCheck, AlertCircle, CheckCircle2, Clock3 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { getSystemSettings } from '../../services/settingsService.ts';
import { listUsdtRecharges, submitUsdtRecharge, type UsdtRechargeRequest } from '../../services/usdtRechargeService.ts';
import type { SystemSettings } from '../../types/index.ts';

type CryptoSettings = SystemSettings & {
  usdtBep20DepositAddress?: string;
  depositNetworkLabel?: string;
  depositNetworkNotice?: string;
  depositWalletLink?: string;
  depositQrImageUrl?: string;
  depositDisplayEnabled?: boolean;
};

const FALLBACK_BEP20_ADDRESS = '0x062D87BE020291b34D08fdCfa7E432248680910E';
const FALLBACK_BEP20_QR = '/usdt-bep20-qr.svg';

export const Recharge: React.FC = () => {
  const { wallet, user, profile, refreshWallet } = useAuth();
  const [settings, setSettings] = useState<CryptoSettings | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [txRef, setTxRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [requests, setRequests] = useState<UsdtRechargeRequest[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [depositAddress, setDepositAddress] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([
        getSystemSettings(),
        user ? listUsdtRecharges(user) : Promise.resolve({ requests: [], enabled: false, depositAddress: '' })
      ]);
      setSettings(s as CryptoSettings);
      setRequests(r.requests);
      setEnabled(r.enabled);
      setDepositAddress(r.depositAddress);
    } catch (err: any) {
      setError(err?.message || 'Unable to load recharge requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user?.uid]);

  // Wallet details must remain visible even when automated verification is temporarily disabled.
  const address = depositAddress || settings?.usdtBep20DepositAddress || FALLBACK_BEP20_ADDRESS;
  const qrUrl = settings?.depositQrImageUrl || FALLBACK_BEP20_QR;
  const recent = useMemo(() => requests.slice(0, 5), [requests]);

  const copyAddress = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const submitConfirmation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    if (!enabled) {
      setError('Automated payment confirmation is temporarily unavailable. You can still use the USDT BEP20 wallet address shown above.');
      return;
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || !/^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,8})?$/.test(amount.trim())) {
      return setError('Enter a valid USDT amount (up to 8 decimals).');
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(txRef.trim())) return setError('Enter a valid BSC transaction hash.');

    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const result = await submitUsdtRecharge(user, amount.trim(), txRef.trim(), '');
      await refreshWallet();
      setSuccess(
        result.status === 'approved'
          ? `Payment verified and ${amount.trim()} USDT credited to your Fund Wallet. Transaction ID: ${result.id}.`
          : `Payment confirmation submitted. Request ${result.id} is pending verification.`
      );
      setAmount('');
      setTxRef('');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Unable to submit payment confirmation. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-blue-500/20 pb-3">
        <div>
          <h2 className="text-xl font-bold text-white">Recharge — USDT BEP20</h2>
          <p className="text-xs text-slate-400 mt-1">Send only USDT on BNB Smart Chain (BEP20) to the wallet below.</p>
        </div>
        <div className="p-3 rounded-xl bg-[#091129] border border-blue-500/25 flex items-center gap-3">
          <Wallet className="w-5 h-5 text-cyan-400" />
          <div><div className="text-[10px] uppercase tracking-wider text-slate-500">Fund Balance</div><div className="text-sm font-bold font-mono text-cyan-300">{Number(wallet?.fundWallet || 0).toFixed(2)}</div></div>
        </div>
      </div>

      {success && <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" /><span>{success}</span></div>}
      {error && <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 text-xs flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span></div>}

      <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 flex gap-3 text-xs text-amber-700">
        <ShieldCheck className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <div><strong className="block mb-1">BNB Smart Chain (BEP20)</strong><span>{settings?.depositNetworkNotice || 'Send only USDT using the BNB Smart Chain (BEP20) network to this address. Sending any other asset or network may result in loss.'}</span></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 p-5 sm:p-6 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl space-y-5">
          <div className="flex items-center justify-between">
            <div><h3 className="text-sm font-bold text-white uppercase tracking-wider">Scan QR to Deposit USDT</h3><div className="text-[11px] text-cyan-500 mt-1">USDT • BEP20</div></div>
            <button onClick={load} disabled={loading} className="p-2 rounded-lg bg-[#0e173a] border border-blue-500/20 text-cyan-400 disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
          </div>

          <div className="flex justify-center"><div className="bg-white p-4 rounded-2xl shadow-lg"><img src={qrUrl} alt="USDT BEP20 deposit QR code" className="w-52 h-52 object-contain" loading="lazy" /></div></div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">USDT BEP20 Wallet Address</label>
            <div className="flex gap-2">
              <div className="flex-1 px-3.5 py-3 rounded-xl border border-blue-500/30 text-cyan-500 font-mono text-xs break-all">{address}</div>
              <button onClick={copyAddress} className="px-3 rounded-xl bg-blue-600/20 border border-blue-500/30 text-cyan-500">{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</button>
            </div>
          </div>

          {!enabled && <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-500 text-[11px]">Wallet deposit details are available. Automated payment verification is temporarily unavailable, so confirmation may need admin review later.</div>}
        </div>

        <form onSubmit={submitConfirmation} className="lg:col-span-5 p-5 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl space-y-4">
          <div><h3 className="text-sm font-bold text-white uppercase tracking-wider">Confirm Payment</h3><p className="text-[11px] text-slate-400 mt-1">After sending USDT BEP20, enter the amount and BSC transaction hash.</p></div>
          <div><label className="block text-xs font-semibold text-slate-300 mb-1">USDT Amount</label><input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="e.g. 50" className="w-full px-3.5 py-3 rounded-xl border border-blue-500/30" /></div>
          <div><label className="block text-xs font-semibold text-slate-300 mb-1">BSC Transaction Hash / TXID</label><input required value={txRef} onChange={e => setTxRef(e.target.value)} placeholder="0x..." maxLength={66} className="w-full px-3.5 py-3 rounded-xl border border-blue-500/30" /></div>
          <button type="submit" disabled={submitting} className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2">{submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}{submitting ? 'Confirming Payment…' : 'Confirm Payment'}</button>
          <p className="text-[10px] text-slate-500">Funds are credited only after verification/admin approval.</p>
        </form>
      </div>

      <section className="p-5 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl">
        <div className="flex items-center justify-between mb-4"><div><h3 className="text-sm font-bold text-white">My Recharge Requests</h3><p className="text-[11px] text-slate-400">Your submitted payment confirmations appear here.</p></div><button onClick={load} className="p-2 rounded-lg border border-blue-500/25"><RefreshCw className={`w-4 h-4 text-cyan-500 ${loading ? 'animate-spin' : ''}`} /></button></div>
        {recent.length === 0 ? <div className="text-xs text-slate-500 py-6 text-center">No payment confirmation submitted yet.</div> : <div className="space-y-2">{recent.map(r => <div key={r.id} className="p-3 rounded-xl border border-blue-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2"><div><div className="font-mono text-xs font-bold text-cyan-500">{r.id}</div><div className="text-[11px] text-slate-500">USDT {r.amountUsdt} • {new Date(r.createdAt).toLocaleString('en-IN')}</div><div className="text-[10px] text-slate-500 break-all">{r.txHash}</div></div><div className="flex items-center gap-2 text-xs font-semibold"><Clock3 className="w-4 h-4 text-amber-500" /><span className={r.status === 'approved' ? 'text-emerald-500' : r.status === 'rejected' ? 'text-rose-500' : 'text-amber-500'}>{r.status.toUpperCase()}</span>{r.creditInr && <span className="text-emerald-400">₹{r.creditInr} credited</span>}</div></div>)}</div>}
      </section>
    </div>
  );
};
