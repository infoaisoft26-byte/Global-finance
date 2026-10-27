import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeftRight,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { getSystemSettings } from '../../services/settingsService.ts';
import { DataTable, type Column } from '../common/DataTable.tsx';
import type { TransactionRequest, SystemSettings } from '../../types/index.ts';

export const TransferIncomeToFund: React.FC = () => {
  const { user, profile, wallet, refreshWallet } = useAuth();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [transferring, setTransferring] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [requests, setRequests] = useState<TransactionRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const pendingTransferRef = useRef<{ amount: number; requestId: string } | null>(null);

  const apiCall = async (method: 'GET' | 'POST', body?: object) => {
    if (!user) throw new Error('Please sign in again to transfer USDT.');
    const response = await fetch('/api/internal-wallet-transfer', {
      method,
      credentials: 'include',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${await user.getIdToken()}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(data?.error || 'Internal transfer failed.'));
    return data;
  };

  const loadData = async () => {
    if (!profile || !user) return;
    setLoadingRequests(true);
    try {
      const [sysSettings, history] = await Promise.all([
        getSystemSettings(),
        apiCall('GET')
      ]);
      setSettings(sysSettings);
      setRequests(Array.isArray(history.history) ? history.history : []);
    } catch (err) {
      console.error('Internal transfer history could not load:', err);
    } finally {
      setLoadingRequests(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [profile?.uid, user?.uid]);

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !user) {
      setErrorMsg('Please sign in again before transferring USDT.');
      return;
    }

    const minAmount = settings?.minIncomeTransfer || 100;
    const maxAmount = settings?.maxIncomeTransfer || 200000;
    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMsg('Enter a valid USDT amount greater than zero.');
      return;
    }
    if (amount < minAmount) {
      setErrorMsg(`Minimum internal transfer amount is USDT ${minAmount.toFixed(8)}.`);
      return;
    }
    if (amount > maxAmount) {
      setErrorMsg(`Maximum internal transfer amount is USDT ${maxAmount.toFixed(8)}.`);
      return;
    }

    // Do not reject based on a stale client/Firebase wallet snapshot.
    // The authenticated Neon API locks and checks the canonical wallet balance.
    setTransferring(true);
    setErrorMsg('');
    setSuccessMsg('');

    // Reuse this ID if the same request is retried after a network interruption.
    if (!pendingTransferRef.current || pendingTransferRef.current.amount !== amount) {
      pendingTransferRef.current = { amount, requestId: `WALLET_TRANSFER_${crypto.randomUUID()}` };
    }
    try {
      const result = await apiCall('POST', { amount: String(amount), requestId: pendingTransferRef.current.requestId });
      pendingTransferRef.current = null;
      setSuccessMsg(String(result.message || 'Internal transfer completed successfully.'));
      await refreshWallet();
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Transfer failed. Refresh balances before retrying.');
    } finally {
      setTransferring(false);
    }
  };

  const columns: Column<TransactionRequest>[] = [
    {
      key: 'createdAt',
      header: 'Transfer Date',
      render: (item) => (
        <span className="text-xs text-slate-300 font-mono">
          {new Date(item.createdAt).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short'
          })}
        </span>
      )
    },
    {
      key: 'reference',
      header: 'Reference ID',
      render: (item) => (
        <span className="font-mono text-cyan-400 text-xs font-semibold">
          {item.reference}
        </span>
      )
    },
    {
      key: 'amountRupees',
      header: 'Amount Converted',
      render: (item) => (
        <span className="font-mono text-xs font-bold text-cyan-300">
          USDT {Number(item.amountRupees || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
        </span>
      )
    },
    {
      key: 'status',
      header: 'Status',
      render: () => (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <CheckCircle2 className="w-3 h-3" />
          <span>Completed</span>
        </span>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-blue-500/20">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Transfer Available USDT Balance to Fund Wallet</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Transfer your available earnings to Fund Wallet for package activation or reinvestment.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-[#091129] border border-blue-500/25">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Available Balance</span>
            <div className="text-sm font-bold font-mono text-emerald-400">
              USDT {Number(wallet?.incomeWallet || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-[#091129] border border-blue-500/25">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Available Fund</span>
            <div className="text-sm font-bold font-mono text-cyan-300">
              USDT {Number(wallet?.fundWallet || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-2xl bg-[#091129] border border-blue-500/25 p-5 sm:p-6 shadow-xl space-y-5">
          <div className="flex items-center justify-between border-b border-blue-500/20 pb-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>Internal Wallet Transfer</span>
            </h3>
            <span className="text-[11px] text-cyan-400 font-mono font-semibold">
              Min: USDT {settings?.minIncomeTransfer || 100} • 0% Fee
            </span>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleTransfer} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Transfer Amount (USDT)</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-cyan-400 font-bold text-xs">USDT</span>
                <input
                  type="number"
                  min={settings?.minIncomeTransfer || 100}
                  max={settings?.maxIncomeTransfer || 200000}
                  step="0.00000001"
                  value={amount > 0 ? amount : ''}
                  onChange={(e) => setAmount(e.target.value === '' ? 0 : Number(e.target.value))}
                  required
                  className="w-full pl-14 pr-3.5 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white font-mono text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20 text-xs text-slate-300 flex items-center justify-between">
              <span>Debit from Available Balance:</span>
              <span className="font-mono text-rose-400 font-bold">{amount > 0 ? `-USDT ${amount.toFixed(8)}` : "Enter amount"}</span>
            </div>
            <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20 text-xs text-slate-300 flex items-center justify-between">
              <span>Credit to Available Fund:</span>
              <span className="font-mono text-emerald-400 font-bold">{amount > 0 ? `+USDT ${amount.toFixed(8)}` : "Enter amount"}</span>
            </div>
            <button
              type="submit"
              disabled={transferring}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-cyan-950/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {transferring ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Processing secure wallet transfer...</span>
                </>
              ) : (
                <>
                  <ArrowLeftRight className="w-4 h-4" />
                  <span>Transfer to Fund Wallet</span>
                </>
              )}
            </button>
          </form>
        </div>

        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl bg-[#091129] border border-blue-500/25 p-5 shadow-xl space-y-3">
            <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              <span>Accounting Protection</span>
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              Your available balance is checked before the transfer, and the amount is moved securely between your wallets.
            </p>
            <ul className="text-[11px] text-slate-400 space-y-2 list-disc list-inside">
              <li>0% administrative charges.</li>
              <li>Fund balance updates immediately for package activation.</li>
              <li>A record of the completed transfer is maintained.</li>
              <li>Transfer references help prevent duplicate processing.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-[#091129] border border-blue-500/25 p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-blue-500/20">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Internal Transfer History</h3>
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loadingRequests}
            className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingRequests ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
        <DataTable columns={columns} data={requests} emptyMessage="No internal transfers performed yet." />
      </div>
    </div>
  );
};
