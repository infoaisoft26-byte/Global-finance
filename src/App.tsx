import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { Header } from './components/layout/Header.tsx';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { Footer } from './components/layout/Footer.tsx';
import { AuthScreen } from './components/auth/AuthScreen.tsx';
import { AdminLoginScreen } from './components/auth/AdminLoginScreen.tsx';
import { Dashboard } from './components/pages/Dashboard.tsx';
import { Recharge } from './components/pages/Recharge.tsx';
import { BasicPackage } from './components/pages/BasicPackage.tsx';
import { FdPackage } from './components/pages/FdPackage.tsx';
import { DirectTeam } from './components/pages/DirectTeam.tsx';
import { TeamList } from './components/pages/TeamList.tsx';
import { IncomeView } from './components/pages/IncomeView.tsx';
import { P2PTransfer } from './components/pages/P2PTransfer.tsx';
import { TransferIncomeToFund } from './components/pages/TransferIncomeToFund.tsx';
import { FundWithdrawal } from './components/pages/FundWithdrawal.tsx';
import { DailyIncomeReport } from './components/pages/DailyIncomeReport.tsx';
import { MonthlyIncomeReport } from './components/pages/MonthlyIncomeReport.tsx';
import { FundWalletSummary } from './components/pages/FundWalletSummary.tsx';
import { IncomeWalletSummary } from './components/pages/IncomeWalletSummary.tsx';
import { SupportTickets } from './components/pages/SupportTickets.tsx';
import { ProfileKycModal } from './components/modals/ProfileKycModal.tsx';
import { KycPage } from './components/pages/KycPage.tsx';
import { TransactionsPage } from './components/pages/TransactionsPage.tsx';
import { NotificationsPage } from './components/pages/NotificationsPage.tsx';
import { PackageActivationsPage } from './components/pages/PackageActivationsPage.tsx';

// Admin Pages
import { AdminDashboard } from './components/pages/admin/AdminDashboard.tsx';
import { AdminUsers } from './components/pages/admin/AdminUsers.tsx';
import { AdminUserDetail } from './components/pages/admin/AdminUserDetail.tsx';
import { AdminKyc } from './components/pages/admin/AdminKyc.tsx';
import { AdminTickets } from './components/pages/admin/AdminTickets.tsx';
import { AdminReports } from './components/pages/admin/AdminReports.tsx';
import { AdminPackages } from './components/pages/admin/AdminPackages.tsx';
import { AdminPackageActivations } from './components/pages/admin/AdminPackageActivations.tsx';
import { AdminTransactions } from './components/pages/admin/AdminTransactions.tsx';
import { AdminAudit } from './components/pages/admin/AdminAudit.tsx';
import { AdminSettingsPage } from './components/pages/admin/AdminSettingsPage.tsx';

import { getSystemSettings } from './services/settingsService.ts';
import type { ActivePage, SystemSettings } from './types/index.ts';
import { ShieldCheck, RefreshCw, ShieldAlert, LogOut, AlertTriangle, Wrench } from 'lucide-react';

const MainLayout: React.FC = () => {
  const { user, loading, isAdmin, isSuspended, logout } = useAuth();
  const isAdminEntry = typeof window !== 'undefined' && (window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/'));
  const [activePage, setActivePage] = useState<ActivePage>(() => isAdminEntry ? 'admin-dashboard' : 'dashboard');
  const [selectedAdminUserId, setSelectedAdminUserId] = useState<string>('');
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState<boolean>(false);
  const [showProfileModal, setShowProfileModal] = useState<boolean>(false);
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);

  useEffect(() => {
    if (isAdminEntry && isAdmin) setActivePage('admin-dashboard');
  }, [isAdminEntry, isAdmin]);

  // Poll system settings for real-time maintenance mode & safety parameters
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const s = await getSystemSettings();
        setSystemSettings(s);
      } catch (err) {
        console.warn('Failed to load system settings:', err);
      }
    };
    fetchSettings();
    const interval = setInterval(fetchSettings, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070b19] flex flex-col items-center justify-center text-center p-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 via-cyan-500 to-indigo-600 flex items-center justify-center shadow-2xl shadow-cyan-500/30 border border-cyan-400/40 mb-4 animate-pulse">
          <ShieldCheck className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-xl font-bold tracking-wider text-white">GLOBAL FINANCE</h2>
        <p className="text-xs text-cyan-400/80 mt-1 mb-4">Secure • Transparent • Digital Finance Platform</p>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
          <span>Synchronizing cryptographic ledger...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return isAdminEntry ? <AdminLoginScreen /> : <AuthScreen />;
  }

  if (isAdminEntry && !isAdmin) {
    return (
      <div className="min-h-screen bg-[#070b19] flex items-center justify-center p-4 text-center">
        <div className="max-w-md w-full p-7 rounded-2xl bg-[#091129] border border-rose-500/40 shadow-2xl space-y-4">
          <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto" />
          <h2 className="text-xl font-bold text-white">Admin Access Denied</h2>
          <p className="text-xs text-slate-400 leading-relaxed">This account is valid, but it does not have an administrator role. Admin access is verified server-side.</p>
          <button
            onClick={logout}
            className="w-full px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
          >
            Sign Out
          </button>
          <a href="/" className="block text-xs text-cyan-400 hover:text-cyan-300">Go to Member Dashboard</a>
        </div>
      </div>
    );
  }

  // Account suspension gate
  if (isSuspended) {
    return (
      <div className="min-h-screen bg-[#070b19] flex flex-col items-center justify-center p-4 text-center">
        <div className="max-w-md w-full p-6 sm:p-8 rounded-2xl bg-[#091129] border border-rose-500/40 shadow-2xl space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white">Account Access Suspended</h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            Your GLOBAL FINANCE member account has been suspended by the platform compliance officers. Please reach out to <strong className="text-cyan-400">support@globalfinance.digital</strong> for identity verification and reinstatement.
          </p>
          <div className="pt-2">
            <button
              onClick={logout}
              className="px-5 py-2.5 rounded-xl bg-[#121c44] hover:bg-[#1a2860] border border-blue-500/30 text-white font-semibold text-xs flex items-center justify-center gap-2 mx-auto"
            >
              <LogOut className="w-4 h-4 text-rose-400" />
              <span>Log Out of Account</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Maintenance Mode gate: non-admins are shown maintenance screen; admins retain access
  if (systemSettings?.maintenanceMode && !isAdmin) {
    return (
      <div className="min-h-screen bg-[#070b19] flex flex-col items-center justify-center p-4 text-center">
        <div className="max-w-lg w-full p-8 rounded-2xl bg-[#091129] border border-amber-500/40 shadow-2xl space-y-5">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-xl shadow-amber-950/40">
            <Wrench className="w-8 h-8 animate-pulse" />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-white tracking-wider">GLOBAL FINANCE</h2>
            <p className="text-xs text-cyan-400">Secure • Transparent • Digital Finance Platform</p>
          </div>
          <div className="p-4 rounded-xl bg-[#060b1c] border border-blue-500/20 text-xs text-slate-300 space-y-2">
            <strong className="text-amber-300 font-semibold block text-sm">Scheduled Maintenance in Progress</strong>
            <p className="leading-relaxed text-slate-400">
              GLOBAL FINANCE is currently undergoing scheduled cryptographic ledger synchronization and compliance system upgrades. Normal member operations are temporarily paused and will resume shortly.
            </p>
            <div className="pt-2 text-[11px] text-slate-500 font-mono">
              Direct Inquiries: <span className="text-cyan-400">support@globalfinance.digital</span>
            </div>
          </div>
          <button
            onClick={logout}
            className="px-5 py-2.5 rounded-xl bg-[#121c44] hover:bg-[#1a2860] border border-blue-500/30 text-white font-semibold text-xs flex items-center justify-center gap-2 mx-auto"
          >
            <LogOut className="w-4 h-4 text-rose-400" />
            <span>Log Out</span>
          </button>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    // Admin route protection: only users with admin role can access admin modules
    const isAdminRoute = activePage.startsWith('admin-');
    if (isAdminRoute && !isAdmin) {
      return (
        <div className="p-8 rounded-2xl bg-[#091129] border border-rose-500/30 text-center space-y-3">
          <ShieldAlert className="w-10 h-10 text-rose-400 mx-auto" />
          <h3 className="text-base font-bold text-white">Access Denied: Staff Authorization Required</h3>
          <p className="text-xs text-slate-400">
            You do not possess administrative clearance to access the GLOBAL FINANCE control desk.
          </p>
          <button
            onClick={() => setActivePage('dashboard')}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
          >
            Return to Member Dashboard
          </button>
        </div>
      );
    }

    switch (activePage) {
      case 'dashboard':
        return <Dashboard onNavigate={setActivePage} onOpenProfile={() => setShowProfileModal(true)} />;
      case 'recharge':
        return <Recharge />;
      case 'kyc':
        return <KycPage />;
      case 'transactions':
        return <TransactionsPage />;
      case 'notifications':
        return <NotificationsPage onNavigate={setActivePage} />;
      case 'basic-package':
        return <BasicPackage onNavigateToRecharge={() => setActivePage('recharge')} />;
      case 'fd-package':
        return <FdPackage onNavigateToRecharge={() => setActivePage('recharge')} />;
      case 'package-activations':
      case 'packages':
        return <PackageActivationsPage onNavigateToPackages={() => setActivePage('basic-package')} />;
      case 'direct-team':
        return <DirectTeam />;
      case 'team-list':
        return <TeamList />;
      case 'basic-roi':
      case 'basic-referral':
      case 'basic-level':
      case 'fd-roi':
      case 'fd-referral':
      case 'fd-level':
      case 'rd-level':
      case 'salary-income':
        return <IncomeView page={activePage} />;
      case 'p2p-transfer':
        return <P2PTransfer />;
      case 'transfer-income-fund':
        return <TransferIncomeToFund />;
      case 'fund-withdrawal':
        return <FundWithdrawal onOpenProfile={() => setShowProfileModal(true)} />;
      case 'daily-income-report':
        return <DailyIncomeReport />;
      case 'monthly-income-report':
        return <MonthlyIncomeReport />;
      case 'fund-wallet-summary':
        return <FundWalletSummary />;
      case 'income-wallet-summary':
        return <IncomeWalletSummary />;
      case 'support-tickets':
        return <SupportTickets />;

      // Admin Panels
      case 'admin-dashboard':
        return <AdminDashboard onNavigate={setActivePage} />;
      case 'admin-transactions':
        return <AdminTransactions />;
      case 'admin-package-activations':
        return <AdminPackageActivations />;
      case 'admin-users':
        return (
          <AdminUsers
            onSelectUser={(userId) => {
              setSelectedAdminUserId(userId);
              setActivePage('admin-user-detail');
            }}
          />
        );
      case 'admin-user-detail':
        return (
          <AdminUserDetail
            userId={selectedAdminUserId}
            onBack={() => setActivePage('admin-users')}
          />
        );
      case 'admin-kyc':
        return <AdminKyc />;
      case 'admin-tickets':
        return <AdminTickets />;
      case 'admin-reports':
        return <AdminReports />;
      case 'admin-packages':
        return <AdminPackages />;
      case 'admin-audit':
        return <AdminAudit />;
      case 'admin-settings':
        return <AdminSettingsPage />;

      default:
        return <Dashboard onNavigate={setActivePage} onOpenProfile={() => setShowProfileModal(true)} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#070b19] text-slate-200 flex flex-col antialiased selection:bg-cyan-500 selection:text-slate-900">
      {systemSettings?.maintenanceMode && isAdmin && (
        <div className="bg-amber-500/20 border-b border-amber-500/40 px-4 py-2 text-center text-xs font-bold text-amber-300 flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <span>SYSTEM NOTICE: Maintenance Mode is currently ACTIVE. Normal member operations are paused.</span>
        </div>
      )}

      <Sidebar
        activePage={activePage}
        onSelectPage={setActivePage}
        isOpenMobile={isSidebarOpenMobile}
        onCloseMobile={() => setIsSidebarOpenMobile(false)}
      />

      <div className="lg:pl-72 flex-1 flex flex-col min-w-0 transition-all">
        <Header
          activePage={activePage}
          onToggleSidebar={() => setIsSidebarOpenMobile(prev => !prev)}
          onOpenProfile={() => setShowProfileModal(true)}
          onNavigate={setActivePage}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {renderContent()}
        </main>

        <Footer />
      </div>

      <ProfileKycModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        onNavigateToKyc={() => {
          setShowProfileModal(false);
          setActivePage('kyc');
        }}
      />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainLayout />
    </AuthProvider>
  );
}
