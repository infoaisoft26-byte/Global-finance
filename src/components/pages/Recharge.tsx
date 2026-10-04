import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Check, RefreshCw, ShieldCheck, AlertCircle, CheckCircle2, ArrowDownToLine } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../../context/AuthContext.tsx';
import { getUsdtDepositAddress, type UsdtDepositEvent } from '../../services/usdtDepositService.ts';

const explorerUrl = (txHash:string) => `https://bscscan.com/tx/${txHash}`;

export const Recharge: React.FC = () => {
  const { wallet, user, refreshWallet } = useAuth();
  const [address, setAddress] = useState('');
  const [contract, setContract] = useState('');
  const [deposits, setDeposits] = useState<UsdtDepositEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [refreshingWallet, setRefreshingWallet] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getUsdtDepositAddress(user);
      setAddress(data.depositAddress);
      setContract(data.contractAddress || '');
      setDeposits(data.deposits || []);
      setError('');
    } catch (err:any) {
      setError(err?.message || 'Unable to load your USDT deposit address.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(async () => {
      if (!user) return;
      try {
        const data = await getUsdtDepositAddress(user);
        setAddress(data.depositAddress);
        setContract(data.contractAddress || '');
        setDeposits(data.deposits || []);
        if ((data.deposits || []).some(d => d.status === 'credited')) {
          setRefreshingWallet(true);
          try { await refreshWallet(); } finally { setRefreshingWallet(false); }
        }
      } catch {
        // Keep the current UI stable during temporary polling failures.
      }
    }, 20000);
    return () => window.clearInterval(timer);
  }, [user?.uid]);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError('Unable to copy address. Please copy it manually.');
    }
  };

  const recent = useMemo(() => deposits.slice(0, 10), [deposits]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-blue-500/20 pb-3">
        <div>
          <h2 className="text-xl font-bold text-white">Recharge — USDT BEP20</h2>
          <p className="text-xs text-slate-400 mt-1">
            Aapke account ke liye unique BSC deposit address hai. TXID ya screenshot submit karna zaroori nahi.
          </p>
        </div>
        <div className="p-3 rounded-xl bg-[#091129] border border-blue-500/25">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Fund Wallet</div>
          <div className="text-sm font-bold font-mono text-cyan-300">{Number(wallet?.fundWallet || 0).toFixed(2)} USDT</div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 flex gap-3 text-xs text-amber-200">
        <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <strong className="block mb-1">BSC • USDT • Automatic Credit</strong>
          <span>Sirf accepted USDT ko BNB Smart Chain (BEP20) par isi personal address par bhejein. Required confirmations ke baad Fund Wallet automatic credit hoga.</span>
        </div>
      </div>

      {loading && !address ? (
        <div className="p-10 rounded-2xl bg-[#091129] border border-blue-500/25 text-center text-xs text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-3 text-cyan-400" />
          Your personal deposit address is being prepared…
        </div>
      ) : address ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 p-6 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Your Personal Deposit Address</h3>
                <div className="text-[11px] text-cyan-400 mt-1">Ye address sirf aapke Global Finance account ke liye mapped hai.</div>
              </div>
              <button type="button" onClick={load} disabled={loading} className="p-2 rounded-lg border border-blue-500/20 text-cyan-400 disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="flex justify-center">
              <div className="bg-white p-4 rounded-2xl shadow-lg">
                <QRCodeSVG value={address} size={220} includeMargin />
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-300 mb-1.5">USDT BEP20 Wallet Address</div>
              <div className="flex gap-2">
                <div className="flex-1 px-3.5 py-3 rounded-xl border border-blue-500/30 text-cyan-300 font-mono text-xs break-all">{address}</div>
                <button type="button" onClick={copyAddress} className="px-3 rounded-xl bg-blue-600/20 border border-blue-500/30 text-cyan-300">
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-xl border border-blue-500/20">
                <div className="text-[10px] text-slate-500 uppercase">Network</div>
                <div className="text-xs text-white mt-1">BNB Smart Chain (BEP20)</div>
              </div>
              <div className="p-3 rounded-xl border border-blue-500/20">
                <div className="text-[10px] text-slate-500 uppercase">Asset</div>
                <div className="text-xs text-white mt-1">USDT</div>
              </div>
            </div>

            {contract && (
              <div className="p-3 rounded-xl border border-blue-500/20">
                <div className="text-[10px] text-slate-500 uppercase">Accepted Token Contract</div>
                <div className="text-[10px] text-slate-300 font-mono break-all mt-1">{contract}</div>
              </div>
            )}
          </div>

          <div className="lg:col-span-5 p-6 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl space-y-5">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Automatic Recharge</h3>
              <p className="text-[11px] text-slate-400 mt-1">Koi manual TXID / screenshot submission nahi hai.</p>
            </div>

            <div className="space-y-3">
              {[
                ['1', 'Send USDT', 'Apne wallet ya exchange se isi personal address par USDT BEP20 bhejein.'],
                ['2', 'Blockchain scan', 'System accepted token Transfer events ko continuously scan karega.'],
                ['3', 'Confirm & credit', '12 confirmations ke baad verified amount Fund Wallet mein automatically credit hoga.'],
              ].map(([n,title,desc]) => (
                <div key={n} className="flex gap-3 p-3 rounded-xl border border-blue-500/20">
                  <div className="w-7 h-7 rounded-full bg-blue-600/20 text-cyan-300 flex items-center justify-center text-xs font-bold">{n}</div>
                  <div>
                    <div className="text-xs font-semibold text-white">{title}</div>
                    <div className="text-[11px] text-slate-400 mt-1">{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
              <div className="flex items-center gap-2 text-emerald-300 text-xs font-semibold">
                <ArrowDownToLine className="w-4 h-4" />
                No TXID / screenshot submission required
              </div>
              <div className="text-[11px] text-slate-400 mt-2">
                Deposit user ke unique address se identify hoga, isliye shared wallet attribution ki zarurat nahi.
              </div>
              {refreshingWallet && <div className="text-[10px] text-cyan-300 mt-2">Refreshing Fund Wallet…</div>}
            </div>
          </div>
        </div>
      ) : null}

      <section className="p-5 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-white">My Automatic Deposits</h3>
            <p className="text-[11px] text-slate-400">Real on-chain deposits matched to this account.</p>
          </div>
          <button type="button" onClick={load} className="p-2 rounded-lg border border-blue-500/25">
            <RefreshCw className={`w-4 h-4 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {recent.length === 0 ? (
          <div className="text-xs text-slate-500 py-6 text-center">No data available yet.</div>
        ) : (
          <div className="space-y-2">
            {recent.map((d) => (
              <div key={d.id} className="p-3 rounded-xl border border-blue-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="font-mono text-xs font-bold text-cyan-300">USDT {d.amountUsdt}</div>
                  <div className="text-[11px] text-slate-500">{new Date(d.createdAt).toLocaleString('en-IN')}</div>
                  <a className="text-[10px] text-blue-400 font-mono break-all" href={explorerUrl(d.txHash)} target="_blank" rel="noreferrer">{d.txHash}</a>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <CheckCircle2 className={`w-4 h-4 ${d.status === 'credited' ? 'text-emerald-400' : 'text-amber-400'}`} />
                  <span className={d.status === 'credited' ? 'text-emerald-400' : 'text-amber-400'}>{d.status.toUpperCase()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
