import React, { useState, useEffect } from 'react';
import { Users, Package } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { getDownlineMembers } from '../../services/financeService.ts';
import { DataTable, type Column, type PdfColumn } from '../common/DataTable.tsx';
import type { DownlineMember } from '../../types/index.ts';

export const TeamList: React.FC = () => {
  const { profile, wallet } = useAuth();
  const [allMembers, setAllMembers] = useState<DownlineMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [levelFilter, setLevelFilter] = useState('all');

  const filteredMembers = allMembers.filter(member => {
    const statusMatches = statusFilter === 'all' || (statusFilter === 'active' ? member.status === 'active' : member.status !== 'active');
    const levelMatches = levelFilter === 'all' || Number(member.level) === Number(levelFilter);
    return statusMatches && levelMatches;
  });

  const loadTeamList = async () => {
    if (!profile) return;
    setLoading(true);
    setError('');
    try {
      setAllMembers(await getDownlineMembers(profile.referralCode));
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Unable to load downline.');
    } finally {
      setLoading(false);
    }
  };

  // Load once when the Team List opens. Further updates happen only when
  // the member clicks the table's manual Refresh control.
  useEffect(() => {
    loadTeamList();
  }, [profile?.uid, profile?.referralCode]);


  const formatDate = (value: string) => new Date(value).toLocaleDateString('en-IN', { dateStyle: 'medium' });

  const columns: Column<DownlineMember>[] = [
    {
      key: 'level',
      header: 'Generation Level',
      render: item => <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-blue-500/15 text-cyan-300 border border-blue-500/30">Level {item.level}</span>
    },
    {
      key: 'referralCode',
      header: 'Member ID',
      render: item => <span className="font-mono text-cyan-400 text-xs font-bold">{item.referralCode}</span>
    },
    {
      key: 'sponsorId',
      header: 'Sponsor Code',
      render: item => <span className="font-mono text-slate-300 text-xs">{item.sponsorId || '—'}</span>
    },
    {
      key: 'name',
      header: 'Member Name',
      render: item => <span className="text-xs font-semibold text-white">{item.name || '—'}</span>
    },
    {
      key: 'email',
      header: 'Email Address',
      render: item => <span className="text-xs text-slate-300 break-all">{item.email || 'Not provided'}</span>
    },
    {
      key: 'phone',
      header: 'Mobile No',
      render: item => item.phone ? <a href={`tel:${item.phone}`} className="text-xs text-cyan-300 underline underline-offset-2">{item.phone}</a> : <span className="text-xs text-slate-500">Not provided</span>
    },
    {
      key: 'joinDate',
      header: 'Registered On',
      render: item => <span className="text-xs text-slate-400 font-mono">{formatDate(item.joinDate)}</span>
    },
    {
      key: 'status',
      header: 'Network Status',
      render: item => <span className="inline-flex w-fit items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{item.status.toUpperCase()}</span>
    },
    {
      key: 'packageName',
      header: 'Package',
      render: item => <span className="inline-flex items-center gap-1 text-xs font-semibold text-white"><Package className="w-3 h-3 text-cyan-400" />{item.packageName || 'No Package'}</span>
    },
    {
      key: 'activePackage',
      header: 'Total Package Purchase (USDT)',
      render: item => <span className="text-xs font-bold text-cyan-300">USDT {Number(item.activePackage || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    },
    {
      key: 'packageStatus',
      header: 'Package Status',
      render: item => <span className="text-xs text-slate-300">{item.packageStatus || 'No Purchase'}</span>
    }
  ];

  const pdfColumns: PdfColumn<DownlineMember>[] = [
    { header: 'Date', accessor: item => formatDate(item.joinDate) },
    { header: 'Id', accessor: item => item.referralCode },
    { header: 'Name', accessor: item => item.name },
    { header: 'Email', accessor: item => item.email || '' },
    { header: 'Mobile', accessor: item => item.phone || '' },
    { header: 'Referral Id', accessor: item => item.sponsorId || '' },
    { header: 'Level', accessor: item => item.level },
    { header: 'DOA', accessor: item => formatDate(item.joinDate) },
    { header: 'Activation', accessor: item => item.status === 'active' ? 'Active' : 'Inactive' },
    { header: 'Package', accessor: item => item.packageName || 'No Package' },
    { header: 'Total Package Purchase (USDT)', accessor: item => 'USDT ' + Number(item.activePackage || 0).toFixed(2) },
    { header: 'Package Status', accessor: item => item.packageStatus || 'No Purchase' }
  ];

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl bg-[#091129]/90 border border-blue-500/30 shadow-xl backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Downline Network</span>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight mt-0.5">Team List (All Generations)</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">Explore complete generational multi-tier downline structure and affiliate network.</p>
        </div>
        <div className="p-4 rounded-xl bg-[#0e173a] border border-blue-500/30 text-right">
          <span className="text-xs text-slate-400">Total Network Size</span>
          <div className="text-xl sm:text-2xl font-extrabold text-cyan-400 font-mono tabular-nums">{wallet?.totalTeamCount ?? allMembers.length}</div>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-[#091129]/90 border border-blue-500/20 flex items-center gap-3">
        <Users className="w-5 h-5 text-cyan-400" />
        <div>
          <p className="text-xs font-semibold text-slate-300">Automatic Generation Tracking</p>
          <p className="text-[11px] text-slate-500">Direct referrals appear as Level 1; their referrals automatically appear as Level 2, continuing up to Level 15.</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400">Network Members</h3>
          <span className="text-xs text-slate-500">Multilevel affiliate hierarchy</span>
        </div>
        {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-blue-500/20 bg-[#091129]/90 p-4">
          <label className="text-xs font-semibold text-slate-300 space-y-1">
            <span>Member Status</span>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')} className="w-full rounded-lg border border-blue-500/30 bg-[#0e1738] px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400">
              <option value="all">All Members</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive (including suspended)</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-300 space-y-1">
            <span>Downline Level</span>
            <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)} className="w-full rounded-lg border border-blue-500/30 bg-[#0e1738] px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400">
              <option value="all">All Levels (1–15)</option>
              {Array.from({ length: 15 }, (_, i) => i + 1).map(level => <option key={level} value={String(level)}>Level {level}</option>)}
            </select>
          </label>
          <p className="sm:col-span-2 text-xs text-slate-500">Showing {filteredMembers.length} of {allMembers.length} network members. Member details load from your registered downline records; use Refresh to reload latest data.</p>
        </div>
        <DataTable
          title="Downline Team List"
          columns={columns}
          pdfColumns={pdfColumns}
          data={filteredMembers}
          onRefresh={loadTeamList}
          isLoading={loading}
          emptyMessage="No downline team members found for your referral network."
        />
      </div>
    </div>
  );
};
