import React, { useEffect, useState } from 'react';
import { getActiveOfferPoster, type OfferPoster } from '../../services/offerPosterService.ts';

export const OfferPosterPopup: React.FC = () => {
  const [poster, setPoster] = useState<OfferPoster | null>(null);
  const [failed, setFailed] = useState(false);
  const [phase, setPhase] = useState<'poster' | 'video'>('poster');
  const [muted, setMuted] = useState(true);
  const [shown] = useState(() => typeof window !== 'undefined' && window.sessionStorage.getItem('gf-offer-sequence-shown') === '1');

  useEffect(() => {
    if (shown) return;
    let alive = true;
    getActiveOfferPoster().then(value => {
      if (alive && value) {
        setPoster(value);
        window.sessionStorage.setItem('gf-offer-sequence-shown', '1');
      }
    }).catch(error => console.warn('Offer promotion unavailable:', error));
    return () => { alive = false; };
  }, [shown]);

  useEffect(() => {
    if (!poster || phase !== 'poster' || !poster.videoUrl) return;
    const timer = window.setTimeout(() => setPhase('video'), (poster.posterSeconds || 5) * 1000);
    return () => window.clearTimeout(timer);
  }, [poster, phase]);

  if (!poster || failed || shown) return null;
  const close = () => setPoster(null);
  const openCta = () => {
    if (!poster.ctaUrl) return;
    if (/^https?:\/\//i.test(poster.ctaUrl)) window.open(poster.ctaUrl, '_blank', 'noopener,noreferrer');
    else window.location.assign(poster.ctaUrl);
  };
  return (
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={poster.title}>
      <div className="relative w-full max-w-xl max-h-[94vh] overflow-y-auto rounded-2xl bg-[#080d1d] border border-cyan-400/30 shadow-2xl">
        <button onClick={close} aria-label="Close promotion" className="absolute right-3 top-3 z-20 w-9 h-9 rounded-full bg-black/75 border border-white/30 text-white text-2xl leading-none">×</button>
        {phase === 'poster' || !poster.videoUrl ? <>
          <img src={poster.imageUrl} alt={poster.title} className="block w-full max-h-[78vh] object-contain bg-black" onError={() => setFailed(true)} />
          {(poster.description || poster.ctaLabel) && <div className="p-4 space-y-3">
            {poster.description && <p className="text-sm text-slate-200 whitespace-pre-wrap">{poster.description}</p>}
            {poster.ctaLabel && poster.ctaUrl && <button onClick={openCta} className="w-full rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-3 text-sm font-bold text-white">{poster.ctaLabel}</button>}
          </div>}
        </> : <div className="bg-black">
          <video key={poster.videoUrl} src={poster.videoUrl} autoPlay muted={muted} playsInline controls onEnded={close} className="block w-full max-h-[78vh]" />
          <div className="flex items-center justify-between px-4 py-3 text-xs text-slate-300">
            <span>Offer video</span>
            <button type="button" onClick={() => setMuted(value => !value)} aria-label={muted ? 'Unmute video' : 'Mute video'} className="rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-white font-semibold">
              {muted ? '🔇 Unmute' : '🔊 Mute'}
            </button>
          </div>
        </div>}
      </div>
    </div>
  );
};
