import React from 'react';
import {
  LayoutDashboard,
  Users,
  FileCheck,
  LifeBuoy,
  Package,
  ArrowLeftRight,
  FileBarChart2,
  ShieldCheck,
  Settings,
  LogOut,
  X,
  ClipboardList
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import type { ActivePage } from '../../types/index.ts';

interface AdminSidebarProps {
  activePage: ActivePage;
  onSelectPage: (page: ActivePage) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

const items: Array<{ page: ActivePage; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { page: 'admin-dashboard', label: 'Admin Dashboard', icon: LayoutDashboard },
  { page: 'admin-users', label: 'User Management', icon: Users },
  { page: 'admin-kyc', label: 'KYC Approvals', icon: FileCheck },
  { page: 'admin-transactions', label: 'Transaction Requests', icon: ArrowLeftRight },
  { page: 'admin-test-buys', label: 'Nile Test Buys', icon: ArrowLeftRight },
  { page: 'admin-package-activations', label: 'Package Activations', icon: ClipboardList },
  { page: 'admin-packages', label: 'Package Management', icon: Package },
  { page: 'admin-tickets', label: 'Support Tickets', icon: LifeBuoy },
  { page: 'admin-reports', label: 'Reports', icon: FileBarChart2 },
  { page: 'admin-audit', label: 'Audit Logs', icon: ShieldCheck },
  { page: 'admin-settings', label: 'System Settings', icon: Settings },
];

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  activePage,
  onSelectPage,
  isOpenMobile,
  onCloseMobile,
}) => {
  const { profile, logout } = useAuth();

  const handleNav = (page: ActivePage) => {
    onSelectPage(page);
    onCloseMobile();
  };

  return (
    <>
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 bg-[#060a19] border-r border-rose-500/20 flex flex-col transition-transform duration-300 lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        } no-print`}
      >
        <div className="h-16 px-5 border-b border-rose-500/20 flex items-center justify-between bg-[#080d22]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-600 via-blue-600 to-cyan-500 flex items-center justify-center border border-rose-400/40">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-extrabold tracking-wider text-white">GLOBAL FINANCE</div>
              <div className="text-[9px] uppercase tracking-[0.18em] text-rose-300">Administration</div>
            </div>
          </div>
          <button onClick={onCloseMobile} className="lg:hidden p-1.5 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-4 border-b border-blue-500/10">
          <div className="rounded-xl border border-rose-500/20 bg-rose-950/10 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Signed in as</div>
            <div className="mt-1 text-xs font-semibold text-white truncate">{profile?.name || 'Administrator'}</div>
            <div className="text-[10px] text-rose-300 truncate">{profile?.email || ''}</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
          {items.map(({ page, label, icon: Icon }) => {
            const selected = activePage === page || (page === 'admin-users' && activePage === 'admin-user-detail');
            return (
              <button
                key={page}
                onClick={() => handleNav(page)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  selected
                    ? 'bg-gradient-to-r from-rose-600/80 to-blue-600/80 text-white border border-rose-400/30 shadow-lg shadow-rose-950/30'
                    : 'text-slate-300 hover:text-white hover:bg-[#101936]'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-blue-500/15 space-y-2">
          <a
            href="/"
            className="block w-full text-center px-3 py-2 rounded-xl border border-blue-500/20 bg-[#0d1530] text-xs text-cyan-300 hover:text-white"
          >
            Open Member Portal
          </a>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-rose-600/15 border border-rose-500/30 text-rose-300 hover:bg-rose-600/25 text-xs font-bold"
          >
            <LogOut className="w-4 h-4" />
            Logout Admin
          </button>
        </div>
      </aside>
    </>
  );
};
