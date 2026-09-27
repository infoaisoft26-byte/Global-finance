import React, { useEffect, useMemo, useState } from 'react';
import { Users, Search, RefreshCw, Network, Package, Wallet, ChevronDown, ChevronRight, Eye, Coins, Plus, Minus } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext.tsx';

interface AdminUsersProps { onSelectUser: (userId: string) => void; }

type Member = {
  id: string; name: string; email: string; phone: string; referralCode: string; sponsorId: string;
  role: string; status: string; kycStatus: string; createdAt: string; directCount: number; totalDownline: number;
  fundWallet: number; incomeWallet: number; activePackageAmount: number; activePackageCount: number;
  latestPackageName: string; referralIncome: number; levelIncome: number; totalCredited: number; tokenBalance: number;
};
type Summary = { totalMembers:number; totalDirectLinks:number; totalActivePackageAmount:number; totalReferralIncome:number; totalLevelIncome:number; totalTokens:number };

export const AdminUsers: React.FC<AdminUsersProps> = ({ onSelectUser }) => {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string>('');
  const [status, setStatus] = useState('all');
  const [kyc, setKyc] = useState('all');
  const [tokenAmount, setTokenAmount] = useState<Record<string,string>>({});
  const [tokenReason, setTokenReason] = useState<Record<string,string>>({});
  const [tokenBusy, setTokenBusy] = useState('');

  const money = (n:number) => `₹${Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;

  const load = async (silent=false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    setError('');
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin-network', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data.error || 'Unable to load users');
      setMembers(data.members || []); setSummary(data.summary || null);
    } catch (e:any) { setError(e?.message || 'Unable to load users'); }
    finally { if (!silent) setLoading(false); }
  };

  useEffect(()=>{ load(); },[user?.uid]);

  const adjustToken = async (member:Member, flow:'credit'|'debit') => {
    if (!user) return;
    const amount = Number(tokenAmount[member.id] || 0);
    const reason = String(tokenReason[member.id] || '').trim();
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter a valid token amount.'); return; }
    if (!reason) { setError('Reason is required for manual token changes.'); return; }
    setTokenBusy(member.id); setError(''); setMessage('');
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin-token', {
        method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
        body:JSON.stringify({ userId:member.id, flow, amount, reason })
      });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data.error || 'Token update failed');
      setMembers(prev=>prev.map(m=>m.id===member.id?{...m,tokenBalance:Number(data.tokenBalance||0)}:m));
      setTokenAmount(prev=>({...prev,[member.id]:''}));
      setTokenReason(prev=>({...prev,[member.id]:''}));
      setMessage(`${amount} GF Token ${flow==='credit'?'credited to':'removed from'} ${member.name}.`);
      load(true);
    } catch(e:any){ setError(e?.message || 'Token update failed'); }
    finally { setTokenBusy(''); }
  };

  const sponsorByCode = useMemo(()=>new Map(members.map(m=>[m.referralCode,m])),[members]);
  const filtered = useMemo(()=>members.filter(m=>{
    if (status !== 'all' && m.status !== status) return false;
    if (kyc !== 'all' && m.kycStatus !== kyc) return false;
    const q=search.trim().toLowerCase();
    if (!q) return true;
    return [m.name,m.email,m.phone,m.referralCode,m.sponsorId,m.latestPackageName].some(v=>String(v||'').toLowerCase().includes(q));
  }),[members,search,status,kyc]);

  return <div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div><div className="flex items-center gap-2"><Users className="w-5 h-5 text-cyan-400"/><h2 className="text-xl font-bold text-white">Users, Referral & Token Control</h2></div><p className="text-xs text-slate-400 mt-1">User details, sponsor/downline, packages, wallets and audited manual GF Token credit/removal.</p></div>
      <button onClick={()=>load()} disabled={loading} className="px-3 py-2 rounded-xl bg-[#0e173a] border border-blue-500/30 text-xs font-semibold text-white flex items-center gap-2"><RefreshCw className={`w-4 h-4 text-cyan-400 ${loading?'animate-spin':''}`}/>Refresh</button>
    </div>

    {message && <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-950/30 text-emerald-300 text-xs">{message}</div>}
    {error && <div className="p-3 rounded-xl border border-rose-500/40 bg-rose-950/30 text-rose-300 text-xs">{error}</div>}

    <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
      {[
        ['Members',summary?.totalMembers||0,Users],['Referral Links',summary?.totalDirectLinks||0,Network],['Active Packages',money(summary?.totalActivePackageAmount||0),Package],['Referral Income',money(summary?.totalReferralIncome||0),Wallet],['Level Income',money(summary?.totalLevelIncome||0),Wallet],['GF Tokens',Number(summary?.totalTokens||0).toLocaleString('en-IN'),Coins]
      ].map(([label,value,Icon]:any)=><div key={label} className="p-4 rounded-2xl bg-[#091129] border border-blue-500/20"><Icon className="w-4 h-4 text-cyan-400 mb-2"/><div className="text-[10px] uppercase text-slate-500">{label}</div><div className="text-lg font-bold text-white mt-1">{value}</div></div>)}
    </div>

    <div className="p-4 rounded-2xl bg-[#091129] border border-blue-500/20 grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3">
      <div className="relative"><Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, email, phone, GF code, sponsor, package..." className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/30 text-xs text-white outline-none focus:border-cyan-400"/></div>
      <select value={status} onChange={e=>setStatus(e.target.value)} className="px-3 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/30 text-xs text-white"><option value="all">All status</option><option value="active">Active</option><option value="suspended">Suspended</option></select>
      <select value={kyc} onChange={e=>setKyc(e.target.value)} className="px-3 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/30 text-xs text-white"><option value="all">All KYC</option><option value="verified">Verified</option><option value="pending">Pending</option><option value="unverified">Unverified</option><option value="rejected">Rejected</option></select>
    </div>

    <div className="rounded-2xl bg-[#091129] border border-blue-500/25 overflow-hidden shadow-xl">
      {loading ? <div className="py-14 text-center text-slate-400 text-xs"><RefreshCw className="w-6 h-6 animate-spin mx-auto text-cyan-400 mb-2"/>Loading users...</div> : filtered.length===0 ? <div className="py-14 text-center text-slate-500 text-xs">No matching members found.</div> :
      <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-[#060b1c] text-[10px] uppercase text-slate-400"><tr><th className="px-4 py-3 text-left">Member / Sponsor</th><th className="px-4 py-3 text-left">Team</th><th className="px-4 py-3 text-left">Package</th><th className="px-4 py-3 text-left">Token</th><th className="px-4 py-3 text-left">Wallet</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-blue-500/10">
      {filtered.map(m=>{const sponsor=sponsorByCode.get(m.sponsorId);const open=expanded===m.id;return <React.Fragment key={m.id}><tr className="hover:bg-[#0e173a]/50"><td className="px-4 py-3 cursor-pointer" onClick={()=>setExpanded(open?'':m.id)}><div className="flex items-start gap-2">{open?<ChevronDown className="w-3.5 h-3.5 mt-0.5 text-cyan-400"/>:<ChevronRight className="w-3.5 h-3.5 mt-0.5 text-slate-500"/>}<div><div className="font-bold text-white">{m.name}</div><div className="text-slate-500">{m.email}</div><div className="font-mono text-cyan-400">{m.referralCode}</div><div className="text-[10px] text-slate-500 mt-1">Referred by: <span className="text-slate-300">{sponsor?`${sponsor.name} (${m.sponsorId})`:(m.sponsorId||'—')}</span></div></div></div></td><td className="px-4 py-3"><div className="text-white">Direct: <b>{m.directCount}</b></div><div className="text-cyan-400">Total: <b>{m.totalDownline}</b></div></td><td className="px-4 py-3"><div className="text-white font-semibold">{m.latestPackageName||'No active package'}</div><div className="text-slate-400">{m.activePackageCount} active • {money(m.activePackageAmount)}</div></td><td className="px-4 py-3"><div className="font-mono text-amber-300 font-bold">{Number(m.tokenBalance||0).toLocaleString('en-IN')} GF</div><div className="text-[10px] text-slate-500">Manual token ledger</div></td><td className="px-4 py-3"><div className="text-slate-300">Fund {money(m.fundWallet)}</div><div className="text-slate-300">Income {money(m.incomeWallet)}</div></td><td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${m.status==='active'?'bg-emerald-500/15 text-emerald-400':'bg-rose-500/15 text-rose-400'}`}>{m.status}</span><div className="text-[10px] text-slate-500 mt-1">KYC: {m.kycStatus}</div></td><td className="px-4 py-3 text-right"><button onClick={()=>onSelectUser(m.id)} className="px-2.5 py-1.5 rounded-lg bg-blue-600/25 border border-cyan-500/30 text-cyan-300 inline-flex items-center gap-1"><Eye className="w-3 h-3"/>Details</button></td></tr>{open&&<tr><td colSpan={7} className="px-6 py-4 bg-[#060b1c]/70"><div className="grid grid-cols-1 xl:grid-cols-[1fr_1.2fr] gap-4"><div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]"><div><span className="text-slate-500">Phone</span><div className="text-white">{m.phone||'—'}</div></div><div><span className="text-slate-500">Joined</span><div className="text-white">{new Date(m.createdAt).toLocaleString('en-IN')}</div></div><div><span className="text-slate-500">Total credited</span><div className="text-emerald-400 font-mono">{money(m.totalCredited)}</div></div><div><span className="text-slate-500">UID</span><div className="text-white font-mono break-all">{m.id}</div></div></div><div className="p-3 rounded-xl border border-amber-500/20 bg-amber-950/10"><div className="flex items-center justify-between mb-2"><div className="text-xs font-bold text-amber-300 flex items-center gap-2"><Coins className="w-4 h-4"/>Manual GF Token Control</div><div className="font-mono text-white font-bold">{Number(m.tokenBalance||0).toLocaleString('en-IN')} GF</div></div><div className="grid grid-cols-1 md:grid-cols-[120px_1fr_auto_auto] gap-2"><input type="number" min="0.0001" step="0.0001" value={tokenAmount[m.id]||''} onChange={e=>setTokenAmount(p=>({...p,[m.id]:e.target.value}))} placeholder="Amount" className="px-3 py-2 rounded-lg bg-[#091129] border border-blue-500/30 text-white text-xs"/><input value={tokenReason[m.id]||''} onChange={e=>setTokenReason(p=>({...p,[m.id]:e.target.value}))} placeholder="Reason e.g. loss compensation" className="px-3 py-2 rounded-lg bg-[#091129] border border-blue-500/30 text-white text-xs"/><button disabled={tokenBusy===m.id} onClick={()=>adjustToken(m,'credit')} className="px-3 py-2 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50"><Plus className="w-3.5 h-3.5"/>Give</button><button disabled={tokenBusy===m.id} onClick={()=>adjustToken(m,'debit')} className="px-3 py-2 rounded-lg bg-rose-600/20 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50"><Minus className="w-3.5 h-3.5"/>Remove</button></div><div className="text-[10px] text-slate-500 mt-2">GF Token is tracked separately from Fund/Income wallets. Every manual credit/removal is written to the audit ledger.</div></div></div></td></tr>}</React.Fragment>})}
      </tbody></table></div>}
    </div>
  </div>;
};
