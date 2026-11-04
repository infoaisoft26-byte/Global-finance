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
    ticker.setAttribute('theme', 'light');
    ticker.style.display = 'block';
    ticker.style.width = '100%';
    container.appendChild(ticker);

    let active = true;
    const showFallback = () => {
      if (!active || !container.isConnected) return;
      container.textContent = 'Forex market feed is temporarily unavailable.';
      container.className = 'w-full py-3 text-center text-xs text-slate-500';
    };

    const existingScript = document.getElementById(TRADINGVIEW_SCRIPT_ID) as HTMLScriptElement | null;
    if (customElements.get('tv-ticker-tape')) {
      return () => {
        active = false;
        ticker.remove();
      };
    }

    if (existingScript) {
      customElements.whenDefined('tv-ticker-tape').catch(showFallback);
    } else {
      const script = document.createElement('script');
      script.id = TRADINGVIEW_SCRIPT_ID;
      script.type = 'module';
      script.src = TRADINGVIEW_SCRIPT_URL;
      script.async = true;
      script.onerror = showFallback;
      document.head.appendChild(script);
    }

    return () => {
      active = false;
      ticker.remove();
    };
  }, []);

  return <div ref={containerRef} className="w-full min-w-0 overflow-hidden" aria-label="Live forex market prices" />;
};
