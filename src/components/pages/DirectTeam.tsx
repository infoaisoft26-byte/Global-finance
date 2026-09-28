import React, { useState, useEffect } from 'react';
import { Copy, Check, Share2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { getDownlineMembers } from '../../services/financeService.ts';
import { DataTable, type Column, type PdfColumn } from '../common/DataTable.tsx';
import type { DownlineMember } from '../../types/index.ts';

export const DirectTeam: React.FC = () => {
  const { profile, wallet } = useAuth();
  const [members, setMembers] = useState<DownlineMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const referralCode = profile?.referralCode || 'GF152551';
  const referralUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/register?r=${referralCode}`
    : `https://globalfinance.digital/register?r=${referralCode}`;

  const loadDirectTeam = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const data = await getDownlineMembers(profile.referralCode);
      setMembers(data.filter(m => m.level === 1));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDirectTeam();
  }, [profile?.referralCode]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const formatDate = (value: string) => new Date(value).toLocaleDateString('en-IN', { dateStyle: 'medium' });

  const columns: Column<DownlineMember>[] = [
    {
      key: 'joinDate',
      header: 'Join Date',
      render: item => <span className="text-xs text-slate-300 font-mono">{formatDate(item.joinDate)}</span>
    },
    {
      key: 'referralCode',
      header: 'User ID',
      render: item => <span className="font-mono text-cyan-400 text-xs font-bold">{item.referralCode}</span>
    },
    {
      key: 'name',
      header: 'Member Name',
      render: item => <span className="text-xs font-semibold text-white">{item.name}</span>
    },
    {
      key: 'email',
      header: 'Email Address',
      render: item => <span className="text-xs text-slate-300">{item.email}</span>
    },
    {
      key: 'phone',
      header: 'Mobile No',
      render: item => <span className="text-xs text-slate-400 font-mono">{item.phone || '—'}</span>
    },
    {
      key: 'status',
      header: 'Status',
      render: () => (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">ACTIVE</span>
      )
    }
  ];

  const pdfColumns: PdfColumn<DownlineMember>[] = [
    { header: 'Date', accessor: item => formatDate(item.joinDate) },
    { header: 'Id', accessor: item => item.referralCode },
    { header: 'Name', accessor: item => item.name },
    { header: 'Mobile', accessor: item => item.phone || '' },
    { header: 'DOA', accessor: item => formatDate(item.joinDate) },
    { header: 'Activation', accessor: item => item.status === 'active' ? 'Active' : 'Inactive' }
  ];

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl bg-[#091129]/90 border border-blue-500/30 shadow-xl backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Downline Network</span>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight mt-0.5">Direct Team</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">Members registered directly under your referral code {referralCode}.</p>
        </div>
        <div className="p-4 rounded-xl bg-[#0e173a] border border-blue-500/30 text-right">
          <span className="text-xs text-slate-400">Total Direct Affiliates</span>
          <div className="text-xl sm:text-2xl font-extrabold text-cyan-400 font-mono tabular-nums">{wallet?.directTeamCount ?? members.length}</div>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-[#091129]/90 border border-cyan-500/25 shadow-lg backdrop-blur-md flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shrink-0"><Share2 className="w-4 h-4" /></div>
          <div>
            <div className="text-xs font-medium text-slate-300">Invite new members using your direct link:</div>
            <div className="text-xs font-mono text-cyan-400 truncate max-w-sm sm:max-w-md">{referralUrl}</div>
          </div>
        </div>
        <button onClick={handleCopyLink} className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-semibold text-xs transition-colors shrink-0 shadow-sm">
          {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copiedLink ? 'Copied Link!' : 'Copy Referral URL'}</span>
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400">Direct Members Directory</h3>
          <span className="text-xs text-slate-500">Level 1 team</span>
        </div>
        <DataTable
          title="Direct Team"
          columns={columns}
          pdfColumns={pdfColumns}
          data={members}
          onRefresh={loadDirectTeam}
          isLoading={loading}
          emptyMessage="No direct team members found. Share your referral link above to grow your network!"
        />
      </div>
    </div>
  );
};
