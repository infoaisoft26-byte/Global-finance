import React, { useEffect, useState } from 'react';
import { Menu, Copy, Check, ChevronRight, ShieldAlert, Sun, Moon, Type } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import type { ActivePage } from '../../types/index.ts';
import '../../styles/memberPreferences.css';

interface HeaderProps {
  activePage: ActivePage;
  onToggleSidebar: () => void;
  onOpenProfile: () => void;
  onNavigate?: (page: ActivePage) => void;
}

const pageTitles: Partial<Record<ActivePage, { title: string; category: string }>> = {
  dashboard: { title: 'Dashboard', category: 'Overview' },
  recharge: { title: 'Recharge Fund', category: 'Wallets' },
  'basic-package': { title: 'Basic Package Activation', category: 'Package Activation' },
  'fd-package': { title: 'FD Package Activation', category: 'Package Activation' },
  packages: { title: 'Investment Packages', category: 'Package Activation' },
  'package-activations': { title: 'My Package Activations', category: 'Package Activation' },
  'direct-team': { title: 'Direct Team', category: 'Downline' },
  'team-list': { title: 'Team List', category: 'Downline' },
  'basic-roi': { title: 'Basic ROI Income', category: 'Income' },
  'basic-referral': { title: 'Basic Referral Income', category: 'Income' },
  'basic-level': { title: 'Basic Level Income', category: 'Income' },
  'fd-roi': { title: 'FD ROI Income', category: 'Income' },
  'fd-referral': { title: 'FD Referral Income', category: 'Income' },
  'fd-level': { title: 'FD Level Income', category: 'Income' },
  'rd-level': { title: 'RD Level Income', category: 'Income' },
  'salary-income': { title: 'Salary Income', category: 'Income' },
  'p2p-transfer': { title: 'P2P Transfer', category: 'Transactional' },
  'transfer-income-fund': { title: 'Transfer Income To Fund', category: 'Transactional' },
  'fund-withdrawal': { title: 'Fund Withdrawal', category: 'Transactional' },
  transactions: { title: 'Transaction Ledger & Requests', category: 'Transactional' },
  'daily-income-report': { title: 'Daily Income Report', category: 'Reports' },
  'monthly-income-report': { title: 'Monthly Income Report', category: 'Reports' },
  'fund-wallet-summary': { title: 'Fund Wallet Summary', category: 'Reports' },
  'income-wallet-summary': { title: 'Income Wallet Summary', category: 'Reports' },
  'support-tickets': { title: 'Support Ticket', category: 'Help & Support' },
  'admin-dashboard': { title: 'Executive Admin Desk', category: 'Staff Administration' },
  'admin-users': { title: 'User Management', category: 'Staff Administration' },
  'admin-user-detail': { title: 'Member Ledger & Team Inspection', category: 'Staff Administration' },
  'admin-kyc': { title: 'KYC Compliance Queue', category: 'Staff Administration' },
  'admin-tickets': { title: 'Support Tickets Helpdesk', category: 'Staff Administration' },
  'admin-reports': { title: 'Reports & Audited Exports', category: 'Staff Administration' },
  'admin-packages': { title: 'Database Package Definitions', category: 'Staff Administration' },
  'admin-package-activations': { title: 'Package Activations Queue', category: 'Staff Administration' },
  'admin-transactions': { title: 'Transaction Requests Queue', category: 'Staff Administration' },
  'admin-audit': { title: 'Audit Trail', category: 'Staff Administration' },
  'admin-settings': { title: 'Platform Safety Parameters', category: 'Staff Administration' }
};

type ThemeMode = 'light' | 'dark';
type FontMode = 'small' | 'normal' | 'large';

export const Header: React.FC<HeaderProps> = ({ activePage, onToggleSidebar, onOpenProfile }) => {
  const { profile, isAdmin } = useAuth();
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => (localStorage.getItem('gf-theme') as ThemeMode) || 'light');
  const [fontMode, setFontMode] = useState<FontMode>(() => (localStorage.getItem('gf-font') as FontMode) || 'normal');

  const referralCode = profile?.referralCode || 'GF152551';
  const referralUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/register?r=${referralCode}`
    : `https://globalfinance1.vercel.app/register?r=${referralCode}`;

  useEffect(() => {
    document.documentElement.dataset.gfTheme = theme;
    localStorage.setItem('gf-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.gfFont = fontMode;
    localStorage.setItem('gf-font', fontMode);
  }, [fontMode]);

  const cycleFont = () => setFontMode(v => v === 'small' ? 'normal' : v === 'normal' ? 'large' : 'small');
  const handleCopyReferral = async () => {
    await navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const pageInfo = pageTitles[activePage] || { title: 'Dashboard', category: 'Overview' };

  return (
    <header className="sticky top-0 z-30 bg-[#080e22]/90 backdrop-blur-md border-b border-blue-500/20 px-4 sm:px-6 py-3.5 no-print transition-all">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onToggleSidebar} className="lg:hidden p-2 rounded-lg bg-[#0e1738] border border-blue-500/30" aria-label="Toggle navigation menu"><Menu className="w-5 h-5 text-cyan-400" /></button>
          <div className="min-w-0">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400">
              <span className="text-cyan-400 font-semibold">GLOBAL FINANCE</span><ChevronRight className="w-3.5 h-3.5" /><span>{pageInfo.category}</span><ChevronRight className="w-3.5 h-3.5" /><span className="text-slate-200 truncate">{pageInfo.title}</span>
            </div>
            <h1 className="text-base sm:text-lg font-bold text-white truncate">{pageInfo.title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && <div className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-bold"><ShieldAlert className="w-3.5 h-3.5" />Admin Mode</div>}

          {!isAdmin && <>
            <button onClick={() => setTheme(v => v === 'light' ? 'dark' : 'light')} title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'} className="p-2 rounded-lg border border-blue-500/25 bg-white/10 text-cyan-400 hover:border-cyan-400 transition-colors">
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
            <button onClick={cycleFont} title={`Font size: ${fontMode}`} className="px-2.5 py-2 rounded-lg border border-blue-500/25 bg-white/10 text-cyan-400 hover:border-cyan-400 transition-colors flex items-center gap-1">
              <Type className="w-4 h-4" /><span className="hidden sm:inline text-[10px] uppercase font-bold">{fontMode}</span>
            </button>
          </>}

          <button onClick={handleCopyReferral} title="Copy referral link" className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-cyan-500/30 text-xs transition-all">
            <span className="text-slate-400">Ref:</span><span className="font-mono font-bold text-cyan-400">{referralCode}</span>{copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
          </button>

          <button onClick={onOpenProfile} className="flex items-center gap-2 p-1.5 sm:px-3 sm:py-1.5 rounded-lg border border-blue-500/30 text-left">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white font-bold text-xs">{profile?.name ? profile.name.charAt(0).toUpperCase() : 'G'}</div>
            <div className="hidden sm:block"><div className="text-xs font-semibold text-slate-200 truncate max-w-[110px]">{profile?.name || 'Member'}</div><div className="text-[10px] text-cyan-400 font-mono">{referralCode}</div></div>
          </button>
        </div>
      </div>
    </header>
  );
};
