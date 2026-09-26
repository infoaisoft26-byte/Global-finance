import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  User, 
  Wallet, 
  ShieldCheck, 
  Clock, 
  Layers, 
  Package, 
  History, 
  FileText, 
  AlertCircle, 
  CheckCircle2, 
  Scale, 
  CreditCard,
  PlusCircle,
  MinusCircle,
  RefreshCw,
  Copy,
  Check
} from 'lucide-react';
import { 
  adminGetUserDetail, 
  adminAuditedFinancialAdjustment,
  getTransactions
} from '../../../services/financeService.ts';
import { useAuth } from '../../../context/AuthContext.tsx';
import type { 
  UserProfile, 
  WalletData, 
  PackageActivationRecord, 
  TransactionLedger 
} from '../../../types/index.ts';

interface AdminUserDetailProps {
  userId: string;
  onBack: () => void;
}

export const AdminUserDetail: React.FC<AdminUserDetailProps> = ({ userId, onBack }) => {
  const { user: currentAdmin } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [packages, setPackages] = useState<PackageActivationRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionLedger[]>([]);
  const [ledgerStats, setLedgerStats] = useState<{
    derivedFundWallet: number;
    derivedIncomeWallet: number;
    totalCredits: number;
    totalDebits: number;
    entryCount: number;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);

  // Audited Adjustment Modal state
  const [showAdjModal, setShowAdjModal] = useState(false);
  const [adjWalletType, setAdjWalletType] = useState<'fund_wallet' | 'income_wallet'>('fund_wallet');
  const [adjFlow, setAdjFlow] = useState<'credit' | 'debit'>('credit');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjProcessing, setAdjProcessing] = useState(false);
  const [adjError, setAdjError] = useState('');
  const [adjSuccess, setAdjSuccess] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await adminGetUserDetail(userId);
      setProfile(data.profile);
      setWallet(data.wallet);
      setPackages(data.packages);
      setLedgerStats(data.ledgerStats);

      const txns = await getTransactions(userId);
      setTransactions(txns);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [userId]);

  const handleExecuteAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAdmin) return;
    const num = parseFloat(adjAmount);
    if (isNaN(num) || num <= 0) {
      setAdjError('Please enter a valid positive adjustment amount');
      return;
    }
    if (!adjReason.trim()) {
      setAdjError('Mandatory audit justification reason required');
      return;
    }

    setAdjProcessing(true);
    setAdjError('');
    try {
      const res = await adminAuditedFinancialAdjustment(
        currentAdmin.uid,
        userId,
        adjWalletType,
        adjFlow,
        num,
        adjReason.trim()
      );
      setAdjSuccess(`Audited transaction recorded in immutable ledger! Txn Ref: ${res.transactionId}`);
      setAdjAmount('');
      setAdjReason('');
      setShowAdjModal(false);
      await loadData();
    } catch (err: any) {
      setAdjError(err.message || 'Adjustment failed');
    } finally {
      setAdjProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
        <RefreshCw className="w-7 h-7 animate-spin text-cyan-400" />
        <span className="text-sm">Fetching immutable ledger records and team structure...</span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-8 text-center bg-[#091129] rounded-2xl border border-blue-500/20 space-y-3">
        <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
        <h3 className="text-base font-bold text-white">User not found</h3>
        <button
          onClick={onBack}
          className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold"
        >
          Return to User List
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Nav Back */}
      <div className="flex items-center justify-between pb-2">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0e173a] hover:bg-[#142250] text-slate-300 hover:text-white border border-blue-500/30 text-xs font-semibold transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-cyan-400" />
          <span>Back to All Users</span>
        </button>

        <button
          onClick={() => setShowAdjModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-950/40 transition-all"
        >
          <Scale className="w-4 h-4" />
          <span>Audited Ledger Adjustment</span>
        </button>
      </div>

      {adjSuccess && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{adjSuccess}</span>
        </div>
      )}

      {/* Member Profile Overview Banner */}
      <div className="p-6 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-blue-500/20">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white font-extrabold text-lg shadow-md">
              {profile.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">{profile.name}</h2>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  profile.status === 'suspended'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                }`}>
                  {profile.status || 'active'}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">{profile.email}</div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            <div className="p-2.5 rounded-xl bg-[#060b1c] border border-blue-500/20">
              <span className="text-slate-400 block text-[10px] uppercase">Member Code</span>
              <span className="text-cyan-400 font-bold text-sm">{profile.referralCode}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#060b1c] border border-blue-500/20">
              <span className="text-slate-400 block text-[10px] uppercase">Sponsor ID</span>
              <span className="text-slate-200 font-bold text-sm">{profile.sponsorId || '—'}</span>
            </div>
          </div>
        </div>

        {/* Breakdown Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/15">
            <span className="text-slate-500 block text-[11px]">Direct Team Count:</span>
            <span className="text-white font-mono font-bold text-base">{wallet?.directTeamCount || 0}</span>
          </div>
          <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/15">
            <span className="text-slate-500 block text-[11px]">Total Team Count:</span>
            <span className="text-cyan-400 font-mono font-bold text-base">{wallet?.totalTeamCount || 0}</span>
          </div>
          <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/15">
            <span className="text-slate-500 block text-[11px]">KYC Verification:</span>
            <span className="text-emerald-400 font-semibold capitalize">{profile.kycStatus || 'unverified'}</span>
          </div>
          <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/15">
            <span className="text-slate-500 block text-[11px]">Joined Platform:</span>
            <span className="text-slate-300 font-mono">
              {new Date(profile.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
            </span>
          </div>
        </div>
      </div>

      {/* Ledger Derived Balances (Mathematical Verification) */}
      <div className="p-6 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-blue-500/20">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400">
              Wallet Balances (Derived From Append-Only Ledger)
            </h3>
            <p className="text-xs text-slate-500">
              Balances are mathematically computed directly from server transactions. Direct balance edits are prohibited.
            </p>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {ledgerStats?.entryCount || 0} Ledger Events
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-[#060b1c] border border-blue-500/20">
            <span className="text-xs text-slate-400">Available Fund (Current)</span>
            <div className="text-2xl font-bold font-mono text-cyan-400 mt-1">
              ₹{wallet?.fundWallet?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">
              Derived: ₹{ledgerStats?.derivedFundWallet.toFixed(2)}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-[#060b1c] border border-blue-500/20">
            <span className="text-xs text-slate-400">Available Balance / Income</span>
            <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
              ₹{wallet?.incomeWallet?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">
              Derived: ₹{ledgerStats?.derivedIncomeWallet.toFixed(2)}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-[#060b1c] border border-blue-500/20">
            <span className="text-xs text-slate-400">Total Credits Disbursed</span>
            <div className="text-2xl font-bold font-mono text-white mt-1">
              ₹{ledgerStats?.totalCredits.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}
            </div>
            <span className="text-[10px] text-emerald-400 mt-1 block">Cumulative inflow</span>
          </div>

          <div className="p-4 rounded-xl bg-[#060b1c] border border-blue-500/20">
            <span className="text-xs text-slate-400">Total Debits Applied</span>
            <div className="text-2xl font-bold font-mono text-rose-400 mt-1">
              ₹{ledgerStats?.totalDebits.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}
            </div>
            <span className="text-[10px] text-rose-400 mt-1 block">Cumulative outflow</span>
          </div>
        </div>
      </div>

      {/* Package Activations */}
      <div className="p-6 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400">
          Activated Packages ({packages.length})
        </h3>

        {packages.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-xs bg-[#060b1c] rounded-xl border border-blue-500/10">
            No packages currently activated by this member.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {packages.map((pkg) => (
              <div key={pkg.id} className="p-4 rounded-xl bg-[#060b1c] border border-blue-500/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs">{pkg.packageName}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-cyan-500/20 text-cyan-300">
                    {pkg.packageType.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center justify-between font-mono text-xs">
                  <span className="text-slate-400">Invested Capital:</span>
                  <span className="text-emerald-400 font-bold">₹{pkg.amount.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                  <span>Daily ROI Rate: {pkg.roiDailyRate}%</span>
                  <span>Duration: {pkg.durationDays} days</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Audited Financial Adjustment Modal */}
      {showAdjModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b132b] border border-blue-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-base font-bold text-white">
              <Scale className="w-5 h-5 text-cyan-400" />
              <span>Audited Financial Adjustment</span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              This operation executes a server-side PostgreSQL / Firestore transaction that writes an audited entry to the immutable ledger. Direct balance overwriting is strictly blocked by platform rules.
            </p>

            {adjError && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs">
                {adjError}
              </div>
            )}

            <form onSubmit={handleExecuteAdjustment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Target Wallet</label>
                <select
                  value={adjWalletType}
                  onChange={(e) => setAdjWalletType(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[#060b1c] border border-blue-500/30 text-white focus:outline-none focus:border-cyan-400"
                >
                  <option value="fund_wallet">Available Fund</option>
                  <option value="income_wallet">Available Balance (Income)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Adjustment Flow</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjFlow('credit')}
                    className={`py-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 border transition-all ${
                      adjFlow === 'credit'
                        ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300 shadow-md'
                        : 'bg-[#060b1c] border-blue-500/20 text-slate-400'
                    }`}
                  >
                    <PlusCircle className="w-4 h-4 text-emerald-400" />
                    <span>Credit (+)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAdjFlow('debit')}
                    className={`py-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 border transition-all ${
                      adjFlow === 'debit'
                        ? 'bg-rose-600/30 border-rose-500 text-rose-300 shadow-md'
                        : 'bg-[#060b1c] border-blue-500/20 text-slate-400'
                    }`}
                  >
                    <MinusCircle className="w-4 h-4 text-rose-400" />
                    <span>Debit (-)</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="e.g. 500.00"
                  value={adjAmount}
                  onChange={(e) => setAdjAmount(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#060b1c] border border-blue-500/30 text-white font-mono focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Compliance Audit Reason (Required)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Reconciling verified UPI banking UTR #827299..."
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#060b1c] border border-blue-500/30 text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdjModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#101b3d] text-slate-300 text-xs hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjProcessing}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-xs shadow-md transition-colors disabled:opacity-50"
                >
                  {adjProcessing ? 'Executing Ledger Write...' : 'Commit to Immutable Ledger'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
