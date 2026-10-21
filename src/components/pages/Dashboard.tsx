import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { 
  Wallet, 
  TrendingUp, 
  Users, 
  ArrowUpRight, 
  ArrowDownLeft, 
  CreditCard, 
  Package, 
  Copy, 
  Check, 
  ExternalLink,
  ShieldAlert,
  ArrowRight,
  Sparkles,
  Calendar,
  Layers,
  Award,
  RefreshCw,
  QrCode,
  Smartphone,
  ListOrdered,
  Table as TableIcon
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { auth } from '../../lib/firebase.ts';
import { getTransactions, getDownlineMembers } from '../../services/financeService.ts';
import { getActiveOfferPoster, type OfferPoster } from '../../services/offerPosterService.ts';
import type { ActivePage } from '../../types/index.ts';

interface DashboardProps {
  onNavigate: (page: ActivePage) => void;
  onOpenProfile: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, onOpenProfile }) => {
  const { user, profile, wallet, refreshWallet } = useAuth();
  const [incomeLedger, setIncomeLedger] = useState<any[]>([]);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [teamMembers, setTeamMembers] = useState<Awaited<ReturnType<typeof getDownlineMembers>> | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [offerPoster, setOfferPoster] = useState<OfferPoster | null>(null);
  const [showOffer, setShowOffer] = useState(false);

  const referralCode = profile?.referralCode || '';

  const loadIncomeLedger = useCallback(async () => {
    if (!user) return;
    try {
      const token = await (auth.currentUser || user).getIdToken();
      const response = await fetch('/api/member-income-history', {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(payload.transactions)) throw new Error(payload.error || 'Income ledger unavailable');
      setIncomeLedger(payload.transactions);
    } catch (error) { console.error('Dashboard income ledger refresh failed:', error); }
  }, [user?.uid]);

  // Initial dashboard load only. Use the Total Income card's Refresh control for updates.
  useEffect(() => {
    void loadIncomeLedger();
  }, [loadIncomeLedger]);

  const [incomeRefreshing, setIncomeRefreshing] = useState(false);
  const handleIncomeRefresh = async () => {
    if (incomeRefreshing) return;
    setIncomeRefreshing(true);
    try {
      await loadIncomeLedger();
      await refreshWallet();
    } finally {
      setIncomeRefreshing(false);
    }
  };

  const retopupLevelSummary = useMemo(() => {
    const levels = Array.from({ length: 15 }, (_, index) => ({
      level: index + 1,
      rate: index === 0 ? 1 : 0.25,
      amount: 0,
    }));
    for (const t of incomeLedger) {
      if (t.flow !== 'credit' || !['completed', 'approved', 'credited'].includes(String(t.status || '').toLowerCase())) continue;
      const type = String(t.type || '').toLowerCase();
      const metadata = (t.metadata && typeof t.metadata === 'object' ? t.metadata : {}) as Record<string, unknown>;
      if (!type.includes('retopup')) continue;
      const levelMatch = type.match(/level[_-]?(\\d{1,2})|(?:^|[_-])l(\\d{1,2})(?:$|[_-])/);
      const rawLevel = Number(metadata.level ?? metadata.levelNumber ?? levelMatch?.[1] ?? levelMatch?.[2]);
      if (!Number.isInteger(rawLevel) || rawLevel < 1 || rawLevel > 15) continue;
      const amount = Number(t.netAmount || t.amount || 0);
      if (Number.isFinite(amount)) levels[rawLevel - 1].amount += amount;
    }
    return levels;
  }, [incomeLedger]);
  const eligibleRetopupLevels = retopupLevelSummary.filter(item =>
    (teamMembers?.some(member => Number(member.level) === item.level) ?? false) || item.amount > 0
  );
  const totalRetopupLevelIncome = retopupLevelSummary.reduce((sum, item) => sum + item.amount, 0);

  const actualIncomeTotals = useMemo(() => {
    const result = { total: 0, referral: 0, basicReferral: 0, fdReferral: 0, level: 0, roi: 0, salary: 0, bonus: 0, other: 0 };
    for (const t of incomeLedger) {
      if (t.flow !== 'credit' || !['completed','approved','credited'].includes(String(t.status || '').toLowerCase())) continue;
      const amount = Number(t.netAmount || t.amount || 0);
      if (!Number.isFinite(amount)) continue;
      result.total += amount;
      const type = String(t.type || '').toLowerCase();
      if (type.includes('referral') || type === 'direct_referral') { result.referral += amount; if (type.startsWith('fd_')) result.fdReferral += amount; else if (type.startsWith('basic_')) result.basicReferral += amount; }
      else if (type.includes('level')) result.level += amount;
      else if (type.includes('roi') || type === 'roi_daily') result.roi += amount;
      else if (type === 'salary') result.salary += amount;
      else if (['joining_bonus','registration_bonus','signup_bonus'].includes(type)) result.bonus += amount;
      else result.other += amount;
    }
    return result;
  }, [incomeLedger]);

  // Read team counts from the authenticated, server-calculated downline instead
  // of stale wallet counters, which may not have been updated for legacy members.
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const loadTeamSummary = async () => {
      if (!profile?.referralCode || inFlight || cancelled) return;
      inFlight = true;
      try {
        const members = await getDownlineMembers(profile.referralCode);
        if (!cancelled) setTeamMembers(members);
      } catch (error) {
        console.error('Unable to refresh dashboard team summary:', error);
      } finally {
        inFlight = false;
      }
    };
    void loadTeamSummary();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadTeamSummary();
    }, 15000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadTeamSummary();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [profile?.uid, profile?.referralCode]);

  const directTeamCount = teamMembers
    ? teamMembers.filter(member => Number(member.level) === 1).length
    : Number(wallet?.directTeamCount || 0);
  const totalTeamCount = teamMembers
    ? teamMembers.length
    : Number(wallet?.totalTeamCount || 0);

  const [capCycles, setCapCycles] = useState<Array<{ id: string; package_name?: string; package_type?: string; amount: string | number; status?: string; cap_amount?: string | number; credited_total?: string | number; cap_reconciled?: boolean }>>([]);
  const [capReferralStatus, setCapReferralStatus] = useState<'active' | 'inactive'>('active');
  const [capLoading, setCapLoading] = useState(true);
  const [capError, setCapError] = useState('');
  const [capRefreshing, setCapRefreshing] = useState(false);
  const [capLastUpdated, setCapLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    if (!user) {
      setCapCycles([]);
      setCapReferralStatus('active');
      setCapLoading(false);
      setCapError('');
      return;
    }
    const loadCapStatus = async (initial = false) => {
      if (inFlight || cancelled) return;
      inFlight = true;
      if (initial) setCapLoading(true);
      setCapRefreshing(true);
      try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/usdt-bep20-deposit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ action: 'package_history' }),
          cache: 'no-store',
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Unable to load package history');
        if (!cancelled) {
          setCapCycles(Array.isArray(data.items) ? data.items : []);
          setCapReferralStatus(data.referralStatus === 'inactive' ? 'inactive' : 'active');
          setCapError('');
          setCapLastUpdated(new Date());
        }
      } catch (error) {
        if (!cancelled) setCapError(error instanceof Error ? error.message : 'Unable to load package history');
      } finally {
        inFlight = false;
        if (!cancelled) {
          setCapLoading(false);
          setCapRefreshing(false);
        }
      }
    };
    void loadCapStatus(true);
    const interval = window.setInterval(() => { void loadCapStatus(false); }, 15000);
    const onVisible = () => { if (document.visibilityState === 'visible') void loadCapStatus(false); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user?.uid]);

  const capSummary = capCycles.reduce((summary, cycle) => {
    const invested = Number(cycle.amount || 0);
    const cap = Number(cycle.cap_amount ?? invested * 5);
    const counted = Math.max(0, Number(cycle.credited_total || 0));
    summary.invested += invested;
    summary.totalCap += cap;
    summary.counted += counted;
    summary.remaining += Math.max(0, cap - counted);
    if (cycle.cap_reconciled === false) summary.unreconciled += 1;
    return summary;
  }, { invested: 0, totalCap: 0, counted: 0, remaining: 0, unreconciled: 0 });
  // If the current account has legacy wallet package balances but no linked
  // package-activation rows yet, show a clearly labelled estimate instead of 0.
  const walletPackageAmount = Number(wallet?.basicPackageActive || 0) + Number(wallet?.fdPackageActive || 0);
  const capHasActivationRows = capCycles.length > 0;
  const displayedInvestment = capHasActivationRows ? capSummary.invested : walletPackageAmount;
  const displayedCapLimit = capHasActivationRows ? capSummary.totalCap : walletPackageAmount * 5;
  const displayedRemainingCap = capHasActivationRows ? capSummary.remaining : displayedCapLimit;
  const capStatusLabel = capHasActivationRows && capSummary.unreconciled > 0 ? 'SYNC PENDING' : capReferralStatus === 'inactive' ? 'ID INACTIVE' : capHasActivationRows ? 'ID ACTIVE' : 'SYNC PENDING';

  const refreshCapStatus = async () => {
    if (!user || capRefreshing) return;
    setCapRefreshing(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/usdt-bep20-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ action: 'package_history' }),
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to load package history');
      setCapCycles(Array.isArray(data.items) ? data.items : []);
      setCapReferralStatus(data.referralStatus === 'inactive' ? 'inactive' : 'active');
      setCapError('');
      setCapLastUpdated(new Date());
    } catch (error) {
      setCapError(error instanceof Error ? error.message : 'Unable to load package history');
    } finally {
      setCapRefreshing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    getActiveOfferPoster().then((poster) => {
      if (!cancelled && poster) { setOfferPoster(poster); setShowOffer(true); }
    }).catch((err) => console.warn('Offer poster unavailable:', err));
    return () => { cancelled = true; };
  }, []);
  const referralUrl = typeof window !== 'undefined' && referralCode
    ? `${window.location.origin}/register?r=${referralCode}`
    : '';

  const handleCopyLink = () => {
    if (!referralUrl) return;
    navigator.clipboard.writeText(referralUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(referralCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const formatUsdt = (val: number | undefined) => {
    const num = Number(val || 0);
    return `USDT ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`;
  };

  return (
    <div className="space-y-6">
      {showOffer && offerPoster && (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-3xl bg-[#091129] border border-cyan-500/30 shadow-2xl shadow-cyan-950/40">
            <button onClick={() => setShowOffer(false)} className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/70 border border-white/20 text-white text-lg" aria-label="Close offer">×</button>
            <img src={offerPoster.imageUrl} alt={offerPoster.title} className="w-full max-h-[65vh] object-contain bg-black/20" />
            <div className="p-5 space-y-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-400">Exclusive Offer</div>
              <h3 className="text-xl font-extrabold text-white">{offerPoster.title}</h3>
              {offerPoster.description && <p className="text-sm text-slate-300 leading-relaxed">{offerPoster.description}</p>}
              <div className="flex gap-2">
                {offerPoster.ctaLabel && offerPoster.ctaUrl && <a href={offerPoster.ctaUrl} target={offerPoster.ctaUrl.startsWith('http') ? '_blank' : undefined} rel="noreferrer" onClick={() => setShowOffer(false)} className="flex-1 text-center px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-xs font-bold">{offerPoster.ctaLabel}</a>}
                <button onClick={() => setShowOffer(false)} className="px-4 py-3 rounded-xl bg-[#111c44] border border-blue-500/30 text-slate-200 text-xs font-semibold">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Top Banner & Quick Shortcuts */}
      <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-[#0d173d] via-[#0b1435] to-[#070b1a] border border-blue-500/30 shadow-xl backdrop-blur-md flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
              Welcome back
            </span>
            <span className="text-slate-500">·</span>
            <span className="text-xs text-slate-400 font-mono">
              Member ID: {profile?.referralCode || '—'}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            {profile?.name || 'Global Finance Member'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-xl">
            Real-time digital finance dashboard. Manage investment packages, monitor downline commissions, and process instant ledger transfers.
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
          <button
            onClick={() => onNavigate('recharge')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs transition-all shadow-lg shadow-emerald-950/40"
          >
            <ArrowUpRight className="w-4 h-4" />
            <span>Recharge Fund</span>
          </button>

          <button
            onClick={() => onNavigate('basic-package')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-semibold text-xs transition-all shadow-lg shadow-blue-950/40"
          >
            <Package className="w-4 h-4" />
            <span>Activate Package</span>
          </button>

          <button
            onClick={() => onNavigate('p2p-transfer')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#111c44] hover:bg-[#16255c] text-cyan-300 font-semibold text-xs border border-blue-500/30 transition-all shadow-sm"
          >
            <ArrowDownLeft className="w-4 h-4" />
            <span>P2P Transfer</span>
          </button>

          <button
            onClick={() => onNavigate('fund-withdrawal')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#111c44] hover:bg-[#16255c] text-rose-300 font-semibold text-xs border border-blue-500/30 transition-all shadow-sm"
          >
            <CreditCard className="w-4 h-4" />
            <span>Withdraw</span>
          </button>
        </div>
      </div>

      {/* Referral Link & Viral Invitation Card */}
      <div className="p-4 sm:p-5 rounded-xl bg-[#091129]/90 border border-cyan-500/25 shadow-lg backdrop-blur-md flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-300">
              Your Referral Link (GF Format)
            </div>
            <div className="text-xs sm:text-sm font-mono text-cyan-400 truncate max-w-md">
              {referralUrl || 'Referral link unavailable until your Member ID is assigned'}
            </div>
            <div className="mt-1 text-[10px] text-slate-500">
              Referral ID: <span className="font-mono text-cyan-300">{referralCode || '—'}</span>
              {profile?.sponsorId && <> · Referred by: <span className="font-mono text-slate-300">{profile.sponsorId}</span> <span className="text-slate-500">({profile.sponsorName || 'Sponsor name unavailable'})</span></>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 text-xs font-medium transition-colors"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedLink ? 'Copied Link' : 'Copy Referral URL'}</span>
          </button>

          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#111d46] hover:bg-[#17275d] border border-blue-500/30 text-slate-200 text-xs font-medium transition-colors"
          >
            {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
            <span>Copy ID: {referralCode}</span>
          </button>

          <button
            onClick={() => setShowQrModal(true)}
            title="Show QR Code"
            className="p-1.5 rounded-lg bg-[#111d46] hover:bg-[#17275d] border border-blue-500/30 text-cyan-400"
          >
            <QrCode className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ACCOUNT DETAILS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-[#091129]/90 border border-cyan-500/20 shadow-lg">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Sponsor ID</div>
          <div className="mt-1 font-mono text-sm font-bold text-cyan-300">{profile?.sponsorId || '—'}</div>
        </div>
        <div className="p-4 rounded-xl bg-[#091129]/90 border border-cyan-500/20 shadow-lg">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Sponsor Name</div>
          <div className="mt-1 text-sm font-semibold text-white truncate">{profile?.sponsorName || '—'}</div>
        </div>
        <div className="p-4 rounded-xl bg-[#091129]/90 border border-blue-500/20 shadow-lg">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500"><Smartphone className="w-3.5 h-3.5 text-cyan-400"/> Primary Mobile</div>
          <div className="mt-1 font-mono text-sm font-semibold text-slate-200">{profile?.phone || '—'}</div>
        </div>
        <div className="p-4 rounded-xl bg-[#091129]/90 border border-blue-500/20 shadow-lg">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500"><Smartphone className="w-3.5 h-3.5 text-cyan-400"/> Second Mobile</div>
          <div className="mt-1 font-mono text-sm font-semibold text-slate-200">{profile?.secondPhone || 'Not added'}</div>
        </div>
      </div>

      {/* PRIMARY STATS ROW: Basic Package & FD Package */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* Basic Package Card */}
        <div className="p-5 sm:p-6 rounded-2xl bg-[#091129]/90 border border-blue-500/30 shadow-xl backdrop-blur-md relative overflow-hidden group hover:border-cyan-500/40 transition-all">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Basic Package
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-cyan-400">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono tracking-tight tabular-nums">
            {formatUsdt(wallet?.basicPackageActive)}
          </div>
          <div className="mt-4 pt-3 border-t border-blue-500/15 flex items-center justify-between text-xs">
            <span className="text-slate-400">Active Daily ROI Plan</span>
            <button
              onClick={() => onNavigate('basic-package')}
              className="text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform"
            >
              Activate <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* FD Package Card */}
        <div className="p-5 sm:p-6 rounded-2xl bg-[#091129]/90 border border-blue-500/30 shadow-xl backdrop-blur-md relative overflow-hidden group hover:border-amber-500/40 transition-all">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              FD Package
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono tracking-tight tabular-nums">
            {formatUsdt(wallet?.fdPackageActive)}
          </div>
          <div className="mt-4 pt-3 border-t border-blue-500/15 flex items-center justify-between text-xs">
            <span className="text-slate-400">Fixed Deposit Lock Plan</span>
            <button
              onClick={() => onNavigate('fd-package')}
              className="text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform"
            >
              Activate <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Live 5X Cap summary — based on this member's recorded package activations */}
        <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-[#082b3a] via-[#091129] to-[#101744] border border-cyan-400/50 shadow-xl shadow-cyan-950/20 relative overflow-hidden">
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-cyan-400/10 blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-200">Live 5X Capping</span>
            <span className={`flex items-center gap-1.5 text-[10px] font-bold ${capStatusLabel === 'ID INACTIVE' ? 'text-rose-300' : capStatusLabel === 'SYNC PENDING' ? 'text-amber-300' : 'text-emerald-300'}`}><span className={`w-1.5 h-1.5 rounded-full ${capStatusLabel === 'ID INACTIVE' ? 'bg-rose-400' : capStatusLabel === 'SYNC PENDING' ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`} /> {capStatusLabel}</span>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono tracking-tight tabular-nums">
            {capLoading ? 'Loading…' : displayedInvestment > 0 ? formatUsdt(displayedRemainingCap) : 'Awaiting plan sync'}
          </div>
          <div className="mt-1 text-xs text-cyan-100/80">
            {capHasActivationRows ? `Remaining eligible cap across ${capCycles.length} recorded plan(s)` : displayedInvestment > 0 ? 'Estimated from current wallet package balances; plan-cycle records still need syncing' : 'No package activation records or active package balance returned for this account'}
          </div>
          <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3 border-t border-cyan-300/15 pt-3">
            <div><div className="text-[10px] uppercase tracking-wider text-slate-400">Recorded investment</div><div className="mt-1 text-sm font-bold text-white">{formatUsdt(displayedInvestment)}</div></div>
            <div><div className="text-[10px] uppercase tracking-wider text-slate-400">Total 5X cap</div><div className="mt-1 text-sm font-bold text-cyan-200">{formatUsdt(displayedCapLimit)}</div></div>
            <div><div className="text-[10px] uppercase tracking-wider text-slate-400">Counted income</div><div className="mt-1 text-sm font-bold text-white">{capHasActivationRows && capSummary.unreconciled > 0 ? 'Pending' : formatUsdt(capSummary.counted)}</div></div>
            <div><div className="text-[10px] uppercase tracking-wider text-slate-400">Remaining cap</div><div className="mt-1 text-sm font-bold text-emerald-200">{capHasActivationRows && capSummary.unreconciled > 0 ? 'Pending' : formatUsdt(displayedRemainingCap)}</div></div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-400">{capError ? 'Could not refresh package data' : capHasActivationRows && capSummary.unreconciled > 0 ? 'Historical cap reconciliation pending' : capHasActivationRows ? 'Verified from recorded package activations and ledger credits' : displayedInvestment > 0 ? 'Wallet fallback estimate — activation sync pending' : 'Package history syncs automatically'}</span>
            <button onClick={refreshCapStatus} disabled={capRefreshing} className="inline-flex items-center gap-1 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-[10px] font-semibold text-cyan-200 disabled:opacity-50"><RefreshCw className={`h-3 w-3 ${capRefreshing ? 'animate-spin' : ''}`} /> Refresh</button>
          </div>
          {capError && <div className="mt-2 text-[10px] text-rose-300">{capError}</div>}
          <div className="mt-1 text-[10px] text-slate-500">{capLastUpdated ? `Updated ${capLastUpdated.toLocaleTimeString()}` : 'Waiting for first package sync'} · refreshes every 15 sec</div>
        </div>
      </div>

      {/* BALANCE SUMMARY SECTION */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400">
            Balance Summary
          </h3>
          <span className="text-xs text-slate-500">Real-time ledger synchronized</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Available Fund */}
          <div className="p-5 rounded-xl bg-[#091129]/90 border border-blue-500/25 shadow-lg backdrop-blur-md">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400">Available Fund</span>
              <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white font-mono tracking-tight tabular-nums">
              {formatUsdt(wallet?.fundWallet)}
            </div>
            <div className="mt-3 text-[11px] text-slate-400 flex items-center justify-between">
              <span>Deposit wallet</span>
              <button 
                onClick={() => onNavigate('recharge')} 
                className="text-cyan-400 hover:underline"
              >
                Add Fund
              </button>
            </div>
          </div>

          {/* Available Balance */}
          <div className="p-5 rounded-xl bg-[#091129]/90 border border-blue-500/25 shadow-lg backdrop-blur-md">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400">Available Balance</span>
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                <CreditCard className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-emerald-400 font-mono tracking-tight tabular-nums">
              {formatUsdt(wallet?.incomeWallet)}
            </div>
            <div className="mt-3 text-[11px] text-slate-400 flex items-center justify-between">
              <span>Income wallet</span>
              <button 
                onClick={() => onNavigate('fund-withdrawal')} 
                className="text-emerald-400 hover:underline"
              >
                Withdraw
              </button>
            </div>
          </div>

          {/* Total Income */}
          <div className="p-5 rounded-xl bg-[#091129]/90 border border-blue-500/25 shadow-lg backdrop-blur-md">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400">Total Income</span>
              <button type="button" onClick={handleIncomeRefresh} disabled={incomeRefreshing} aria-label="Refresh income totals" title="Refresh income totals" className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${incomeRefreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-indigo-300 font-mono tracking-tight tabular-nums">
              {formatUsdt(incomeLedger.length ? actualIncomeTotals.total : wallet?.totalIncome)}
            </div>
            <div className="mt-3 text-[11px] text-slate-400">
              Cumulative earnings
            </div>
          </div>

          {/* Total Withdrawal */}
          <div className="p-5 rounded-xl bg-[#091129]/90 border border-blue-500/25 shadow-lg backdrop-blur-md">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400">Total Withdrawal</span>
              <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400">
                <ArrowDownLeft className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-rose-300 font-mono tracking-tight tabular-nums">
              {formatUsdt(wallet?.totalWithdrawal)}
            </div>
            <div className="mt-3 text-[11px] text-slate-400">
              Net payout executed
            </div>
          </div>

          {/* Compact retopup level summary; only levels present in the downline or with credited income are shown. */}
          <div className="p-3 sm:p-4 rounded-xl bg-[#091129]/90 border border-violet-500/25 shadow-lg backdrop-blur-md sm:col-span-2 lg:col-span-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-violet-300">Retopup Income</span>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">Total</span>
                <span className="font-bold text-violet-200 font-mono">{formatUsdt(totalRetopupLevelIncome)}</span>
              </div>
            </div>
            {eligibleRetopupLevels.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
                {eligibleRetopupLevels.map((item) => (
                  <div key={item.level} className="flex items-center justify-between gap-2 rounded-md border border-violet-500/15 bg-[#0b1430] px-2.5 py-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-slate-300">Level {item.level}</div>
                      <div className="text-[10px] text-cyan-300">{item.rate}%</div>
                    </div>
                    <div className="text-xs font-bold text-white font-mono text-right">{formatUsdt(item.amount)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400">Retopup levels will appear automatically when your team qualifies or income is credited.</p>
            )}
          </div>
        </div>
      </div>

      {/* TEAM SUMMARY SECTION */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400">
            Team Summary
          </h3>
          <button 
            onClick={() => onNavigate('direct-team')}
            className="text-xs text-cyan-400 hover:underline flex items-center gap-1"
          >
            View Downline <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {/* Member Referral ID */}
          <div className="p-5 rounded-xl bg-[#091129]/90 border border-cyan-500/25 shadow-lg backdrop-blur-md flex items-center justify-between">
            <div className="min-w-0">
              <span className="text-xs text-slate-400">My Referral ID</span>
              <div className="text-xl sm:text-2xl font-extrabold text-cyan-300 font-mono mt-1 tabular-nums break-all">
                {referralCode || '—'}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Share this ID to invite members</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
              <Users className="w-6 h-6" />
            </div>
          </div>

          {/* Direct Team */}
          <div className="p-5 rounded-xl bg-[#091129]/90 border border-blue-500/25 shadow-lg backdrop-blur-md flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400">Direct Referrals</span>
              <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono mt-1 tabular-nums">
                {directTeamCount}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Members who joined with your referral</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Users className="w-6 h-6" />
            </div>
          </div>

          {/* Total Team */}
          <div className="p-5 rounded-xl bg-[#091129]/90 border border-blue-500/25 shadow-lg backdrop-blur-md flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400">Total Team Members</span>
              <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono mt-1 tabular-nums">
                {totalTeamCount}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Direct and indirect members across your network</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Users className="w-6 h-6" />
            </div>
          </div>
        </div>
        {teamMembers && teamMembers.length > 0 && (
          <div className="mt-4 p-4 rounded-xl bg-[#091129]/90 border border-blue-500/20">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400">Recent Team Members</h4>
              <button onClick={() => onNavigate('team-list')} className="text-xs text-cyan-400 hover:underline">View all members</button>
            </div>
            <div className="space-y-2">
              {teamMembers.slice(0, 5).map(member => (
                <div key={member.id || member.userId || member.referralCode} className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-blue-500/10 last:border-0">
                  <div>
                    <div className="text-sm font-semibold text-white">{member.name}</div>
                    <div className="text-[11px] text-slate-400 font-mono">{member.referralCode || '—'} · {member.level === 1 ? 'Direct' : `Level ${member.level}`}</div>
                  </div>
                  <span className="text-[11px] text-slate-400">{member.joinDate ? new Date(member.joinDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* TWO COLUMN BREAKDOWN: Basic Income Breakdown & FD Income Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Basic Income Breakdown */}
        <div className="p-5 sm:p-6 rounded-2xl bg-[#091129]/90 border border-blue-500/25 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between pb-4 border-b border-blue-500/20 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <Package className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                Basic Income Breakdown
              </h3>
            </div>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-400 border border-cyan-500/30">
              Basic Tier
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="p-3.5 rounded-lg bg-[#0e173a]/70 border border-blue-500/15">
              <span className="text-[11px] text-slate-400">Joining Bonus</span>
              <div className="text-base sm:text-lg font-bold text-white font-mono mt-1 tabular-nums">
                {formatUsdt(wallet?.joiningBonus)}
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[#0e173a]/70 border border-blue-500/15">
              <span className="text-[11px] text-slate-400">Referral Income</span>
              <div className="text-base sm:text-lg font-bold text-emerald-400 font-mono mt-1 tabular-nums">
                {formatUsdt(incomeLedger.length ? actualIncomeTotals.basicReferral : wallet?.referralIncome)}
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[#0e173a]/70 border border-blue-500/15">
              <span className="text-[11px] text-slate-400">Today ROI Income</span>
              <div className="text-base sm:text-lg font-bold text-cyan-300 font-mono mt-1 tabular-nums">
                {formatUsdt(wallet?.todayRoiIncome)}
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[#0e173a]/70 border border-blue-500/15">
              <span className="text-[11px] text-slate-400">Today Level Income</span>
              <div className="text-base sm:text-lg font-bold text-teal-300 font-mono mt-1 tabular-nums">
                {formatUsdt(wallet?.todayLevelIncome)}
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[#0e173a]/70 border border-blue-500/15">
              <span className="text-[11px] text-slate-400">Total ROI Income</span>
              <div className="text-base sm:text-lg font-bold text-white font-mono mt-1 tabular-nums">
                {formatUsdt(wallet?.totalRoiIncome)}
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[#0e173a]/70 border border-blue-500/15">
              <span className="text-[11px] text-slate-400">Total Level Income</span>
              <div className="text-base sm:text-lg font-bold text-white font-mono mt-1 tabular-nums">
                {formatUsdt(incomeLedger.length ? actualIncomeTotals.level : wallet?.totalLevelIncome)}
              </div>
            </div>
          </div>
        </div>

        {/* FD Income Breakdown */}
        <div className="p-5 sm:p-6 rounded-2xl bg-[#091129]/90 border border-blue-500/25 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between pb-4 border-b border-blue-500/20 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Layers className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                FD Income Breakdown
              </h3>
            </div>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-500/30">
              FD Tier
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-lg bg-[#0e173a]/70 border border-blue-500/15">
              <span className="text-[11px] text-slate-400">Today ROI Income</span>
              <div className="text-base sm:text-lg font-bold text-amber-300 font-mono mt-1 tabular-nums">
                {formatUsdt(wallet?.fdTodayRoiIncome)}
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[#0e173a]/70 border border-blue-500/15">
              <span className="text-[11px] text-slate-400">Today Level Income</span>
              <div className="text-base sm:text-lg font-bold text-yellow-300 font-mono mt-1 tabular-nums">
                {formatUsdt(wallet?.fdTodayLevelIncome)}
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[#0e173a]/70 border border-blue-500/15">
              <span className="text-[11px] text-slate-400">Total ROI Income</span>
              <div className="text-base sm:text-lg font-bold text-white font-mono mt-1 tabular-nums">
                {formatUsdt(wallet?.fdTotalRoiIncome)}
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[#0e173a]/70 border border-blue-500/15">
              <span className="text-[11px] text-slate-400">Total Level Income</span>
              <div className="text-base sm:text-lg font-bold text-white font-mono mt-1 tabular-nums">
                {formatUsdt(wallet?.fdTotalLevelIncome)}
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[#0e173a]/70 border border-blue-500/15">
              <span className="text-[11px] text-slate-400">Referral Income</span>
              <div className="text-base sm:text-lg font-bold text-emerald-400 font-mono mt-1 tabular-nums">
                {formatUsdt(incomeLedger.length ? actualIncomeTotals.fdReferral : wallet?.fdReferralIncome)}
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[#0e173a]/70 border border-blue-500/15">
              <span className="text-[11px] text-slate-400">FD Released</span>
              <div className="text-base sm:text-lg font-bold text-cyan-300 font-mono mt-1 tabular-nums">
                {formatUsdt(wallet?.fdReleased)}
              </div>
            </div>

            <div className="col-span-2 sm:col-span-3 p-3.5 rounded-lg bg-[#0e173a]/70 border border-blue-500/15 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400">Total Salary</span>
                <p className="text-[10px] text-slate-500">Executive monthly salary payout</p>
              </div>
              <div className="text-lg sm:text-xl font-bold text-rose-300 font-mono tabular-nums">
                {formatUsdt(wallet?.totalSalary)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* QR Code Modal for Referral */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b132b] border border-blue-500/30 rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4">
            <h4 className="text-base font-bold text-white">Your Referral QR Code</h4>
            <div className="bg-white p-4 rounded-xl inline-block shadow-inner">
              {/* Scalable Vector QR Code Graphic */}
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(referralUrl)}`} 
                alt="Referral QR Code" 
                className="w-44 h-44 mx-auto"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="font-mono text-cyan-400 text-sm font-bold">
              {referralCode}
            </div>
            <p className="text-xs text-slate-400">
              Scan to register on Global Finance under your sponsor code.
            </p>
            <button
              onClick={() => setShowQrModal(false)}
              className="w-full py-2 bg-[#121f4c] hover:bg-[#182963] text-white rounded-lg text-xs font-semibold border border-blue-500/30"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
