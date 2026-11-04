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

/** TradingView's official module is loaded once from index.html. */
export const ForexLiveTicker: React.FC = () => (
  <section
    className="relative z-10 block h-[58px] min-h-[58px] w-full min-w-0 overflow-hidden rounded-xl border border-cyan-500/20 bg-[#091129] shadow-lg"
    aria-label="Live forex market"
  >
    <div className="h-[58px] min-h-[58px] w-full min-w-0 overflow-hidden">
      <tv-ticker-tape
        symbols={FOREX_SYMBOLS}
        direction="horizontal"
        item-size="compact"
        theme="dark"
        transparent=""
        style={{ display: 'block', width: '100%', minHeight: '58px' }}
      >
        <span className="flex h-[58px] items-center justify-center px-3 text-xs text-slate-300">
          Loading live forex market…
        </span>
      </tv-ticker-tape>
    </div>
  </section>
);
