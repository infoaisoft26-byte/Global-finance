import React, { useEffect, useMemo, useState } from 'react';
import { Wallet, Copy, Check, RefreshCw, ShieldCheck, AlertCircle, ExternalLink, QrCode, CheckCircle2, Clock3, Upload } from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../../context/AuthContext.tsx';
import { storage } from '../../lib/firebase.ts';
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

type PaymentPopup = {
  type: 'not-found' | 'submitted' | 'error';
  title: string;
  message: string;
} | null;

const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const ALLOWED_PROOF_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export const Recharge: React.FC = () => {
  const { wallet, user, profile } = useAuth();
  const [settings, setSettings] = useState<CryptoSettings | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [txRef, setTxRef] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [requests, setRequests] = useState<TransactionRequest[]>([]);
  const [paymentPopup, setPaymentPopup] = useState<PaymentPopup>(null);

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
  const recent = useMemo(() => requests.slice(0, 8), [requests]);
  const pendingUsdt = useMemo(() => requests
    .filter(r => ['pending', 'under_review', 'approved', 'processing'].includes(r.status))
    .reduce((sum, r) => sum + Number(r.amountRupees || 0), 0), [requests]);
  const completedUsdt = useMemo(() => requests
    .filter(r => r.status === 'completed')
    .reduce((sum, r) => sum + Number(r.amountRupees || 0), 0), [requests]);

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const submitConfirmation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Enter a valid USDT amount.');
      return;
    }
    if (!txRef.trim()) {
      setError('');
      setPaymentPopup({
        type: 'not-found',
        title: 'Transaction Hash Required',
        message: 'Paste the BEP20 transaction hash/reference after making payment so the deposit can be verified.'
      });
      return;
    }
    if (!proofFile) {
      setError('Upload the payment screenshot before submitting.');
      return;
    }
    if (!ALLOWED_PROOF_TYPES.has(proofFile.type)) {
      setError('Payment proof must be PNG, JPG, JPEG or WEBP.');
      return;
    }
    if (proofFile.size > MAX_PROOF_BYTES) {
      setError('Payment screenshot must be 5MB or smaller.');
      return;
    }

    setSubmitting(true); setError(''); setSuccess('');
    try {
      const safeName = proofFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const proofPath = `payment_proofs/${user.uid}/${Date.now()}-${safeName}`;
      const proofRef = ref(storage, proofPath);
      await uploadBytes(proofRef, proofFile, {
        contentType: proofFile.type,
        customMetadata: { ownerUid: user.uid, asset: 'USDT', network: 'BEP20' }
      });
      const paymentProofUrl = await getDownloadURL(proofRef);

      const result = await createTransactionRequest({
        userId: user.uid,
        userEmail: user.email || undefined,
        userName: profile.name,
        userReferralCode: profile.referralCode,
        requestType: 'recharge',
        sourceWalletType: 'fund_wallet',
        destinationWalletType: 'fund_wallet',
        amountRupees: numericAmount,
        userNote: `USDT BEP20 payment confirmation. Transaction reference: ${txRef.trim()}`,
        metadata: {
          asset: 'USDT',
          network: 'BEP20',
          paymentReference: txRef.trim(),
          paymentConfirmationSubmitted: true,
          proofUploaded: true,
          paymentProofUrl,
          paymentProofStoragePath: proofPath
        }
      });

      setRequests(prev => [result.request, ...prev.filter(r => r.id !== result.request.id)]);
      const message = `Payment screenshot uploaded successfully. USDT ${numericAmount.toFixed(2)} is now shown as PENDING until verification.`;
      setSuccess(message);
      setPaymentPopup({
        type: 'submitted',
        title: 'Payment Proof Submitted',
        message: `USDT ${numericAmount.toFixed(2)} is visible as Pending USDT. It becomes spendable Available USDT only after verification.`
      });
      setAmount('');
      setTxRef('');
      setProofFile(null);
    } catch (err: any) {
      const message = err?.message || 'Unable to submit payment proof. Please try again.';
      setError(message);
      setPaymentPopup({ type: 'error', title: 'Payment Submission Failed', message });
    } finally { setSubmitting(false); }
  };

  if (settings?.depositDisplayEnabled === false) {
    return <div className="p-6 rounded-2xl bg-[#091129] border border-blue-500/25 text-center"><Wallet className="w-8 h-8 text-slate-500 mx-auto mb-3" /><h2 className="text-lg font-bold text-white">Deposit temporarily unavailable</h2><p className="text-xs text-slate-400 mt-2">Admin has temporarily hidden deposit wallet details.</p></div>;
  }

  return (
    <div className="space-y-6">
      {paymentPopup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px]">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 p-7 sm:p-9 text-center">
            <div className={`mx-auto mb-5 w-20 h-20 rounded-full border-4 flex items-center justify-center ${paymentPopup.type === 'submitted' ? 'border-emerald-300 text-emerald-500' : paymentPopup.type === 'error' ? 'border-rose-300 text-rose-500' : 'border-orange-300 text-orange-400'}`}>
              {paymentPopup.type === 'submitted' ? <CheckCircle2 className="w-10 h-10" /> : <AlertCircle className="w-10 h-10" />}
            </div>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-700">{paymentPopup.title}</h3>
            <p className="mt-4 text-sm sm:text-base text-slate-600 leading-relaxed">{paymentPopup.message}</p>
            <button type="button" onClick={() => setPaymentPopup(null)} className="mt-7 min-w-24 px-7 py-3 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-bold shadow-lg shadow-violet-200">OK</button>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-blue-500/20 pb-3">
        <div><h2 className="text-xl font-bold text-white">Recharge — USDT BEP20</h2><p className="text-xs text-slate-400 mt-1">Send USDT, upload payment proof and track verification here.</p></div>
        <div className="grid grid-cols-3 gap-2 w-full sm:w-auto">
          <div className="p-3 rounded-xl bg-[#091129] border border-blue-500/25"><div className="text-[10px] uppercase tracking-wider text-slate-500">Available USDT</div><div className="text-sm font-bold font-mono text-emerald-500">{Number(wallet?.fundWallet || 0).toFixed(2)}</div></div>
          <div className="p-3 rounded-xl bg-[#091129] border border-amber-500/25"><div className="text-[10px] uppercase tracking-wider text-slate-500">Pending USDT</div><div className="text-sm font-bold font-mono text-amber-500">{pendingUsdt.toFixed(2)}</div></div>
          <div className="p-3 rounded-xl bg-[#091129] border border-cyan-500/25"><div className="text-[10px] uppercase tracking-wider text-slate-500">Verified Deposits</div><div className="text-sm font-bold font-mono text-cyan-500">{completedUsdt.toFixed(2)}</div></div>
        </div>
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

        <form onSubmit={submitConfirmation} className="lg:col-span-5 p-5 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl space-y-4">
          <div><h3 className="text-sm font-bold text-white uppercase tracking-wider">Confirm Payment</h3><p className="text-[11px] text-slate-400 mt-1">Upload payment proof. Submitted amount appears immediately as Pending USDT.</p></div>
          <div><label className="block text-xs font-semibold text-slate-300 mb-1">USDT Amount</label><input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="e.g. 50" className="w-full px-3.5 py-3 rounded-xl border border-blue-500/30" /></div>
          <div><label className="block text-xs font-semibold text-slate-300 mb-1">Transaction Hash / Reference</label><input value={txRef} onChange={e => setTxRef(e.target.value)} placeholder="Paste BEP20 transaction hash/reference" className="w-full px-3.5 py-3 rounded-xl border border-blue-500/30" /></div>
          <div><label className="block text-xs font-semibold text-slate-300 mb-1">Payment Screenshot</label><label className="flex items-center justify-center gap-2 w-full min-h-24 rounded-xl border border-dashed border-blue-500/35 cursor-pointer bg-blue-500/5"><Upload className="w-4 h-4 text-cyan-500"/><span className="text-xs">{proofFile ? proofFile.name : 'Choose payment screenshot'}</span><input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => setProofFile(e.target.files?.[0] || null)} /></label><div className="text-[10px] text-slate-500 mt-1">PNG/JPG/WEBP, max 5MB.</div></div>
          <button type="submit" disabled={submitting} className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2">{submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}{submitting ? 'Uploading Proof…' : 'Submit Payment Proof'}</button>
          <p className="text-[10px] text-slate-500">Pending USDT is informational and cannot be spent. Available USDT is credited only after verification; package purchase then uses the verified Available USDT balance.</p>
        </form>
      </div>

      <section className="p-5 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl">
        <div className="flex items-center justify-between mb-4"><div><h3 className="text-sm font-bold text-white">My Recharge Requests</h3><p className="text-[11px] text-slate-400">Payment screenshots and verification status appear here.</p></div><button onClick={load} className="p-2 rounded-lg border border-blue-500/25"><RefreshCw className={`w-4 h-4 text-cyan-500 ${loading ? 'animate-spin' : ''}`} /></button></div>
        {recent.length === 0 ? <div className="text-xs text-slate-500 py-6 text-center">No payment confirmation submitted yet.</div> : <div className="space-y-2">{recent.map(r => <div key={r.id} className="p-3 rounded-xl border border-blue-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2"><div><div className="font-mono text-xs font-bold text-cyan-500">{r.reference}</div><div className="text-[11px] text-slate-500">USDT {Number(r.amountRupees || 0).toFixed(2)} • {new Date(r.createdAt).toLocaleString('en-IN')}</div></div><div className="flex items-center gap-2 text-xs font-semibold"><Clock3 className="w-4 h-4 text-amber-500" /><span className={r.status === 'completed' ? 'text-emerald-500' : r.status === 'rejected' ? 'text-rose-500' : 'text-amber-500'}>{r.status.replace(/_/g, ' ').toUpperCase()}</span>{(r.metadata as any)?.proofUploaded && <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 text-[10px]">Screenshot uploaded ✓</span>}</div></div>)}</div>}
      </section>
    </div>
  );
};
