import React, { useState, useEffect } from 'react';
import { 
  ArrowLeftRight, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  UserCheck, 
  Wallet, 
  CreditCard,
  Send,
  RefreshCw,
  Clock,
  XCircle,
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase.ts';
import { 
  createTransactionRequest, 
  getUserTransactionRequests 
} from '../../services/transactionRequestService.ts';
import { getSystemSettings } from '../../services/settingsService.ts';
import { DataTable, type Column } from '../common/DataTable.tsx';
import type { TransactionRequest, UserProfile, SystemSettings } from '../../types/index.ts';

export const P2PTransfer: React.FC = () => {
  const { profile, wallet, refreshWallet } = useAuth();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [recipientCode, setRecipientCode] = useState('');
  const [recipientInfo, setRecipientInfo] = useState<{ name: string; referralCode: string } | null>(null);
  const [checkingRecipient, setCheckingRecipient] = useState(false);
  const [amount, setAmount] = useState<number>(500);
  const [userNote, setUserNote] = useState('');
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
        getUserTransactionRequests(profile.uid, 'p2p_transfer')
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

  // Lookup recipient by GF referral code (Privacy safe: Only reveals Name & GF ID)
  const handleVerifyRecipient = async () => {
    const code = recipientCode.trim().toUpperCase();
    if (!code) {
      setRecipientInfo(null);
      return;
    }
    if (profile && code === profile.referralCode.toUpperCase()) {
      setErrorMsg('You cannot transfer funds to your own Member ID.');
      setRecipientInfo(null);
      return;
    }

    setCheckingRecipient(true);
    setErrorMsg('');
    try {
      const q = query(collection(db, 'users'), where('referralCode', '==', code));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const u = snap.docs[0].data() as UserProfile;
        if (u.status === 'suspended') {
          setRecipientInfo(null);
          setErrorMsg(`Member account "${code}" is suspended and cannot receive transfers.`);
          return;
        }
        // Minimal recipient info only (Never expose email, phone, or KYC)
        setRecipientInfo({
          name: u.name,
          referralCode: u.referralCode
        });
        setErrorMsg('');
      } else {
        setRecipientInfo(null);
        setErrorMsg(`Recipient Member ID "${code}" was not found.`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCheckingRecipient(false);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !wallet) return;

    if (!recipientInfo) {
      setErrorMsg('Please enter a valid, verified Recipient Member ID.');
      return;
    }

    const minP2p = settings?.minP2p || 100;
    const maxP2p = settings?.maxP2p || 100000;

    if (amount < minP2p) {
      setErrorMsg(`Minimum P2P transfer amount is ₹${minP2p.toFixed(2)}.`);
      return;
    }
    if (amount > maxP2p) {
      setErrorMsg(`Maximum P2P transfer amount is ₹${maxP2p.toFixed(2)}.`);
      return;
    }

    if ((wallet.fundWallet || 0) < amount) {
      setErrorMsg(`Insufficient Available Fund balance. Available: ₹${(wallet.fundWallet || 0).toFixed(2)}, Required: ₹${amount.toFixed(2)}`);
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
        requestType: 'p2p_transfer',
        sourceWalletType: 'fund_wallet',
        destinationWalletType: 'peer_user',
        amountRupees: amount,
        beneficiaryReferralCode: recipientInfo.referralCode,
        userNote: userNote.trim() || 'Direct Member Transfer'
      });

      if (res.success) {
        setSuccessMsg(res.message);
        setRecipientCode('');
        setRecipientInfo(null);
        setUserNote('');
        await refreshWallet();
        await loadData();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'P2P transfer failed.');
    } finally {
      setTransferring(false);
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
      key: 'beneficiaryReferralCode',
      header: 'Recipient',
      render: (item) => (
        <div>
          <span className="text-xs font-semibold text-white block">
            {item.beneficiaryName || 'Member'}
          </span>
          <span className="text-[11px] font-mono text-cyan-400">
            {item.beneficiaryReferralCode}
          </span>
        </div>
      )
    },
    {
      key: 'amountRupees',
      header: 'Amount',
      render: (item) => (
        <span className="font-mono text-xs font-bold text-rose-400">
          -₹{item.amountRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </span>
      )
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => {
        if (item.status === 'completed') {
          return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 className="w-3 h-3" />
              <span>Transferred</span>
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
          <h2 className="text-xl font-bold text-white tracking-tight">Peer-to-Peer (P2P) Fund Transfer</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Send Available Fund securely to any active GLOBAL FINANCE member using their Member ID.
          </p>
        </div>

        <div className="p-3 rounded-xl bg-[#091129] border border-blue-500/25 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-cyan-400/40 flex items-center justify-center text-cyan-400">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Available Fund Balance</span>
            <div className="text-base font-bold font-mono text-cyan-300">
              ₹{(wallet?.fundWallet || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Transfer Form */}
        <div className="lg:col-span-7 rounded-2xl bg-[#091129] border border-blue-500/25 p-5 sm:p-6 shadow-xl space-y-5">
          <div className="flex items-center justify-between border-b border-blue-500/20 pb-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-cyan-400" />
              <span>Initiate Member Transfer</span>
            </h3>
            <span className="text-[11px] text-cyan-400 font-mono font-semibold">
              Min: ₹{settings?.minP2p || 100} • Max: ₹{settings?.maxP2p ? (settings.maxP2p / 1000) + 'k' : '100k'}
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
            {/* Recipient Lookup */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Recipient Member ID (GF Format) <span className="text-rose-400">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. GF788872"
                  value={recipientCode}
                  onChange={(e) => {
                    setRecipientCode(e.target.value.toUpperCase());
                    setRecipientInfo(null);
                  }}
                  onBlur={handleVerifyRecipient}
                  required
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white font-mono uppercase text-xs focus:outline-none focus:border-cyan-400 tracking-wider"
                />
                <button
                  type="button"
                  onClick={handleVerifyRecipient}
                  disabled={checkingRecipient || !recipientCode}
                  className="px-4 py-2.5 rounded-xl bg-[#142048] hover:bg-[#1a2c64] text-cyan-300 border border-blue-500/30 font-semibold text-xs transition-colors shrink-0 disabled:opacity-40"
                >
                  {checkingRecipient ? 'Verifying...' : 'Verify Member'}
                </button>
              </div>

              {/* Minimal recipient card for privacy */}
              {recipientInfo && (
                <div className="mt-2.5 p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-emerald-400" />
                    <span className="text-slate-200">
                      Recipient: <strong className="text-white">{recipientInfo.name}</strong>
                    </span>
                  </div>
                  <span className="font-mono text-emerald-400 font-bold">
                    {recipientInfo.referralCode}
                  </span>
                </div>
              )}
            </div>

            {/* Transfer Amount */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Transfer Amount (INR) <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-cyan-400 font-bold text-sm">
                  ₹
                </span>
                <input
                  type="number"
                  min={settings?.minP2p || 100}
                  max={settings?.maxP2p || 100000}
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  required
                  className="w-full pl-8 pr-3.5 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white font-mono text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            {/* Remarks */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Transfer Remark / Purpose (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Package investment sponsorship"
                value={userNote}
                onChange={(e) => setUserNote(e.target.value)}
                className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#060b1c] border border-blue-500/30 text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <button
              type="submit"
              disabled={transferring || !recipientInfo}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-cyan-950/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {transferring ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Executing Balanced Ledger Journal...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Transfer Funds Instantly</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Info Box */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl bg-[#091129] border border-blue-500/25 p-5 shadow-xl space-y-4">
            <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              <span>P2P Protocol Invariants</span>
            </h4>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20">
                <strong className="text-white block mb-1">Balanced Accounting</strong>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Debit to sender fund wallet and credit to recipient fund wallet are recorded atomically in a single database transaction. No money is created or destroyed.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20">
                <strong className="text-white block mb-1">Privacy Architecture</strong>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  In compliance with security guidelines, lookup displays only the recipient's display name and GF ID. Private contact data and document details remain inaccessible.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20">
                <strong className="text-white block mb-1">Zero Transfer Fee</strong>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Internal member-to-member transfers incur 0% administrative charges.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* P2P Requests & Transfers Table */}
      <div className="rounded-2xl bg-[#091129] border border-blue-500/25 p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-blue-500/20">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Your P2P Transfers
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
          emptyMessage="No P2P transfers sent yet."
        />
      </div>
    </div>
  );
};
