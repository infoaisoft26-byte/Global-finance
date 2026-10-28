import React, { useState, useEffect } from 'react';
import { Copy, Check, Share2, Phone, Mail, CalendarDays, UserRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { getDownlineMembers } from '../../services/financeService.ts';
import { DataTable, type Column, type PdfColumn } from '../common/DataTable.tsx';
import type { DownlineMember } from '../../types/index.ts';

export const DirectTeam: React.FC = () => {
  const { profile } = useAuth();
  const [members, setMembers] = useState<DownlineMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const referralCode = profile?.referralCode || '';
  const referralUrl = typeof window !== 'undefined' && referralCode
    ? `${window.location.origin}/register?r=${referralCode}`
    : '';

  const loadDirectTeam = async () => {
    if (!profile?.referralCode) return;
    setLoading(true);
    try {
      const data = await getDownlineMembers(profile.referralCode);
      setMembers(data.filter(m => Number(m.level) === 1));
    } catch (err) {
      console.error('Unable to load direct team:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDirectTeam();
  }, [profile?.uid, profile?.referralCode]);

  const handleCopyLink = async () => {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch (err) {
      console.error('Unable to copy referral URL:', err);
    }
  };

  const formatDate = (value: string) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-IN', { dateStyle: 'medium' });
  };

  const columns: Column<DownlineMember>[] = [
    {
      key: 'joinDate',
      header: 'Join Date',
      render: item => <span className="text-xs text-slate-600 font-mono">{formatDate(item.joinDate)}</span>
    },
    {
      key: 'referralCode',
      header: 'User ID',
      render: item => <span className="font-mono text-cyan-700 text-xs font-bold">{item.referralCode}</span>
    },
    {
      key: 'name',
      header: 'Member Name',
      render: item => <span className="text-xs font-semibold text-slate-900">{item.name || '—'}</span>
    },
    {
      key: 'email',
      header: 'Email Address',
      render: item => <span className="text-xs text-slate-600 break-all">{item.email || '—'}</span>
    },
    {
      key: 'phone',
      header: 'Mobile No',
      render: item => item.phone
        ? <a href={`tel:${item.phone}`} className="text-xs text-blue-700 font-mono underline underline-offset-2">{item.phone}</a>
        : <span className="text-xs text-slate-500">Not provided</span>
    },
    {
      key: 'status',
      header: 'Status',
      render: item => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${item.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : item.status === 'suspended' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
          {item.status === 'active' ? 'Active' : 'Inactive'}
        </span>
      )
    }
  ];

  const pdfColumns: PdfColumn<DownlineMember>[] = [
    { header: 'Date', accessor: item => formatDate(item.joinDate) },
    { header: 'Id', accessor: item => item.referralCode },
    { header: 'Name', accessor: item => item.name },
    { header: 'Mobile', accessor: item => item.phone || '' },
    { header: 'Email', accessor: item => item.email || '' },
    { header: 'DOA', accessor: item => formatDate(item.joinDate) },
    { header: 'Activation', accessor: item => item.status === 'active' ? 'Active' : 'Inactive' }
  ];

  return (
    <div className="space-y-5">
      <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-700">Downline Network · Level 1</span>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-1">Direct Team</h2>
          <p className="text-sm text-slate-600 mt-1">Only members registered directly with your referral ID <strong>{referralCode || '—'}</strong>.</p>
        </div>
        <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 w-full sm:w-auto sm:min-w-40 sm:text-right">
          <span className="text-xs text-slate-600">Total Direct Members</span>
          <div className="text-2xl font-extrabold text-blue-800 tabular-nums">{members.length}</div>
        </div>
      </div>

      {referralUrl && <div className="p-4 rounded-xl bg-white border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-700">Your direct referral link</div>
          <div className="text-xs font-mono text-blue-700 break-all mt-1">{referralUrl}</div>
        </div>
        <button onClick={handleCopyLink} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs shrink-0">
          {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copiedLink ? 'Copied!' : 'Copy Link'}
        </button>
      </div>}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-900">Direct Member Details</h3>
          <span className="text-xs text-slate-500">Level 1 only</span>
        </div>

        {/* Mobile-first cards keep each member's phone number visible without horizontal table scrolling. */}
        <div className="md:hidden space-y-3">
          {loading && <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading direct team…</div>}
          {!loading && members.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">No direct team members found yet.</div>}
          {members.map(item => (
            <article key={item.userId || item.id || item.referralCode} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center shrink-0"><UserRound className="w-5 h-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-900 break-words">{item.name || 'Member'}</div>
                  <div className="text-xs text-blue-700 font-mono mt-0.5">{item.referralCode || '—'}</div>
                </div>
                <span className={`text-[11px] font-semibold rounded-full px-2 py-1 capitalize ${item.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>{item.status || 'inactive'}</span>
              </div>
              <div className="grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 text-sm">
                <div className="flex items-start gap-2 text-slate-700"><Phone className="w-4 h-4 mt-0.5 text-blue-700 shrink-0" /><span className="text-xs text-slate-500 w-16 shrink-0">Mobile</span>{item.phone ? <a href={`tel:${item.phone}`} className="font-semibold text-blue-700 underline underline-offset-2 break-all">{item.phone}</a> : <span className="text-slate-500">Not provided</span>}</div>
                <div className="flex items-start gap-2 text-slate-700"><Mail className="w-4 h-4 mt-0.5 text-blue-700 shrink-0" /><span className="text-xs text-slate-500 w-16 shrink-0">Email</span><span className="break-all text-xs">{item.email || 'Not provided'}</span></div>
                <div className="flex items-start gap-2 text-slate-700"><CalendarDays className="w-4 h-4 mt-0.5 text-blue-700 shrink-0" /><span className="text-xs text-slate-500 w-16 shrink-0">Joined</span><span className="text-xs">{formatDate(item.joinDate)}</span></div>
              </div>
            </article>
          ))}
        </div>

        <div className="hidden md:block">
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
      </section>
    </div>
  );
};
