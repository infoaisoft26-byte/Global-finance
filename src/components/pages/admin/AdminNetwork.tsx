import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, Users, Network, Wallet, Package, IndianRupee, ChevronDown, ChevronRight } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext.tsx';

type Member = {
  id: string; name: string; email: string; phone: string; referralCode: string; sponsorId: string;
  role: string; status: string; kycStatus: string; createdAt: string; directCount: number; totalDownline: number;
  fundWallet: number; incomeWallet: number; activePackageAmount: number; activePackageCount: number;
  latestPackageName: string; referralIncome: number; levelIncome: number; totalCredited: number;
};
type Summary = { totalMembers: number; totalDirectLinks: number; totalActivePackageAmount: number; totalReferralIncome: number; totalLevelIncome: number };

export const AdminNetwork: React.FC = () => {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string>('');

  const load = async () => {
    if (!user) return;
    setLoading(true); setError('');
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin-network', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load network');
      setMembers(data.members || []); setSummary(data.summary || null);
    } catch (e: any) { setError(e?.message || 'Failed to load referral network'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [user?.uid]);

  const sponsorByCode = useMemo(() => new Map(members.map(m => [m.referralCode, m])), [members]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(m => [m.name,m.email,m.phone,m.referralCode,m.sponsorId,m.latestPackageName].some(v => String(v||'').toLowerCase().includes(q)));
  }, [members, search]);

  const money = (n:number) => `USDT ${Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:6})}`;

  return <div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <div className="flex items-center gap-2"><Network className="w-5 h-5 text-cyan-400"/><h2 className="text-xl font-bold text-white">Referral & Downline Control</h2></div>
        <p className="text-xs text-slate-400 mt-1">Real member hierarchy, sponsor mapping, package exposure and recorded referral/level income.</p>
      </div>
      <button onClick={load} disabled={loading} className="px-3 py-2 rounded-xl bg-[#0e173a] border border-blue-500/30 text-xs font-semibold text-white flex items-center gap-2"><RefreshCw className={`w-4 h-4 text-cyan-400 ${loading?'animate-spin':''}`}/>Refresh</button>
    </div>

    {error && <div className="p-3 rounded-xl border border-rose-500/40 bg-rose-950/30 text-rose-300 text-xs">{error}</div>}

    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {[
        ['Members', summary?.totalMembers||0, Users],
        ['Referral Links', summary?.totalDirectLinks||0, Network],
        ['Active Packages', money(summary?.totalActivePackageAmount||0), Package],
        ['Referral Income', money(summary?.totalReferralIncome||0), IndianRupee],
        ['Level Income', money(summary?.totalLevelIncome||0), Wallet],
      ].map(([label,value,Icon]:any)=><div key={label} className="p-4 rounded-2xl bg-[#091129] border border-blue-500/20"><Icon className="w-4 h-4 text-cyan-400 mb-2"/><div className="text-[10px] uppercase text-slate-500">{label}</div><div className="text-lg font-bold text-white mt-1">{value}</div></div>)}
    </div>

    <div className="p-4 rounded-2xl bg-[#091129] border border-blue-500/20">
      <div className="relative"><Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, email, GF code, sponsor, package..." className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/30 text-xs text-white outline-none focus:border-cyan-400"/></div>
    </div>

    <div className="rounded-2xl bg-[#091129] border border-blue-500/25 overflow-hidden shadow-xl">
      {loading ? <div className="py-16 text-center text-slate-400 text-xs"><RefreshCw className="w-6 h-6 animate-spin mx-auto text-cyan-400 mb-2"/>Loading real network data...</div> :
      <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-[#060b1c] text-[10px] uppercase text-slate-400"><tr>
        <th className="px-4 py-3 text-left">Member / Sponsor</th><th className="px-4 py-3 text-left">Team</th><th className="px-4 py-3 text-left">Package</th><th className="px-4 py-3 text-left">Referral Income</th><th className="px-4 py-3 text-left">Level Income</th><th className="px-4 py-3 text-left">Wallet</th><th className="px-4 py-3 text-left">Status</th>
      </tr></thead><tbody className="divide-y divide-blue-500/10">
        {filtered.map(m => { const sponsor=sponsorByCode.get(m.sponsorId); const open=expanded===m.id; return <React.Fragment key={m.id}>
          <tr className="hover:bg-[#0e173a]/50 cursor-pointer" onClick={()=>setExpanded(open?'':m.id)}>
            <td className="px-4 py-3"><div className="flex items-start gap-2">{open?<ChevronDown className="w-3.5 h-3.5 mt-0.5 text-cyan-400"/>:<ChevronRight className="w-3.5 h-3.5 mt-0.5 text-slate-500"/>}<div><div className="font-bold text-white">{m.name}</div><div className="text-slate-500">{m.email}</div><div className="font-mono text-cyan-400">{m.referralCode}</div><div className="text-[10px] text-slate-500 mt-1">Sponsor: <span className="text-slate-300">{sponsor ? `${sponsor.name} (${m.sponsorId})` : (m.sponsorId||'—')}</span></div></div></div></td>
            <td className="px-4 py-3"><div className="text-white font-semibold">Direct: {m.directCount}</div><div className="text-cyan-400">Total: {m.totalDownline}</div></td>
            <td className="px-4 py-3"><div className="text-white font-semibold">{m.latestPackageName||'No active package'}</div><div className="text-slate-400">{m.activePackageCount} active • {money(m.activePackageAmount)}</div></td>
            <td className="px-4 py-3 font-mono text-emerald-400 font-bold">{money(m.referralIncome)}</td>
            <td className="px-4 py-3 font-mono text-cyan-400 font-bold">{money(m.levelIncome)}</td>
            <td className="px-4 py-3"><div className="text-slate-300">Fund {money(m.fundWallet)}</div><div className="text-slate-300">Income {money(m.incomeWallet)}</div></td>
            <td className="px-4 py-3"><div className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${m.status==='active'?'bg-emerald-500/15 text-emerald-400':'bg-rose-500/15 text-rose-400'}`}>{m.status}</div><div className="text-[10px] text-slate-500 mt-1">KYC: {m.kycStatus}</div></td>
          </tr>
          {open && <tr><td colSpan={7} className="px-8 py-3 bg-[#060b1c]/70"><div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]"><div><span className="text-slate-500">Phone</span><div className="text-white">{m.phone||'—'}</div></div><div><span className="text-slate-500">Joined</span><div className="text-white">{new Date(m.createdAt).toLocaleString('en-IN')}</div></div><div><span className="text-slate-500">Total credited</span><div className="text-emerald-400 font-mono">{money(m.totalCredited)}</div></div><div><span className="text-slate-500">Member ID</span><div className="text-white font-mono break-all">{m.id}</div></div></div></td></tr>}
        </React.Fragment>})}
      </tbody></table></div>}
    </div>

    <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/20 text-[11px] text-amber-200/80">Referral and level income shown here is calculated only from actual completed ledger entries. No percentage or commission is assumed by the dashboard.</div>
  </div>;
};
