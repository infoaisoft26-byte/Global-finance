import React, { Component, Suspense, lazy, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { Header } from './components/layout/Header.tsx';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { AdminSidebar } from './components/layout/AdminSidebar.tsx';
import { Footer } from './components/layout/Footer.tsx';
import { AuthScreen } from './components/auth/AuthScreen.tsx';
import { AdminLoginScreen } from './components/auth/AdminLoginScreen.tsx';
import { ProfileKycModal } from './components/modals/ProfileKycModal.tsx';
import { DirectTeam } from './components/pages/DirectTeam.tsx';
import { TeamList } from './components/pages/TeamList.tsx';
import { PaymentStatusSummary } from './components/dashboard/PaymentStatusSummary.tsx';
import { getSystemSettings } from './services/settingsService.ts';
import type { ActivePage, SystemSettings } from './types/index.ts';
import { ShieldCheck, RefreshCw, ShieldAlert, LogOut, AlertTriangle, Wrench } from 'lucide-react';

const Dashboard = lazy(() => import('./components/pages/Dashboard.tsx').then(m => ({ default: m.Dashboard })));
const Recharge = lazy(() => import('./components/pages/Recharge.tsx').then(m => ({ default: m.Recharge })));
const BasicPackage = lazy(() => import('./components/pages/BasicPackage.tsx').then(m => ({ default: m.BasicPackage })));
const FdPackage = lazy(() => import('./components/pages/FdPackage.tsx').then(m => ({ default: m.FdPackage })));
const IncomeView = lazy(() => import('./components/pages/IncomeView.tsx').then(m => ({ default: m.IncomeView })));
const P2PTransfer = lazy(() => import('./components/pages/P2PTransfer.tsx').then(m => ({ default: m.P2PTransfer })));
const TransferIncomeToFund = lazy(() => import('./components/pages/TransferIncomeToFund.tsx').then(m => ({ default: m.TransferIncomeToFund })));
const FundWithdrawal = lazy(() => import('./components/pages/FundWithdrawal.tsx').then(m => ({ default: m.FundWithdrawal })));
const DailyIncomeReport = lazy(() => import('./components/pages/DailyIncomeReport.tsx').then(m => ({ default: m.DailyIncomeReport })));
const MonthlyIncomeReport = lazy(() => import('./components/pages/MonthlyIncomeReport.tsx').then(m => ({ default: m.MonthlyIncomeReport })));
const FundWalletSummary = lazy(() => import('./components/pages/FundWalletSummary.tsx').then(m => ({ default: m.FundWalletSummary })));
const IncomeWalletSummary = lazy(() => import('./components/pages/IncomeWalletSummary.tsx').then(m => ({ default: m.IncomeWalletSummary })));
const SupportTickets = lazy(() => import('./components/pages/SupportTickets.tsx').then(m => ({ default: m.SupportTickets })));
const KycPage = lazy(() => import('./components/pages/KycPage.tsx').then(m => ({ default: m.KycPage })));
const TransactionsPage = lazy(() => import('./components/pages/TransactionsPage.tsx').then(m => ({ default: m.TransactionsPage })));
const NotificationsPage = lazy(() => import('./components/pages/NotificationsPage.tsx').then(m => ({ default: m.NotificationsPage })));
const PackageActivationsPage = lazy(() => import('./components/pages/PackageActivationsPage.tsx').then(m => ({ default: m.PackageActivationsPage })));

const AdminDashboardFast = lazy(() => import('./components/pages/admin/AdminDashboardFast.tsx').then(m => ({ default: m.AdminDashboardFast })));
const AdminUsers = lazy(() => import('./components/pages/admin/AdminUsers.tsx').then(m => ({ default: m.AdminUsers })));
const AdminUserDetail = lazy(() => import('./components/pages/admin/AdminUserDetail.tsx').then(m => ({ default: m.AdminUserDetail })));
const AdminKyc = lazy(() => import('./components/pages/admin/AdminKyc.tsx').then(m => ({ default: m.AdminKyc })));
const AdminTickets = lazy(() => import('./components/pages/admin/AdminTickets.tsx').then(m => ({ default: m.AdminTickets })));
const AdminReports = lazy(() => import('./components/pages/admin/AdminReports.tsx').then(m => ({ default: m.AdminReports })));
const AdminPackages = lazy(() => import('./components/pages/admin/AdminPackages.tsx').then(m => ({ default: m.AdminPackages })));
const AdminPackageActivations = lazy(() => import('./components/pages/admin/AdminPackageActivations.tsx').then(m => ({ default: m.AdminPackageActivations })));
const AdminTransactions = lazy(() => import('./components/pages/admin/AdminTransactionsAccounting.tsx').then(m => ({ default: m.AdminTransactionsAccounting })));
const AdminAudit = lazy(() => import('./components/pages/admin/AdminAudit.tsx').then(m => ({ default: m.AdminAudit })));
const AdminSettingsPage = lazy(() => import('./components/pages/admin/AdminSettingsPage.tsx').then(m => ({ default: m.AdminSettingsPage })));

class PageErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: unknown) { console.error('Page render failed:', error); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[260px] flex items-center justify-center p-6">
          <div className="max-w-md w-full p-5 rounded-2xl bg-[#091129] border border-rose-500/30 text-center space-y-3">
            <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
            <div className="text-white font-bold">Page could not be displayed.</div>
            <div className="text-xs text-slate-400">Refresh this module and try again. Your account data is not affected.</div>
            <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold">Refresh Page</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const PageFallback = () => (
  <div className="min-h-[280px] flex items-center justify-center">
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
      <span>Loading module…</span>
    </div>
  </div>
);

const MainLayout: React.FC = () => {
  const { user, loading, isAdmin, isSuspended, logout } = useAuth();
  const isAdminEntry = typeof window !== 'undefined' && (window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/'));
  const [activePage, setActivePage] = useState<ActivePage>(() => isAdminEntry ? 'admin-dashboard' : 'dashboard');
  const [selectedAdminUserId, setSelectedAdminUserId] = useState('');
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);

  useEffect(() => {
    if (isAdminEntry && isAdmin) setActivePage('admin-dashboard');
  }, [isAdminEntry, isAdmin]);

  useEffect(() => {
    if (!loading && user && isAdmin && !isAdminEntry) window.location.replace('/admin');
  }, [loading, user, isAdmin, isAdminEntry]);

  useEffect(() => {
    let alive = true;
    getSystemSettings().then(s => alive && setSystemSettings(s)).catch(() => {});
    const interval = setInterval(() => {
      getSystemSettings().then(s => alive && setSystemSettings(s)).catch(() => {});
    }, 60_000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070b19] flex flex-col items-center justify-center text-center p-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 via-cyan-500 to-indigo-600 flex items-center justify-center shadow-xl border border-cyan-400/40 mb-4 animate-pulse">
          <ShieldCheck className="w-7 h-7 text-white" />
        </div>
        <h2 className="text-lg font-bold tracking-wider text-white">GLOBAL FINANCE</h2>
        <div className="flex items-center gap-2 text-xs text-slate-400 mt-3">
          <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
          <span>Opening secure account…</span>
        </div>
      </div>
    );
  }

  if (!user) return isAdminEntry ? <AdminLoginScreen /> : <AuthScreen />;

  if (isAdminEntry && !isAdmin) {
    return (
      <div className="min-h-screen bg-[#070b19] flex items-center justify-center p-4 text-center">
        <div className="max-w-md w-full p-7 rounded-2xl bg-[#091129] border border-rose-500/40 shadow-2xl space-y-4">
          <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto" />
          <h2 className="text-xl font-bold text-white">Admin Access Denied</h2>
          <p className="text-xs text-slate-400">This account does not have an administrator role.</p>
          <button onClick={logout} className="w-full px-4 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-bold">Sign Out</button>
          <a href="/" className="block text-xs text-cyan-400">Go to Member Login</a>
        </div>
      </div>
    );
  }

  if (isSuspended) {
    return (
      <div className="min-h-screen bg-[#070b19] flex items-center justify-center p-4 text-center">
        <div className="max-w-md w-full p-7 rounded-2xl bg-[#091129] border border-rose-500/40 shadow-2xl space-y-4">
          <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto" />
          <h2 className="text-xl font-bold text-white">Account Access Suspended</h2>
          <button onClick={logout} className="px-5 py-2.5 rounded-xl bg-[#121c44] text-white text-xs flex items-center gap-2 mx-auto"><LogOut className="w-4 h-4" />Log Out</button>
        </div>
      </div>
    );
  }

  if (systemSettings?.maintenanceMode && !isAdmin) {
    return (
      <div className="min-h-screen bg-[#070b19] flex items-center justify-center p-4 text-center">
        <div className="max-w-lg w-full p-8 rounded-2xl bg-[#091129] border border-amber-500/40 shadow-2xl space-y-5">
          <Wrench className="w-12 h-12 mx-auto text-amber-400" />
          <h2 className="text-2xl font-bold text-white">GLOBAL FINANCE</h2>
          <p className="text-xs text-slate-400">Scheduled maintenance in progress.</p>
          <button onClick={logout} className="px-5 py-2.5 rounded-xl bg-[#121c44] text-white text-xs mx-auto">Log Out</button>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    if (activePage.startsWith('admin-') && !isAdmin) return <div className="p-8 text-center text-rose-300">Access denied.</div>;

    switch (activePage) {
      case 'dashboard': return (
        <div className="space-y-6">
          <PaymentStatusSummary onOpenRecharge={() => setActivePage('recharge')} />
          <Dashboard onNavigate={setActivePage} onOpenProfile={() => setShowProfileModal(true)} />
        </div>
      );
      case 'recharge': return <Recharge />;
      case 'kyc': return <KycPage />;
      case 'transactions': return <TransactionsPage />;
      case 'notifications': return <NotificationsPage onNavigate={setActivePage} />;
      case 'basic-package': return <BasicPackage onNavigateToRecharge={() => setActivePage('recharge')} />;
      case 'fd-package': return <FdPackage onNavigateToRecharge={() => setActivePage('recharge')} />;
      case 'package-activations':
      case 'packages': return <PackageActivationsPage onNavigateToPackages={() => setActivePage('basic-package')} />;
      case 'direct-team': return <DirectTeam />;
      case 'team-list': return <TeamList />;
      case 'basic-roi':
      case 'basic-referral':
      case 'basic-level':
      case 'fd-roi':
      case 'fd-referral':
      case 'fd-level':
      case 'rd-level':
      case 'salary-income': return <IncomeView page={activePage} />;
      case 'p2p-transfer': return <P2PTransfer />;
      case 'transfer-income-fund': return <TransferIncomeToFund />;
      case 'fund-withdrawal': return <FundWithdrawal onOpenProfile={() => setShowProfileModal(true)} />;
      case 'daily-income-report': return <DailyIncomeReport />;
      case 'monthly-income-report': return <MonthlyIncomeReport />;
      case 'fund-wallet-summary': return <FundWalletSummary />;
      case 'income-wallet-summary': return <IncomeWalletSummary />;
      case 'support-tickets': return <SupportTickets />;
      case 'admin-dashboard': return <AdminDashboardFast onNavigate={setActivePage} />;
      case 'admin-transactions': return <AdminTransactions />;
      case 'admin-package-activations': return <AdminPackageActivations />;
      case 'admin-users': return <AdminUsers onSelectUser={(userId) => { setSelectedAdminUserId(userId); setActivePage('admin-user-detail'); }} />;
      case 'admin-user-detail': return <AdminUserDetail userId={selectedAdminUserId} onBack={() => setActivePage('admin-users')} />;
      case 'admin-kyc': return <AdminKyc />;
      case 'admin-tickets': return <AdminTickets />;
      case 'admin-reports': return <AdminReports />;
      case 'admin-packages': return <AdminPackages />;
      case 'admin-audit': return <AdminAudit />;
      case 'admin-settings': return <AdminSettingsPage />;
      default: return isAdminEntry ? <AdminDashboardFast onNavigate={setActivePage} /> : (
        <div className="space-y-6">
          <PaymentStatusSummary onOpenRecharge={() => setActivePage('recharge')} />
          <Dashboard onNavigate={setActivePage} onOpenProfile={() => setShowProfileModal(true)} />
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#070b19] text-slate-200 flex flex-col antialiased">
      {systemSettings?.maintenanceMode && isAdmin && (
        <div className="bg-amber-500/20 border-b border-amber-500/40 px-4 py-2 text-center text-xs font-bold text-amber-300 flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Maintenance Mode is ACTIVE
        </div>
      )}

      {isAdminEntry ? (
        <AdminSidebar activePage={activePage} onSelectPage={setActivePage} isOpenMobile={isSidebarOpenMobile} onCloseMobile={() => setIsSidebarOpenMobile(false)} />
      ) : (
        <Sidebar activePage={activePage} onSelectPage={setActivePage} isOpenMobile={isSidebarOpenMobile} onCloseMobile={() => setIsSidebarOpenMobile(false)} />
      )}

      <div className="lg:pl-72 flex-1 flex flex-col min-w-0">
        <Header activePage={activePage} onToggleSidebar={() => setIsSidebarOpenMobile(v => !v)} onOpenProfile={() => !isAdminEntry && setShowProfileModal(true)} onNavigate={setActivePage} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <PageErrorBoundary><Suspense fallback={<PageFallback />}>{renderContent()}</Suspense></PageErrorBoundary>
        </main>
        <Footer />
      </div>

      {!isAdminEntry && <ProfileKycModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} onNavigateToKyc={() => { setShowProfileModal(false); setActivePage('kyc'); }} />}
    </div>
  );
};

export default function AppOptimized() {
  return <AuthProvider><MainLayout /></AuthProvider>;
}
