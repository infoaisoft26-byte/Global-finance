import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Download, 
  Search, 
  Calendar, 
  RefreshCw, 
  Filter, 
  Printer, 
  Users, 
  ShieldCheck, 
  Clock, 
  Package, 
  ArrowLeftRight,
  TrendingUp,
  FileSpreadsheet
} from 'lucide-react';
import { 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  limit 
} from 'firebase/firestore';
import { db } from '../../../lib/firebase.ts';
import type { 
  UserProfile, 
  TransactionLedger, 
  SupportTicket, 
  KycSubmission,
  PackageActivationRecord
} from '../../../types/index.ts';

type ReportType = 
  | 'daily_registration' 
  | 'kyc_summary' 
  | 'tickets_summary' 
  | 'package_activations' 
  | 'ledger_summary' 
  | 'user_referral_summary';

export const AdminReports: React.FC = () => {
  const [reportType, setReportType] = useState<ReportType>('daily_registration');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  // Loaded real dataset from DB
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [transactions, setTransactions] = useState<TransactionLedger[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [kycList, setKycList] = useState<KycSubmission[]>([]);
  const [packages, setPackages] = useState<PackageActivationRecord[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [uSnap, tSnap, tkSnap, kSnap, pSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(query(collection(db, 'transactions'), orderBy('createdAt', 'desc'), limit(500))),
        getDocs(query(collection(db, 'tickets'), orderBy('createdAt', 'desc'), limit(300))),
        getDocs(query(collection(db, 'kyc_submissions'), orderBy('createdAt', 'desc'), limit(300))),
        getDocs(query(collection(db, 'packages'), orderBy('activatedAt', 'desc'), limit(300)))
      ]);

      setUsers(uSnap.docs.map(d => d.data() as UserProfile));
      setTransactions(tSnap.docs.map(d => d.data() as TransactionLedger));
      setTickets(tkSnap.docs.map(d => d.data() as SupportTicket));
      setKycList(kSnap.docs.map(d => d.data() as KycSubmission));
      setPackages(pSnap.docs.map(d => d.data() as PackageActivationRecord));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter helpers
  const matchesSearchAndDate = (str: string, dateStr?: string) => {
    if (searchQuery.trim() && !str.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (dateFilter && dateStr && !dateStr.startsWith(dateFilter)) {
      return false;
    }
    return true;
  };

  // Export CSV
  const handleExportCsv = () => {
    let rows: string[][] = [];
    let filename = `report_${reportType}_${new Date().toISOString().slice(0, 10)}.csv`;

    if (reportType === 'daily_registration') {
      rows.push(['UID', 'Name', 'Email', 'Referral Code', 'Sponsor ID', 'Status', 'Joined Date']);
      users.forEach(u => {
        if (matchesSearchAndDate(`${u.name} ${u.email} ${u.referralCode}`, u.createdAt)) {
          rows.push([u.uid, u.name, u.email, u.referralCode, u.sponsorId || '', u.status || 'active', u.createdAt]);
        }
      });
    } else if (reportType === 'ledger_summary') {
      rows.push(['Transaction ID', 'User ID', 'Type', 'Category', 'Flow', 'Amount', 'Fee', 'Net Amount', 'Status', 'Date']);
      transactions.forEach(t => {
        if (matchesSearchAndDate(`${t.id} ${t.description} ${t.type}`, t.createdAt)) {
          rows.push([t.id, t.userId, t.type, t.category, t.flow, t.amount.toString(), t.fee.toString(), t.netAmount.toString(), t.status, t.createdAt]);
        }
      });
    } else if (reportType === 'kyc_summary') {
      rows.push(['Submission ID', 'Legal Name', 'Email', 'Document Type', 'Last 4', 'Status', 'Date']);
      kycList.forEach(k => {
        if (matchesSearchAndDate(`${k.legalName} ${k.userEmail}`, k.createdAt)) {
          rows.push([k.id, k.legalName, k.userEmail, k.documentType, k.documentLast4, k.status, k.createdAt]);
        }
      });
    } else if (reportType === 'tickets_summary') {
      rows.push(['Ticket ID', 'User Email', 'Subject', 'Category', 'Priority', 'Status', 'Created Date']);
      tickets.forEach(tk => {
        if (matchesSearchAndDate(`${tk.id} ${tk.subject} ${tk.userEmail}`, tk.createdAt)) {
          rows.push([tk.id, tk.userEmail, tk.subject, tk.category, tk.priority, tk.status, tk.createdAt]);
        }
      });
    } else if (reportType === 'package_activations') {
      rows.push(['Package ID', 'User ID', 'Package Name', 'Type', 'Amount', 'ROI Rate', 'Days', 'Status', 'Activated Date']);
      packages.forEach(p => {
        if (matchesSearchAndDate(`${p.id} ${p.packageName}`, p.activatedAt)) {
          rows.push([p.id, p.userId, p.packageName, p.packageType, p.amount.toString(), p.roiDailyRate.toString(), p.durationDays.toString(), p.status, p.activatedAt]);
        }
      });
    } else {
      rows.push(['User ID', 'Name', 'Referral Code', 'Sponsor ID', 'Joined Date']);
      users.forEach(u => {
        if (matchesSearchAndDate(`${u.name} ${u.referralCode} ${u.sponsorId}`, u.createdAt)) {
          rows.push([u.uid, u.name, u.referralCode, u.sponsorId || 'None', u.createdAt]);
        }
      });
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-teal-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Executive Compliance Reports & Exports</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real data summaries generated directly from PostgreSQL and immutable financial ledger records.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0f1d44] hover:bg-[#15275c] border border-blue-500/30 text-xs font-semibold text-cyan-300 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0e173a] hover:bg-[#142250] border border-blue-500/30 text-xs font-semibold text-slate-300 transition-colors"
          >
            <Printer className="w-3.5 h-3.5 text-slate-400" />
            <span>Print Report</span>
          </button>

          <button
            onClick={loadData}
            disabled={loading}
            className="p-1.5 rounded-xl bg-[#0e173a] hover:bg-[#142250] border border-blue-500/30 text-cyan-400 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Report Switcher Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          { id: 'daily_registration', label: 'User Registration', icon: Users },
          { id: 'kyc_summary', label: 'KYC Summary', icon: ShieldCheck },
          { id: 'tickets_summary', label: 'Ticket Summary', icon: Clock },
          { id: 'package_activations', label: 'Package Activations', icon: Package },
          { id: 'ledger_summary', label: 'Ledger Audit', icon: FileSpreadsheet },
          { id: 'user_referral_summary', label: 'Referral Summary', icon: TrendingUp }
        ].map(item => {
          const Icon = item.icon;
          const isActive = reportType === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setReportType(item.id as any)}
              className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1.5 ${
                isActive
                  ? 'bg-gradient-to-r from-blue-600/30 to-cyan-600/30 border-cyan-400 text-white shadow-md'
                  : 'bg-[#091129] border-blue-500/20 text-slate-400 hover:text-white hover:bg-[#0d1636]'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
              <span className="text-xs font-bold leading-tight">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Filter and Date Bar */}
      <div className="p-4 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-lg flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search report entries..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl bg-[#060b1c] border border-blue-500/30 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
          />
        </div>

        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-cyan-400 shrink-0" />
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-xl bg-[#060b1c] border border-blue-500/30 text-white focus:outline-none focus:border-cyan-400"
          />
          {dateFilter && (
            <button
              onClick={() => setDateFilter('')}
              className="text-xs text-rose-400 hover:text-rose-300 font-semibold px-2"
            >
              Clear Date
            </button>
          )}
        </div>
      </div>

      {/* Rendered Table Content */}
      <div className="rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
            <span className="text-xs">Computing report from live records...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {reportType === 'daily_registration' && (
              <table className="w-full text-left text-xs">
                <thead className="bg-[#060b1c] border-b border-blue-500/20 text-slate-400 uppercase font-mono text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Member Name</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Member Code</th>
                    <th className="py-3 px-4">Sponsor ID</th>
                    <th className="py-3 px-4">Account Status</th>
                    <th className="py-3 px-4">Registration Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-500/10">
                  {users
                    .filter(u => matchesSearchAndDate(`${u.name} ${u.email} ${u.referralCode}`, u.createdAt))
                    .map(u => (
                      <tr key={u.uid} className="hover:bg-[#0e173a]/50">
                        <td className="py-3 px-4 font-bold text-white">{u.name}</td>
                        <td className="py-3 px-4 text-slate-400">{u.email}</td>
                        <td className="py-3 px-4 font-mono font-bold text-cyan-400">{u.referralCode}</td>
                        <td className="py-3 px-4 font-mono text-slate-300">{u.sponsorId || '—'}</td>
                        <td className="py-3 px-4 capitalize font-semibold text-emerald-400">{u.status || 'active'}</td>
                        <td className="py-3 px-4 font-mono text-slate-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}

            {reportType === 'ledger_summary' && (
              <table className="w-full text-left text-xs">
                <thead className="bg-[#060b1c] border-b border-blue-500/20 text-slate-400 uppercase font-mono text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Txn ID</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Target Wallet</th>
                    <th className="py-3 px-4">Flow</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-500/10">
                  {transactions
                    .filter(t => matchesSearchAndDate(`${t.id} ${t.description} ${t.type}`, t.createdAt))
                    .map(t => (
                      <tr key={t.id} className="hover:bg-[#0e173a]/50">
                        <td className="py-3 px-4 font-mono text-cyan-400 font-bold">{t.id}</td>
                        <td className="py-3 px-4 capitalize text-white">{t.type.replace(/_/g, ' ')}</td>
                        <td className="py-3 px-4 text-slate-400">{t.category === 'fund_wallet' ? 'Available Fund' : 'Available Balance'}</td>
                        <td className="py-3 px-4">
                          <span className={`font-mono font-bold ${t.flow === 'credit' ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {t.flow.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-white">₹{t.amount.toFixed(2)}</td>
                        <td className="py-3 px-4 capitalize text-cyan-300 font-semibold">{t.status}</td>
                        <td className="py-3 px-4 text-slate-400 truncate max-w-xs">{t.description}</td>
                        <td className="py-3 px-4 font-mono text-slate-400">{new Date(t.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}

            {reportType === 'kyc_summary' && (
              <table className="w-full text-left text-xs">
                <thead className="bg-[#060b1c] border-b border-blue-500/20 text-slate-400 uppercase font-mono text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Applicant Legal Name</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Document Type</th>
                    <th className="py-3 px-4">Last 4</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Submission Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-500/10">
                  {kycList
                    .filter(k => matchesSearchAndDate(`${k.legalName} ${k.userEmail}`, k.createdAt))
                    .map(k => (
                      <tr key={k.id} className="hover:bg-[#0e173a]/50">
                        <td className="py-3 px-4 font-bold text-white">{k.legalName}</td>
                        <td className="py-3 px-4 text-slate-400">{k.userEmail}</td>
                        <td className="py-3 px-4 font-mono uppercase text-cyan-300">{k.documentType}</td>
                        <td className="py-3 px-4 font-mono text-slate-300">•••• {k.documentLast4}</td>
                        <td className="py-3 px-4 capitalize font-semibold text-emerald-400">{k.status}</td>
                        <td className="py-3 px-4 font-mono text-slate-400">{new Date(k.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}

            {reportType === 'tickets_summary' && (
              <table className="w-full text-left text-xs">
                <thead className="bg-[#060b1c] border-b border-blue-500/20 text-slate-400 uppercase font-mono text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Ticket ID</th>
                    <th className="py-3 px-4">User Email</th>
                    <th className="py-3 px-4">Subject</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Priority</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Created Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-500/10">
                  {tickets
                    .filter(tk => matchesSearchAndDate(`${tk.id} ${tk.subject} ${tk.userEmail}`, tk.createdAt))
                    .map(tk => (
                      <tr key={tk.id} className="hover:bg-[#0e173a]/50">
                        <td className="py-3 px-4 font-mono text-cyan-400 font-bold">#{tk.id.slice(0, 8)}</td>
                        <td className="py-3 px-4 text-slate-400">{tk.userEmail}</td>
                        <td className="py-3 px-4 font-bold text-white">{tk.subject}</td>
                        <td className="py-3 px-4 capitalize text-slate-300">{tk.category}</td>
                        <td className="py-3 px-4 uppercase font-mono text-[10px] text-amber-400">{tk.priority}</td>
                        <td className="py-3 px-4 capitalize text-cyan-300 font-semibold">{tk.status}</td>
                        <td className="py-3 px-4 font-mono text-slate-400">{new Date(tk.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}

            {reportType === 'package_activations' && (
              <table className="w-full text-left text-xs">
                <thead className="bg-[#060b1c] border-b border-blue-500/20 text-slate-400 uppercase font-mono text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Package ID</th>
                    <th className="py-3 px-4">Package Name</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Capital Amount</th>
                    <th className="py-3 px-4">ROI Daily Rate</th>
                    <th className="py-3 px-4">Term</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Activated Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-500/10">
                  {packages
                    .filter(p => matchesSearchAndDate(`${p.id} ${p.packageName}`, p.activatedAt))
                    .map(p => (
                      <tr key={p.id} className="hover:bg-[#0e173a]/50">
                        <td className="py-3 px-4 font-mono text-cyan-400 font-bold">{p.id}</td>
                        <td className="py-3 px-4 font-bold text-white">{p.packageName}</td>
                        <td className="py-3 px-4 uppercase font-mono text-cyan-300">{p.packageType}</td>
                        <td className="py-3 px-4 font-mono font-bold text-emerald-400">₹{p.amount.toFixed(2)}</td>
                        <td className="py-3 px-4 font-mono text-slate-300">{p.roiDailyRate}%</td>
                        <td className="py-3 px-4 font-mono text-slate-400">{p.durationDays} days</td>
                        <td className="py-3 px-4 capitalize text-cyan-300 font-semibold">{p.status}</td>
                        <td className="py-3 px-4 font-mono text-slate-400">{new Date(p.activatedAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}

            {reportType === 'user_referral_summary' && (
              <table className="w-full text-left text-xs">
                <thead className="bg-[#060b1c] border-b border-blue-500/20 text-slate-400 uppercase font-mono text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Member Name</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Referral Code</th>
                    <th className="py-3 px-4">Sponsor Code</th>
                    <th className="py-3 px-4">Total Downline Count</th>
                    <th className="py-3 px-4">Joined Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-500/10">
                  {users
                    .filter(u => matchesSearchAndDate(`${u.name} ${u.referralCode} ${u.sponsorId}`, u.createdAt))
                    .map(u => {
                      const directCount = users.filter(sub => sub.sponsorId === u.referralCode).length;
                      return (
                        <tr key={u.uid} className="hover:bg-[#0e173a]/50">
                          <td className="py-3 px-4 font-bold text-white">{u.name}</td>
                          <td className="py-3 px-4 text-slate-400">{u.email}</td>
                          <td className="py-3 px-4 font-mono font-bold text-cyan-400">{u.referralCode}</td>
                          <td className="py-3 px-4 font-mono text-slate-300">{u.sponsorId || '—'}</td>
                          <td className="py-3 px-4 font-mono font-bold text-emerald-400">{directCount} Direct</td>
                          <td className="py-3 px-4 font-mono text-slate-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
