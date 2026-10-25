import React, { useEffect, useState } from 'react';
import { X, Star, Sparkles, CheckCircle2, MessageSquareText } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

const STORAGE_KEY = 'gf_feedback_prompt_v1';
const MAX_PROMPTS_PER_DAY = 5;
type FeedbackState = { day: string; count: number; lastAt: number; dismissedAt?: number };
const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
function getPromptState(): FeedbackState {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed.day === todayKey() ? parsed : { day: todayKey(), count: 0, lastAt: 0 };
  } catch { return { day: todayKey(), count: 0, lastAt: 0 }; }
}
export const WebsiteFeedbackPopup: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const [visible, setVisible] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [websiteExperience, setWebsiteExperience] = useState('good');
  const [transactionExperience, setTransactionExperience] = useState('not_used');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!user || isAdmin) { setVisible(false); return; }
    let cancelled = false;
    const check = async () => {
      try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/website-feedback', { headers: { Authorization: 'Bearer ' + idToken }, cache: 'no-store' });
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok) throw new Error(data.error || 'Could not check feedback status.');
        if (data.submitted) {
          setSubmitted(true);
          localStorage.setItem('gf_feedback_submitted_' + user.uid, '1');
          setChecked(true);
          return;
        }
        if (localStorage.getItem('gf_feedback_submitted_' + user.uid) === '1') {
          // Server is authoritative; don't permanently hide if the server has no record.
          localStorage.removeItem('gf_feedback_submitted_' + user.uid);
        }
        setChecked(true);
      } catch { if (!cancelled) setChecked(true); }
    };
    check();
    return () => { cancelled = true; };
  }, [user, isAdmin]);

  useEffect(() => {
    if (!user || isAdmin || !checked || submitted) return;
    const state = getPromptState();
    if (state.count >= MAX_PROMPTS_PER_DAY) return;
    const lastPrompt = Number(state.lastAt || 0);
    const delay = lastPrompt ? Math.max(0, 4 * 60 * 60 * 1000 - (Date.now() - lastPrompt)) : 18_000;
    const timer = window.setTimeout(() => {
      const latest = getPromptState();
      if (latest.count >= MAX_PROMPTS_PER_DAY) return;
      latest.count += 1;
      latest.lastAt = Date.now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(latest));
      setVisible(true);
    }, Math.min(delay, 24 * 60 * 60 * 1000));
    return () => window.clearTimeout(timer);
  }, [user, isAdmin, checked, submitted]);

  const close = () => {
    setVisible(false);
    const state = getPromptState();
    state.dismissedAt = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || rating < 1) { setError('Please select your star rating first.'); return; }
    setBusy(true); setError('');
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/website-feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
        body: JSON.stringify({ rating, websiteExperience, transactionExperience, comment })
      });
      const data = await response.json();
      if (!response.ok && response.status !== 409) throw new Error(data.error || 'Feedback could not be saved.');
      setSubmitted(true);
      localStorage.setItem('gf_feedback_submitted_' + user.uid, '1');
      setVisible(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally { setBusy(false); }
  };

  if (!visible || submitted || !user || isAdmin) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-3 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="gf-feedback-title">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-amber-300/40 bg-white text-slate-800 shadow-[0_25px_100px_rgba(0,0,0,.45)]">
        <div className="relative bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950 px-6 pb-7 pt-7 text-center text-white">
          <button onClick={close} aria-label="Close feedback popup" className="absolute right-4 top-4 rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white"><X size={18}/></button>
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/40 bg-amber-300/10 text-amber-300"><Sparkles size={24}/></div>
          <p className="text-[10px] font-bold uppercase tracking-[.28em] text-amber-300">Your voice matters</p>
          <h2 id="gf-feedback-title" className="mt-2 text-2xl font-extrabold">Rate Global Finance</h2>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-5 text-slate-300">A quick review helps us improve your website experience.</p>
        </div>
        <form onSubmit={submit} className="space-y-5 px-5 py-5 sm:px-7">
          <div className="text-center">
            <p className="text-sm font-bold">How would you rate your experience?</p>
            <div className="mt-3 flex justify-center gap-2" onMouseLeave={() => setHover(0)}>
              {[1,2,3,4,5].map(n => <button type="button" key={n} aria-label={n + ' stars'} onMouseEnter={() => setHover(n)} onFocus={() => setHover(n)} onClick={() => setRating(n)} className="rounded-lg p-1 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-amber-400"><Star size={31} className={(hover || rating) >= n ? 'fill-amber-400 text-amber-500' : 'text-slate-300'}/></button>)}
            </div>
            <p className="mt-1 text-xs font-semibold text-amber-700">{(hover || rating) ? ['','Poor','Fair','Good','Very good','Excellent!'][(hover || rating)] : 'Tap a star to rate'}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600">Website experience
              <select value={websiteExperience} onChange={e=>setWebsiteExperience(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-amber-400">
                <option value="excellent">Excellent</option><option value="good">Good</option><option value="average">Average</option><option value="poor">Needs improvement</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">Deposit/withdrawal experience
              <select value={transactionExperience} onChange={e=>setTransactionExperience(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-amber-400">
                <option value="not_used">Not used yet</option><option value="excellent">Excellent</option><option value="good">Good</option><option value="average">Average</option><option value="poor">Needs improvement</option>
              </select>
            </label>
          </div>
          <label className="block text-xs font-semibold text-slate-600">Suggestions (optional)
            <textarea value={comment} onChange={e=>setComment(e.target.value)} maxLength={1200} rows={3} placeholder="Tell us what we can improve..." className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-amber-400"/>
          </label>
          {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
          <button disabled={busy || rating < 1} type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 px-4 py-3 text-sm font-extrabold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50">
            <MessageSquareText size={17}/>{busy ? 'Submitting...' : 'Submit feedback'}
          </button>
          <div className="text-center">
            <p className="text-[10px] text-slate-400">Your feedback is linked to your account to prevent duplicate reviews.</p>
            <p className="mt-2 text-[11px] font-semibold text-slate-500">Developer by <span className="font-extrabold text-amber-700">Ai Soft Studio</span></p>
            <button type="button" onClick={close} className="mt-2 text-xs font-semibold text-slate-500 underline underline-offset-4 hover:text-slate-800">Maybe later</button>
          </div>
        </form>
      </div>
    </div>
  );
};
