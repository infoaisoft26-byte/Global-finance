import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowDownLeft, CheckCircle2, Clock, Copy, RefreshCw, Wallet, XCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { getUserTransactionRequests } from '../../services/transactionRequestService.ts';
import { requestTransactionOtp, verifyTransactionOtp, submitWithdrawalWithOtp } from '../../services/p2pTransferService.ts';
import { getSystemSettings } from '../../services/settingsService.ts';
import { DataTable, type Column } from '../common/DataTable.tsx';
import type { TransactionRequest, SystemSettings } from '../../types/index.ts';

export const FundWithdrawal: React.FC<{ onOpenProfile: () => void }> = () => {
  const { user, profile, wallet, refreshWallet } = useAuth();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [amount, setAmount] = useState<number>(10);
  const [walletAddress, setWalletAddress] = useState('');
  const [userNote, setUserNote] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [otpId, setOtpId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [requests, setRequests] = useState<TransactionRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [withdrawalWindowOpen, setWithdrawalWindowOpen] = useState(false);

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
  const feeAmount = Number(((amount * feePercent) / 100).toFixed(6));
  const netPayout = Number((amount - feeAmount).toFixed(6));
  const isWithdrawalEnabled = settings?.withdrawalEnabled ?? true;

  const isWithinWithdrawalWindow = () => {
    const timezone = settings?.withdrawalTimezone || 'Asia/Kolkata';
    const start = settings?.withdrawalWindowStart || '10:30';
    const end = settings?.withdrawalWindowEnd || '15:30';
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).formatToParts(new Date());
      const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
      const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
      const current = hour * 60 + minute;
      const [startHour, startMinute] = start.split(':').map(Number);
      const [endHour, endMinute] = end.split(':').map(Number);
      const startMinutes = startHour * 60 + startMinute;
      const endMinutes = endHour * 60 + endMinute;
      return current >= startMinutes && current <= endMinutes;
    } catch {
      return true;
    }
  };

  useEffect(() => {
    const syncWindow = () => setWithdrawalWindowOpen(isWithinWithdrawalWindow());
    syncWindow();
    const timer = window.setInterval(syncWindow, 30_000);
    return () => window.clearInterval(timer);
  }, [settings?.withdrawalWindowStart, settings?.withdrawalWindowEnd, settings?.withdrawalTimezone]);

  const withdrawalWindowLabel = () => {
    const start = settings?.withdrawalWindowStart || '10:30';
    const end = settings?.withdrawalWindowEnd || '15:30';
    const format = (value: string) => {
      const [h, m] = value.split(':').map(Number);
      const suffix = h >= 12 ? 'PM' : 'AM';
      const hour = h % 12 || 12;
      return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
    };
    return `${format(start)} – ${format(end)} ${settings?.withdrawalTimezone === 'Asia/Kolkata' || !settings?.withdrawalTimezone ? 'IST' : settings.withdrawalTimezone}`;
  };
  const showWithdrawalWindowPopup = () => {
    const message = `Email OTP is available only during the permitted withdrawal hours: ${withdrawalWindowLabel()}.`;
    setErrorMsg(message);
    setSuccessMsg('');
    if (typeof window !== 'undefined') window.alert(message);
  };

  const otpPayload = () => ({ purpose: 'withdrawal' as const, amount: Number(amount), walletAddress: walletAddress.trim(), note: userNote.trim() });
  const handleSendOtp = async () => {
    if (!isWithdrawalEnabled || !isWithinWithdrawalWindow()) { showWithdrawalWindowPopup(); return; }
    if (!user) { setErrorMsg('Please sign in again.'); return; }
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress.trim()) || !Number.isFinite(amount) || amount < 2) { setErrorMsg('Enter a valid amount and BEP20 address first.'); return; }
    setSendingOtp(true); setErrorMsg(''); setSuccessMsg('');
    try { const result = await requestTransactionOtp(user, otpPayload()); setOtpId(result.otpId); setOtpCode(''); setOtpVerified(false); setSuccessMsg('Email OTP sent to ' + result.maskedEmail + '. It expires in 10 minutes.'); }
    catch (err: any) { setErrorMsg(err?.message || 'Unable to send email OTP.'); } finally { setSendingOtp(false); }
  };
  const handleVerifyOtp = async () => {
    if (!isWithdrawalEnabled || !isWithinWithdrawalWindow()) { showWithdrawalWindowPopup(); return; }
    if (!user || !otpId) { setErrorMsg('Request an email OTP first.'); return; }
    setVerifyingOtp(true); setErrorMsg('');
    try { await verifyTransactionOtp(user, { ...otpPayload(), otpId, code: otpCode }); setOtpVerified(true); setSuccessMsg('Email OTP verified. You can submit this withdrawal request.'); }
    catch (err: any) { setOtpVerified(false); setErrorMsg(err?.message || 'OTP verification failed.'); } finally { setVerifyingOtp(false); }
  };

  const handleWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !wallet) return;

    if (!isWithdrawalEnabled || !withdrawalWindowOpen) {
      setErrorMsg('Withdrawal requests are accepted daily from 10:30 AM to 3:30 PM IST.');
      return;
    }

    if (!Number.isFinite(amount) || amount < 2) {
      setErrorMsg('Minimum withdrawal amount is 2 USDT.');
      return;
    }

    if (!walletAddress.trim()) {
      setErrorMsg('Please enter your USDT BEP20 wallet address.');
      return;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress.trim())) {
      setErrorMsg('Please enter a valid BNB Smart Chain / BEP20 wallet address starting with 0x.');
      return;
    }

    if ((wallet.incomeWallet || 0) < amount) {
      setErrorMsg(`Insufficient Available Balance. Available: ${(wallet.incomeWallet || 0).toFixed(6)} USDT`);
      return;
    }

    setWithdrawing(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (!user || !otpId || !otpVerified) throw new Error('Verify the email OTP before submitting withdrawal.');
      const res = await submitWithdrawalWithOtp(user, { amount, walletAddress: walletAddress.trim(), note: userNote.trim(), otpId });

      if (res.success) {
        setSuccessMsg(`Withdrawal request submitted successfully. USDT ${amount.toFixed(6)} has been deducted from your available balance and reserved. Admin approval and processing target: within 24 hours. Reference: ${res.request.reference}`);
        setUserNote('');
        setOtpId(''); setOtpCode(''); setOtpVerified(false);
        await refreshWallet();
        await loadData();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'USDT withdrawal request failed.');
    } finally {
      setWithdrawing(false);
    }
  };

  const copyAddress = async () => {
    if (!walletAddress) return;
    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const columns: Column<TransactionRequest>[] = [
    {
      key: 'createdAt',
      header: 'Request Date',
      render: (item) => <span className="text-xs font-mono">{new Date(item.createdAt).toLocaleString('en-IN')}</span>
    },
    {
      key: 'reference',
      header: 'Reference ID',
      render: (item) => <span className="font-mono text-cyan-500 text-xs font-semibold">{item.reference}</span>
    },
    {
      key: 'amountRupees',
      header: 'Requested USDT',
      render: (item) => <span className="font-mono text-xs font-bold">{Number(item.amountRupees || 0).toFixed(6)} USDT</span>
    },
    {
      key: 'netAmountRupees',
      header: 'Net USDT',
      render: (item) => {
        const meta = (item.metadata || {}) as Record<string, any>;
        const net = meta.netPayoutUsdt ?? item.netAmountRupees ?? item.amountRupees;
        const fee = meta.feeAmountUsdt ?? item.feeRupees ?? 0;
        return (
          <div>
            <span className="font-mono text-xs font-bold block">{Number(net || 0).toFixed(6)} USDT</span>
            <span className="text-[10px] font-mono">Fee: {Number(fee || 0).toFixed(6)} USDT</span>
          </div>
        );
      }
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => {
        if (item.status === 'completed') return <span className="inline-flex items-center gap-1 text-xs font-semibold"><CheckCircle2 className="w-3.5 h-3.5" /> Completed</span>;
        if (item.status === 'rejected' || item.status === 'failed') return <span className="inline-flex items-center gap-1 text-xs font-semibold"><XCircle className="w-3.5 h-3.5" /> {item.status.toUpperCase()}</span>;
        return <span className="inline-flex items-center gap-1 text-xs font-semibold"><Clock className="w-3.5 h-3.5" /> {item.status.replace('_', ' ')}</span>;
      }
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-blue-500/20">
        <div>
          <h2 className="text-xl font-bold tracking-tight">USDT Withdrawal</h2>
          <p className="text-xs mt-1">Withdrawals support USDT on BEP20 / BNB Smart Chain only. Bank and UPI payouts are unavailable.</p>
        </div>
        <div className="p-3 rounded-xl bg-white border border-blue-200 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600"><Wallet className="w-5 h-5" /></div>
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider">Withdrawable Balance</span>
            <div className="text-base font-bold font-mono">{(wallet?.incomeWallet || 0).toFixed(6)} USDT</div>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 flex items-start gap-3 text-xs">
        <Clock className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div><strong className="font-semibold block">Daily withdrawal window</strong><span>10:30 AM – 3:30 PM IST • Minimum 2 USDT</span><span className="block mt-1">After submission, the amount is reserved immediately. Admin approval and processing target: within 24 hours. If rejected, the reserved amount is refunded to your available balance.</span></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-2xl bg-white border border-blue-200 p-5 sm:p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-blue-100 pb-3">
            <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2"><ArrowDownLeft className="w-4 h-4 text-cyan-500" />Withdrawal Application</h3>
            <span className="text-[11px] text-cyan-600 font-mono font-semibold">USDT • BEP20</span>
          </div>

          {errorMsg && <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" /><span>{errorMsg}</span></div>}
          {successMsg && <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" /><span>{successMsg}</span></div>}

          <form onSubmit={handleWithdrawal} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1">Withdrawal Amount (USDT) *</label>
              <div className="relative">
                <input type="number" min="2" step="0.000001" value={amount} onChange={(e) => setAmount(Number(e.target.value))} required className="w-full pr-16 px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono text-sm focus:outline-none focus:border-cyan-500" />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold">USDT</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">USDT BEP20 Wallet Address *</label>
              <div className="flex gap-2">
                <input type="text" value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)} placeholder="0x..." required className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono text-sm focus:outline-none focus:border-cyan-500" />
                <button type="button" onClick={copyAddress} className="px-3 rounded-xl border border-slate-300 bg-white text-xs font-semibold flex items-center gap-1"><Copy className="w-3.5 h-3.5" />{copied ? 'Copied' : 'Copy'}</button>
              </div>
              <p className="text-[11px] mt-1">Network: BNB Smart Chain (BEP20). Sending to another network may result in loss of funds.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Note (optional)</label>
              <textarea value={userNote} onChange={(e) => setUserNote(e.target.value)} rows={3} placeholder="Optional note for admin" className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm focus:outline-none focus:border-cyan-500" />
            </div>

            <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 space-y-3">
              <div className="text-xs font-bold text-cyan-800">Email OTP Security Verification</div>
              <p className="text-[11px] text-slate-600">OTP goes to your registered email. If amount or wallet address changes, request a new OTP.</p>
              <button type="button" onClick={handleSendOtp} disabled={sendingOtp || !walletAddress.trim() || otpVerified} className="w-full rounded-lg border border-cyan-300 px-3 py-2 text-xs font-bold text-cyan-800 disabled:opacity-50">{sendingOtp ? 'Sending OTP…' : !isWithdrawalEnabled || !withdrawalWindowOpen ? `OTP available ${withdrawalWindowLabel()}` : 'Send OTP to Registered Email'}</button>
              <div className="flex gap-2">
                <input aria-label="Email OTP" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otpCode} onChange={(e) => { setOtpCode(e.target.value.replace(/\D/g, '').slice(0,6)); setOtpVerified(false); }} placeholder="Enter 6-digit OTP" className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tracking-[0.25em]" />
                <button type="button" onClick={handleVerifyOtp} disabled={verifyingOtp || otpCode.length!==6 || !otpId || otpVerified} className="rounded-lg bg-cyan-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{otpVerified ? 'Verified ✓' : verifyingOtp ? 'Checking…' : 'Verify OTP'}</button>
              </div>
            </div>
            <button type="submit" disabled={withdrawing || !isWithdrawalEnabled || !withdrawalWindowOpen || !otpVerified} className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
              {withdrawing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowDownLeft className="w-4 h-4" />}
              {withdrawing ? 'Submitting…' : 'Submit USDT Withdrawal'}
            </button>
          </form>
        </div>

        <div className="lg:col-span-5 rounded-2xl bg-white border border-blue-200 p-5 sm:p-6 shadow-sm h-fit">
          <h3 className="text-sm font-bold mb-3">USDT Withdrawal Details</h3>
          <div className="space-y-3 text-xs">
            <div className="flex justify-between"><span>Asset</span><strong>USDT</strong></div>
            <div className="flex justify-between"><span>Network</span><strong>BEP20 / BNB Smart Chain</strong></div>
            <div className="flex justify-between"><span>Payout Method</span><strong>Crypto Wallet Only</strong></div>
            <div className="flex justify-between"><span>Bank / UPI</span><strong>Not Supported</strong></div>
          </div>
        </div>
      </div>

      <DataTable title="USDT Withdrawal Requests" columns={columns} data={requests} onRefresh={loadData} isLoading={loadingRequests} emptyMessage="No USDT withdrawal request found." />
    </div>
  );
};
