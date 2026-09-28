import React, { useEffect, useMemo, useState } from 'react';
import { Wallet, Copy, Check, RefreshCw, ShieldCheck, AlertCircle, ExternalLink, QrCode, Upload, CheckCircle2, Clock3 } from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../lib/firebase.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { getSystemSettings } from '../../services/settingsService.ts';
import { createTransactionRequest, getUserTransactionRequests } from '../../services/transactionRequestService.ts';
import type { SystemSettings, TransactionRequest } from '../../types/index.ts';

type CryptoSettings = SystemSettings & {
  usdtBep20DepositAddress?: string;
  depositNetworkLabel?: string;
  depositNetworkNotice?: string;
  depositWalletLink?: string;
  depositQrImageUrl?: string;
  depositDisplayEnabled?: boolean;
};

export const Recharge: React.FC = () => {
  const { wallet, user, profile } = useAuth();
  const [settings, setSettings] = useState<CryptoSettings | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [txRef, setTxRef] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [requests, setRequests] = useState<TransactionRequest[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([
        getSystemSettings(),
        user ? getUserTransactionRequests(user.uid, 'recharge') : Promise.resolve([])
      ]);
      setSettings(s as CryptoSettings);
      setRequests(r);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [user?.uid]);

  const address = settings?.usdtBep20DepositAddress || '';
  const recent = useMemo(() => requests.slice(0, 5), [requests]);

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleProof = (file?: File) => {
    if (!file) return setProof(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Payment screenshot must be JPG, PNG or WEBP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Payment screenshot must be below 5 MB.');
      return;
    }
    setError('');
    setProof(file);
  };

  const submitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return setError('Enter a valid USDT amount.');
    if (!proof) return setError('Upload your payment screenshot before submitting.');

    setSubmitting(true); setError(''); setSuccess('');
    try {
      const safeName = proof.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const proofPath = `payment_proofs/${user.uid}/${Date.now()}_${safeName}`;
      const storageRef = ref(storage, proofPath);
      await uploadBytes(storageRef, proof, { contentType: proof.type, customMetadata: { ownerUid: user.uid, purpose: 'usdt_bep20_recharge' } });
      const proofUrl = await getDownloadURL(storageRef);

      const result = await createTransactionRequest({
        userId: user.uid,
        userEmail: user.email || undefined,
        userName: profile.name,
        userReferralCode: profile.referralCode,
        requestType: 'recharge',
        sourceWalletType: 'fund_wallet',
        destinationWalletType: 'fund_wallet',
        amountRupees: numericAmount,
        userNote: txRef.trim() ? `USDT BEP20 payment reference: ${txRef.trim()}` : 'USDT BEP20 payment proof uploaded by member.',
        metadata: {
          asset: 'USDT',
          network: 'BEP20',
          paymentProofUrl: proofUrl,
          paymentProofPath: proofPath,
          paymentProofFileName: proof.name,
          paymentReference: txRef.trim(),
          proofUploaded: true
        }
      });

      setRequests(prev => [result.request, ...prev.filter(r => r.id !== result.request.id)]);
      setSuccess(`Payment screenshot uploaded successfully. Request ${result.request.reference} is now reflected in your account as ${result.request.status.toUpperCase()}.`);
      setAmount(''); setTxRef(''); setProof(null);
    } catch (err: any) {
      setError(err?.message || 'Unable to upload payment screenshot. Please try again.');
    } finally { setSubmitting(false); }
  };

  if (settings?.depositDisplayEnabled === false) {
    return <div className="p-6 rounded-2xl bg-[#091129] border border-blue-500/25 text-center"><Wallet className="w-8 h-8 text-slate-500 mx-auto mb-3" /><h2 className="text-lg font-bold text-white">Deposit temporarily unavailable</h2><p className="text-xs text-slate-400 mt-2">Admin has temporarily hidden deposit wallet details.</p></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-blue-500/20 pb-3">
        <div><h2 className="text-xl font-bold text-white">Recharge — USDT BEP20</h2><p className="text-xs text-slate-400 mt-1">Pay using the wallet below, then upload the payment screenshot for admin verification.</p></div>
        <div className="p-3 rounded-xl bg-[#091129] border border-blue-500/25 flex items-center gap-3"><Wallet className="w-5 h-5 text-cyan-400" /><div><div className="text-[10px] uppercase tracking-wider text-slate-500">Fund Balance</div><div className="text-sm font-bold font-mono text-cyan-300">{Number(wallet?.fundWallet || 0).toFixed(2)}</div></div></div>
      </div>

      {success && <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" /><span>{success}</span></div>}
      {error && <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 text-xs flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span></div>}

      <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 flex gap-3 text-xs text-amber-700"><ShieldCheck className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" /><div><strong className="block mb-1">BNB Smart Chain (BEP20)</strong><span>{settings?.depositNetworkNotice || 'Send only USDT using the BNB Smart Chain (BEP20) network to this address.'}</span></div></div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 p-5 sm:p-6 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl space-y-5">
          <div className="flex items-center justify-between"><div><h3 className="text-sm font-bold text-white uppercase tracking-wider">Scan QR to Deposit USDT</h3><div className="text-[11px] text-cyan-500 mt-1">USDT • BEP20</div></div><button onClick={load} disabled={loading} className="p-2 rounded-lg bg-[#0e173a] border border-blue-500/20 text-cyan-400 disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button></div>
          {settings?.depositQrImageUrl ? <div className="flex justify-center"><div className="bg-white p-4 rounded-2xl shadow-lg"><img src={settings.depositQrImageUrl} alt="USDT BEP20 deposit QR code" className="w-52 h-52 object-contain" loading="lazy" /></div></div> : <div className="p-8 rounded-2xl border border-dashed border-blue-500/30 text-center text-slate-500"><QrCode className="w-10 h-10 mx-auto mb-2" /><div className="text-xs">Admin has not added the BEP20 QR image yet.</div></div>}
          <div><label className="block text-xs font-semibold text-slate-300 mb-1.5">USDT BEP20 Wallet Address</label>{address ? <div className="flex gap-2"><div className="flex-1 px-3.5 py-3 rounded-xl border border-blue-500/30 text-cyan-500 font-mono text-xs break-all">{address}</div><button onClick={copyAddress} className="px-3 rounded-xl bg-blue-600/20 border border-blue-500/30 text-cyan-500">{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</button></div> : <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-500 text-xs">Admin has not configured the USDT BEP20 deposit address yet.</div>}</div>
          {settings?.depositWalletLink && <a href={settings.depositWalletLink} target="_blank" rel="noreferrer" className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-xs font-bold"><ExternalLink className="w-4 h-4" />Open Wallet / Payment Link</a>}
        </div>

        <form onSubmit={submitProof} className="lg:col-span-5 p-5 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl space-y-4">
          <div><h3 className="text-sm font-bold text-white uppercase tracking-wider">Upload Payment Proof</h3><p className="text-[11px] text-slate-400 mt-1">After payment, upload the screenshot. It will automatically appear in your account as a pending recharge request.</p></div>
          <div><label className="block text-xs font-semibold text-slate-300 mb-1">USDT Amount</label><input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="e.g. 50" className="w-full px-3.5 py-3 rounded-xl border border-blue-500/30" /></div>
          <div><label className="block text-xs font-semibold text-slate-300 mb-1">Transaction Hash / Reference <span className="font-normal text-slate-500">(optional)</span></label><input value={txRef} onChange={e => setTxRef(e.target.value)} placeholder="Paste transaction hash/reference" className="w-full px-3.5 py-3 rounded-xl border border-blue-500/30" /></div>
          <label className="block p-4 rounded-xl border border-dashed border-cyan-500/40 cursor-pointer text-center hover:border-cyan-400 transition-colors"><Upload className="w-6 h-6 mx-auto text-cyan-500 mb-2" /><div className="text-xs font-semibold">{proof ? proof.name : 'Choose payment screenshot'}</div><div className="text-[10px] text-slate-500 mt-1">JPG / PNG / WEBP • max 5 MB</div><input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => handleProof(e.target.files?.[0])} /></label>
          <button type="submit" disabled={submitting || !proof} className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2">{submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}{submitting ? 'Uploading & Submitting…' : 'Upload Screenshot & Submit'}</button>
          <p className="text-[10px] text-slate-500">Submitting a screenshot does not credit funds automatically. Balance is updated only after admin verification/completion.</p>
        </form>
      </div>

      <section className="p-5 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl">
        <div className="flex items-center justify-between mb-4"><div><h3 className="text-sm font-bold text-white">My Recharge Requests</h3><p className="text-[11px] text-slate-400">Automatic account reflection after proof upload.</p></div><button onClick={load} className="p-2 rounded-lg border border-blue-500/25"><RefreshCw className={`w-4 h-4 text-cyan-500 ${loading ? 'animate-spin' : ''}`} /></button></div>
        {recent.length === 0 ? <div className="text-xs text-slate-500 py-6 text-center">No payment screenshot submitted yet.</div> : <div className="space-y-2">{recent.map(r => <div key={r.id} className="p-3 rounded-xl border border-blue-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2"><div><div className="font-mono text-xs font-bold text-cyan-500">{r.reference}</div><div className="text-[11px] text-slate-500">USDT {Number(r.amountRupees || 0).toFixed(2)} • {new Date(r.createdAt).toLocaleString('en-IN')}</div></div><div className="flex items-center gap-2 text-xs font-semibold"><Clock3 className="w-4 h-4 text-amber-500" /><span className={r.status === 'completed' ? 'text-emerald-500' : r.status === 'rejected' ? 'text-rose-500' : 'text-amber-500'}>{r.status.replace(/_/g, ' ').toUpperCase()}</span>{(r.metadata as any)?.proofUploaded && <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 text-[10px]">Screenshot uploaded ✓</span>}</div></div>)}</div>}
      </section>
    </div>
  );
};
