import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, CreditCard, RefreshCw, XCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { listUsdtRecharges, type UsdtRechargeRequest } from '../../services/usdtRechargeService.ts';

interface PaymentStatusSummaryProps {
  onOpenRecharge: () => void;
}

export const PaymentStatusSummary: React.FC<PaymentStatusSummaryProps> = ({ onOpenRecharge }) => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<UsdtRechargeRequest[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      setRequests((await listUsdtRecharges(user)).requests);
    } catch (error) {
      console.warn('Unable to load recharge status summary:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const summary = useMemo(() => {
    const total = requests.reduce((sum, r) => sum + Number(r.amountUsdt || 0), 0);
    const completed = requests.filter(r => r.status === 'approved').reduce((sum, r) => sum + Number(r.amountUsdt || 0), 0);
    const pending = requests.filter(r => r.status === 'pending').reduce((sum, r) => sum + Number(r.amountUsdt || 0), 0);
    const rejected = requests.filter(r => r.status === 'rejected').reduce((sum, r) => sum + Number(r.amountUsdt || 0), 0);
    return { total, completed, pending, rejected };
  }, [requests]);

  const latest = requests[0];
  const statusClass = latest?.status === 'approved'
    ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/25'
    : latest?.status === 'rejected'
      ? 'text-rose-500 bg-rose-500/10 border-rose-500/25'
      : 'text-amber-500 bg-amber-500/10 border-amber-500/25';

  return (
    <section className="rounded-2xl border border-blue-500/20 bg-white/90 dark:bg-[#091129]/90 shadow-lg overflow-hidden">
      <div className="px-4 sm:px-5 py-4 border-b border-blue-500/15 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-cyan-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Payment Status & Recharge Accounting</h3>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">USDT TXID submit karne ke baad request yahan reflect hoti hai.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading} className="p-2 rounded-lg border border-blue-500/20 text-cyan-500 disabled:opacity-50" title="Refresh payment status">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={onOpenRecharge} className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-xs font-bold">Recharge / Submit TXID</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-blue-500/10">
        <Metric label="Submitted" value={summary.total} />
        <Metric label="Pending Verification" value={summary.pending} tone="pending" />
        <Metric label="Completed / Credited" value={summary.completed} tone="success" />
        <Metric label="Rejected / Failed" value={summary.rejected} tone="danger" />
      </div>

      <div className="p-4 sm:p-5">
        {!latest ? (
          <div className="text-xs text-slate-500 text-center py-3">Abhi tak koi USDT recharge submit nahi hua.</div>
        ) : (
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Latest Payment</div>
              <div className="font-mono text-sm font-bold text-cyan-600 dark:text-cyan-400 mt-1">{latest.id}</div>
              <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">USDT {latest.amountUsdt} • {new Date(latest.createdAt).toLocaleString('en-IN')}</div>
              <div className="text-[11px] text-slate-500 mt-1 break-all">TXID: {latest.txHash}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold ${statusClass}`}>
                {latest.status === 'approved' ? <CheckCircle2 className="w-3 h-3" /> : latest.status === 'rejected' ? <XCircle className="w-3 h-3" /> : <Clock3 className="w-3 h-3" />}
                {latest.status.toUpperCase()}
              </span>
            </div>
          </div>
        )}
        <p className="text-[10px] text-slate-500 mt-4">TXID submit hone se balance automatic credit nahi hota. Fund balance sirf BSC verification aur admin approval ke baad update hota hai.</p>
      </div>
    </section>
  );
};

const Metric: React.FC<{ label: string; value: number; tone?: 'default' | 'pending' | 'success' | 'danger' }> = ({ label, value, tone = 'default' }) => {
  const valueClass = tone === 'success' ? 'text-emerald-500' : tone === 'pending' ? 'text-amber-500' : tone === 'danger' ? 'text-rose-500' : 'text-slate-900 dark:text-white';
  return (
    <div className="bg-white dark:bg-[#091129] px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-base font-bold font-mono mt-1 ${valueClass}`}>USDT {value.toFixed(2)}</div>
    </div>
  );
};
