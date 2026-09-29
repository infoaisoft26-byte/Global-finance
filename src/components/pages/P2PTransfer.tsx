import React, { useEffect, useState } from 'react';
import { ArrowLeftRight, CheckCircle2, AlertCircle, UserCheck, Wallet, Send, RefreshCw, Clock, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { getSystemSettings } from '../../services/settingsService.ts';
import { listP2pTransfers, lookupP2pRecipient, sendP2pTransfer } from '../../services/p2pTransferService.ts';
import { DataTable, type Column } from '../common/DataTable.tsx';
import type { TransactionRequest, SystemSettings } from '../../types/index.ts';

export const P2PTransfer: React.FC = () => {
  const { user, profile, wallet, refreshWallet } = useAuth();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [recipientCode, setRecipientCode] = useState('');
  const [recipientInfo, setRecipientInfo] = useState<{ name: string; referralCode: string } | null>(null);
  const [checkingRecipient, setCheckingRecipient] = useState(false);
  const [amount, setAmount] = useState<number>(100);
  const [userNote, setUserNote] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [requests, setRequests] = useState<TransactionRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  const loadData = async () => {
    if (!user) return;
    setLoadingRequests(true);
    try {
      const [sysSettings, reqs] = await Promise.all([
        getSystemSettings(),
        listP2pTransfers(user),
      ]);
      setSettings(sysSettings);
      setRequests(reqs);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || 'Unable to load P2P transfer data.');
    } finally {
      setLoadingRequests(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.uid]);

  const handleVerifyRecipient = async () => {
    const code = recipientCode.trim().toUpperCase();
    setRecipientInfo(null);
    setSuccessMsg('');
    if (!code) return;
    if (!/^GF\d{6}$/.test(code)) {
      setErrorMsg('Enter a valid Member ID in GF123456 format.');
      return;
    }
    if (profile && code === String(profile.referralCode || '').toUpperCase()) {
      setErrorMsg('You cannot transfer funds to your own Member ID.');
      return;
    }
    if (!user) {
      setErrorMsg('Please sign in again to verify the member.');
      return;
    }

    setCheckingRecipient(true);
    setErrorMsg('');
    try {
      const recipient = await lookupP2pRecipient(user, code);
      setRecipientInfo(recipient);
    } catch (err: any) {
      setErrorMsg(err?.message || `Recipient Member ID "${code}" was not found.`);
    } finally {
      setCheckingRecipient(false);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || !wallet) {
      setErrorMsg('Please sign in again before transferring funds.');
      return;
    }
    if (!recipientInfo) {
      setErrorMsg('Please verify the Recipient Member ID first.');
      return;
    }

    const minP2p = Number(settings?.minP2p || 1);
    const maxP2p = Number(settings?.maxP2p || 1000000);
    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMsg('Enter a valid transfer amount.');
      return;
    }
    if (amount < minP2p) {
      setErrorMsg(`Minimum P2P transfer amount is ${minP2p.toFixed(2)} USDT.`);
      return;
    }
    if (amount > maxP2p) {
      setErrorMsg(`Maximum P2P transfer amount is ${maxP2p.toFixed(2)} USDT.`);
      return;
    }
    if (Number(wallet.fundWallet || 0) < amount) {
      setErrorMsg(`Insufficient Available USDT. Available: ${Number(wallet.fundWallet || 0).toFixed(2)} USDT, Required: ${amount.toFixed(2)} USDT.`);
      return;
    }

    setTransferring(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await sendP2pTransfer(user, recipientInfo.referralCode, amount, userNote || 'Direct Member Transfer');
      setSuccessMsg(res.message);
      setRecipientCode('');
      setRecipientInfo(null);
      setUserNote('');
      await refreshWallet();
      await loadData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'P2P transfer failed.');
    } finally {
      setTransferring(false);
    }
  };

  const columns: Column<TransactionRequest>[] = [
    {
      key: 'createdAt',
      header: 'Date & Time',
      render: (item) => <span className="text-xs text-slate-300 font-mono">{new Date(item.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>,
    },
    {
      key: 'reference',
      header: 'Reference ID',
      render: (item) => <span className="font-mono text-cyan-400 text-xs font-semibold">{item.reference}</span>,
    },
    {
      key: 'beneficiaryReferralCode',
      header: 'Recipient',
      render: (item) => (
        <div>
          <span className="text-xs font-semibold text-white block">{item.beneficiaryName || 'Member'}</span>
          <span className="text-[11px] font-mono text-cyan-400">{item.beneficiaryReferralCode}</span>
        </div>
      ),
    },
    {
      key: 'amountRupees',
      header: 'Amount',
      render: (item) => <span className="font-mono text-xs font-bold text-rose-400">-{Number(item.amountRupees || 0).toFixed(2)} USDT</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => (
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${item.status === 'completed' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/15 text-amber-400 border-amber-500/30'}`}>
          {item.status === 'completed' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
          <span>{item.status === 'completed' ? 'Transferred' : String(item.status).replace('_', ' ')}</span>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-blue-500/20">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Peer-to-Peer (P2P) Fund Transfer</h2>
          <p className="text-xs text-slate-400 mt-0.5">Send Available USDT securely to any active GLOBAL FINANCE member using their Member ID.</p>
        </div>
        <div className="p-3 rounded-xl bg-[#091129] border border-blue-500/25 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-cyan-400/40 flex items-center justify-center text-cyan-400"><Wallet className="w-5 h-5" /></div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Available USDT</span>
            <div className="text-base font-bold font-mono text-cyan-300">{Number(wallet?.fundWallet || 0).toFixed(2)} USDT</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-2xl bg-[#091129] border border-blue-500/25 p-5 sm:p-6 shadow-xl space-y-5">
          <div className="flex items-center justify-between border-b border-blue-500/20 pb-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2"><ArrowLeftRight className="w-4 h-4 text-cyan-400" /><span>Initiate Member Transfer</span></h3>
            <span className="text-[11px] text-cyan-400 font-mono font-semibold">Min: {settings?.minP2p || 1} • Max: {settings?.maxP2p || 1000000} USDT</span>
          </div>

          {errorMsg && <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" /><span>{errorMsg}</span></div>}
          {successMsg && <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" /><span>{successMsg}</span></div>}

          <form onSubmit={handleTransfer} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Recipient Member ID / Sponsor ID (GF Format) <span className="text-rose-400">*</span></label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. GF788872"
                  value={recipientCode}
                  maxLength={8}
                  onChange={(e) => { setRecipientCode(e.target.value.toUpperCase().replace(/\s/g, '')); setRecipientInfo(null); setErrorMsg(''); }}
                  onBlur={handleVerifyRecipient}
                  required
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white font-mono uppercase text-xs focus:outline-none focus:border-cyan-400 tracking-wider"
                />
                <button type="button" onClick={handleVerifyRecipient} disabled={checkingRecipient || !recipientCode} className="px-4 py-2.5 rounded-xl bg-[#142048] hover:bg-[#1a2c64] text-cyan-300 border border-blue-500/30 font-semibold text-xs transition-colors shrink-0 disabled:opacity-40">
                  {checkingRecipient ? 'Verifying...' : 'Verify Member'}
                </button>
              </div>
              {recipientInfo && (
                <div className="mt-2.5 p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2"><UserCheck className="w-4 h-4 text-emerald-400" /><span className="text-slate-200">Recipient: <strong className="text-white">{recipientInfo.name}</strong></span></div>
                  <span className="font-mono text-emerald-400 font-bold">{recipientInfo.referralCode}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Transfer Amount (USDT) <span className="text-rose-400">*</span></label>
              <input type="number" min={settings?.minP2p || 1} max={settings?.maxP2p || 1000000} step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} required className="w-full px-3.5 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white font-mono text-sm focus:outline-none focus:border-cyan-400" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Transfer Remark / Purpose (Optional)</label>
              <input type="text" maxLength={250} placeholder="e.g. Member fund transfer" value={userNote} onChange={(e) => setUserNote(e.target.value)} className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#060b1c] border border-blue-500/30 text-white focus:outline-none focus:border-cyan-400" />
            </div>

            <button type="submit" disabled={transferring || !recipientInfo} className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-cyan-950/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
              {transferring ? <><RefreshCw className="w-4 h-4 animate-spin" /><span>Processing Secure Transfer...</span></> : <><Send className="w-4 h-4" /><span>Transfer Funds Instantly</span></>}
            </button>
          </form>
        </div>

        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl bg-[#091129] border border-blue-500/25 p-5 shadow-xl space-y-4">
            <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2"><ShieldCheck className="w-4 h-4" /><span>P2P Security</span></h4>
            <div className="space-y-3 text-xs text-slate-300">
              <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20"><strong className="text-white block mb-1">Atomic Transfer</strong><p className="text-[11px] text-slate-400 leading-relaxed">Sender debit and recipient credit are completed together in one secure database transaction.</p></div>
              <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20"><strong className="text-white block mb-1">Server-side Member Verification</strong><p className="text-[11px] text-slate-400 leading-relaxed">GF Member ID is checked against the live production member database. Private contact and KYC data are never exposed.</p></div>
              <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/20"><strong className="text-white block mb-1">Zero Transfer Fee</strong><p className="text-[11px] text-slate-400 leading-relaxed">Internal member-to-member transfer currently uses zero transfer fee.</p></div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-[#091129] border border-blue-500/25 p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-blue-500/20">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Your P2P Transfers</h3>
          <button onClick={loadData} disabled={loadingRequests} className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300"><RefreshCw className={`w-3.5 h-3.5 ${loadingRequests ? 'animate-spin' : ''}`} /><span>Refresh</span></button>
        </div>
        <DataTable columns={columns} data={requests} emptyMessage="No P2P transfers sent yet." />
      </div>
    </div>
  );
};
