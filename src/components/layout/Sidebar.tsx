import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Wallet, 
  Package, 
  Users, 
  TrendingUp, 
  ArrowLeftRight, 
  FileBarChart2, 
  LifeBuoy, 
  LogOut, 
  ChevronDown, 
  ChevronRight, 
  Shield, 
  Layers, 
  Sparkles, 
  CreditCard, 
  Building2, 
  DollarSign, 
  UserCheck, 
  Send, 
  History, 
  ShieldAlert, 
  FileCheck, 
  Settings, 
  X,
  Bell,
  CheckCircle2,
  Lock
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import type { ActivePage } from '../../types/index.ts';

interface SidebarProps {
  activePage: ActivePage;
  onSelectPage: (page: ActivePage) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activePage,
  onSelectPage,
  isOpenMobile,
  onCloseMobile
}) => {
  const { logout, profile, isAdmin } = useAuth();

  // Collapsible menu sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    package: true,
    downline: false,
    income: false,
    transactional: true,
    reports: false,
    admin: true
  });

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleNav = (page: ActivePage) => {
    onSelectPage(page);
    onCloseMobile();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div 
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 bg-[#060a19] border-r border-blue-500/20 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        } no-print`}
      >
        {/* Brand Header */}
        <div className="h-16 px-6 border-b border-blue-500/20 flex items-center justify-between bg-[#080d22]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 border border-cyan-400/40">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-base font-extrabold tracking-wider bg-gradient-to-r from-white via-cyan-100 to-cyan-400 bg-clip-text text-transparent">
                GLOBAL FINANCE
              </span>
              <p className="text-[9px] uppercase tracking-wider text-cyan-400/80 font-medium">
                Digital Finance Platform
              </p>
            </div>
          </div>
          <button 
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#10193d]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Menus List (Scrollable) */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 text-xs text-slate-300">
          {/* Main: Dashboard */}
          <button
            onClick={() => handleNav('dashboard')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium transition-all ${
              activePage === 'dashboard'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold shadow-lg shadow-blue-900/40'
                : 'hover:bg-[#0e1635] text-slate-300 hover:text-white'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 text-cyan-400" />
            <span className="text-sm">Dashboard</span>
          </button>

          {/* Main: Recharge */}
          <button
            onClick={() => handleNav('recharge')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium transition-all ${
              activePage === 'recharge'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold shadow-lg shadow-blue-900/40'
                : 'hover:bg-[#0e1635] text-slate-300 hover:text-white'
            }`}
          >
            <Wallet className="w-4 h-4 text-emerald-400" />
            <span className="text-sm">Recharge Fund</span>
          </button>

          {/* KYC Verification Page */}
          <button
            onClick={() => handleNav('kyc')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium transition-all ${
              activePage === 'kyc'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold shadow-lg shadow-blue-900/40'
                : 'hover:bg-[#0e1635] text-slate-300 hover:text-white'
            }`}
          >
            <FileCheck className="w-4 h-4 text-cyan-400" />
            <span className="text-sm">KYC Verification</span>
          </button>

          {/* Notifications Center */}
          <button
            onClick={() => handleNav('notifications')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium transition-all ${
              activePage === 'notifications'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold shadow-lg shadow-blue-900/40'
                : 'hover:bg-[#0e1635] text-slate-300 hover:text-white'
            }`}
          >
            <Bell className="w-4 h-4 text-cyan-400" />
            <span className="text-sm">Notifications</span>
          </button>

          {/* Section: Transactional */}
          <div className="pt-2">
            <button
              onClick={() => toggleSection('transactional')}
              className="w-full flex items-center justify-between px-3.5 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[#0d1430] transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <ArrowLeftRight className="w-4 h-4 text-cyan-400" />
                <span className="font-semibold text-xs tracking-wide uppercase text-slate-400">Transactional</span>
              </div>
              {openSections.transactional ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            {openSections.transactional && (
              <div className="pl-6 pt-1 space-y-1">
                <button
                  onClick={() => handleNav('transactions')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                    activePage === 'transactions'
                      ? 'bg-blue-600/30 text-cyan-300 font-semibold border-l-2 border-cyan-400'
                      : 'hover:bg-[#0e1635] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <span>Transaction Ledger</span>
                </button>
                <button
                  onClick={() => handleNav('p2p-transfer')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                    activePage === 'p2p-transfer'
                      ? 'bg-blue-600/30 text-cyan-300 font-semibold border-l-2 border-cyan-400'
                      : 'hover:bg-[#0e1635] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span>P2P Transfer</span>
                </button>
                <button
                  onClick={() => handleNav('transfer-income-fund')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                    activePage === 'transfer-income-fund'
                      ? 'bg-blue-600/30 text-cyan-300 font-semibold border-l-2 border-cyan-400'
                      : 'hover:bg-[#0e1635] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Transfer Income To Fund</span>
                </button>
                <button
                  onClick={() => handleNav('fund-withdrawal')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                    activePage === 'fund-withdrawal'
                      ? 'bg-blue-600/30 text-cyan-300 font-semibold border-l-2 border-cyan-400'
                      : 'hover:bg-[#0e1635] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  <span>Fund Withdrawal</span>
                </button>
              </div>
            )}
          </div>

          {/* Section: Package Activation */}
          <div className="pt-2">
            <button
              onClick={() => toggleSection('package')}
              className="w-full flex items-center justify-between px-3.5 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[#0d1430] transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Package className="w-4 h-4 text-cyan-400" />
                <span className="font-semibold text-xs tracking-wide uppercase text-slate-400">Package Activation</span>
              </div>
              {openSections.package ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            {openSections.package && (
              <div className="pl-6 pt-1 space-y-1">
                <button
                  onClick={() => handleNav('basic-package')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                    activePage === 'basic-package'
                      ? 'bg-blue-600/30 text-cyan-300 font-semibold border-l-2 border-cyan-400'
                      : 'hover:bg-[#0e1635] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <span>Basic Package</span>
                </button>
                <button
                  onClick={() => handleNav('fd-package')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                    activePage === 'fd-package'
                      ? 'bg-blue-600/30 text-cyan-300 font-semibold border-l-2 border-cyan-400'
                      : 'hover:bg-[#0e1635] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span>FD Package</span>
                </button>
                <button
                  onClick={() => handleNav('package-activations')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                    activePage === 'package-activations'
                      ? 'bg-blue-600/30 text-cyan-300 font-semibold border-l-2 border-cyan-400'
                      : 'hover:bg-[#0e1635] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  <span>Package Requests</span>
                </button>
              </div>
            )}
          </div>

          {/* Section: Downline */}
          <div className="pt-2">
            <button
              onClick={() => toggleSection('downline')}
              className="w-full flex items-center justify-between px-3.5 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[#0d1430] transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-cyan-400" />
                <span className="font-semibold text-xs tracking-wide uppercase text-slate-400">Downline</span>
              </div>
              {openSections.downline ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            {openSections.downline && (
              <div className="pl-6 pt-1 space-y-1">
                <button
                  onClick={() => handleNav('direct-team')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                    activePage === 'direct-team'
                      ? 'bg-blue-600/30 text-cyan-300 font-semibold border-l-2 border-cyan-400'
                      : 'hover:bg-[#0e1635] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span>Direct Team</span>
                </button>
                <button
                  onClick={() => handleNav('team-list')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                    activePage === 'team-list'
                      ? 'bg-blue-600/30 text-cyan-300 font-semibold border-l-2 border-cyan-400'
                      : 'hover:bg-[#0e1635] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  <span>Team List</span>
                </button>
              </div>
            )}
          </div>

          {/* Section: Income */}
          <div className="pt-2">
            <button
              onClick={() => toggleSection('income')}
              className="w-full flex items-center justify-between px-3.5 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[#0d1430] transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <TrendingUp className="w-4 h-4 text-cyan-400" />
                <span className="font-semibold text-xs tracking-wide uppercase text-slate-400">Income</span>
              </div>
              {openSections.income ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            {openSections.income && (
              <div className="pl-6 pt-1 space-y-1">
                <button
                  onClick={() => handleNav('basic-roi')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                    activePage === 'basic-roi'
                      ? 'bg-blue-600/30 text-cyan-300 font-semibold border-l-2 border-cyan-400'
                      : 'hover:bg-[#0e1635] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <span>Basic ROI Income</span>
                </button>
                <button
                  onClick={() => handleNav('basic-referral')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                    activePage === 'basic-referral'
                      ? 'bg-blue-600/30 text-cyan-300 font-semibold border-l-2 border-cyan-400'
                      : 'hover:bg-[#0e1635] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Basic Referral Income</span>
                </button>
                <button
                  onClick={() => handleNav('basic-level')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                    activePage === 'basic-level'
                      ? 'bg-blue-600/30 text-cyan-300 font-semibold border-l-2 border-cyan-400'
                      : 'hover:bg-[#0e1635] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                  <span>Basic Level Income</span>
                </button>
                <button
                  onClick={() => handleNav('fd-roi')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                    activePage === 'fd-roi'
                      ? 'bg-blue-600/30 text-cyan-300 font-semibold border-l-2 border-cyan-400'
                      : 'hover:bg-[#0e1635] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span>FD ROI Income</span>
                </button>
                <button
                  onClick={() => handleNav('fd-referral')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                    activePage === 'fd-referral'
                      ? 'bg-blue-600/30 text-cyan-300 font-semibold border-l-2 border-cyan-400'
                      : 'hover:bg-[#0e1635] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                  <span>FD Referral Income</span>
                </button>
                <button
                  onClick={() => handleNav('fd-level')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                    activePage === 'fd-level'
                      ? 'bg-blue-600/30 text-cyan-300 font-semibold border-l-2 border-cyan-400'
                      : 'hover:bg-[#0e1635] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                  <span>FD Level Income</span>
                </button>
                <button
                  onClick={() => handleNav('rd-level')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                    activePage === 'rd-level'
                      ? 'bg-blue-600/30 text-cyan-300 font-semibold border-l-2 border-cyan-400'
                      : 'hover:bg-[#0e1635] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                  <span>RD Level Income</span>
                </button>
                <button
                  onClick={() => handleNav('salary-income')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                    activePage === 'salary-income'
                      ? 'bg-blue-600/30 text-cyan-300 font-semibold border-l-2 border-cyan-400'
                      : 'hover:bg-[#0e1635] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  <span>Salary Income</span>
                </button>
              </div>
            )}
          </div>

          {/* Section: Reports */}
          <div className="pt-2">
            <button
              onClick={() => toggleSection('reports')}
              className="w-full flex items-center justify-between px-3.5 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[#0d1430] transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <FileBarChart2 className="w-4 h-4 text-cyan-400" />
                <span className="font-semibold text-xs tracking-wide uppercase text-slate-400">Reports</span>
              </div>
              {openSections.reports ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            {openSections.reports && (
              <div className="pl-6 pt-1 space-y-1">
                <button
                  onClick={() => handleNav('daily-income-report')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                    activePage === 'daily-income-report'
                      ? 'bg-blue-600/30 text-cyan-300 font-semibold border-l-2 border-cyan-400'
                      : 'hover:bg-[#0e1635] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span>Daily Income Report</span>
                </button>
                <button
                  onClick={() => handleNav('monthly-income-report')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                    activePage === 'monthly-income-report'
                      ? 'bg-blue-600/30 text-cyan-300 font-semibold border-l-2 border-cyan-400'
                      : 'hover:bg-[#0e1635] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  <span>Monthly Income Report</span>
                </button>
                <button
                  onClick={() => handleNav('fund-wallet-summary')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                    activePage === 'fund-wallet-summary'
                      ? 'bg-blue-600/30 text-cyan-300 font-semibold border-l-2 border-cyan-400'
                      : 'hover:bg-[#0e1635] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                  <span>Fund Wallet Summary</span>
                </button>
                <button
                  onClick={() => handleNav('income-wallet-summary')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                    activePage === 'income-wallet-summary'
                      ? 'bg-blue-600/30 text-cyan-300 font-semibold border-l-2 border-cyan-400'
                      : 'hover:bg-[#0e1635] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <span>Income Wallet Summary</span>
                </button>
              </div>
            )}
          </div>

          {/* Section: Support Ticket */}
          <div className="pt-2">
            <button
              onClick={() => handleNav('support-tickets')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium transition-all ${
                activePage === 'support-tickets'
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold shadow-lg shadow-blue-900/40'
                  : 'hover:bg-[#0e1635] text-slate-300 hover:text-white'
              }`}
            >
              <LifeBuoy className="w-4 h-4 text-cyan-400" />
              <span className="text-sm">Support Tickets</span>
            </button>
          </div>

          {/* ========================================================= */}
          {/* SECTION: ADMIN PANEL (VISIBLE TO ADMINISTRATORS) */}
          {/* ========================================================= */}
          {isAdmin && (
            <div className="pt-4 border-t border-blue-500/20">
              <button
                onClick={() => toggleSection('admin')}
                className="w-full flex items-center justify-between px-3.5 py-2 rounded-lg text-rose-300 hover:text-rose-200 hover:bg-rose-950/20 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  <span className="font-bold text-xs tracking-wider uppercase text-rose-300">Admin Panel</span>
                </div>
                {openSections.admin ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>

              {openSections.admin && (
                <div className="pl-6 pt-1 space-y-1">
                  <button
                    onClick={() => handleNav('admin-dashboard')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                      activePage === 'admin-dashboard'
                        ? 'bg-rose-600/30 text-rose-200 font-semibold border-l-2 border-rose-400'
                        : 'hover:bg-[#0e1635] text-slate-300 hover:text-white'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                    <span>Control Desk</span>
                  </button>

                  <button
                    onClick={() => handleNav('admin-transactions')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                      activePage === 'admin-transactions'
                        ? 'bg-rose-600/30 text-rose-200 font-semibold border-l-2 border-rose-400'
                        : 'hover:bg-[#0e1635] text-slate-300 hover:text-white'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    <span>Transaction Requests</span>
                  </button>

                  <button
                    onClick={() => handleNav('admin-package-activations')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                      activePage === 'admin-package-activations'
                        ? 'bg-rose-600/30 text-rose-200 font-semibold border-l-2 border-rose-400'
                        : 'hover:bg-[#0e1635] text-slate-300 hover:text-white'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                    <span>Package Requests</span>
                  </button>

                  <button
                    onClick={() => handleNav('admin-users')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                      activePage === 'admin-users' || activePage === 'admin-user-detail'
                        ? 'bg-rose-600/30 text-rose-200 font-semibold border-l-2 border-rose-400'
                        : 'hover:bg-[#0e1635] text-slate-300 hover:text-white'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    <span>User Management</span>
                  </button>

                  <button
                    onClick={() => handleNav('admin-kyc')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                      activePage === 'admin-kyc'
                        ? 'bg-rose-600/30 text-rose-200 font-semibold border-l-2 border-rose-400'
                        : 'hover:bg-[#0e1635] text-slate-300 hover:text-white'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>KYC Queue</span>
                  </button>

                  <button
                    onClick={() => handleNav('admin-tickets')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                      activePage === 'admin-tickets'
                        ? 'bg-rose-600/30 text-rose-200 font-semibold border-l-2 border-rose-400'
                        : 'hover:bg-[#0e1635] text-slate-300 hover:text-white'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <span>Ticket Desk</span>
                  </button>

                  <button
                    onClick={() => handleNav('admin-packages')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                      activePage === 'admin-packages'
                        ? 'bg-rose-600/30 text-rose-200 font-semibold border-l-2 border-rose-400'
                        : 'hover:bg-[#0e1635] text-slate-300 hover:text-white'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                    <span>Package Config</span>
                  </button>

                  <button
                    onClick={() => handleNav('admin-reports')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                      activePage === 'admin-reports'
                        ? 'bg-rose-600/30 text-rose-200 font-semibold border-l-2 border-rose-400'
                        : 'hover:bg-[#0e1635] text-slate-300 hover:text-white'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                    <span>Admin Reports</span>
                  </button>

                  <button
                    onClick={() => handleNav('admin-audit')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                      activePage === 'admin-audit'
                        ? 'bg-rose-600/30 text-rose-200 font-semibold border-l-2 border-rose-400'
                        : 'hover:bg-[#0e1635] text-slate-300 hover:text-white'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                    <span>Audit Trail</span>
                  </button>

                  <button
                    onClick={() => handleNav('admin-settings')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                      activePage === 'admin-settings'
                        ? 'bg-rose-600/30 text-rose-200 font-semibold border-l-2 border-rose-400'
                        : 'hover:bg-[#0e1635] text-slate-300 hover:text-white'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    <span>Safety Settings</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* User Card & Logout Footer */}
        <div className="p-4 border-t border-blue-500/20 bg-[#080d22]">
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-slate-200 truncate max-w-[150px]">
                {profile?.name || 'Member'}
              </span>
              <span className="text-[10px] text-cyan-400 font-mono">
                {profile?.referralCode || 'GF152551'}
              </span>
            </div>
            <button
              onClick={logout}
              title="Logout"
              className="p-2 rounded-lg bg-[#111a3d] border border-blue-500/30 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
          <div className="text-[10px] text-slate-500 text-center">
            GLOBAL FINANCE v2.6 · Secure Core
          </div>
        </div>
      </aside>
    </>
  );
};
