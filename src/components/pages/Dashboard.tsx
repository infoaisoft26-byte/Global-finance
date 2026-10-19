import React, { useEffect, useState } from 'react';
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
import { getTransactions } from '../../services/financeService.ts';
import { getActiveOfferPoster, type OfferPoster } from '../../services/offerPosterService.ts';
import type { ActivePage } from '../../types/index.ts';

interface DashboardProps {
  onNavigate: (page: ActivePage) => void;
  onOpenProfile: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, onOpenProfile }) => {
  const { user, profile, wallet } = useAuth();
  const [capCycles, setCapCycles] = useState<Array<{ id: string; package_name: string; package_type: string; amount: string | number; roi_daily_rate?: string | number; duration_days?: number; total_earned?: string | number; activated_at?: string | null; expires_at?: string | null; cap_multiple: number; cap_amount: string | number | null; credited_total: string | number; cap_reconciled: boolean; status: string; completed_at: string | null; principal_returned?: boolean; principal_return_amount?: string | number }>>([]);
  const [capLoading, setCapLoading] = useState(true);
  const [capError, setCapError] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [offerPoster, setOfferPoster] = useState<OfferPoster | null>(null);
  const [showOffer, setShowOffer] = useState(false);

  const referralCode = profile?.referralCode || '';
  const [capLastUpdated, setCapLastUpdated] = useState<Date | null>(null);
  const [capRefreshing, setCapRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    if (!user) {
      setCapCycles([]);
      setCapError('');
      setCapLoading(false);
      setCapLastUpdated(null);
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
        if (!response.ok) throw new Error(data.error || 'Unable to load investment cap status');
        if (!cancelled) {
          setCapCycles(Array.isArray(data.items) ? data.items : []);
          setCapError('');
          setCapLastUpdated(new Date());
        }
      } catch (error) {
        console.warn('Investment cap status unavailable:', error);
        if (!cancelled) setCapError(error instanceof Error ? error.message : 'Unable to load investment cap status.');
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

  const capSummary = capCycles.reduce((summary, cycle) => {
    const invested = Number(cycle.amount || 0);
    const cap = Number(cycle.cap_amount ?? invested * 5);
    summary.invested += invested;
    summary.totalCap += cap;
    if (cycle.cap_reconciled === true) {
      const counted = Math.min(cap, Math.max(0, Number(cycle.credited_total || 0)));
      summary.verifiedCounted += counted;
      summary.verifiedRemaining += Math.max(0, cap - counted);
      summary.verifiedCycles += 1;
    } else {
      summary.reviewCycles += 1;
    }
    return summary;
  }, { invested: 0, totalCap: 0, verifiedCounted: 0, verifiedRemaining: 0, verifiedCycles: 0, reviewCycles: 0 });

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
      if (!response.ok) throw new Error(data.error || 'Unable to load investment cap status');
      setCapCycles(Array.isArray(data.items) ? data.items : []);
      setCapError('');
      setCapLastUpdated(new Date());
    } catch (error) {
      setCapError(error instanceof Error ? error.message : 'Unable to load investment cap status.');
    } finally {
      setCapRefreshing(false);
    }
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

      {/* PRIMARY STATS ROW: Basic, FD & live investment cap */}
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

        {/* Primary, auto-refreshing cap summary */}
        <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-[#082b3a] via-[#091129] to-[#101744] border border-cyan-400/50 shadow-xl shadow-cyan-950/20 relative overflow-hidden">
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-cyan-400/10 blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-200">Live 5X Capping</span>
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-300"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> AUTO</span>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono tracking-tight tabular-nums">{formatUsdt(capSummary.totalCap)}</div>
          <div className="mt-1 text-xs text-cyan-100/80">Total 5X cap limit across all recorded plans</div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-cyan-300/15 pt-3">
            <div><div className="text-[10px] uppercase tracking-wider text-slate-400">Verified counted</div><div className="mt-1 text-sm font-bold text-white">{formatUsdt(capSummary.verifiedCounted)}</div></div>
            <div><div className="text-[10px] uppercase tracking-wider text-slate-400">Verified remaining</div><div className="mt-1 text-sm font-bold text-cyan-200">{formatUsdt(capSummary.verifiedRemaining)}</div></div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-400">{capSummary.reviewCycles ? `${capSummary.reviewCycles} plan(s) need admin review` : `${capSummary.verifiedCycles} verified plan(s)`}</span>
            <button onClick={refreshCapStatus} disabled={capRefreshing} className="inline-flex items-center gap-1 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-[10px] font-semibold text-cyan-200 disabled:opacity-50"><RefreshCw className={`h-3 w-3 ${capRefreshing ? 'animate-spin' : ''}`} /> Refresh</button>
          </div>
          <div className="mt-1 text-[10px] text-slate-500">{capLastUpdated ? `Updated ${capLastUpdated.toLocaleTimeString()}` : 'Waiting for first cap sync'} · refreshes every 15 sec</div>
        </div>
      </div>

      {/* 5X INVESTMENT CAP */}
      <section className="p-5 sm:p-6 rounded-2xl bg-[#091129]/90 border border-cyan-500/25 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-300">5X Investment Cap</h3>
            <p className="text-xs text-slate-400 mt-1">ROI, referral, level and bonus credits are counted toward each eligible investment cap. Principal return is subject to the same cap when processed through the capped income ledger.</p>
          </div>
          <span className="self-start rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-bold text-cyan-300">5X LIMIT</span>
        </div>
        {capLoading ? <p className="text-sm text-slate-400">Loading verified investment cap status…</p> : capError ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-3 text-sm text-rose-200">Investment cap data could not be loaded: {capError}. Please refresh or contact support if this continues.</div>
        ) : capCycles.length === 0 ? (
          <div className="rounded-xl border border-amber-500/25 bg-amber-950/10 p-3"><p className="text-sm text-amber-200">No investment cycles were returned by the cap API for this account.</p><p className="mt-1 text-xs text-slate-400">If an investment is visible in Package Activations but not here, its record may be in the legacy store and needs to be linked for cap tracking.</p></div>
        ) : <div className="space-y-3">
          {capCycles.map((cycle) => {
            const invested = Number(cycle.amount || 0);
            const cap = Number(cycle.cap_amount ?? invested * 5);
            const counted = Number(cycle.credited_total || 0);
            const remaining = Math.max(0, cap - counted);
            const progress = cap > 0 ? Math.min(100, Math.max(0, counted / cap * 100)) : 0;
            const completed = cycle.status === 'completed' || counted >= cap;
            const review = cycle.cap_reconciled !== true;
            const statusLabel = review ? 'Admin Review' : completed ? 'Completed' : cycle.status === 'active' ? 'Active' : cycle.status;
            const statusStyle = review ? 'text-amber-300 bg-amber-500/10 border-amber-500/25' : completed ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25' : 'text-cyan-300 bg-cyan-500/10 border-cyan-500/25';
            return <div key={cycle.id} className="rounded-xl border border-blue-500/20 bg-[#0e173a]/55 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-white">{cycle.package_name || (cycle.package_type === 'fd' ? 'FD Package' : 'Basic Package')}</div>
                  <div className="text-xs text-slate-400 mt-1">Investment: {formatUsdt(invested)} · Maximum 5X cap: {formatUsdt(cap)}</div>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusStyle}`}>{statusLabel}</span>
              </div>
              {review ? <p className="mt-3 text-xs leading-relaxed text-amber-200">Historical income needs admin reconciliation before this cycle can safely participate in cap-limited credits. Displayed progress is not yet verified.</p> : <>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div><div className="text-[10px] uppercase tracking-wider text-slate-500">Counted toward cap</div><div className="mt-1 text-sm font-bold text-white">{formatUsdt(counted)}</div></div>
                  <div><div className="text-[10px] uppercase tracking-wider text-slate-500">Cap remaining</div><div className="mt-1 text-sm font-bold text-cyan-300">{formatUsdt(remaining)}</div></div>
                  <div><div className="text-[10px] uppercase tracking-wider text-slate-500">Progress</div><div className="mt-1 text-sm font-bold text-white">{progress.toFixed(1)}%</div></div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all" style={{ width: `${progress}%` }} /></div>
                {cycle.principal_returned && <p className="mt-3 text-xs text-slate-300">Principal returned to Fund Wallet: <span className="font-semibold text-white">{formatUsdt(Number(cycle.principal_return_amount || 0))}</span></p>}
                {completed && <p className="mt-3 text-xs font-semibold text-emerald-300">This investment cycle is completed. A new cycle requires a new package activation.</p>}
              </>}
            </div>;
          })}
        </div>}
      </section>

      {/* USER PLAN HISTORY: keep completed and matured plans visible */}
      <section className="p-5 sm:p-6 rounded-2xl bg-[#091129]/90 border border-emerald-500/25 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-300">My Plan History</h3>
            <p className="text-xs text-slate-400 mt-1">Your active, completed and matured Basic/FD investments stay visible here.</p>
          </div>
          <span className="self-start rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300">{capCycles.length} PLAN{capCycles.length === 1 ? '' : 'S'}</span>
        </div>
        {capLoading ? <p className="text-sm text-slate-400">Loading plan history…</p> : capError ? (
          <p className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-3 text-sm text-rose-200">Plan history could not be loaded: {capError}</p>
        ) : capCycles.length === 0 ? (
          <p className="rounded-xl border border-blue-500/20 bg-[#0e173a]/55 p-3 text-sm text-slate-400">No package activations were found for this account yet.</p>
        ) : <div className="space-y-3">
          {capCycles.map((cycle) => {
            const invested = Number(cycle.amount || 0);
            const roiEarned = Number(cycle.total_earned || 0);
            const expiresAt = cycle.expires_at ? new Date(cycle.expires_at) : null;
            const isPastMaturity = Boolean(expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now());
            const isCompleted = cycle.status === 'completed' || cycle.status === 'matured';
            const isMaturedAwaitingSettlement = !isCompleted && isPastMaturity;
            const statusText = isCompleted ? 'Completed' : isMaturedAwaitingSettlement ? 'Matured · Settlement pending' : cycle.status === 'active' ? 'Active' : cycle.status;
            const statusColor = isCompleted ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25' : isMaturedAwaitingSettlement ? 'text-amber-200 bg-amber-500/10 border-amber-500/25' : 'text-cyan-300 bg-cyan-500/10 border-cyan-500/25';
            return <div key={cycle.id} className="rounded-xl border border-blue-500/20 bg-[#0e173a]/55 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-white">{cycle.package_name || (cycle.package_type === 'fd' ? 'FD Package' : 'Basic Package')}</div>
                  <div className="mt-1 text-xs text-slate-400">Investment: {formatUsdt(invested)} · ROI rate: {Number(cycle.roi_daily_rate || 0).toLocaleString('en-US')}% · Duration: {Number(cycle.duration_days || 0)} days</div>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusColor}`}>{statusText}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div><div className="text-[10px] uppercase tracking-wider text-slate-500">ROI credited</div><div className="mt-1 text-sm font-bold text-emerald-300">{formatUsdt(roiEarned)}</div></div>
                <div><div className="text-[10px] uppercase tracking-wider text-slate-500">Cap progress</div><div className="mt-1 text-sm font-bold text-white">{formatUsdt(Number(cycle.credited_total || 0))} / {formatUsdt(Number(cycle.cap_amount ?? invested * 5))}</div></div>
                <div><div className="text-[10px] uppercase tracking-wider text-slate-500">Activated</div><div className="mt-1 text-xs font-semibold text-slate-200">{cycle.activated_at ? new Date(cycle.activated_at).toLocaleDateString() : '—'}</div></div>
                <div><div className="text-[10px] uppercase tracking-wider text-slate-500">Maturity date</div><div className="mt-1 text-xs font-semibold text-slate-200">{cycle.expires_at ? new Date(cycle.expires_at).toLocaleDateString() : '—'}</div></div>
              </div>
              {cycle.principal_returned && <p className="mt-3 text-xs text-slate-300">Principal returned: <span className="font-semibold text-white">{formatUsdt(Number(cycle.principal_return_amount || 0))}</span></p>}
              {isMaturedAwaitingSettlement && <p className="mt-2 text-xs text-amber-200">The scheduled maturity date has passed, but the backend has not marked this plan completed yet. Please do not treat the principal as paid until it appears in your wallet ledger.</p>}
            </div>;
          })}
        </div>}
      </section>

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
              <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-indigo-300 font-mono tracking-tight tabular-nums">
              {formatUsdt(wallet?.totalIncome)}
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

          {/* Signup maturity points remain separate from cash balances. */}
          <div className="p-5 rounded-xl bg-[#091129]/90 border border-violet-500/25 shadow-lg backdrop-blur-md">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400">Maturity Points</span>
              <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-300">
                <Award className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-violet-200 font-mono tracking-tight tabular-nums">
              {Number(wallet?.lockedMaturityPoints || 0) + Number(wallet?.releasedMaturityPoints || 0)}
            </div>
            <div className="mt-3 text-[11px] text-slate-400">
              {wallet?.maturityPointsStatus === 'released'
                ? '150 points released after all packages matured'
                : wallet?.maturityPointsStatus === 'locked'
                  ? `${Number(wallet?.lockedMaturityPoints || 0)} points locked until all packages mature`
                  : 'Signup points status'}
            </div>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Direct Team */}
          <div className="p-5 rounded-xl bg-[#091129]/90 border border-blue-500/25 shadow-lg backdrop-blur-md flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400">Direct Team</span>
              <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono mt-1 tabular-nums">
                {wallet?.directTeamCount ?? 0}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Directly sponsored affiliates</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Users className="w-6 h-6" />
            </div>
          </div>

          {/* Total Team */}
          <div className="p-5 rounded-xl bg-[#091129]/90 border border-blue-500/25 shadow-lg backdrop-blur-md flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400">Total Team</span>
              <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono mt-1 tabular-nums">
                {wallet?.totalTeamCount ?? 0}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Full downline multi-generation network</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Users className="w-6 h-6" />
            </div>
          </div>
        </div>
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
                {formatUsdt(wallet?.referralIncome)}
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
                {formatUsdt(wallet?.totalLevelIncome)}
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
                {formatUsdt(wallet?.fdReferralIncome)}
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
