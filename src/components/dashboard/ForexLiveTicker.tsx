import React, { useEffect, useRef } from 'react';

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
    let cancelled = false;
    let ticker: HTMLElement | null = null;

    const mountTicker = async () => {
      try {
        // Load TradingView's official custom element before creating it.
        // @ts-expect-error TradingView serves this browser module remotely.
        await import(/* @vite-ignore */ 'https://www.tradingview-widget.com/w/en/tv-ticker-tape.js');
        if (cancelled || !containerRef.current) return;

        ticker = document.createElement('tv-ticker-tape');
        ticker.setAttribute('symbols', FOREX_SYMBOLS);
        ticker.setAttribute('direction', 'horizontal');
        ticker.setAttribute('item-size', 'compact');
        ticker.setAttribute('theme', 'dark');
        ticker.setAttribute('transparent', '');
        ticker.style.display = 'block';
        ticker.style.width = '100%';
        ticker.style.minHeight = '58px';
        containerRef.current.replaceChildren(ticker);
      } catch (error) {
        console.error('TradingView forex ticker failed to load:', error);
        if (!cancelled && containerRef.current) {
          containerRef.current.textContent = 'Live forex rates are temporarily unavailable';
        }
      }
    };

    void mountTicker();
    return () => {
      cancelled = true;
      ticker?.remove();
    };
  }, []);

  return (
    <section
      className="relative z-10 block h-[58px] min-h-[58px] w-full min-w-0 overflow-hidden rounded-xl border border-cyan-500/20 bg-[#091129] shadow-lg"
      aria-label="Live forex market"
    >
      <div
        ref={containerRef}
        className="h-[58px] min-h-[58px] w-full min-w-0 overflow-hidden text-xs text-slate-300"
      >
        <span className="flex h-[58px] items-center justify-center px-3">
          Loading live forex market…
        </span>
      </div>
    </section>
  );
};
