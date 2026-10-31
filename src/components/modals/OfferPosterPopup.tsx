import React, { useEffect, useState } from 'react';
import { getActiveOfferPoster, type OfferPoster } from '../../services/offerPosterService.ts';

export const OfferPosterPopup: React.FC = () => {
  const [poster, setPoster] = useState<OfferPoster | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    getActiveOfferPoster().then(value => { if (alive) setPoster(value); })
      .catch(error => console.warn('Offer poster unavailable:', error));
    return () => { alive = false; };
  }, []);
  if (!poster || failed) return null;
  const close = () => setPoster(null);
  const openCta = () => {
    if (!poster.ctaUrl) return;
    const url = poster.ctaUrl.startsWith('/') ? poster.ctaUrl : poster.ctaUrl;
    if (/^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
    else window.location.assign(url);
  };
  return (
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={poster.title}>
      <div className="relative w-full max-w-xl max-h-[94vh] overflow-y-auto rounded-2xl bg-[#080d1d] border border-cyan-400/30 shadow-2xl">
        <button onClick={close} aria-label="Close poster" className="absolute right-3 top-3 z-10 w-9 h-9 rounded-full bg-black/75 border border-white/30 text-white text-2xl leading-none">×</button>
        <img src={poster.imageUrl} alt={poster.title} className="block w-full max-h-[78vh] object-contain bg-black" onError={() => setFailed(true)} />
        {(poster.description || poster.ctaLabel) && <div className="p-4 space-y-3">
          {poster.description && <p className="text-sm text-slate-200 whitespace-pre-wrap">{poster.description}</p>}
          {poster.ctaLabel && poster.ctaUrl && <button onClick={openCta} className="w-full rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-3 text-sm font-bold text-white">{poster.ctaLabel}</button>}
        </div>}
      </div>
    </div>
  );
};
