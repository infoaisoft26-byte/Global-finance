import React, { useEffect, useState } from 'react';
import { Megaphone, Save, Eye, EyeOff, RefreshCw, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react';
import { disableOfferPoster, getActiveOfferPoster, saveOfferPoster, type OfferPoster } from '../../../services/offerPosterService.ts';

export const AdminOfferPoster: React.FC = () => {
  const [poster, setPoster] = useState<OfferPoster | null>(null);
  const [title, setTitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [description, setDescription] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const current = await getActiveOfferPoster();
      setPoster(current);
      if (current) {
        setTitle(current.title); setImageUrl(current.imageUrl); setDescription(current.description);
        setCtaLabel(current.ctaLabel); setCtaUrl(current.ctaUrl);
        setStartAt(current.startAt ? current.startAt.slice(0,16) : '');
        setEndAt(current.endAt ? current.endAt.slice(0,16) : '');
        setActive(current.active);
      } else {
        setTitle(''); setImageUrl(''); setDescription(''); setCtaLabel(''); setCtaUrl(''); setStartAt(''); setEndAt(''); setActive(true);
      }
    } catch (e: any) { setError(e?.message || 'Unable to load poster.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setMessage(''); setError('');
    try {
      const saved = await saveOfferPoster({
        id: poster?.id || '',
        title, imageUrl, description, ctaLabel, ctaUrl,
        startAt: startAt ? new Date(startAt).toISOString() : '',
        endAt: endAt ? new Date(endAt).toISOString() : '',
        active,
      });
      setPoster(saved); setMessage(active ? 'Offer poster published. Logged-in users can now see it.' : 'Poster saved but kept hidden.');
    } catch (e: any) { setError(e?.message || 'Unable to save poster.'); }
    finally { setSaving(false); }
  };

  const hide = async () => {
    if (!poster) return;
    setSaving(true); setError(''); setMessage('');
    try {
      await disableOfferPoster(poster.id);
      setActive(false); setPoster({ ...poster, active: false });
      setMessage('Offer poster is now hidden from all members.');
    } catch (e: any) { setError(e?.message || 'Unable to hide poster.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-500/20 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-rose-600 to-orange-500 flex items-center justify-center"><Megaphone className="w-5 h-5 text-white" /></div>
          <div><h2 className="text-xl font-bold text-white">Offer Poster Manager</h2><p className="text-xs text-slate-400">Only an active poster published by an administrator is shown after member login.</p></div>
        </div>
        <button onClick={() => void load()} disabled={loading || saving} className="p-2.5 rounded-xl bg-[#0e173a] border border-blue-500/30 text-cyan-300 disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>

      {message && <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{message}</div>}
      {error && <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{error}</div>}

      <form onSubmit={save} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="p-5 rounded-2xl bg-[#091129] border border-blue-500/25 space-y-4">
          <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-cyan-300">Poster Content</h3><label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Publish now</label></div>
          <label className="block text-xs text-slate-300">Offer title<input value={title} onChange={e => setTitle(e.target.value)} required maxLength={160} className="mt-1 w-full px-3 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/25 text-white" placeholder="e.g. New Member Offer" /></label>
          <label className="block text-xs text-slate-300">Poster image URL<input value={imageUrl} onChange={e => setImageUrl(e.target.value)} required className="mt-1 w-full px-3 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/25 text-white" placeholder="https://..." /></label>
          <label className="block text-xs text-slate-300">Description<textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} maxLength={1000} className="mt-1 w-full px-3 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/25 text-white" placeholder="Short offer details..." /></label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs text-slate-300">Button text<input value={ctaLabel} onChange={e => setCtaLabel(e.target.value)} maxLength={80} className="mt-1 w-full px-3 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/25 text-white" placeholder="View Offer" /></label>
            <label className="block text-xs text-slate-300">Button link<input value={ctaUrl} onChange={e => setCtaUrl(e.target.value)} maxLength={2000} className="mt-1 w-full px-3 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/25 text-white" placeholder="/basic-package or https://..." /></label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs text-slate-300">Start (optional)<input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} className="mt-1 w-full px-3 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/25 text-white" /></label>
            <label className="block text-xs text-slate-300">End (optional)<input type="datetime-local" value={endAt} onChange={e => setEndAt(e.target.value)} className="mt-1 w-full px-3 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/25 text-white" /></label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-rose-600 to-orange-500 text-white font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50"><Save className="w-4 h-4" />{saving ? 'Saving…' : active ? 'Publish Offer Poster' : 'Save Hidden'}</button>
            {poster && poster.active && <button type="button" onClick={() => void hide()} disabled={saving} className="px-4 py-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 font-bold text-xs flex items-center gap-2"><EyeOff className="w-4 h-4" />Hide</button>}
          </div>
        </section>

        <section className="p-5 rounded-2xl bg-[#091129] border border-cyan-500/20 space-y-4">
          <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-cyan-300">Live Preview</h3>{poster?.active && <span className="text-[10px] text-emerald-300 flex items-center gap-1"><Eye className="w-3.5 h-3.5" />LIVE</span>}</div>
          {imageUrl ? <div className="rounded-2xl overflow-hidden border border-blue-500/20 bg-black/20"><img src={imageUrl} alt="Offer poster preview" className="w-full max-h-[520px] object-contain" onError={e => { e.currentTarget.style.display = 'none'; }} /></div> : <div className="aspect-[4/5] rounded-2xl border border-dashed border-blue-500/20 flex items-center justify-center text-xs text-slate-500">Poster preview will appear here</div>}
          {description && <p className="text-xs text-slate-300 leading-relaxed">{description}</p>}
          {ctaLabel && <div className="inline-flex items-center gap-2 text-xs text-cyan-300"><ExternalLink className="w-3.5 h-3.5" />{ctaLabel}</div>}
        </section>
      </form>
    </div>
  );
};
