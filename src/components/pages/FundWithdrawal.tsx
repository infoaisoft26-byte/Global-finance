import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  Building, 
  QrCode, 
  ArrowDownLeft, 
  Info,
  RefreshCw,
  Clock,
  XCircle,
  AlertTriangle,
  Lock
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { 
  createTransactionRequest, 
  getUserTransactionRequests 
} from '../../services/transactionRequestService.ts';
import { getSystemSettings } from '../../services/settingsService.ts';
import { DataTable, type Column } from '../common/DataTable.tsx';
import type { TransactionRequest, SystemSettings } from '../../types/index.ts';

export const FundWithdrawal: React.FC<{ onOpenProfile: () => void }> = ({ onOpenProfile }) => {
  const { profile, wallet, refreshWallet } = useAuth();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [amount, setAmount] = useState<number>(1000);
  const [withdrawalType, setWithdrawalType] = useState<'bank' | 'upi'>('bank');
  const [bankAccount, setBankAccount] = useState(profile?.bankAccount || '');
  const [ifscCode, setIfscCode] = useState(profile?.ifscCode || '');
  const [upiId, setUpiId] = useState(profile?.upiId || '');
  const [userNote, setUserNote] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [requests, setRequests] = useState<TransactionRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  useEffect(() => {
    if (profile) {
      if (profile.bankAccount) setBankAccount(profile.bankAccount);
      if (profile.ifscCode) setIfscCode(profile.ifscCode);
      if (profile.upiId) setUpiId(profile.upiId);
    }
  }, [profile]);

  const loadData = async () => {
    if (!profile) return;
    setLoadingRequests(true);
    try {
      const [sysSettings, reqs] = await Promise.all([
        getSystemSettings(),
        getUserTransactionRequests(profile.uid, 'withdrawal')
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

  const feePercent = settings?.withdrawalFeePercent || 5;
  const tdsFee = Number(((amount * feePercent) / 100).toFixed(2));
  const netPayout = Number((amount - tdsFee).toFixed(2));

  const isKycVerified = profile?.kycStatus === 'verified';
  const isWithdrawalEnabled = settings?.withdrawalEnabled ?? false;

  const handleWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !wallet) return;

    if (!isKycVerified && settings?.requireKycForWithdrawal) {
      setErrorMsg('KYC verification is mandatory before requesting fund payouts.');
      return;
    }

    if (!isWithdrawalEnabled) {
      setErrorMsg('Fund withdrawals are currently disabled in platform settings (PAYOUTS_ENABLED=false).');
      return;
    }

    const minWithdrawal = settings?.minWithdrawal || 500;
    const maxWithdrawal = settings?.maxWithdrawal || 100000;

    if (amount < minWithdrawal) {
      setErrorMsg(`Minimum withdrawal amount is ₹${minWithdrawal.toFixed(2)}.`);
      return;
    }
    if (amount > maxWithdrawal) {
      setErrorMsg(`Maximum withdrawal amount is ₹${maxWithdrawal.toFixed(2)}.`);
      return;
    }

    if ((wallet.incomeWallet || 0) < amount) {
      setErrorMsg(`Insufficient Available Balance! Available: ₹${(wallet.incomeWallet || 0).toFixed(2)}, Requested: ₹${amount.toFixed(2)}`);
      return;
    }

    if (withdrawalType === 'bank' && (!bankAccount.trim() || !ifscCode.trim())) {
      setErrorMsg('Please provide your Bank Account Number and IFSC Code.');
      return;
    }

    if (withdrawalType === 'upi' && !upiId.trim()) {
      setErrorMsg('Please enter your valid UPI ID.');
      return;
    }

    const destination = withdrawalType === 'bank' 
      ? `Bank: A/C ${bankAccount} (IFSC: ${ifscCode.toUpperCase()})`
      : `UPI: ${upiId}`;

    setWithdrawing(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await createTransactionRequest({
        userId: profile.uid,
        userEmail: profile.email,
        userName: profile.name,
        userReferralCode: profile.referralCode,
        requestType: 'withdrawal',
        sourceWalletType: 'income_wallet',
        destinationWalletType: withdrawalType === 'bank' ? 'external_bank' : 'external_upi',
        amountRupees: amount,
        userNote: `${destination}. ${userNote.trim()}`,
        metadata: {
          withdrawalType,
          destination,
          tdsFee,
          netPayout
        }
      });

      if (res.success) {
        setSuccessMsg(res.message);
        setUserNote('');
        await refreshWallet();
        await loadData();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Withdrawal request failed.');
    } finally {
      setWithdrawing(false);
    }
  };

  const columns: Column<TransactionRequest>[] = [
    {
      key: 'createdAt',
      header: 'Request Date',
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
      header: 'Gross Amount',
      render: (item) => (
        <span className="font-mono text-xs font-bold text-rose-400">
          ₹{item.amountRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </span>
      )
    },
    {
      key: 'netAmountRupees',
      header: 'Net Payout',
      render: (item) => (
        <div>
          <span className="font-mono text-xs font-bold text-emerald-400 block">
            ₹{item.netAmountRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-slate-500 font-mono">Fee: ₹{item.feeRupees}</span>
        </div>
      )
    },
    {
      key: 'status',
      header: 'Payout Status',
      render: (item) => {
        if (item.status === 'completed') {
          return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 className="w-3 h-3" />
              <span>Disbursed</span>
            </span>
          );
        }
        if (item.status === 'rejected' || item.status === 'failed') {
          return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
              <XCircle className="w-3 h-3" />
              <span>{item.status.toUpperCase()}</span>
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
          <h2 className="text-xl font-bold text-white tracking-tight">Fund Withdrawal (Payout Request)</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Submit verified payout disbursements from your Available Balance directly to your registered Indian Bank or UPI.
          </p>
        </div>

        <div className="p-3 rounded-xl bg-[#091129] border border-blue-500/25 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-600/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Withdrawable Balance</span>
            <div className="text-base font-bold font-mono text-emerald-400">
              ₹{(wallet?.incomeWallet || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      {/* KYC Compliance Gate Warning */}
      {!isKycVerified && (
        <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/40 flex items-start justify-between gap-4 text-xs text-amber-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-white block font-bold">KYC Verification Mandatory for Withdrawals</strong>
              <span className="text-slate-300">
                In compliance with financial regulations, member identity documents must be submitted and approved prior to requesting payouts.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenProfile}
            className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold shrink-0"
          >
            Submit KYC
          </button>
        </div>
      )}

      {/* Automated Payouts Disabled Notice */}
      {!isWithdrawalEnabled && (
        <div className="p-4 rounded-xl bg-[#0c1638] border border-blue-500/30 flex items-start gap-3 text-xs text-slate-300">
          <Lock className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <strong className="text-cyan-300 font-semibold block mb-0.5">
              Automated Payouts Temporarily Suspended (PAYOUTS_ENABLED=false)
            </strong>
            <span>
              Real-money bank payout settlement execution remains disabled until the authorized banking provider clearance is active. Payout requests are queued for compliance inspection.
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form Card */}
        <div className="lg:col-span-7 rounded-2xl bg-[#091129] border border-blue-500/25 p-5 sm:p-6 shadow-xl space-y-5">
          <div className="flex items-center justify-between border-b border-blue-500/20 pb-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <ArrowDownLeft className="w-4 h-4 text-cyan-400" />
              <span>Withdrawal Application</span>
            </h3>
            <span className="text-[11px] text-cyan-400 font-mono font-semibold">
              Min: ₹{settings?.minWithdrawal || 500} • 5% TDS / Fee
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

          <form onSubmit={handleWithdrawal} className="space-y-4">
            {/* Amount */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Requested Withdrawal Amount (INR) <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-400 font-bold text-sm">
                  ₹
                </span>
                <input
                  type="number"
                  min={settings?.minWithdrawal || 500}
                  max={settings?.maxWithdrawal || 100000}
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  required
                  className="w-full pl-8 pr-3.5 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white font-mono text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            {/* Payout Channel Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Payout Channel
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setWithdrawalType('bank')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    withdrawalType === 'bank'
                      ? 'bg-blue-600/30 border-cyan-400 text-white'
                      : 'bg-[#060b1c] border-blue-500/20 text-slate-400'
                  }`}
                >
                  <Building className="w-4 h-4 text-cyan-400 mb-1" />
                  <span className="text-xs font-bold block text-white">Bank Account</span>
                  <span className="text-[10px] text-slate-400">Direct NEFT / IMPS</span>
                </button>

                <button
                  type="button"
                  onClick={() => setWithdrawalType('upi')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    withdrawalType === 'upi'
                      ? 'bg-blue-600/30 border-cyan-400 text-white'
                      : 'bg-[#060b1c] border-blue-500/20 text-slate-400'
                  }`}
                >
                  <QrCode className="w-4 h-4 text-emerald-400 mb-1" />
                  <span className="text-xs font-bold block text-white">UPI VPA</span>
                  <span className="text-[10px] text-slate-400">Instant UPI VPA</span>
                </button>
              </div>
            </div>

            {/* Destination inputs */}
            {withdrawalType === 'bank' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Bank Account Number
                  </label>
                  <input
                    type="text"
                    value={bankAccount}
                    onChange={(e) => setBankAccount(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    IFSC Code
                  </label>
                  <input
                    type="text"
                    value={ifscCode}
                    onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white font-mono text-xs focus:outline-none focus:border-cyan-400 uppercase"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  UPI VPA / ID
                </label>
                <input
                  type="text"
                  placeholder="yourname@bank"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>
            )}

            {/* Net Payout Summary */}
            <div className="p-3.5 rounded-xl bg-[#060b1c] border border-blue-500/20 space-y-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Gross Withdrawal:</span>
                <span className="font-mono text-white">₹{amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Govt TDS & Settlement Fee ({feePercent}%):</span>
                <span className="font-mono text-rose-400">-₹{tdsFee.toFixed(2)}</span>
              </div>
              <div className="pt-2 border-t border-blue-500/20 flex justify-between font-bold text-sm">
                <span className="text-white">Net Disbursed to Account:</span>
                <span className="font-mono text-emerald-400">₹{netPayout.toFixed(2)}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={withdrawing || (!isKycVerified && settings?.requireKycForWithdrawal) || !isWithdrawalEnabled}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/40 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {withdrawing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Submitting Payout Request...</span>
                </>
              ) : (
                <>
                  <ArrowDownLeft className="w-4 h-4" />
                  <span>Submit Audited Withdrawal Request</span>
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
              <span>Withdrawal Governance Protocol</span>
            </h4>
            <div className="space-y-2.5 text-xs text-slate-300">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                To guarantee zero fake withdrawal approvals, withdrawal statuses follow an audited 5-stage lifecycle:
              </p>
              <div className="space-y-1.5 font-mono text-[11px]">
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>1. PENDING: User submission logged</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  <span>2. UNDER REVIEW: Compliance checks</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-indigo-400" />
                  <span>3. APPROVED: Authorized for payout</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-purple-400" />
                  <span>4. PROCESSING: In banking queue</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>5. COMPLETED: Bank UTR settlement verified</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Withdrawal Queue Table */}
      <div className="rounded-2xl bg-[#091129] border border-blue-500/25 p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-blue-500/20">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Your Withdrawal Queue & Records
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
          emptyMessage="No withdrawal requests submitted yet."
        />
      </div>
    </div>
  );
};
