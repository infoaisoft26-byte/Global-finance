import React, { useEffect, useRef } from 'react';

const FOREX_SYMBOLS = [
  { proName: 'FX:EURUSD', title: 'EUR/USD' },
  { proName: 'FX:GBPUSD', title: 'GBP/USD' },
  { proName: 'FX:USDJPY', title: 'USD/JPY' },
  { proName: 'FX:USDCHF', title: 'USD/CHF' },
  { proName: 'FX:AUDUSD', title: 'AUD/USD' },
  { proName: 'FX:USDCAD', title: 'USD/CAD' },
  { proName: 'FX_IDC:USDINR', title: 'USD/INR' },
];

/**
 * Use TradingView's classic iframe ticker embed here. The widget's own script
 * creates its iframe; adding the script as a DOM node avoids React/innerHTML
 * script execution issues with third-party embeds.
 */
export const ForexLiveTicker: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    mount.replaceChildren();

    const widgetContainer = document.createElement('div');
    widgetContainer.className = 'tradingview-widget-container';
    widgetContainer.style.width = '100%';
    widgetContainer.style.height = '58px';
    widgetContainer.style.overflow = 'hidden';

    const widget = document.createElement('div');
    widget.className = 'tradingview-widget-container__widget';
    widget.style.width = '100%';
    widget.style.height = '58px';
    widgetContainer.appendChild(widget);

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.async = true;
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js';
    script.textContent = JSON.stringify({
      symbols: FOREX_SYMBOLS,
      showSymbolLogo: false,
      colorTheme: 'dark',
      isTransparent: true,
      displayMode: 'adaptive',
      locale: 'en',
    });
    widgetContainer.appendChild(script);
    mount.appendChild(widgetContainer);

    return () => {
      mount.replaceChildren();
    };
  }, []);

  return (
    <section
      className="relative z-10 block h-[58px] min-h-[58px] w-full min-w-0 overflow-hidden rounded-xl border border-cyan-500/20 bg-[#091129] shadow-lg"
      aria-label="Live forex market"
    >
      <div ref={mountRef} className="h-[58px] min-h-[58px] w-full min-w-0 overflow-hidden">
        <div className="flex h-[58px] items-center justify-center px-3 text-xs text-slate-300">
          Loading live forex market…
        </div>
      </div>
    </section>
  );
};
