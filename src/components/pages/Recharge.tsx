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
          const newlyApproved = (history.requests || []).some((item: UsdtRechargeRequest) => {
            const key = `shared:${item.id}`;
            if (item.status !== 'approved' || creditedSeen.current.has(key)) return false;
            creditedSeen.current.add(key);
            return true;
          });
          if (newlyApproved) await refreshWallet();
        }
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
        await submitUsdtRecharge(user, amountUsdt.trim(), tx.hash, undefined, signerAddress, walletSignature);
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
      if (connectedWallet && (window as any).ethereum) {
        const provider = new BrowserProvider((window as any).ethereum);
        const signer = await provider.getSigner();
        walletAddress = await signer.getAddress();
        const claimMessage = createUsdtDepositClaimMessage(user.uid, txHash.trim(), amountUsdt.trim(), walletAddress);
        walletSignature = await signer.signMessage(claimMessage);
      }
      const result = await submitUsdtRecharge(user, amountUsdt.trim(), txHash.trim(), undefined, walletAddress, walletSignature);
      setSubmitMessage(String(result?.message || 'TXID submitted for verification.'));
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

      <div className="rounded-2xl border border-cyan-400/25 bg-[#091129] p-4 sm:p-6 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Trust Wallet</h3>
            <p className="mt-1 text-xs leading-5 text-slate-400">Connect on BNB Smart Chain, then send USDT directly to the deposit address shown below.</p>
          </div>
          <button type="button" onClick={connectTrustWallet} disabled={connectingWallet} className="rounded-xl bg-cyan-500 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">
            {connectingWallet ? 'Connecting…' : connectedWallet ? 'Reconnect Trust Wallet' : 'Connect Trust Wallet'}
          </button>
        </div>
        {connectedWallet && <p className="break-all font-mono text-xs text-cyan-200">Connected: {connectedWallet}</p>}
        {walletMessage && <p className="text-xs text-emerald-300">{walletMessage}</p>}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="block text-xs text-slate-300">USDT amount
            <input inputMode="decimal" value={amountUsdt} onChange={e => setAmountUsdt(e.target.value)} className="mt-1 w-full rounded-lg border border-blue-500/25 bg-[#040a19] px-3 py-3 text-sm text-white" placeholder="e.g. 10" />
          </label>
          <button type="button" onClick={sendUsdtFromWallet} disabled={!connectedWallet || walletSending || !info?.depositAddress || !info?.contractAddress} className="self-end rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
            {walletSending ? 'Sending…' : 'Send USDT'}
          </button>
        </div>
        <p className="text-[10px] leading-5 text-slate-500">Your wallet will ask you to approve the transaction. BNB is required for network gas. Never share your recovery phrase or private key. Credit is not granted merely because a wallet is connected or a transaction is submitted.</p>
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
            <label className="block text-xs text-slate-300">Amount sent (USDT)
              <input required inputMode="decimal" value={amountUsdt} onChange={e => setAmountUsdt(e.target.value)} className="mt-1 w-full rounded-lg border border-blue-500/25 bg-[#091129] px-3 py-3 text-sm text-white" placeholder="e.g. 10" />
            </label>
            <label className="block text-xs text-slate-300">Transaction hash / TXID
              <input required minLength={66} maxLength={66} value={txHash} onChange={e => setTxHash(e.target.value.trim())} className="mt-1 w-full rounded-lg border border-blue-500/25 bg-[#091129] px-3 py-3 font-mono text-xs text-white" placeholder="0x..." />
            </label>
            <button type="submit" disabled={submitting} className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{submitting ? 'Submitting…' : 'Submit TXID for verification'}</button>
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
