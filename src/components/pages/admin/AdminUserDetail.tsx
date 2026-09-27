import React, { useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw, ShieldCheck, Wallet, Package, History, KeyRound, CheckCircle2, AlertCircle, UserRound, Users, Ban, PlayCircle } from 'lucide-react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../../lib/firebase.ts';
import { useAuth } from '../../../context/AuthContext.tsx';

interface AdminUserDetailProps { userId: string; onBack: () => void; }

type Detail = {
  profile: { id:string; uid:string; email:string; name:string; phone:string; referralCode:string; sponsorId:string; role:string; status:string; kycStatus:string; createdAt:string; updatedAt:string };
  wallet: { fundWallet:number; incomeWallet:number; totalIncome:number; totalWithdrawal:number; basicPackageActive:number; fdPackageActive:number; directTeamCount:number; totalTeamCount:number };
  ledger: { totalCredits:number; totalDebits:number; entryCount:number };
  packages: Array<{ id:string; packageId:string; packageType:string; packageName:string; amount:number; roiDailyRate:number; durationDays:number; totalEarned:number; status:string; activatedAt:string|null; expiresAt:string|null }>;
  transactions: Array<{ id:string; type:string; category:string; flow:string; amount:number; fee:number; netAmount:number; description:string; referenceId:string; status:string; createdAt:string }>;
  kycSubmissions: Array<{ id:string; legalName:string; documentType:string; documentLast4:string; status:string; adminNotes:string; reviewedBy:string; reviewedAt:string|null; createdAt:string }>;
};

export const AdminUserDetail: React.FC<AdminUserDetailProps> = ({ userId, onBack }) => {
  const { user: admin } = useAuth();
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const money = (n:number) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 });

  const request = async (method:'GET'|'PATCH', body?:Record<string,unknown>) => {
    if (!admin) throw new Error('Admin session unavailable');
    const token = await admin.getIdToken();
    const res = await fetch(`/api/admin-user-detail?userId=${encodeURIComponent(userId)}`, {
      method,
      headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
      ...(body ? { body: JSON.stringify({ userId, ...body }) } : {})
    });
    const json = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(json.error || 'Unable to load member details');
    return json as Detail;
  };

  const load = async () => {
    if (!admin || !userId) return;
    setLoading(true); setError('');
    try { setData(await request('GET')); }
    catch (e:any) { setError(e?.message || 'Unable to load member details'); }
    finally { setLoading(false); }
  };

  useEffect(()=>{ load(); }, [admin?.uid, userId]);

  const updateKyc = async (status:string) => {
    setAction(`kyc-${status}`); setError(''); setMessage('');
    try { setData(await request('PATCH', { action:'kyc', status })); setMessage(`KYC marked ${status}.`); }
    catch(e:any){ setError(e?.message || 'KYC update failed'); }
    finally { setAction(''); }
  };

  const updateStatus = async (status:'active'|'suspended') => {
    setAction(`status-${status}`); setError(''); setMessage('');
    try { setData(await request('PATCH', { action:'status', status })); setMessage(`Account marked ${status}.`); }
    catch(e:any){ setError(e?.message || 'Account status update failed'); }
    finally { setAction(''); }
  };

  const sendReset = async () => {
    if (!data?.profile.email) return;
    setAction('password'); setError(''); setMessage('');
    try { await sendPasswordResetEmail(auth, data.profile.email); setMessage(`Password reset email sent to ${data.profile.email}.`); }
    catch(e:any){ setError(e?.message || 'Password reset email could not be sent'); }
    finally { setAction(''); }
  };

  if (loading) return <div className="py-14 text-center text-slate-400"><RefreshCw className="w-6 h-6 animate-spin text-cyan-400 mx-auto mb-2"/><div className="text-xs">Loading member account...</div></div>;
  if (!data) return <div className="space-y-3 p-6 rounded-2xl bg-[#091129] border border-rose-500/25 text-center"><AlertCircle className="w-8 h-8 text-rose-400 mx-auto"/><div className="text-white font-bold">Member detail unavailable</div><div className="text-xs text-rose-300">{error}</div><button onClick={onBack} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs">Back to Users</button></div>;

  const { profile:p, wallet:w, packages, transactions, kycSubmissions, ledger } = data;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button onClick={onBack} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#0e173a] border border-blue-500/30 text-xs text-white"><ArrowLeft className="w-4 h-4 text-cyan-400"/>Back to User Management</button>
      <button onClick={load} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#0e173a] border border-blue-500/30 text-xs text-white"><RefreshCw className="w-4 h-4 text-cyan-400"/>Refresh</button>
    </div>

    {message && <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex gap-2"><CheckCircle2 className="w-4 h-4"/>{message}</div>}
    {error && <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs">{error}</div>}

    <div className="p-5 rounded-2xl bg-[#091129] border border-blue-500/25">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3"><div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center"><UserRound className="w-6 h-6 text-white"/></div><div><h2 className="text-xl font-bold text-white">{p.name || 'Member'}</h2><div className="text-xs text-slate-400">{p.email}</div><div className="text-xs font-mono text-cyan-400 mt-1">{p.referralCode}</div></div></div>
        <div className="flex flex-wrap gap-2"><span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${p.status==='active'?'bg-emerald-500/15 text-emerald-400':'bg-rose-500/15 text-rose-400'}`}>{p.status.toUpperCase()}</span><span className="px-2.5 py-1 rounded-full bg-cyan-500/15 text-cyan-300 text-[10px] font-bold">KYC {String(p.kycStatus||'unverified').toUpperCase()}</span></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-5 text-xs">
        <Info label="User / Wallet ID" value={p.id}/><Info label="Phone" value={p.phone || '—'}/><Info label="Sponsor ID" value={p.sponsorId || '—'}/><Info label="Joined" value={new Date(p.createdAt).toLocaleString('en-IN')}/>
      </div>
    </div>

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Stat icon={<Wallet/>} label="Fund Wallet" value={money(w.fundWallet)}/><Stat icon={<Wallet/>} label="Income Wallet" value={money(w.incomeWallet)}/><Stat icon={<Package/>} label="Basic Package Active" value={money(w.basicPackageActive)}/><Stat icon={<Package/>} label="FD Package Active" value={money(w.fdPackageActive)}/>
      <Stat icon={<History/>} label="Total Income" value={money(w.totalIncome)}/><Stat icon={<History/>} label="Total Withdrawal" value={money(w.totalWithdrawal)}/><Stat icon={<Users/>} label="Direct Team" value={String(w.directTeamCount)}/><Stat icon={<Users/>} label="Total Team" value={String(w.totalTeamCount)}/>
    </div>

    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div className="p-5 rounded-2xl bg-[#091129] border border-blue-500/25 space-y-4">
        <div><h3 className="text-sm font-bold text-white flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-cyan-400"/>KYC Manual Control</h3><p className="text-[11px] text-slate-500 mt-1">Admin can manually update the member KYC status. Changes are logged.</p></div>
        {kycSubmissions[0] && <div className="p-3 rounded-xl bg-[#060b1c] text-xs grid grid-cols-2 gap-2"><Info label="Legal Name" value={kycSubmissions[0].legalName || '—'}/><Info label="Document" value={`${kycSubmissions[0].documentType || '—'} ${kycSubmissions[0].documentLast4 ? `••••${kycSubmissions[0].documentLast4}`:''}`}/></div>}
        <div className="flex flex-wrap gap-2"><ActionButton disabled={!!action} onClick={()=>updateKyc('verified')} text="Approve KYC"/><ActionButton disabled={!!action} onClick={()=>updateKyc('pending')} text="Mark Pending" neutral/><ActionButton disabled={!!action} onClick={()=>updateKyc('rejected')} text="Reject KYC" danger/><ActionButton disabled={!!action} onClick={()=>updateKyc('unverified')} text="Reset KYC" neutral/></div>
      </div>

      <div className="p-5 rounded-2xl bg-[#091129] border border-blue-500/25 space-y-4">
        <div><h3 className="text-sm font-bold text-white flex items-center gap-2"><KeyRound className="w-4 h-4 text-cyan-400"/>Account Security & Status</h3><p className="text-[11px] text-slate-500 mt-1">Password is never shown to admin. Reset sends a secure Firebase reset email.</p></div>
        <button onClick={sendReset} disabled={!!action} className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold disabled:opacity-50">{action==='password'?'Sending...':'Send Password Reset Email'}</button>
        <div className="grid grid-cols-2 gap-2">{p.status==='active'?<button onClick={()=>updateStatus('suspended')} disabled={!!action} className="py-2.5 rounded-xl bg-rose-600/20 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center justify-center gap-2"><Ban className="w-4 h-4"/>Suspend User</button>:<button onClick={()=>updateStatus('active')} disabled={!!action} className="py-2.5 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-center gap-2"><PlayCircle className="w-4 h-4"/>Activate User</button>}<div className="py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/20 text-center text-xs text-slate-300">Role: <b>{p.role}</b></div></div>
      </div>
    </div>

    <div className="p-5 rounded-2xl bg-[#091129] border border-blue-500/25">
      <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-bold text-white">Plan Purchase / Activation History ({packages.length})</h3><span className="text-[10px] text-slate-500">Credits {money(ledger.totalCredits)} • Debits {money(ledger.totalDebits)}</span></div>
      {packages.length===0?<Empty text="No package purchase recorded for this member."/>:<div className="overflow-x-auto"><table className="w-full text-xs"><thead className="text-slate-500 bg-[#060b1c]"><tr><th className="p-3 text-left">Plan</th><th className="p-3 text-left">Type</th><th className="p-3 text-left">Amount</th><th className="p-3 text-left">Daily %</th><th className="p-3 text-left">Days</th><th className="p-3 text-left">Earned</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">Purchased</th></tr></thead><tbody className="divide-y divide-blue-500/10">{packages.map(x=><tr key={x.id}><td className="p-3 text-white font-semibold">{x.packageName}</td><td className="p-3 text-cyan-300">{x.packageType}</td><td className="p-3 text-white font-mono">{money(x.amount)}</td><td className="p-3 text-slate-300">{x.roiDailyRate}%</td><td className="p-3 text-slate-300">{x.durationDays}</td><td className="p-3 text-emerald-400 font-mono">{money(x.totalEarned)}</td><td className="p-3 text-slate-300">{x.status}</td><td className="p-3 text-slate-400">{x.activatedAt?new Date(x.activatedAt).toLocaleString('en-IN'):'—'}</td></tr>)}</tbody></table></div>}
    </div>

    <div className="p-5 rounded-2xl bg-[#091129] border border-blue-500/25">
      <h3 className="text-sm font-bold text-white mb-3">Recent Ledger Activity ({transactions.length})</h3>
      {transactions.length===0?<Empty text="No ledger activity recorded."/>:<div className="overflow-x-auto max-h-80"><table className="w-full text-xs"><thead className="sticky top-0 bg-[#060b1c] text-slate-500"><tr><th className="p-3 text-left">Date</th><th className="p-3 text-left">Type</th><th className="p-3 text-left">Flow</th><th className="p-3 text-left">Amount</th><th className="p-3 text-left">Description</th></tr></thead><tbody className="divide-y divide-blue-500/10">{transactions.map(t=><tr key={t.id}><td className="p-3 text-slate-400">{new Date(t.createdAt).toLocaleString('en-IN')}</td><td className="p-3 text-cyan-300">{t.type}</td><td className={`p-3 font-bold ${t.flow==='credit'?'text-emerald-400':'text-rose-400'}`}>{t.flow}</td><td className="p-3 text-white font-mono">{money(t.amount)}</td><td className="p-3 text-slate-300">{t.description}</td></tr>)}</tbody></table></div>}
    </div>
  </div>;
};

const Info = ({label,value}:{label:string;value:string}) => <div><div className="text-[10px] uppercase text-slate-500">{label}</div><div className="text-xs text-white mt-1 break-all">{value}</div></div>;
const Stat = ({icon,label,value}:{icon:React.ReactNode;label:string;value:string}) => <div className="p-4 rounded-2xl bg-[#091129] border border-blue-500/20"><div className="w-4 h-4 text-cyan-400 mb-2">{icon}</div><div className="text-[10px] uppercase text-slate-500">{label}</div><div className="text-lg font-bold text-white mt-1 font-mono">{value}</div></div>;
const Empty = ({text}:{text:string}) => <div className="p-6 text-center rounded-xl bg-[#060b1c] border border-blue-500/10 text-xs text-slate-500">{text}</div>;
const ActionButton = ({onClick,text,danger,neutral,disabled}:{onClick:()=>void;text:string;danger?:boolean;neutral?:boolean;disabled?:boolean}) => <button onClick={onClick} disabled={disabled} className={`px-3 py-2 rounded-xl text-xs font-bold border disabled:opacity-50 ${danger?'bg-rose-600/20 border-rose-500/40 text-rose-300':neutral?'bg-slate-700/30 border-slate-500/30 text-slate-300':'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'}`}>{text}</button>;
