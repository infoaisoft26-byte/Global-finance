import React, { useEffect, useRef, useState } from 'react';
import {
  Wallet, Copy, Check, RefreshCw, ShieldCheck, AlertCircle,
  CheckCircle2, Clock3, ExternalLink
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { BrowserProvider, Contract, parseUnits } from 'ethers';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  getAutomaticDepositInfo,
  createUsdtDepositClaimMessage,
  submitUsdtRecharge,
  listUsdtRecharges,
  type UsdtRechargeRequest,
  type AutomaticUsdtDepositInfo,
  type AutomaticUsdtDepositEvent,
} from '../../services/usdtRechargeService.ts';

function formatUsdt(value: number | string, max = 8) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0.00';
  return number.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: max });
}

function shortHash(value: string) {
  return value ? `${value.slice(0, 10)}…${value.slice(-8)}` : '—';
}

function statusLabel(status: string) {
  if (status === 'credited') return 'CREDITED';
  if (status === 'pending') return 'PENDING REVIEW';
  if (status === 'ignored') return 'NEEDS SUPPORT';
  return String(status || 'PENDING').toUpperCase();
}

export const Recharge: React.FC = () => {
  const { wallet, user, refreshWallet } = useAuth();
  const [info, setInfo] = useState<AutomaticUsdtDepositInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [connectedWallet, setConnectedWallet] = useState('');
  const [connectingWallet, setConnectingWallet] = useState(false);
  const [walletSending, setWalletSending] = useState(false);
  const [walletMessage, setWalletMessage] = useState('');
  const [setupMessage, setSetupMessage] = useState('');
  const [amountUsdt, setAmountUsdt] = useState('');
  const [txHash, setTxHash] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState<UsdtRechargeRequest[]>([]);
  const [submitMessage, setSubmitMessage] = useState('');
  const [error, setError] = useState('');
  const creditedSeen = useRef<Set<string>>(new Set());
  const statusInitialized = useRef(false);
  const [statusPopup, setStatusPopup] = useState<{title:string;message:string;kind:'pending'|'success'|'failed';amount?:string;txHash?:string}|null>(null);

  const notifyDepositStatus = (id:string, status:string, amount:string, hash:string) => {
    if (!id || !status || !user?.uid) return;
    const key = `gf-deposit-status:${user.uid}:${id}:${status}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, '1');
    } catch {}
    if (status === 'pending') {
      setStatusPopup({title:'Recharge Pending',message:'Your deposit has been received for verification. Your Fund Wallet will update only after approval or successful blockchain verification.',kind:'pending',amount,txHash:hash});
    } else if (status === 'approved' || status === 'credited') {
      setStatusPopup({title:'Recharge Successful',message:'Your deposit has been approved and credited to your Fund Wallet.',kind:'success',amount,txHash:hash});
    } else if (status === 'rejected' || status === 'ignored' || status === 'failed') {
      setStatusPopup({title:'Recharge Failed',message:'This deposit was rejected or could not be verified. Check the recharge details or contact support. No credit is confirmed.',kind:'failed',amount,txHash:hash});
    }
  };

  const syncDepositStatusNotices = (history:UsdtRechargeRequest[], deposits:AutomaticUsdtDepositEvent[]) => {
    if (!statusInitialized.current) {
      for (const item of history) {
        try { window.sessionStorage.setItem(`gf-deposit-status:${user?.uid}:${item.id}:${item.status}`, '1'); } catch {}
      }
      for (const item of deposits) {
        try { window.sessionStorage.setItem(`gf-deposit-status:${user?.uid}:${item.id}:${item.status}`, '1'); } catch {}
      }
      statusInitialized.current = true;
      return;
    }
    for (const item of history) notifyDepositStatus(item.id, item.status, item.amountUsdt, item.txHash);
    for (const item of deposits) notifyDepositStatus(item.id, item.status, item.amountUsdt, item.txHash);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async (silent = false) => {
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }
      if (!silent && !cancelled) setLoading(true);
      else if (!cancelled) setRefreshing(true);
      try {
        const next = await getAutomaticDepositInfo(user);
        if (cancelled) return;
        setInfo(next);
        setSetupMessage('');
        setError('');
        if (next.mode === 'shared') {
          const history = await listUsdtRecharges(user);
          if (!cancelled) setRequests(history.requests || []);
          if (!cancelled) syncDepositStatusNotices(history.requests || [], next.deposits || []);
          const newlyApproved = (history.requests || []).some((item: UsdtRechargeRequest) => {
            const key = `shared:${item.id}`;
            if (item.status !== 'approved' || creditedSeen.current.has(key)) return false;
            creditedSeen.current.add(key);
            return true;
          });
          if (newlyApproved) await refreshWallet();
        }
        if (next.mode !== 'shared' && !cancelled) syncDepositStatusNotices([], next.deposits || []);
        const newlyCredited = (next.deposits || []).some((item: AutomaticUsdtDepositEvent) => {
          if (item.status !== 'credited') return false;
          if (creditedSeen.current.has(item.id)) return false;
          creditedSeen.current.add(item.id);
          return true;
        });
        if (newlyCredited) await refreshWallet();
      } catch (err: any) {
        if (cancelled) return;
        const message = String(err?.message || 'Could not load the personal deposit address.');
        const data = err?.data || {};
        if (err?.status === 503 || data?.configured === false) {
          setSetupMessage(message);
          setInfo(null);
        } else {
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };
    void load(false);
    const interval = window.setInterval(() => { void load(true); }, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [user?.uid]);

  const address = info?.depositAddress || '';

  const connectTrustWallet = async () => {
    setWalletMessage('');
    setError('');
    setConnectingWallet(true);
    try {
      const ethereum = (window as any).ethereum;
      if (!ethereum) {
        throw new Error('Trust Wallet was not detected. Open this website in the Trust Wallet DApp browser or install the Trust Wallet browser extension.');
      }
      const provider = new BrowserProvider(ethereum);
      await provider.send('eth_requestAccounts', []);
      const network = await provider.getNetwork();
      if (network.chainId !== 56n) {
        try {
          await provider.send('wallet_switchEthereumChain', [{ chainId: '0x38' }]);
        } catch (switchError: any) {
          if (switchError?.code === 4902) {
            await provider.send('wallet_addEthereumChain', [{
              chainId: '0x38',
              chainName: 'BNB Smart Chain',
              nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
              rpcUrls: ['https://bsc-dataseed.binance.org/'],
              blockExplorerUrls: ['https://bscscan.com/']
            }]);
          } else {
            throw switchError;
          }
        }
      }
      const signer = await provider.getSigner();
      setConnectedWallet(await signer.getAddress());
      setWalletMessage('Trust Wallet connected to BNB Smart Chain.');
    } catch (err: any) {
      setError(String(err?.shortMessage || err?.message || 'Could not connect Trust Wallet.'));
    } finally {
      setConnectingWallet(false);
    }
  };

  const sendUsdtFromWallet = async () => {
    if (!user || !info?.depositAddress || !info?.contractAddress || !connectedWallet) {
      setError('Connect Trust Wallet and wait for the verified deposit address and USDT contract to load.');
      return;
    }
    const amount = Number(amountUsdt);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid USDT amount before sending.');
      return;
    }
    setWalletSending(true);
    setError('');
    setWalletMessage('');
    try {
      const ethereum = (window as any).ethereum;
      if (!ethereum) throw new Error('Trust Wallet connection is no longer available. Reconnect your wallet.');
      const provider = new BrowserProvider(ethereum);
      const network = await provider.getNetwork();
      if (network.chainId !== 56n) throw new Error('Switch Trust Wallet to BNB Smart Chain (BEP20) and reconnect.');
      const signer = await provider.getSigner();
      const signerAddress = await signer.getAddress();
      if (signerAddress.toLowerCase() !== connectedWallet.toLowerCase()) {
        setConnectedWallet(signerAddress);
      }
      const token = new Contract(info.contractAddress, [
        'function transfer(address to, uint256 amount) returns (bool)'
      ], signer);
      const tx = await token.transfer(info.depositAddress, parseUnits(amountUsdt.trim(), 18));
      setTxHash(tx.hash);
      setWalletMessage('Transaction submitted. Waiting for blockchain confirmation…');
      await tx.wait(1);
      if (info.mode === 'shared') {
        const claimMessage = createUsdtDepositClaimMessage(user.uid, tx.hash, amountUsdt.trim(), signerAddress);
        const walletSignature = await signer.signMessage(claimMessage);
        const result = await submitUsdtRecharge(user, amountUsdt.trim(), tx.hash, undefined, signerAddress, walletSignature);
        notifyDepositStatus(String(result?.id || result?.rechargeId || tx.hash), String(result?.status || 'pending'), amountUsdt.trim(), tx.hash);
        const history = await listUsdtRecharges(user);
        setRequests(history.requests || []);
      }
      setSubmitMessage('Transaction confirmed. Deposit monitoring will verify the token, destination, and amount before any wallet credit.');
      setWalletMessage('USDT transfer confirmed on BNB Smart Chain.');
      await manualRefresh();
    } catch (err: any) {
      setError(String(err?.shortMessage || err?.message || 'USDT transfer failed. Check wallet funds, BNB gas, and the network.'));
    } finally {
      setWalletSending(false);
    }
  };

  const submitTxid = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || submitting) return;
    setSubmitting(true);
    setError('');
    setSubmitMessage('');
    try {
      let walletAddress = '';
      let walletSignature = '';
      if (info?.mode === 'shared') {
        const ethereum = (window as any).ethereum;
        if (!ethereum || !connectedWallet) {
          throw new Error('Connect the same Trust Wallet that sent this USDT before submitting the TXID.');
        }
        const provider = new BrowserProvider(ethereum);
        const network = await provider.getNetwork();
        if (network.chainId !== 56n) throw new Error('Switch Trust Wallet to BNB Smart Chain (BEP20), then reconnect.');
        const signer = await provider.getSigner();
        walletAddress = await signer.getAddress();
        if (walletAddress.toLowerCase() !== connectedWallet.toLowerCase()) {
          setConnectedWallet(walletAddress);
          throw new Error('The connected wallet changed. Please confirm the sender wallet and submit again.');
        }
        const claimMessage = createUsdtDepositClaimMessage(user.uid, txHash.trim(), amountUsdt.trim(), walletAddress);
        walletSignature = await signer.signMessage(claimMessage);
      }
      const result = await submitUsdtRecharge(user, amountUsdt.trim(), txHash.trim(), undefined, walletAddress, walletSignature);
      setSubmitMessage(String(result?.message || 'TXID submitted for verification.'));
      notifyDepositStatus(String(result?.id || result?.rechargeId || txHash.trim()), String(result?.status || 'pending'), amountUsdt.trim(), txHash.trim());
      if (result?.status === 'approved') await refreshWallet();
      setAmountUsdt('');
      setTxHash('');
      const history = await listUsdtRecharges(user);
      setRequests(history.requests || []);
    } catch (err: any) {
      setError(String(err?.message || 'Could not submit this TXID. Please check it and retry.'));
    } finally {
      setSubmitting(false);
    }
  };

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Copy failed. Please select and copy the address manually.');
    }
  };

  const manualRefresh = async () => {
    setRefreshing(true);
    try {
      if (!user) throw new Error('Please sign in again.');
      const next = await getAutomaticDepositInfo(user);
      setInfo(next);
      setSetupMessage('');
      setError('');
      if (next.mode === 'shared') {
        const history = await listUsdtRecharges(user);
        setRequests(history.requests || []);
        syncDepositStatusNotices(history.requests || [], next.deposits || []);
      } else {
        syncDepositStatusNotices([], next.deposits || []);
      }
      const newlyCredited = (next.deposits || []).some((item) => {
        if (item.status !== 'credited' || creditedSeen.current.has(item.id)) return false;
        creditedSeen.current.add(item.id);
        return true;
      });
      if (newlyCredited) await refreshWallet();
    } catch (err: any) {
      const data = err?.data || {};
      if (err?.status === 503 || data?.configured === false) {
        setSetupMessage(String(err.message || 'Automatic deposits are not configured.'));
        setInfo(null);
      } else {
        setError(String(err?.message || 'Refresh failed. Please retry.'));
      }
    } finally {
      setRefreshing(false);
    }
  };

  const deposits = info?.deposits || [];

  return (
    <div className="space-y-6">
      <style>{`
        @keyframes gfBackdropIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes gfPopupIn { 0% { opacity: 0; transform: translateY(24px) scale(.82); } 65% { opacity: 1; transform: translateY(-4px) scale(1.025); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes gfIconIn { 0% { transform: scale(0) rotate(-25deg); } 70% { transform: scale(1.16) rotate(7deg); } 100% { transform: scale(1) rotate(0); } }
        @keyframes gfGlow { 0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,.0), 0 24px 80px rgba(0,0,0,.35); } 50% { box-shadow: 0 0 0 8px rgba(16,185,129,.07), 0 24px 80px rgba(0,0,0,.35); } }
        @keyframes gfShine { 0% { transform: translateX(-160%) skewX(-20deg); } 65%, 100% { transform: translateX(260%) skewX(-20deg); } }
        @media (prefers-reduced-motion: reduce) { .gf-status-backdrop, .gf-status-card, .gf-status-icon, .gf-status-shine { animation: none !important; } }
      `}</style>
      {statusPopup && (
        <div className="gf-status-backdrop fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/75 p-4 backdrop-blur-md" style={{animation:'gfBackdropIn .22s ease-out both'}} role="dialog" aria-modal="true" aria-labelledby="deposit-status-title">
          <div className={`gf-status-card relative w-full max-w-sm overflow-hidden rounded-[28px] border bg-white p-6 text-center shadow-2xl sm:p-7 ${statusPopup.kind === 'success' ? 'border-emerald-200' : statusPopup.kind === 'failed' ? 'border-rose-200' : 'border-amber-200'}`} style={{animation:'gfPopupIn .48s cubic-bezier(.2,.85,.25,1.2) both', ...(statusPopup.kind === 'success' ? {boxShadow:'0 24px 80px rgba(0,0,0,.35), 0 0 0 1px rgba(16,185,129,.12)'} : {})}}>
            <div className={`pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full blur-3xl ${statusPopup.kind === 'success' ? 'bg-emerald-300/35' : statusPopup.kind === 'failed' ? 'bg-rose-300/35' : 'bg-amber-300/35'}`} />
            {statusPopup.kind === 'success' && <div className="pointer-events-none absolute inset-x-0 top-0 h-1 overflow-hidden bg-emerald-100"><div className="gf-status-shine h-full w-1/3 bg-gradient-to-r from-transparent via-emerald-500 to-transparent" style={{animation:'gfShine 1.3s ease-in-out .25s both'}} /></div>}
            <div className={`gf-status-icon relative mx-auto mb-4 flex h-[76px] w-[76px] items-center justify-center rounded-full ring-8 ${statusPopup.kind === 'success' ? 'bg-gradient-to-br from-emerald-400 to-green-600 text-white ring-emerald-50' : statusPopup.kind === 'failed' ? 'bg-gradient-to-br from-rose-400 to-red-600 text-white ring-rose-50' : 'bg-gradient-to-br from-amber-300 to-orange-500 text-white ring-amber-50'}`} style={{animation:'gfIconIn .55s cubic-bezier(.2,.9,.25,1.3) .12s both'}}>
              {statusPopup.kind === 'success' ? <CheckCircle2 className="h-10 w-10 drop-shadow-sm" strokeWidth={2.5} /> : statusPopup.kind === 'failed' ? <AlertCircle className="h-10 w-10 drop-shadow-sm" strokeWidth={2.5} /> : <Clock3 className="h-10 w-10 drop-shadow-sm" strokeWidth={2.5} />}
            </div>
            <div className="relative">
              <p className={`mb-1 text-[10px] font-extrabold uppercase tracking-[.24em] ${statusPopup.kind === 'success' ? 'text-emerald-600' : statusPopup.kind === 'failed' ? 'text-rose-600' : 'text-amber-600'}`}>Global Finance · Deposit Update</p>
              <h3 id="deposit-status-title" className="text-xl font-extrabold tracking-tight text-slate-900">{statusPopup.title}</h3>
              {statusPopup.amount && <div className="relative mx-auto mt-4 w-full max-w-[280px] rounded-2xl border-2 border-slate-200 bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.10)]" style={{filter:'none',backdropFilter:'none',WebkitBackdropFilter:'none',transform:'translateZ(0)'}}>
                <p className="mb-1 text-[10px] font-black uppercase tracking-[.22em] text-slate-500">Deposit Amount</p>
                <div className="flex items-baseline justify-center gap-2 whitespace-nowrap">
                  <span className="text-[28px] font-black leading-tight tracking-tight text-slate-950 sm:text-[32px]" style={{opacity:1,filter:'none',textShadow:'none',fontVariantNumeric:'tabular-nums'}}>{formatUsdt(statusPopup.amount, 2)}</span>
                  <span className="rounded-md bg-slate-900 px-2 py-1 text-xs font-extrabold tracking-wide text-white">USDT</span>
                </div>
              </div>}
              <p className="mt-4 text-sm leading-6 text-slate-600">{statusPopup.message}</p>
              {statusPopup.txHash && <p className="mx-auto mt-4 max-w-full rounded-lg bg-slate-50 px-3 py-2 font-mono text-[10px] text-slate-500">{shortHash(statusPopup.txHash)}</p>}
              <button onClick={() => setStatusPopup(null)} className={`mt-6 w-full rounded-xl px-4 py-3.5 text-sm font-extrabold text-white shadow-lg transition duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[.98] focus:outline-none focus:ring-4 ${statusPopup.kind === 'success' ? 'bg-gradient-to-r from-emerald-500 to-green-600 shadow-emerald-500/25 focus:ring-emerald-200' : statusPopup.kind === 'failed' ? 'bg-gradient-to-r from-rose-500 to-red-600 shadow-rose-500/25 focus:ring-rose-200' : 'bg-gradient-to-r from-amber-400 to-orange-500 shadow-amber-500/25 focus:ring-amber-200'}`}>Okay, got it <span className="ml-1">→</span></button>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-blue-500/20 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white">USDT Deposit — BEP20</h2>
          <p className="mt-1 text-xs text-slate-400">{info?.mode === 'shared' ? 'Send USDT to the shared BEP20 address. Sign the TXID claim with the sending wallet for automatic credit; emergency admin review remains available.' : 'Send USDT to your personal address. Blockchain verification updates your Fund Wallet automatically.'}</p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-cyan-400/25 bg-[#091129] px-4 py-3">
          <Wallet className="h-5 w-5 text-cyan-400" />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Available Fund Wallet</div>
            <div className="font-mono text-sm font-bold text-cyan-300">{formatUsdt(wallet?.fundWallet || 0)} USDT</div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-blue-500/25 bg-[#091129] p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white">Automatic deposit verification</h3>
            <p className="text-xs leading-5 text-slate-400">{info?.mode === 'shared' ? 'For a shared address, submit the TXID and sign the claim with the same wallet that sent USDT. The system checks sender ownership, exact token, destination, amount and ' + (info?.confirmationsRequired || 12) + ' confirmations before automatic credit. Admin approve/reject remains available for emergencies.' : 'No TXID, payment screenshot, or manual form is required. Deposits are detected from BNB Smart Chain token-transfer logs and credited after ' + (info?.confirmationsRequired || 12) + ' confirmations, subject to scanner availability.'}</p>
          </div>
        </div>
      </div>

      {setupMessage && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div>
              <h3 className="text-sm font-bold text-amber-200">Personal deposit address not ready</h3>
              <p className="mt-1 text-xs leading-5 text-amber-100/80">{setupMessage}</p>
              <p className="mt-2 text-xs font-semibold leading-5 text-white">Please do not send USDT to the old shared wallet. Wait until your personal deposit address is shown here.</p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading && !info && !setupMessage && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-blue-500/20 bg-[#091129] p-10 text-sm text-slate-300">
          <RefreshCw className="h-4 w-4 animate-spin" /> Preparing your personal USDT deposit address…
        </div>
      )}


      {info?.mode === 'shared' && address && (
        <div className="space-y-5 rounded-2xl border border-cyan-400/25 bg-[#091129] p-4 sm:p-6">
          <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300">Binance USDT deposit address (BEP20)</div>
          <div className="rounded-xl border border-blue-400/20 bg-[#040a19] p-3">
            <div className="break-all font-mono text-xs leading-6 text-cyan-100">{address}</div>
            <button onClick={copyAddress} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600/20 px-3 py-2 text-xs font-semibold text-cyan-200">
              {copied ? 'Copied' : 'Copy deposit address'}
            </button>
          </div>
          <div className="flex justify-center rounded-xl bg-white p-4"><QRCodeSVG value={address} size={180} level="M" includeMargin /></div>
          <p className="text-xs leading-5 text-amber-200">Only send USDT on BNB Smart Chain (BEP20). Other networks may cause permanent loss.</p>
          <form onSubmit={submitTxid} className="space-y-3 rounded-xl border border-blue-500/20 bg-[#060d20] p-4">
            <h4 className="text-sm font-bold text-white">Submit your deposit</h4>
            <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white">Sender wallet verification</p>
                  <p className="mt-1 break-all text-[10px] leading-4 text-slate-400">{connectedWallet ? `Connected: ${connectedWallet}` : 'Connect the same Trust Wallet address that sent this USDT. You will sign a message only; no transaction or gas fee is required.'}</p>
                </div>
                <button type="button" onClick={connectTrustWallet} disabled={connectingWallet || submitting} className="shrink-0 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-bold text-cyan-200 disabled:opacity-50">{connectingWallet ? 'Connecting…' : connectedWallet ? 'Reconnect wallet' : 'Connect Trust Wallet'}</button>
              </div>
            </div>
            <label className="block text-xs text-slate-300">Amount sent (USDT)
              <input required inputMode="decimal" value={amountUsdt} onChange={e => setAmountUsdt(e.target.value)} className="mt-1 w-full rounded-lg border border-blue-500/25 bg-[#091129] px-3 py-3 text-sm text-white" placeholder="e.g. 10" />
            </label>
            <label className="block text-xs text-slate-300">Transaction hash / TXID
              <input required minLength={66} maxLength={66} value={txHash} onChange={e => setTxHash(e.target.value.trim())} className="mt-1 w-full rounded-lg border border-blue-500/25 bg-[#091129] px-3 py-3 font-mono text-xs text-white" placeholder="0x..." />
            </label>
            <button type="submit" disabled={submitting || connectingWallet || !connectedWallet} className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{submitting ? 'Signing & verifying…' : !connectedWallet ? 'Connect Trust Wallet to continue' : 'Sign & submit TXID for auto-credit'}</button>
            {submitMessage && <p className="text-xs text-emerald-300">{submitMessage}</p>}
          </form>
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-white">Your recharge requests</h4>
            {requests.map(r => <div key={r.id} className="rounded-lg border border-blue-500/20 p-3 text-xs text-slate-300">{r.amountUsdt} USDT — {r.status.toUpperCase()} — {shortHash(r.txHash)}</div>)}
          </div>
        </div>
      )}
      {info && address && info.mode !== 'shared' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-5 rounded-2xl border border-cyan-400/25 bg-[#091129] p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300">Your unique deposit address</div>
                <h3 className="mt-1 text-lg font-bold text-white">USDT on BNB Smart Chain</h3>
              </div>
              <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[10px] font-bold tracking-wide text-emerald-300">AUTO CREDIT ENABLED</span>
            </div>

            <div className="rounded-xl border border-blue-400/20 bg-[#040a19] p-3 sm:p-4">
              <div className="break-all font-mono text-xs leading-6 text-cyan-100 sm:text-sm">{address}</div>
              <button onClick={copyAddress} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600/20 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-blue-600/30">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy personal address'}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-blue-500/20 bg-[#060d20] p-3">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Network</div>
                <div className="mt-1 text-sm font-semibold text-white">BNB Smart Chain (BEP20)</div>
              </div>
              <div className="rounded-xl border border-blue-500/20 bg-[#060d20] p-3">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Token</div>
                <div className="mt-1 text-sm font-semibold text-white">USDT only</div>
              </div>
            </div>
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-5 text-amber-100/80">
              Only send USDT using BEP20. Do not send USDT on TRC20, ERC20, or any other network to this address. An incorrect network or token may cause permanent loss.
            </div>
            {info.contractAddress && (
              <div className="text-[10px] leading-5 text-slate-500">USDT token contract: <span className="break-all font-mono text-slate-400">{info.contractAddress}</span></div>
            )}
          </div>

          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-blue-500/25 bg-white p-5 text-center">
            <QRCodeSVG value={address} size={220} level="M" includeMargin />
            <div className="text-sm font-bold text-slate-900">Scan to copy address</div>
            <div className="break-all text-[10px] leading-4 text-slate-500">{address}</div>
            <div className="text-[10px] text-slate-500">Verify the address and network in your wallet before sending.</div>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-blue-500/20 bg-[#091129]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-500/20 p-4">
          <div>
            <h3 className="text-sm font-bold text-white">Deposit activity</h3>
            <p className="mt-1 text-[10px] text-slate-500">Status refreshes automatically every 20 seconds.</p>
          </div>
          <button onClick={manualRefresh} disabled={refreshing || loading} className="inline-flex items-center gap-2 rounded-lg border border-blue-500/30 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-blue-500/10 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh status
          </button>
        </div>
        {deposits.length === 0 ? (
          <div className="p-8 text-center">
            <Clock3 className="mx-auto h-7 w-7 text-slate-600" />
            <p className="mt-2 text-xs font-semibold text-slate-300">No deposits detected yet</p>
            <p className="mt-1 text-[10px] text-slate-500">After a confirmed transfer to your personal address, it will appear here automatically.</p>
          </div>
        ) : (
          <div className="divide-y divide-blue-500/10">
            {deposits.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-white">{formatUsdt(item.amountUsdt)} USDT</span>
                    <span className={`rounded-full px-2 py-1 text-[9px] font-bold ${item.status === 'credited' ? 'bg-emerald-500/10 text-emerald-300' : item.status === 'ignored' ? 'bg-rose-500/10 text-rose-300' : 'bg-amber-500/10 text-amber-300'}`}>
                      {item.status === 'credited' && <CheckCircle2 className="mr-1 inline h-3 w-3" />}
                      {statusLabel(item.status)}
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">{item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'} {item.confirmations ? `• ${item.confirmations} confirmations` : ''}</div>
                  {item.note && <div className="mt-1 text-[10px] text-amber-200/80">{item.note}</div>}
                </div>
                <a href={`https://bscscan.com/tx/${item.txHash}`} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-2 text-xs text-cyan-300 hover:text-cyan-200">
                  {shortHash(item.txHash)} <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
