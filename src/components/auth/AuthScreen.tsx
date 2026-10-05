import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Mail,
  Key,
  User,
  Users,
  Smartphone,
  ArrowRight,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { FinanceAnimatedBackground } from './FinanceAnimatedBackground.tsx';

export const AuthScreen: React.FC = () => {
  const {
    loginWithGoogle,
    loginWithEmail,
    registerWithEmail,
    sponsorReferralParam
  } = useAuth();

  const isReferralRoute = typeof window !== 'undefined' && window.location.pathname === '/register';
  const [mode, setMode] = useState<'signin' | 'register'>(isReferralRoute ? 'register' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [secondPhone, setSecondPhone] = useState('');
  const [sponsorCode, setSponsorCode] = useState(sponsorReferralParam || '');
  const [sponsorName, setSponsorName] = useState('');
  const [sponsorLookupLoading, setSponsorLookupLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (sponsorReferralParam) {
      setSponsorCode(sponsorReferralParam);
      setMode('register');
    }
  }, [sponsorReferralParam]);

  useEffect(() => {
    const code = sponsorCode.trim().toUpperCase();
    setSponsorName('');
    if (!/^GF\d{6}$/.test(code)) {
      setSponsorLookupLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setSponsorLookupLoading(true);
        try {
          const response = await fetch(`/api/referral-lookup?code=${encodeURIComponent(code)}`, { cache: 'no-store' });
          const data = await response.json().catch(() => ({}));
          if (!cancelled && response.ok && data?.valid && data?.sponsor?.name) {
            setSponsorName(String(data.sponsor.name));
          }
        } catch (error) {
          if (!cancelled) console.warn('Sponsor lookup unavailable:', error);
        } finally {
          if (!cancelled) setSponsorLookupLoading(false);
        }
      })();
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [sponsorCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);
    try {
      if (mode === 'signin') await loginWithEmail(email.trim(), password);
      else {
        if (!name.trim()) throw new Error('Please enter your full name');
        await registerWithEmail(name.trim(), email.trim(), password, sponsorCode.trim(), phone.trim(), secondPhone.trim());
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed. Please verify credentials.');
    } finally { setLoading(false); }
  };

  const handleGoogle = async () => {
    setErrorMsg('');
    try { await loginWithGoogle(); }
    catch (err: any) { setErrorMsg(err.message || 'Google Sign-In failed'); }
  };

  return (
    <div className="min-h-screen bg-[#020817] flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden isolate">
      <FinanceAnimatedBackground />
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-[#020817]/10 via-transparent to-[#020817]/55" />

      <div className="text-center mb-5 sm:mb-6 z-10 relative select-none">
        <img
          src="/global-finance-logo.webp"
          alt="Global Finance"
          className="w-[170px] sm:w-[210px] h-auto mx-auto drop-shadow-[0_0_24px_rgba(0,217,255,.24)]"
          decoding="async"
        />
        <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-[0.08em] text-white drop-shadow-[0_2px_16px_rgba(0,217,255,.24)]">
          GLOBAL FINANCE
        </h1>
        <p className="mt-1 text-xs sm:text-sm font-medium tracking-wide text-cyan-200">
          Secure • Transparent • Digital Finance Platform
        </p>
      </div>

      <div className="w-full max-w-md relative z-10 rounded-[24px] border border-cyan-400/25 bg-[#071126]/78 p-6 sm:p-8 shadow-[0_28px_90px_rgba(0,0,0,.55),0_0_45px_rgba(20,120,255,.12)] backdrop-blur-2xl ring-1 ring-white/[0.04] before:absolute before:inset-px before:rounded-[23px] before:pointer-events-none before:bg-gradient-to-br before:from-white/[0.035] before:via-transparent before:to-cyan-400/[0.025]">
        <div className="relative z-[1]">
          <div className="grid grid-cols-2 p-1 bg-[#030817]/85 rounded-xl border border-blue-500/20 mb-6 shadow-inner shadow-black/20">
            <button type="button" onClick={() => { setMode('signin'); setErrorMsg(''); }} className={`py-2 text-xs font-bold rounded-lg transition-all ${mode === 'signin' ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md shadow-cyan-950/40' : 'text-slate-400 hover:text-white'}`}>Member Sign In</button>
            <button type="button" onClick={() => { setMode('register'); setErrorMsg(''); }} className={`py-2 text-xs font-bold rounded-lg transition-all ${mode === 'register' ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md shadow-cyan-950/40' : 'text-slate-400 hover:text-white'}`}>New Account</button>
          </div>

          {sponsorReferralParam && mode === 'register' && (
            <div className="mb-4 p-3 rounded-xl bg-cyan-500/10 border border-cyan-400/30 text-cyan-200 text-xs">
              Referral link detected. Sponsor Member ID <span className="font-mono font-bold text-white">{sponsorReferralParam}</span> will be attached to this new account.
            </div>
          )}

          {errorMsg && <div className="mb-4 p-3 rounded-xl bg-rose-950/45 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2 shadow-lg shadow-rose-950/15"><AlertCircle className="w-4 h-4 shrink-0" /><span>{errorMsg}</span></div>}

          <button type="button" onClick={handleGoogle} className="w-full py-2.5 rounded-xl bg-[#0d1938]/90 hover:bg-[#142654] border border-blue-400/25 text-white font-medium text-xs flex items-center justify-center gap-2.5 transition-all shadow-sm mb-4">
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 0 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
            <span>Continue with Google</span>
          </button>

          <div className="relative flex items-center justify-center my-4"><div className="border-t border-blue-400/15 w-full"/><span className="bg-[#08132a]/75 px-3 text-[10px] text-slate-500 uppercase tracking-widest font-mono whitespace-nowrap">Or with email</span><div className="border-t border-blue-400/15 w-full"/></div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && <>
              <div><label className="block text-xs font-semibold text-slate-300 mb-1">Full Name</label><div className="relative"><User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"/><input type="text" placeholder="Enter your name" value={name} onChange={(e)=>setName(e.target.value)} required className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#081632]/90 border border-blue-400/25 text-white text-xs focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/10 transition-shadow"/></div></div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Sponsor Member ID</label>
                <div className="relative"><Users className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"/><input type="text" placeholder="GF123456" value={sponsorCode} readOnly={Boolean(sponsorReferralParam)} onChange={(e)=>setSponsorCode(e.target.value.toUpperCase())} className={`w-full pl-9 pr-3.5 py-2.5 rounded-xl border text-cyan-300 font-mono text-xs uppercase transition-shadow ${sponsorReferralParam ? 'bg-cyan-950/30 border-cyan-400/40 cursor-not-allowed' : 'bg-[#081632]/90 border-blue-400/25 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/10'}`}/></div>
                {sponsorReferralParam && <p className="mt-1 text-[10px] text-cyan-300">Referral sponsor locked from the referral link.</p>}
                {/^GF\d{6}$/.test(sponsorCode.trim().toUpperCase()) && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg bg-cyan-500/10 border border-cyan-400/20 px-3 py-2 text-[10px]">
                    <Users className="w-3.5 h-3.5 text-cyan-400 shrink-0"/>
                    <span className="text-slate-400">Referred by:</span>
                    {sponsorLookupLoading ? <span className="text-cyan-300">Checking sponsor...</span> : sponsorName ? <span className="font-semibold text-white">{sponsorName}</span> : <span className="text-amber-300">Active sponsor not found</span>}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Primary Mobile Number</label>
                <div className="relative"><Smartphone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"/><input type="tel" inputMode="tel" placeholder="+91XXXXXXXXXX" value={phone} onChange={(e)=>setPhone(e.target.value)} className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#081632]/90 border border-blue-400/25 text-white text-xs font-mono focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/10"/></div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Second Mobile Number <span className="text-slate-500 font-normal">(Optional)</span></label>
                <div className="relative"><Smartphone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"/><input type="tel" inputMode="tel" placeholder="+91XXXXXXXXXX" value={secondPhone} onChange={(e)=>setSecondPhone(e.target.value)} className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#081632]/90 border border-blue-400/25 text-white text-xs font-mono focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/10"/></div>
              </div>
            </>}
            <div><label className="block text-xs font-semibold text-slate-300 mb-1">Email Address</label><div className="relative"><Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"/><input type="email" placeholder="name@example.com" value={email} onChange={(e)=>setEmail(e.target.value)} required className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#081632]/90 border border-blue-400/25 text-white text-xs focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/10 transition-shadow"/></div></div>
            <div><label className="block text-xs font-semibold text-slate-300 mb-1">Password</label><div className="relative"><Key className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"/><input type="password" placeholder="••••••••" value={password} onChange={(e)=>setPassword(e.target.value)} required minLength={6} className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#081632]/90 border border-blue-400/25 text-white text-xs focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/10 transition-shadow"/></div></div>
            <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-600 hover:from-blue-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-cyan-950/45 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">{loading ? <><RefreshCw className="w-4 h-4 animate-spin"/><span>Authenticating with Global Finance Ledger...</span></> : <><span>{mode === 'signin' ? 'Sign In to Dashboard' : 'Create Global Finance Account'}</span><ArrowRight className="w-4 h-4"/></>}</button>
          </form>

          <div className="mt-6 pt-4 border-t border-blue-400/15 flex flex-wrap items-center justify-center gap-2.5 text-[11px] text-slate-400"><div className="flex items-center gap-1"><Lock className="w-3.5 h-3.5 text-emerald-400"/><span>256-bit Encrypted</span></div><span className="text-slate-600">•</span><div className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-cyan-400"/><span>Secure Ledger Controls</span></div></div>
        </div>
      </div>

      <div className="mt-6 text-[11px] text-slate-500 text-center z-10 relative">© 2026 Global Finance. All Rights Reserved.</div>
    </div>
  );
};
