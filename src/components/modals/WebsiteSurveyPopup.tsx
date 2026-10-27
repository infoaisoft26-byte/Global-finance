import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Heart, Sparkles, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

type Answers = { overall: string; navigation: string; dashboard: string; transactions: string; feature: string; recommend: string; suggestion: string };
const initial: Answers = { overall: '', navigation: '', dashboard: '', transactions: '', feature: '', recommend: '', suggestion: '' };
const steps = [
  { title: 'Your experience', subtitle: 'How is Global Finance working for you?' },
  { title: 'Website usability', subtitle: 'Help us make the member area easier.' },
  { title: 'Your favourite feature', subtitle: 'Tell us what matters most to you.' },
  { title: 'Final thoughts', subtitle: 'One last thing before you finish.' },
];
const choices: Record<string, string[]> = {
  overall: ['Excellent', 'Good', 'Average', 'Needs improvement'],
  navigation: ['Very easy', 'Easy', 'Okay', 'Difficult'],
  dashboard: ['Very clear', 'Mostly clear', 'A little confusing', 'Difficult to use'],
  transactions: ['Very smooth', 'Mostly smooth', 'Could be better', 'Not used yet'],
  feature: ['Dashboard & wallets', 'Team / referrals', 'Income reports', 'Deposits & withdrawals', 'Package details'],
  recommend: ['Definitely', 'Probably', 'Not sure', 'Probably not'],
};
export const WebsiteSurveyPopup: React.FC = () => {
  const { user, profile, isAdmin } = useAuth();
  const [visible, setVisible] = useState(false);
  const [checked, setChecked] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const progress = useMemo(() => ((step + 1) / steps.length) * 100, [step]);

  useEffect(() => {
    if (!user || isAdmin) { setVisible(false); return; }
    let cancelled = false;
    const check = async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/website-survey', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not check survey status');
        if (cancelled) return;
        setSubmitted(Boolean(data.submitted));
        if (!data.submitted) window.setTimeout(() => { if (!cancelled) setVisible(true); }, 2200);
      } catch (e) {
        console.warn('Survey status check failed; survey will stay hidden until the server can be reached.', e);
      } finally { if (!cancelled) setChecked(true); }
    };
    void check();
    return () => { cancelled = true; };
  }, [user, isAdmin]);

  const close = () => setVisible(false);
  const choose = (key: keyof Answers, value: string) => setAnswers(previous => ({ ...previous, [key]: value }));
  const next = () => {
    const required: (keyof Answers)[] = step === 0 ? ['overall'] : step === 1 ? ['navigation', 'dashboard', 'transactions'] : step === 2 ? ['feature'] : ['recommend'];
    if (required.some(key => !answers[key].trim())) { setError('Please choose an answer to continue.'); return; }
    setError('');
    if (step < steps.length - 1) setStep(step + 1);
    else void submit();
  };
  const submit = async () => {
    if (!user) return;
    setBusy(true); setError('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/website-survey', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ answers }) });
      const data = await response.json();
      if (!response.ok && response.status !== 409) throw new Error(data.error || 'Survey could not be saved. Please try again.');
      setSubmitted(true); setSuccess(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); }
    finally { setBusy(false); }
  };

  if (!visible || submitted && !success || !user || isAdmin || !checked) return null;
  return (
    <div className="gf-survey-backdrop fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto p-3 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="gf-survey-title">
      <style>{`
        .gf-survey-backdrop{background:radial-gradient(ellipse at top,rgba(245,158,11,.20),transparent 48%),rgba(2,6,23,.82);backdrop-filter:blur(12px);animation:gfSurveyFade .35s ease-out}
        .gf-survey-card{animation:gfSurveyRise .5s cubic-bezier(.2,.8,.2,1);box-shadow:0 30px 100px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.04)}
        .gf-survey-choice{transition:transform .18s ease,border-color .18s ease,background .18s ease}
        .gf-survey-choice:hover{transform:translateY(-2px)}
        @keyframes gfSurveyFade{from{opacity:0}to{opacity:1}} @keyframes gfSurveyRise{from{opacity:0;transform:translateY(22px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
        @media(prefers-reduced-motion:reduce){.gf-survey-backdrop,.gf-survey-card{animation:none}.gf-survey-choice{transition:none}}
      `}</style>
      <div className="gf-survey-card relative my-auto w-full max-w-xl overflow-hidden rounded-[28px] border border-amber-300/30 bg-white text-slate-900">
        {success ? (
          <div className="px-6 py-14 text-center sm:px-10">
            <motion.div initial={{ scale: .4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 220 }} className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 size={44}/></motion.div>
            <p className="text-xs font-extrabold uppercase tracking-[.24em] text-amber-600">Survey completed</p>
            <h2 className="mt-2 text-3xl font-black">Thank you, {profile?.name?.split(' ')[0] || 'Member'}!</h2>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-500">Your feedback has been saved. This survey will not appear again on your account.</p>
            <p className="mt-7 text-xs font-bold tracking-wide text-slate-500">Developed by <span className="text-amber-700">AI SOFT STUDIO</span></p>
            <button onClick={() => { setSuccess(false); setVisible(false); }} className="mt-6 rounded-xl bg-slate-950 px-6 py-3 text-sm font-bold text-white">Done</button>
          </div>
        ) : <>
          <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950 px-5 pb-6 pt-6 text-white sm:px-8 sm:pt-8">
            <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full border border-amber-300/20" />
            <div className="pointer-events-none absolute -right-4 -top-8 h-28 w-28 rounded-full border border-amber-300/20" />
            <button onClick={close} aria-label="Close survey" className="absolute right-4 top-4 z-10 rounded-full p-2 text-white/70 transition hover:bg-white/10 hover:text-white"><X size={18}/></button>
            <div className="relative flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-300/10 text-amber-300"><ClipboardList size={24}/></div>
              <div><p className="text-[10px] font-extrabold uppercase tracking-[.24em] text-amber-300">Member survey · 1 time only</p><h2 id="gf-survey-title" className="mt-1 text-2xl font-black sm:text-3xl">Help us improve</h2></div>
            </div>
            <p className="relative mt-4 max-w-md text-sm leading-6 text-slate-300">A few quick questions about your Global Finance website experience.</p>
            <div className="relative mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold">{profile?.name || user.displayName || 'Member'}</span>
              <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 font-mono text-xs font-bold text-amber-200">{profile?.referralCode || 'GF ID unavailable'}</span>
            </div>
            <div className="relative mt-6 flex items-center justify-between text-[11px] font-bold text-slate-300"><span>STEP {step + 1} OF {steps.length}</span><span>{Math.round(progress)}%</span></div>
            <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-white/15"><motion.div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-yellow-100" animate={{ width: progress + '%' }} transition={{ duration: .35 }}/></div>
          </div>
          <div className="px-5 py-6 sm:px-8 sm:py-7">
            <AnimatePresence mode="wait">
              <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: .2 }}>
                <h3 className="text-xl font-extrabold">{steps[step].title}</h3><p className="mt-1 text-sm text-slate-500">{steps[step].subtitle}</p>
                {step === 0 && <Question title="Overall, how would you rate the website?" name="overall" value={answers.overall} onChange={choose}/>}
                {step === 1 && <div className="mt-5 space-y-5"><Question title="How easy is it to find the pages you need?" name="navigation" value={answers.navigation} onChange={choose}/><Question title="How clear is your dashboard and wallet information?" name="dashboard" value={answers.dashboard} onChange={choose}/><Question title="How has your deposit/withdrawal experience been?" name="transactions" value={answers.transactions} onChange={choose}/></div>}
                {step === 2 && <Question title="Which website feature do you use or value most?" name="feature" value={answers.feature} onChange={choose}/>}
                {step === 3 && <div className="mt-5 space-y-5"><Question title="Would you recommend the website experience to others?" name="recommend" value={answers.recommend} onChange={choose}/><label className="block text-sm font-bold">What should we improve? <span className="font-normal text-slate-400">(optional)</span><textarea value={answers.suggestion} onChange={e=>choose('suggestion',e.target.value)} maxLength={1500} rows={3} placeholder="Share any suggestions..." className="mt-2 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-normal outline-none transition focus:border-amber-400 focus:bg-white focus:ring-4 focus:ring-amber-100"/></label></div>}
              </motion.div>
            </AnimatePresence>
            {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <div className="mt-7 flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
              <button onClick={() => { setError(''); if (step > 0) setStep(step - 1); else close(); }} className="flex items-center gap-1 rounded-xl px-3 py-3 text-sm font-bold text-slate-500 transition hover:bg-slate-100">{step === 0 ? <X size={16}/> : <ChevronLeft size={16}/>} {step === 0 ? 'Later' : 'Back'}</button>
              <button disabled={busy} onClick={next} className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 px-5 py-3 text-sm font-extrabold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:-translate-y-0.5 disabled:opacity-60">{busy ? 'Saving…' : step === steps.length - 1 ? 'Submit survey' : 'Continue'} {!busy && (step === steps.length - 1 ? <Heart size={16}/> : <ChevronRight size={16}/>)}</button>
            </div>
            <p className="mt-5 text-center text-[11px] text-slate-400">Your response is linked to your member account · Developed by <span className="font-bold text-slate-600">AI SOFT STUDIO</span></p>
          </div>
        </>}
      </div>
    </div>
  );
};

function Question({ title, name, value, onChange }: { title: string; name: keyof Answers; value: string; onChange: (name: keyof Answers, value: string) => void }) {
  const options = choices[name] || [];
  return <fieldset className="mt-5"><legend className="text-sm font-bold leading-6">{title}</legend><div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">{options.map((option, i) => <button key={option} type="button" onClick={() => onChange(name, option)} className={'gf-survey-choice flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left text-sm font-semibold ' + (value === option ? 'border-amber-400 bg-amber-50 text-amber-900 ring-2 ring-amber-100' : 'border-slate-200 bg-white text-slate-600 hover:border-amber-200')}><span className={'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black ' + (value === option ? 'bg-amber-400 text-slate-950' : 'bg-slate-100 text-slate-500')}>{String.fromCharCode(65 + i)}</span><span>{option}</span>{value === option && <CheckCircle2 size={16} className="ml-auto text-amber-600"/>}</button>)}</div></fieldset>;
}
