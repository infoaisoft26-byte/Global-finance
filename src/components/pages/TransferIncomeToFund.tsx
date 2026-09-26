import React, { useState, useEffect } from 'react';
import { 
  ArrowLeftRight, 
  CheckCircle2, 
  AlertCircle, 
  Wallet, 
  CreditCard, 
  Sparkles,
  RefreshCw,
  Clock,
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { 
  createTransactionRequest, 
  getUserTransactionRequests 
} from '../../services/transactionRequestService.ts';
import { getSystemSettings } from '../../services/settingsService.ts';
import { DataTable, type Column } from '../common/DataTable.tsx';
import type { TransactionRequest, SystemSettings } from '../../types/index.ts';

export const TransferIncomeToFund: React.FC = () => {
  const { profile, wallet, refreshWallet } = useAuth();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [amount, setAmount] = useState<number>(500);
  const [transferring, setTransferring] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [requests, setRequests] = useState<TransactionRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  const loadData = async () => {
    if (!profile) return;
    setLoadingRequests(true);
    try {
      const [sysSettings, reqs] = await Promise.all([
        getSystemSettings(),
        getUserTransactionRequests(profile.uid, 'income_to_fund')
      ]);
      setSettings(sysSettings);
      setRequests(reqs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRequests(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [profile?.uid]);

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !wallet) return;

    const minAmount = settings?.minIncomeTransfer || 100;
    const maxAmount = settings?.maxIncomeTransfer || 200000;

    if (amount < minAmount) {
      setErrorMsg(`Minimum internal transfer amount is ₹${minAmount.toFixed(2)}.`);
      return;
    }
    if (amount > maxAmount) {
      setErrorMsg(`Maximum internal transfer amount is ₹${maxAmount.toFixed(2)}.`);
      return;
    }

    if ((wallet.incomeWallet || 0) < amount) {
      setErrorMsg(`Insufficient Available Balance! Available: ₹${(wallet.incomeWallet || 0).toFixed(2)}, Required: ₹${amount.toFixed(2)}`);
      return;
    }

    setTransferring(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await createTransactionRequest({
        userId: profile.uid,
        userEmail: profile.email,
        userName: profile.name,
        userReferralCode: profile.referralCode,
        requestType: 'income_to_fund',
        sourceWalletType: 'income_wallet',
        destinationWalletType: 'fund_wallet',
        amountRupees: amount,
        userNote: 'Internal balance conversion to Available Fund'
      });

      if (res.success) {
        setSuccessMsg(res.message);
        await refreshWallet();
        await loadData();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Conversion failed. Please verify and retry.');
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
          ₹{item.amountRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </span>
      )
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <CheckCircle2 className="w-3 h-3" />
          <span>Completed</span>
        </span>
      )
    }
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-blue-500/20">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Convert Available Balance to Available Fund</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Shift earnings from Available Balance into Available Fund to reinvest or activate packages.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-[#091129] border border-blue-500/25">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Available Balance</span>
            <div className="text-sm font-bold font-mono text-emerald-400">
              ₹{(wallet?.incomeWallet || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-[#091129] border border-blue-500/25">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Available Fund</span>
            <div className="text-sm font-bold font-mono text-cyan-300">
              ₹{(wallet?.fundWallet || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form Card */}
        <div className="lg:col-span-7 rounded-2xl bg-[#091129] border border-blue-500/25 p-5 sm:p-6 shadow-xl space-y-5">
          <div className="flex items-center justify-between border-b border-blue-500/20 pb-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>Internal Wallet Shift</span>
            </h3>
            <span className="text-[11px] text-cyan-400 font-mono font-semibold">
              Min: ₹{settings?.minIncomeTransfer || 100} • 0% Fee
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
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Conversion Amount (INR)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-cyan-400 font-bold text-sm">
                  ₹
                </span>
                <input
                  type="number"
                  min={settings?.minIncomeTransfer || 100}
                  max={settings?.maxIncomeTransfer || 200000}
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  required
                  className="w-full pl-8 pr-3.5 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white font-mono text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20 text-xs text-slate-300 flex items-center justify-between">
              <span>Debit from Available Balance:</span>
              <span className="font-mono text-rose-400 font-bold">-₹{amount.toFixed(2)}</span>
            </div>
            <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20 text-xs text-slate-300 flex items-center justify-between">
              <span>Credit to Available Fund:</span>
              <span className="font-mono text-emerald-400 font-bold">+₹{amount.toFixed(2)}</span>
            </div>

            <button
              type="submit"
              disabled={transferring}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-cyan-950/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {transferring ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Converting in Atomic Ledger...</span>
                </>
              ) : (
                <>
                  <ArrowLeftRight className="w-4 h-4" />
                  <span>Confirm Internal Balance Shift</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Info Box */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl bg-[#091129] border border-blue-500/25 p-5 shadow-xl space-y-3">
            <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              <span>Accounting Invariant Rules</span>
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              Internal transfers between your Available Balance and Available Fund are executed instantly inside a single database transaction.
            </p>
            <ul className="text-[11px] text-slate-400 space-y-2 list-disc list-inside">
              <li>0% administrative charges or TDS deducted.</li>
              <li>Fund balance is immediately unlocked for package activation.</li>
              <li>Creates immutable double-entry journal records.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* History Table */}
      <div className="rounded-2xl bg-[#091129] border border-blue-500/25 p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-blue-500/20">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Internal Shift History
          </h3>
          <button
            onClick={loadData}
            disabled={loadingRequests}
            className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingRequests ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        <DataTable
          columns={columns}
          data={requests}
          emptyMessage="No internal transfers performed yet."
        />
      </div>
    </div>
  );
};
