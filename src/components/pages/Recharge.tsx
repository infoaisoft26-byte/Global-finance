import React, { useEffect, useRef, useState } from 'react';
import {
  Wallet, Copy, Check, RefreshCw, ShieldCheck, AlertCircle,
  CheckCircle2, Clock3, ExternalLink
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  getAutomaticDepositInfo,
  submitUsdtRecharge,
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
  const [setupMessage, setSetupMessage] = useState('');
  const [error, setError] = useState('');
  const [amountUsdt, setAmountUsdt] = useState('');
  const [txHash, setTxHash] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');
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
          <p className="mt-1 text-xs text-slate-400">Send USDT to the confirmed BEP20 address, then submit the transaction hash for verification.</p>
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
            <h3 className="text-sm font-bold text-white">On-chain verification before wallet credit</h3>
            <p className="text-xs leading-5 text-slate-400">Submit the transaction hash and exact USDT amount after sending. The request remains pending until an administrator verifies the BNB Smart Chain transfer, receiving address, token, amount, and {info?.confirmationsRequired || 12} confirmations.</p>
          </div>
        </div>
      </div>

      {setupMessage && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div>
              <h3 className="text-sm font-bold text-amber-200">Deposit address not ready</h3>
              <p className="mt-1 text-xs leading-5 text-amber-100/80">{setupMessage}</p>
              <p className="mt-2 text-xs font-semibold leading-5 text-white">Do not send USDT until the confirmed address is shown here.</p>
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

      {info && address && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-5 rounded-2xl border border-cyan-400/25 bg-[#091129] p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300">Confirmed deposit address</div>
                <h3 className="mt-1 text-lg font-bold text-white">USDT on BNB Smart Chain</h3>
              </div>
              <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[10px] font-bold tracking-wide text-amber-200">ADMIN VERIFICATION</span>
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
            <form onSubmit={async (event) => {
              event.preventDefault();
              if (!user || submitting) return;
              setSubmitting(true);
              setSubmitMessage('');
              setError('');
              try {
                const result = await submitUsdtRecharge(user, amountUsdt.trim(), txHash.trim());
                setSubmitMessage(String(result?.message || 'Transaction submitted. Waiting for admin verification.'));
                setAmountUsdt('');
                setTxHash('');
              } catch (err: any) {
                setError(String(err?.message || 'Could not submit transaction. Please retry.'));
              } finally {
                setSubmitting(false);
              }
            }} className="space-y-3 rounded-xl border border-blue-500/20 bg-[#060d20] p-4">
              <h4 className="text-sm font-bold text-white">Submit your transfer</h4>
              <label className="block text-xs text-slate-300">Amount sent (USDT)
                <input value={amountUsdt} onChange={(event) => setAmountUsdt(event.target.value)} inputMode="decimal" required pattern="(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,8})?" placeholder="e.g. 10" className="mt-1 w-full rounded-lg border border-blue-500/30 bg-[#040a19] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400" />
              </label>
              <label className="block text-xs text-slate-300">BSC transaction hash (TXID)
                <input value={txHash} onChange={(event) => setTxHash(event.target.value)} required minLength={66} maxLength={66} pattern="0x[0-9a-fA-F]{64}" placeholder="0x…" className="mt-1 w-full rounded-lg border border-blue-500/30 bg-[#040a19] px-3 py-2 font-mono text-xs text-white outline-none focus:border-cyan-400" />
              </label>
              <button type="submit" disabled={submitting} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50">{submitting ? 'Submitting…' : 'Submit transaction for verification'}</button>
              {submitMessage && <p role="status" className="text-xs leading-5 text-emerald-300">{submitMessage}</p>}
              <p className="text-[10px] leading-4 text-slate-500">Only submit a completed transfer to the address above. Submitting a TXID does not instantly credit your wallet; admin approval follows on-chain verification.</p>
            </form>
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
