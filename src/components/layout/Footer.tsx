import React from 'react';
import { Lock } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="mt-auto border-t border-blue-500/20 bg-[#060a18] text-xs text-slate-400 py-6 px-4 sm:px-8 no-print">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-center sm:text-left">
          <img src="/global-finance-logo.webp" alt="Global Finance" className="w-28 sm:w-32 h-auto opacity-95" loading="lazy" decoding="async" />
          <span className="hidden sm:inline text-slate-600">|</span>
          <span className="text-slate-400 text-xs">Secure • Transparent • Digital Finance Platform</span>
        </div>
        <div className="flex items-center gap-4 text-slate-500 text-xs">
          <div className="flex items-center gap-1.5 text-slate-400"><Lock className="w-3.5 h-3.5 text-emerald-400"/><span>Secure Connection</span></div>
          <span>·</span>
          <span>© 2026 Global Finance. All Rights Reserved.</span>
        </div>
      </div>
    </footer>
  );
};
