import React, { useState, useEffect, useMemo } from 'react';
import { Filter, WalletCards } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { getDownlineMembers } from '../../services/financeService.ts';
import { DataTable, type Column, type PdfColumn } from '../common/DataTable.tsx';
import type { DownlineMember } from '../../types/index.ts';

export const TeamList: React.FC = () => {
  const { profile, wallet } = useAuth();
  const [allMembers, setAllMembers] = useState<DownlineMember[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [loading, setLoading] = useState(false);

  const loadTeamList = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      setAllMembers(await getDownlineMembers(profile.referralCode));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeamList();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadTeamList();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [profile?.referralCode]);

  const filteredMembers = useMemo(() => {
    if (selectedLevel === 'all') return allMembers;
    return allMembers.filter(m => m.level === Number(selectedLevel));
  }, [allMembers, selectedLevel]);

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
      render: item => <span className="text-xs font-semibold text-white">{item.name}</span>
    },
    {
      key: 'email',
      header: 'Email',
      render: item => <span className="text-xs text-slate-300">{item.email}</span>
    },
    {
      key: 'joinDate',
      header: 'Registered On',
      render: item => <span className="text-xs text-slate-400 font-mono">{formatDate(item.joinDate)}</span>
    },
    {
      key: 'status',
      header: 'Network Status',
      render: item => <div className="flex flex-col gap-1"><span className="inline-flex w-fit items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{item.status.toUpperCase()}</span><span className="text-[10px] text-emerald-300">Commission: USDT {Number(item.commissionFromMember || 0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
    },
    {
      key: 'commissionFromMember',
      header: 'Downline Commission',
      render: item => <div className="flex items-center gap-1 text-xs font-bold text-cyan-300"><WalletCards className="w-3 h-3"/><span>USDT {Number(item.commissionFromMember || 0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</span><span className="text-[9px] text-slate-500">L{item.level}</span></div>
    }
  ];

  const pdfColumns: PdfColumn<DownlineMember>[] = [
    { header: 'Date', accessor: item => formatDate(item.joinDate) },
    { header: 'Id', accessor: item => item.referralCode },
    { header: 'Name', accessor: item => item.name },
    { header: 'Referral Id', accessor: item => item.sponsorId || '' },
    { header: 'Level', accessor: item => item.level },
    { header: 'DOA', accessor: item => formatDate(item.joinDate) },
    { header: 'Activation', accessor: item => item.status === 'active' ? 'Active' : 'Inactive' },
    { header: 'Commission', accessor: item => `USDT ${Number(item.commissionFromMember || 0).toFixed(2)} (L${item.level})` }
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

      <div className="p-4 rounded-xl bg-[#091129]/90 border border-blue-500/20 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
          <Filter className="w-4 h-4 text-cyan-400" />
          <span>Filter by Generation:</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {['all', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'].map(lvl => (
            <button
              key={lvl}
              onClick={() => setSelectedLevel(lvl)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedLevel === lvl ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold shadow-md shadow-cyan-900/30' : 'bg-[#0f173a] text-slate-400 hover:text-white border border-blue-500/20'}`}
            >
              {lvl === 'all' ? 'All Generations' : `Level ${lvl}`}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400">Network Members</h3>
          <span className="text-xs text-slate-500">Multilevel affiliate hierarchy</span>
        </div>
        <DataTable
          title="Downline Team List"
          columns={columns}
          pdfColumns={pdfColumns}
          data={filteredMembers}
          onRefresh={loadTeamList}
          isLoading={loading}
          emptyMessage="No downline team members found for this level."
        />
      </div>
    </div>
  );
};
