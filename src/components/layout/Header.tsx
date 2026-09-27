import React, { useState, useEffect } from 'react';
import { 
  Menu, 
  Bell, 
  User, 
  Copy, 
  Check, 
  ShieldCheck, 
  AlertCircle, 
  ExternalLink, 
  ChevronRight,
  ShieldAlert
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { getUnreadNotificationCount } from '../../services/notificationService.ts';
import type { ActivePage } from '../../types/index.ts';

interface HeaderProps {
  activePage: ActivePage;
  onToggleSidebar: () => void;
  onOpenProfile: () => void;
  onNavigate?: (page: ActivePage) => void;
}

const pageTitles: Record<ActivePage, { title: string; category: string }> = {
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
  notifications: { title: 'Notification Center', category: 'Account' },
  'daily-income-report': { title: 'Daily Income Report', category: 'Reports' },
  'monthly-income-report': { title: 'Monthly Income Report', category: 'Reports' },
  'fund-wallet-summary': { title: 'Fund Wallet Summary', category: 'Reports' },
  'income-wallet-summary': { title: 'Income Wallet Summary', category: 'Reports' },
  'support-tickets': { title: 'Support Ticket', category: 'Help & Support' },
  kyc: { title: 'KYC Document Verification', category: 'Identity & Compliance' },
  // Admin pages
  'admin-dashboard': { title: 'Executive Admin Desk', category: 'Staff Administration' },
  'admin-users': { title: 'User Management', category: 'Staff Administration' },
  'admin-user-detail': { title: 'Member Ledger & Team Inspection', category: 'Staff Administration' },
  'admin-kyc': { title: 'KYC Compliance Queue', category: 'Staff Administration' },
  'admin-tickets': { title: 'Support Tickets Helpdesk', category: 'Staff Administration' },
  'admin-reports': { title: 'Reports & Audited Exports', category: 'Staff Administration' },
  'admin-packages': { title: 'Database Package Definitions', category: 'Staff Administration' },
  'admin-package-activations': { title: 'Package Activations Queue', category: 'Staff Administration' },
  'admin-transactions': { title: 'Transaction Requests Queue', category: 'Staff Administration' },
  'admin-test-buys': { title: 'Nile Test Buys', category: 'Staff Administration' },
  'admin-audit': { title: 'Immutable Audit Trail', category: 'Staff Administration' },
  'admin-settings': { title: 'Platform Safety Parameters', category: 'Staff Administration' }
};

export const Header: React.FC<HeaderProps> = ({ 
  activePage, 
  onToggleSidebar,
  onOpenProfile,
  onNavigate
}) => {
  const { profile, user, isAdmin } = useAuth();
  const [copied, setCopied] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  const referralCode = profile?.referralCode || 'GF152551';
  const referralUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/register?r=${referralCode}`
    : `https://globalfinance.digital/register?r=${referralCode}`;

  useEffect(() => {
    if (!user) return;
    const fetchUnread = async () => {
      try {
        const count = await getUnreadNotificationCount(user.uid);
        setUnreadCount(count);
      } catch (err) {
        console.warn('Unread count fetch error:', err);
      }
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000); // Polling every 30s
    return () => clearInterval(interval);
  }, [user?.uid, activePage]);

  const handleCopyReferral = () => {
    navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const pageInfo = pageTitles[activePage] || { title: 'Dashboard', category: 'Overview' };

  return (
    <header className="sticky top-0 z-30 bg-[#080e22]/90 backdrop-blur-md border-b border-blue-500/20 px-4 sm:px-6 py-3.5 no-print transition-all">
      <div className="flex items-center justify-between gap-4">
        {/* Left: Mobile hamburger & Breadcrumbs */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleSidebar}
            className="lg:hidden p-2 rounded-lg bg-[#0e1738] border border-blue-500/30 text-slate-300 hover:text-white hover:bg-[#142048] transition-colors"
            aria-label="Toggle navigation menu"
          >
            <Menu className="w-5 h-5 text-cyan-400" />
          </button>

          {/* Breadcrumbs */}
          <div className="flex flex-col">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400">
              <span className="text-cyan-400/80 font-medium">GLOBAL FINANCE</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
              <span>{pageInfo.category}</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
              <span className="text-slate-200">{pageInfo.title}</span>
            </div>
            <h1 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
              {pageInfo.title}
            </h1>
          </div>
        </div>

        {/* Right: Quick actions, Referral copy, KYC status, Notifications, User profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Admin badge */}
          {isAdmin && (
            <div className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-bold">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Admin Mode</span>
            </div>
          )}

          {/* Referral Link Quick Copy Badge */}
          <button
            onClick={handleCopyReferral}
            title={`Copy Referral Link: ${referralUrl}`}
            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-950/80 to-cyan-950/80 border border-cyan-500/30 hover:border-cyan-400 text-xs text-slate-200 transition-all shadow-sm group"
          >
            <span className="text-slate-400">Ref:</span>
            <span className="font-mono font-bold text-cyan-400">{referralCode}</span>
            {copied ? (
              <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                <Check className="w-3.5 h-3.5" /> Copied
              </span>
            ) : (
              <Copy className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-300 transition-colors" />
            )}
          </button>

          {/* Real Notification Bell with Database Unread Badge */}
          <button
            onClick={() => onNavigate && onNavigate('notifications')}
            className="relative p-2 rounded-lg bg-[#0e1738] border border-blue-500/30 hover:border-cyan-400/50 hover:bg-[#132048] text-slate-300 hover:text-white transition-all"
            title="View Real Database Notifications"
          >
            <Bell className="w-4 h-4 text-cyan-400" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.2 min-w-4.5 h-4.5 rounded-full bg-rose-600 text-white font-mono text-[10px] font-bold flex items-center justify-center border-2 border-[#080e22] shadow-sm animate-pulse">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {/* KYC Status badge */}
          <div 
            onClick={onOpenProfile}
            className="cursor-pointer hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors bg-[#0d1636] border-blue-500/20"
          >
            {profile?.kycStatus === 'verified' ? (
              <span className="flex items-center gap-1 text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>KYC Verified</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-400">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>KYC Pending</span>
              </span>
            )}
          </div>

          {/* User Profile Avatar / Trigger */}
          <button
            onClick={onOpenProfile}
            className="flex items-center gap-2.5 p-1.5 sm:px-3 sm:py-1.5 rounded-lg bg-[#0e1738] border border-blue-500/30 hover:border-cyan-400/50 hover:bg-[#132048] transition-all text-left"
          >
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white font-bold text-xs shadow-md">
              {profile?.name ? profile.name.charAt(0).toUpperCase() : 'G'}
            </div>
            <div className="hidden sm:block">
              <div className="text-xs font-semibold text-slate-200 leading-tight truncate max-w-[110px]">
                {profile?.name || 'Member'}
              </div>
              <div className="text-[10px] text-cyan-400 font-mono">
                {referralCode}
              </div>
            </div>
          </button>
        </div>
      </div>
    </header>
  );
};
