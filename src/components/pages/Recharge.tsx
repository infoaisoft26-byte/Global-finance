import React, { useEffect, useState } from 'react';
import { Wallet, Copy, Check, RefreshCw, ShieldCheck, AlertCircle, CheckCircle2, QrCode } from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../../context/AuthContext.tsx';
import { storage } from '../../lib/firebase.ts';
import { getSystemSettings } from '../../services/settingsService.ts';
import type { SystemSettings } from '../../types/index.ts';

type CryptoSettings = SystemSettings & {
  usdtBep20DepositAddress?: string;
  depositNetworkNotice?: string;
  depositWalletLink?: string;
  depositQrImageUrl?: string;
  depositDisplayEnabled?: boolean;
};

type VerifyState = { kind: 'success' | 'pending' | 'error'; title: string; message: string } | null;

export const Recharge: React.FC = () => {
  const { wallet, user, refreshWallet } = useAuth();
  const [settings, setSettings] = useState<CryptoSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<VerifyState>(null);

  const loadSettings = async () => {
    setLoading(true);
    try { setSettings(await getSystemSettings() as CryptoSettings); }
    finally { setLoading(false); }
  };
  useEffect(() => { void loadSettings(); }, []);

  const address = String(settings?.usdtBep20DepositAddress || '').trim();
  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const confirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const hash = txHash.trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
      setResult({ kind: 'error', title: 'Invalid Transaction Hash', message: 'Paste a valid BNB Smart Chain transaction hash.' });
      return;
    }
    if (proofFile && (!['image/jpeg','image/png','image/webp'].includes(proofFile.type) || proofFile.size > 8 * 1024 * 1024)) {
      setResult({ kind: 'error', title: 'Invalid Screenshot', message: 'Screenshot must be PNG, JPG or WEBP and at most 8 MB.' });
      return;
    }

    setVerifying(true); setResult(null);
    try {
      let paymentProofUrl = '';
      if (proofFile) {
        const safeName = proofFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const objectRef = ref(storage, `payment_proofs/${user.uid}/${hash.toLowerCase()}/${Date.now()}-${safeName}`);
        await uploadBytes(objectRef, proofFile, { contentType: proofFile.type, customMetadata: { ownerUid: user.uid, txHash: hash.toLowerCase(), asset: 'USDT', network: 'BEP20' } });
        paymentProofUrl = await getDownloadURL(objectRef);
      }

      const idToken = await user.getIdToken();
      const response = await fetch('/api/usdt-bep20-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ action: 'verify_deposit', txHash: hash, paymentProofUrl }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 202) {
        setResult({ kind: 'pending', title: 'Waiting for Blockchain Confirmations', message: data.error || `Confirmations: ${Number(data.confirmations || 0)} / ${Number(data.requiredConfirmations || 12)}.` });
        return;
      }
      if (!response.ok || !data.verified || !data.credited) throw new Error(data.error || 'This payment could not be verified.');

      await refreshWallet();
      const credited = Number(data.amount || 0).toFixed(2);
      setResult({
        kind: 'success',
        title: data.alreadyCredited ? 'Payment Already Credited' : 'Payment Confirmed',
        message: data.alreadyCredited
          ? `This transaction was already processed. USDT ${credited} is already included in Available USDT.`
          : `USDT ${credited} verified on BNB Smart Chain and automatically added to your Available USDT wallet. You can now purchase a plan.`,
      });
      setTxHash(''); setProofFile(null);
    } catch (err: any) {
      setResult({ kind: 'error', title: 'Payment Verification Failed', message: err?.message || 'Unable to verify this payment right now.' });
    } finally { setVerifying(false); }
  };

  if (settings?.depositDisplayEnabled === false) return <div className="p-6 rounded-2xl bg-[#091129] border border-blue-500/25 text-center"><Wallet className="w-8 h-8 mx-auto mb-3"/><h2 className="text-lg font-bold">Deposit temporarily unavailable</h2></div>;

  return <div className="space-y-6">
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-blue-500/20 pb-3">
      <div><h2 className="text-xl font-bold">Recharge — USDT BEP20</h2><p className="text-xs mt-1">Make the payment, enter the real BSC transaction hash, optionally attach the screenshot, then press Confirm Payment.</p></div>
      <div className="p-3 rounded-xl bg-[#091129] border border-emerald-500/25 min-w-44"><div className="text-[10px] uppercase">Available USDT</div><div className="text-lg font-bold font-mono text-emerald-500">{Number(wallet?.fundWallet || 0).toFixed(2)}</div></div>
    </div>

    {result && <div className={`p-4 rounded-xl border text-xs flex gap-3 ${result.kind==='success'?'bg-emerald-500/10 border-emerald-500/30 text-emerald-700':result.kind==='pending'?'bg-amber-500/10 border-amber-500/30 text-amber-700':'bg-rose-500/10 border-rose-500/30 text-rose-700'}`}>{result.kind==='success'?<CheckCircle2 className="w-5 h-5 shrink-0"/>:<AlertCircle className="w-5 h-5 shrink-0"/>}<div><div className="font-bold mb-1">{result.title}</div><div>{result.message}</div></div></div>}

    <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 flex gap-3 text-xs"><ShieldCheck className="w-4 h-4 text-amber-500 shrink-0 mt-0.5"/><div><strong className="block mb-1">USDT on BNB Smart Chain (BEP20) only</strong><span>{settings?.depositNetworkNotice || 'Send only USDT using BNB Smart Chain (BEP20).'}</span></div></div>

    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-7 p-5 sm:p-6 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl space-y-5">
        <div className="flex items-center justify-between"><div><h3 className="text-sm font-bold uppercase">Deposit USDT</h3><div className="text-[11px] text-cyan-500 mt-1">BNB Smart Chain • BEP20</div></div><button onClick={loadSettings} disabled={loading} className="p-2 rounded-lg border border-blue-500/20"><RefreshCw className={`w-4 h-4 ${loading?'animate-spin':''}`}/></button></div>
        {settings?.depositQrImageUrl ? <div className="flex justify-center"><div className="bg-white p-4 rounded-2xl"><img src={settings.depositQrImageUrl} alt="USDT BEP20 QR" className="w-52 h-52 object-contain"/></div></div> : <div className="p-8 rounded-2xl border border-dashed border-blue-500/30 text-center"><QrCode className="w-10 h-10 mx-auto mb-2"/><div className="text-xs">Deposit QR is not configured.</div></div>}
        <div><label className="block text-xs font-semibold mb-1.5">USDT BEP20 Wallet Address</label>{address ? <div className="flex gap-2"><div className="flex-1 px-3.5 py-3 rounded-xl border border-blue-500/30 font-mono text-xs break-all">{address}</div><button type="button" onClick={copyAddress} className="px-3 rounded-xl border border-blue-500/30">{copied?<Check className="w-4 h-4"/>:<Copy className="w-4 h-4"/>}</button></div> : <div className="p-4 rounded-xl border border-amber-500/30 text-xs">Deposit wallet not configured.</div>}</div>
      </div>

      <form onSubmit={confirmPayment} className="lg:col-span-5 p-5 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl space-y-4">
        <div><h3 className="text-sm font-bold uppercase">Confirm Payment</h3><p className="text-[11px] mt-1">The amount is read from the real blockchain transfer. Screenshot is supporting proof only.</p></div>
        <div><label className="block text-xs font-semibold mb-1">Transaction Hash</label><input required value={txHash} onChange={e=>setTxHash(e.target.value)} placeholder="0x..." maxLength={66} className="w-full px-3.5 py-3 rounded-xl border border-blue-500/30 font-mono text-xs"/></div>
        <div><label className="block text-xs font-semibold mb-1">Payment Screenshot (optional)</label><label className="flex items-center justify-center min-h-20 rounded-xl border-2 border-dashed border-blue-500/30 cursor-pointer text-xs"><input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e=>setProofFile(e.target.files?.[0]||null)}/>{proofFile?proofFile.name:'Upload PNG, JPG or WEBP • Max 8 MB'}</label>{proofFile&&<button type="button" onClick={()=>setProofFile(null)} className="text-xs mt-1">Remove screenshot</button>}</div>
        <button type="submit" disabled={verifying||!address} className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2">{verifying?<RefreshCw className="w-4 h-4 animate-spin"/>:<CheckCircle2 className="w-4 h-4"/>}{verifying?'Checking BNB Smart Chain…':'Confirm Payment'}</button>
        <p className="text-[10px] leading-relaxed">Security: duplicate TXID, wrong token/network/receiver, failed transaction, or insufficient confirmations will not credit the wallet.</p>
      </form>
    </div>
  </div>;
};
