import React, { useEffect, useState } from 'react';
import { AlertCircle, Check, CheckCircle2, Copy, ExternalLink, Image as ImageIcon, QrCode, RefreshCw, ShieldCheck, Upload, Wallet } from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../../context/AuthContext.tsx';
import { getSystemSettings } from '../../services/settingsService.ts';
import { storage } from '../../lib/firebase.ts';
import type { SystemSettings } from '../../types/index.ts';

type CryptoSettings = SystemSettings & {
  usdtBep20DepositAddress?: string;
  depositNetworkNotice?: string;
  depositWalletLink?: string;
  depositQrImageUrl?: string;
  depositDisplayEnabled?: boolean;
};

type VerifyState = {
  kind: 'success' | 'pending' | 'error';
  title: string;
  message: string;
} | null;

const MAX_PROOF_SIZE = 8 * 1024 * 1024;
const ALLOWED_PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const Recharge: React.FC = () => {
  const { wallet, user, refreshWallet } = useAuth();
  const [settings, setSettings] = useState<CryptoSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<VerifyState>(null);

  const loadSettings = async () => {
    setLoading(true);
    try {
      setSettings(await getSystemSettings() as CryptoSettings);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadSettings(); }, []);
  useEffect(() => () => { if (proofPreview) URL.revokeObjectURL(proofPreview); }, [proofPreview]);

  const address = String(settings?.usdtBep20DepositAddress || '').trim();

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const chooseProof = (file?: File) => {
    setResult(null);
    if (!file) {
      setProofFile(null);
      if (proofPreview) URL.revokeObjectURL(proofPreview);
      setProofPreview('');
      return;
    }
    if (!ALLOWED_PROOF_TYPES.includes(file.type)) {
      setResult({ kind: 'error', title: 'Invalid Screenshot', message: 'Upload a PNG, JPG/JPEG, or WEBP payment screenshot.' });
      return;
    }
    if (file.size > MAX_PROOF_SIZE) {
      setResult({ kind: 'error', title: 'Screenshot Too Large', message: 'Payment screenshot must be 8 MB or smaller.' });
      return;
    }
    if (proofPreview) URL.revokeObjectURL(proofPreview);
    setProofFile(file);
    setProofPreview(URL.createObjectURL(file));
  };

  const uploadProof = async (uid: string, hash: string) => {
    if (!proofFile) return '';
    const safeName = proofFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectRef = ref(storage, `payment_proofs/${uid}/${hash}/${Date.now()}-${safeName}`);
    await uploadBytes(objectRef, proofFile, {
      contentType: proofFile.type,
      customMetadata: { ownerUid: uid, txHash: hash, asset: 'USDT', network: 'BEP20' },
    });
    return getDownloadURL(objectRef);
  };

  const confirmPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    const hash = txHash.trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
      setResult({ kind: 'error', title: 'Invalid Transaction Hash', message: 'Paste a valid BNB Smart Chain transaction hash (0x + 64 hexadecimal characters).' });
      return;
    }

    setVerifying(true);
    setResult(null);
    try {
      const paymentProofUrl = await uploadProof(user.uid, hash);
      const idToken = await user.getIdToken();
      const response = await fetch('/api/usdt-bep20-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ txHash: hash, paymentProofUrl }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.status === 202) {
        setResult({
          kind: 'pending',
          title: 'Payment Submitted — Waiting for Confirmations',
          message: data.error || `Confirmations: ${Number(data.confirmations || 0)} / ${Number(data.requiredConfirmations || 12)}. Please retry shortly.`,
        });
        return;
      }

      if (!response.ok || !data.verified || !data.credited) {
        throw new Error(data.error || 'This payment could not be verified as a USDT BEP20 deposit to the Global Finance wallet.');
      }

      await refreshWallet();
      const amount = Number(data.amount || 0).toFixed(2);
      setResult({
        kind: 'success',
        title: data.alreadyCredited ? 'Payment Already Confirmed' : 'Payment Confirmed',
        message: data.alreadyCredited
          ? `This transaction was already processed. USDT ${amount} is already included in your Available USDT balance.${paymentProofUrl ? ' Screenshot attached.' : ''}`
          : `USDT ${amount} was verified on BNB Smart Chain and automatically credited to your Available USDT balance.${paymentProofUrl ? ' Payment screenshot uploaded successfully.' : ''}`,
      });
      setTxHash('');
      setProofFile(null);
      if (proofPreview) URL.revokeObjectURL(proofPreview);
      setProofPreview('');
    } catch (error: any) {
      setResult({ kind: 'error', title: 'Confirm Payment Failed', message: error?.message || 'Unable to confirm this payment right now.' });
    } finally {
      setVerifying(false);
    }
  };

  if (settings?.depositDisplayEnabled === false) {
    return (
      <div className="p-6 rounded-2xl bg-[#091129] border border-blue-500/25 text-center">
        <Wallet className="w-8 h-8 text-slate-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-white">Deposit temporarily unavailable</h2>
        <p className="text-xs text-slate-400 mt-2">Admin has temporarily hidden deposit wallet details.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-blue-500/20 pb-3">
        <div>
          <h2 className="text-xl font-bold text-white">Recharge — USDT BEP20</h2>
          <p className="text-xs text-slate-400 mt-1">Send USDT, enter the transaction hash, optionally upload your payment screenshot, then press Confirm Payment.</p>
        </div>
        <div className="p-3 rounded-xl bg-[#091129] border border-emerald-500/25 min-w-44">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Available USDT</div>
          <div className="text-lg font-bold font-mono text-emerald-500">{Number(wallet?.fundWallet || 0).toFixed(2)}</div>
        </div>
      </div>

      {result && (
        <div className={`p-4 rounded-xl border text-xs flex gap-3 ${result.kind === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700' : result.kind === 'pending' ? 'bg-amber-500/10 border-amber-500/30 text-amber-700' : 'bg-rose-500/10 border-rose-500/30 text-rose-700'}`}>
          {result.kind === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          <div><div className="font-bold mb-1">{result.title}</div><div>{result.message}</div></div>
        </div>
      )}

      <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 flex gap-3 text-xs text-amber-700">
        <ShieldCheck className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <strong className="block mb-1">USDT on BNB Smart Chain (BEP20) only</strong>
          <span>{settings?.depositNetworkNotice || 'Send only USDT using the BNB Smart Chain (BEP20) network to this address.'} The transaction hash is verified on-chain before any USDT is credited. Screenshot is supporting proof only.</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 p-5 sm:p-6 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl space-y-5">
          <div className="flex items-center justify-between">
            <div><h3 className="text-sm font-bold text-white uppercase tracking-wider">Deposit USDT</h3><div className="text-[11px] text-cyan-500 mt-1">BNB Smart Chain • BEP20</div></div>
            <button onClick={loadSettings} disabled={loading} className="p-2 rounded-lg border border-blue-500/20 text-cyan-500 disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
          </div>

          {settings?.depositQrImageUrl ? (
            <div className="flex justify-center"><div className="bg-white p-4 rounded-2xl shadow-lg"><img src={settings.depositQrImageUrl} alt="USDT BEP20 deposit QR" className="w-52 h-52 object-contain" /></div></div>
          ) : (
            <div className="p-8 rounded-2xl border border-dashed border-blue-500/30 text-center text-slate-500"><QrCode className="w-10 h-10 mx-auto mb-2" /><div className="text-xs">Deposit QR is not configured.</div></div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">USDT BEP20 Wallet Address</label>
            {address ? (
              <div className="flex gap-2">
                <div className="flex-1 px-3.5 py-3 rounded-xl border border-blue-500/30 text-cyan-500 font-mono text-xs break-all">{address}</div>
                <button type="button" onClick={copyAddress} className="px-3 rounded-xl bg-blue-600/20 border border-blue-500/30 text-cyan-500">{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</button>
              </div>
            ) : <div className="p-4 rounded-xl border border-amber-500/30 text-amber-500 text-xs">Admin has not configured the deposit wallet.</div>}
          </div>

          {settings?.depositWalletLink && <a href={settings.depositWalletLink} target="_blank" rel="noreferrer" className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-xs font-bold"><ExternalLink className="w-4 h-4" />Open Wallet / Payment Link</a>}
        </div>

        <form onSubmit={confirmPayment} className="lg:col-span-5 p-5 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl space-y-4">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Confirm Payment</h3>
            <p className="text-[11px] text-slate-400 mt-1">Paste the real BEP20 transaction hash. You can also upload the payment screenshot for reference.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Transaction Hash</label>
            <input value={txHash} onChange={e => setTxHash(e.target.value)} placeholder="0x..." className="w-full px-3.5 py-3 rounded-xl border border-blue-500/30 font-mono text-xs" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Payment Screenshot <span className="font-normal text-slate-500">(optional)</span></label>
            <label className="flex items-center justify-center gap-2 w-full min-h-24 px-4 py-4 rounded-xl border-2 border-dashed border-blue-500/30 cursor-pointer hover:border-cyan-400/60 transition-colors">
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => chooseProof(e.target.files?.[0])} />
              <Upload className="w-5 h-5 text-cyan-500" />
              <div className="text-left"><div className="text-xs font-bold">Upload Payment Screenshot</div><div className="text-[10px] text-slate-500">PNG, JPG, WEBP • Max 8 MB</div></div>
            </label>
            {proofFile && (
              <div className="mt-2 p-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 flex items-center gap-3">
                {proofPreview ? <img src={proofPreview} alt="Payment proof preview" className="w-12 h-12 rounded-lg object-cover border" /> : <ImageIcon className="w-5 h-5" />}
                <div className="min-w-0 flex-1"><div className="text-xs font-semibold truncate">{proofFile.name}</div><div className="text-[10px] text-emerald-600">Screenshot selected ✓</div></div>
                <button type="button" onClick={() => chooseProof(undefined)} className="text-[10px] px-2 py-1 rounded-lg border border-slate-300">Remove</button>
              </div>
            )}
          </div>

          <button type="submit" disabled={verifying || !address} className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {verifying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {verifying ? 'Confirming Payment…' : 'Confirm Payment'}
          </button>

          <div className="text-[10px] leading-relaxed text-slate-500">Security: screenshot upload alone never credits funds. Only a valid confirmed USDT BEP20 transaction to the configured wallet can credit Available USDT, and each transaction hash can be credited once.</div>
        </form>
      </div>
    </div>
  );
};
