import React, { useState, useEffect } from 'react';
import { 
  Wallet, 
  ArrowUpRight, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  Check, 
  ShieldCheck, 
  Building, 
  QrCode,
  CreditCard,
  RefreshCw,
  Clock,
  Lock,
  AlertTriangle,
  XCircle
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { getTransactions } from '../../services/financeService.ts';
import { 
  createTransactionRequest, 
  getUserTransactionRequests 
} from '../../services/transactionRequestService.ts';
import { getSystemSettings } from '../../services/settingsService.ts';
import { DataTable, type Column } from '../common/DataTable.tsx';
import type { TransactionLedger, TransactionRequest, SystemSettings } from '../../types/index.ts';

export const Recharge: React.FC = () => {
  const { profile, wallet, refreshWallet } = useAuth();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [amount, setAmount] = useState<number>(1000);
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'bank' | 'gateway'>('upi');
  const [utrNumber, setUtrNumber] = useState('');
  const [userNote, setUserNote] = useState('');
  const [processing, setProcessing] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [requests, setRequests] = useState<TransactionRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);

  const officialUpi = 'globalfinance.in@upi';
  const quickAmounts = [500, 1000, 2500, 5000, 10000, 25000, 50000];

  const loadData = async () => {
    if (!profile) return;
    setLoadingRequests(true);
    try {
      const [sysSettings, reqs] = await Promise.all([
        getSystemSettings(),
        getUserTransactionRequests(profile.uid, 'recharge')
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

  const handleCopyUpi = () => {
    navigator.clipboard.writeText(officialUpi);
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2000);
  };

  const handleSubmitRecharge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    const minAmount = settings?.minRecharge || 500;
    const maxAmount = settings?.maxRecharge || 500000;

    if (amount < minAmount) {
      setErrorMsg(`Minimum deposit amount is ₹${minAmount.toFixed(2)}.`);
      return;
    }
    if (amount > maxAmount) {
      setErrorMsg(`Maximum deposit amount is ₹${maxAmount.toFixed(2)}.`);
      return;
    }
    if (!utrNumber.trim()) {
      setErrorMsg('Please enter the 12-digit UTR / Bank Reference number.');
      return;
    }

    setProcessing(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await createTransactionRequest({
        userId: profile.uid,
        userEmail: profile.email,
        userName: profile.name,
        userReferralCode: profile.referralCode,
        requestType: 'recharge',
        sourceWalletType: 'fund_wallet',
        destinationWalletType: 'fund_wallet',
        amountRupees: amount,
        userNote: `Payment via ${paymentMethod.toUpperCase()} (UTR: ${utrNumber.trim()}). ${userNote.trim()}`,
        metadata: {
          paymentMethod,
          utrNumber: utrNumber.trim(),
          submittedAt: new Date().toISOString()
        }
      });

      if (res.success) {
        setSuccessMsg(res.message);
        setUtrNumber('');
        setUserNote('');
        await refreshWallet();
        await loadData();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Deposit request failed. Please verify and retry.');
    } finally {
      setProcessing(false);
    }
  };

  const columns: Column<TransactionRequest>[] = [
    {
      key: 'createdAt',
      header: 'Date & Time',
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
      header: 'Amount',
      render: (item) => (
        <span className="font-mono text-xs font-bold text-emerald-400">
          +₹{item.amountRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </span>
      )
    },
    {
      key: 'userNote',
      header: 'Deposit Details',
      render: (item) => (
        <span className="text-xs text-slate-300 truncate max-w-xs block">
          {item.userNote || 'Manual Deposit Verification'}
        </span>
      )
    },
    {
      key: 'status',
      header: 'Compliance Status',
      render: (item) => {
        if (item.status === 'completed') {
          return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 className="w-3 h-3" />
              <span>Credited</span>
            </span>
          );
        }
        if (item.status === 'rejected' || item.status === 'failed') {
          return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
              <XCircle className="w-3 h-3" />
              <span>Rejected</span>
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Clock className="w-3 h-3 animate-pulse" />
            <span className="capitalize">{item.status.replace('_', ' ')}</span>
          </span>
        );
      }
    }
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-blue-500/20">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Available Fund Deposit</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Add capital to your Available Fund to activate packages and execute member P2P transfers.
          </p>
        </div>

        <div className="p-3 rounded-xl bg-[#091129] border border-blue-500/25 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-cyan-400/40 flex items-center justify-center text-cyan-400">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Current Fund Balance</span>
            <div className="text-base font-bold font-mono text-cyan-300">
              ₹{(wallet?.fundWallet || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      {/* Compliance / Integration Notice */}
      <div className="p-4 rounded-xl bg-[#0c1638] border border-blue-500/30 flex items-start gap-3 text-xs text-slate-300">
        <Lock className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-cyan-300 font-semibold block mb-0.5">
            Audited Deposit Verification Protocol
          </strong>
          <span>
            Real-money payment execution adheres to regulatory clearance (PAYMENTS_ENABLED=false default). All deposit submissions record an immutable transaction request validated against bank settlement references.
          </span>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Form: Deposit Request */}
        <div className="lg:col-span-7 rounded-2xl bg-[#091129] border border-blue-500/25 p-5 sm:p-6 shadow-xl space-y-5">
          <div className="flex items-center justify-between border-b border-blue-500/20 pb-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-cyan-400" />
              <span>Submit Deposit Request</span>
            </h3>
            <span className="text-[11px] text-cyan-400 font-mono font-semibold">
              Min: ₹{settings?.minRecharge || 500} • Max: ₹{settings?.maxRecharge ? (settings.maxRecharge / 1000) + 'k' : '500k'}
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

          <form onSubmit={handleSubmitRecharge} className="space-y-4">
            {/* Amount input */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Deposit Amount (INR)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-cyan-400 font-bold text-sm">
                  ₹
                </span>
                <input
                  type="number"
                  min={settings?.minRecharge || 500}
                  max={settings?.maxRecharge || 500000}
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  required
                  className="w-full pl-8 pr-3.5 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white font-mono text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>

              {/* Quick Amount Pills */}
              <div className="flex flex-wrap gap-2 mt-2">
                {quickAmounts.map((qAmt) => (
                  <button
                    key={qAmt}
                    type="button"
                    onClick={() => setAmount(qAmt)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-all ${
                      amount === qAmt
                        ? 'bg-blue-600 text-white border border-cyan-400'
                        : 'bg-[#0e173a] text-slate-400 hover:text-slate-200 border border-blue-500/20'
                    }`}
                  >
                    ₹{qAmt.toLocaleString('en-IN')}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment Method Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Transfer Channel Used
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('upi')}
                  className={`p-2.5 rounded-xl border text-center transition-all ${
                    paymentMethod === 'upi'
                      ? 'bg-blue-600/30 border-cyan-400 text-white'
                      : 'bg-[#060b1c] border-blue-500/20 text-slate-400'
                  }`}
                >
                  <QrCode className="w-4 h-4 mx-auto mb-1 text-cyan-400" />
                  <span className="text-[11px] font-bold block">UPI Transfer</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('bank')}
                  className={`p-2.5 rounded-xl border text-center transition-all ${
                    paymentMethod === 'bank'
                      ? 'bg-blue-600/30 border-cyan-400 text-white'
                      : 'bg-[#060b1c] border-blue-500/20 text-slate-400'
                  }`}
                >
                  <Building className="w-4 h-4 mx-auto mb-1 text-cyan-400" />
                  <span className="text-[11px] font-bold block">NEFT / IMPS</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('gateway')}
                  className={`p-2.5 rounded-xl border text-center transition-all ${
                    paymentMethod === 'gateway'
                      ? 'bg-blue-600/30 border-cyan-400 text-white'
                      : 'bg-[#060b1c] border-blue-500/20 text-slate-400'
                  }`}
                >
                  <CreditCard className="w-4 h-4 mx-auto mb-1 text-cyan-400" />
                  <span className="text-[11px] font-bold block">Net Banking</span>
                </button>
              </div>
            </div>

            {/* UTR / Reference Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Bank UTR / Transaction Reference (12 Digits) <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. 426819827361"
                value={utrNumber}
                onChange={(e) => setUtrNumber(e.target.value.toUpperCase())}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white font-mono text-xs focus:outline-none focus:border-cyan-400 uppercase tracking-wider"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                Found in your banking receipt or UPI app after sending payment.
              </span>
            </div>

            {/* Optional Note */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Additional Note / Remitter Name (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Transferred from HDFC Bank account"
                value={userNote}
                onChange={(e) => setUserNote(e.target.value)}
                className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#060b1c] border border-blue-500/30 text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <button
              type="submit"
              disabled={processing}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-cyan-950/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {processing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Submitting Audited Request...</span>
                </>
              ) : (
                <>
                  <ArrowUpRight className="w-4 h-4" />
                  <span>Submit Deposit Verification Request</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Info: Official Settlement Coordinates */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl bg-[#091129] border border-blue-500/25 p-5 shadow-xl space-y-4">
            <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
              <Building className="w-4 h-4" />
              <span>Official Settlement Account</span>
            </h4>

            {/* UPI Coordinate Box */}
            <div className="p-3.5 rounded-xl bg-[#060b1c] border border-blue-500/20 space-y-2">
              <span className="text-[11px] text-slate-400 block">Global Finance Treasury UPI ID:</span>
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#0a122e] border border-cyan-500/30">
                <span className="font-mono text-cyan-300 font-bold text-xs">{officialUpi}</span>
                <button
                  type="button"
                  onClick={handleCopyUpi}
                  className="p-1 rounded text-slate-400 hover:text-white"
                  title="Copy UPI ID"
                >
                  {copiedUpi ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Bank RTGS/NEFT Coordinates */}
            <div className="p-3.5 rounded-xl bg-[#060b1c] border border-blue-500/20 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Bank Name:</span>
                <span className="text-white font-semibold">HDFC Bank Ltd.</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Account Name:</span>
                <span className="text-white font-semibold">GLOBAL FINANCE DIGITAL CORP</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Account Number:</span>
                <span className="text-cyan-300 font-mono font-bold">50200088921832</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">IFSC Code:</span>
                <span className="text-white font-mono font-bold">HDFC0000128</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Account Type:</span>
                <span className="text-slate-300">Corporate Current Account</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-blue-950/30 border border-blue-500/20 text-[11px] text-slate-300 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-cyan-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Verification SLA:</span>
              </div>
              <p className="leading-relaxed">
                Recharge requests are matched with banking transaction logs within 15–30 minutes during banking hours. Once verified, funds are instantly credited to your Available Fund.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Deposit Requests Table */}
      <div className="rounded-2xl bg-[#091129] border border-blue-500/25 p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-blue-500/20">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Your Deposit Requests & Status
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
          emptyMessage="No deposit requests submitted yet."
        />
      </div>
    </div>
  );
};
