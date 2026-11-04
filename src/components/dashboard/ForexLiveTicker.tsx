import React from 'react';

const FOREX_SYMBOLS = [
  'FX:EURUSD',
  'FX:GBPUSD',
  'FX:USDJPY',
  'FX:USDCHF',
  'FX:AUDUSD',
  'FX:USDCAD',
  'FX_IDC:USDINR',
].join(',');

/**
 * TradingView's official custom element is registered from index.html.
 * Rendering the element declaratively avoids dynamically injected script
 * timing issues and keeps a visible placeholder until the widget upgrades.
 */
export const ForexLiveTicker: React.FC = () => {
  const widget = React.createElement(
    'tv-ticker-tape',
    {
      symbols: FOREX_SYMBOLS,
      direction: 'horizontal',
      'item-size': 'compact',
      theme: 'dark',
      transparent: '',
      style: { display: 'block', width: '100%', minHeight: '58px' },
    } as React.HTMLAttributes<HTMLElement> & Record<string, unknown>,
    React.createElement(
      'span',
      { className: 'flex h-[58px] items-center justify-center px-3 text-xs text-slate-300' },
      'Loading live forex market…',
    ),
  );

  return (
    <section
      className="relative z-10 block h-[58px] min-h-[58px] w-full min-w-0 overflow-hidden rounded-xl border border-cyan-500/20 bg-[#091129] shadow-lg"
      aria-label="Live forex market"
    >
      <div className="h-[58px] min-h-[58px] w-full min-w-0 overflow-hidden">
        {widget}
      </div>
    </section>
  );
};
