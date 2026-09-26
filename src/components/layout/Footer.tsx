import React from 'react';
import { ShieldCheck, Lock, ExternalLink } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="mt-auto border-t border-blue-500/20 bg-[#060a18] text-xs text-slate-400 py-6 px-4 sm:px-8 no-print">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Left: Brand & Tagline */}
        <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-center sm:text-left">
          <div className="flex items-center gap-2 font-bold text-slate-200">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span>GLOBAL FINANCE</span>
          </div>
          <span className="hidden sm:inline text-slate-600">|</span>
          <span className="text-slate-400 text-xs">
            Secure • Transparent • Digital Finance Platform
          </span>
        </div>

        {/* Right: Copyright */}
        <div className="flex items-center gap-4 text-slate-500 text-xs">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span>256-Bit SSL Encrypted Ledger</span>
          </div>
          <span>·</span>
          <span>© 2026 Global Finance. All Rights Reserved.</span>
        </div>
      </div>
    </footer>
  );
};
