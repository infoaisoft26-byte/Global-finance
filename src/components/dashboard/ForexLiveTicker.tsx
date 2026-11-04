import React, { useEffect, useRef } from 'react';

const TRADINGVIEW_SCRIPT_ID = 'gf-tradingview-ticker-tape';
const TRADINGVIEW_SCRIPT_URL = 'https://widgets.tradingview-widget.com/w/en/tv-ticker-tape.js';
const FOREX_SYMBOLS = [
  'FX:EURUSD',
  'FX:GBPUSD',
  'FX:USDJPY',
  'FX:USDCHF',
  'FX:AUDUSD',
  'FX:USDCAD',
  'FX_IDC:USDINR',
].join(',');

export const ForexLiveTicker: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ticker = document.createElement('tv-ticker-tape');
    ticker.setAttribute('symbols', FOREX_SYMBOLS);
    ticker.setAttribute('direction', 'horizontal');
    ticker.setAttribute('item-size', 'compact');
    ticker.setAttribute('theme', 'dark');
    ticker.setAttribute('transparent', '');
    // TradingView sizes this web component from its host container.
    // Keep an explicit height so it cannot collapse to zero in the dashboard.
    ticker.style.display = 'block';
    ticker.style.width = '100%';
    ticker.style.height = '58px';
    ticker.style.minHeight = '58px';
    ticker.appendChild(Object.assign(document.createElement('span'), {
      textContent: 'Loading live forex market…',
    }));
    container.appendChild(ticker);

    let active = true;
    let fallbackTimer = 0;
    const showFallback = () => {
      if (!active || !container.isConnected || customElements.get('tv-ticker-tape')) return;
      container.innerHTML = '<div class="flex h-[58px] min-h-[58px] items-center justify-center px-3 text-xs text-slate-300">Live Forex Market · Feed temporarily unavailable</div>';
    };

    if (!customElements.get('tv-ticker-tape')) {
      const existingScript = document.getElementById(TRADINGVIEW_SCRIPT_ID) as HTMLScriptElement | null;
      if (existingScript) {
        fallbackTimer = window.setTimeout(showFallback, 10000);
        customElements.whenDefined('tv-ticker-tape').then(() => window.clearTimeout(fallbackTimer));
      } else {
        const script = document.createElement('script');
        script.id = TRADINGVIEW_SCRIPT_ID;
        script.type = 'module';
        script.src = TRADINGVIEW_SCRIPT_URL;
        script.async = true;
        script.onload = () => {
          customElements.whenDefined('tv-ticker-tape').then(() => window.clearTimeout(fallbackTimer));
        };
        script.onerror = showFallback;
        document.head.appendChild(script);
        fallbackTimer = window.setTimeout(showFallback, 10000);
      }
    }

    return () => {
      active = false;
      window.clearTimeout(fallbackTimer);
      ticker.remove();
    };
  }, []);

  return (
    <section className="h-[58px] min-h-[58px] w-full min-w-0 overflow-hidden rounded-xl border border-cyan-500/20 bg-[#091129] shadow-lg" aria-label="Live forex market">
      <div ref={containerRef} className="h-[58px] min-h-[58px] w-full min-w-0 overflow-hidden" />
    </section>
  );
};
