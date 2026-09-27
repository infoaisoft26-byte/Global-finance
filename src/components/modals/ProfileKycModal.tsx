import React, { useEffect, useState } from 'react';
import { User, ShieldCheck, Building, CreditCard, CheckCircle2, AlertCircle, Copy, Check, Save, X, RefreshCw, Coins } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

interface ProfileKycModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToKyc?: () => void;
}

export const ProfileKycModal: React.FC<ProfileKycModalProps> = ({ isOpen, onClose, onNavigateToKyc }) => {
  const { profile, user, updateKycData, logout } = useAuth();
  const [name, setName] = useState(profile?.name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [panNumber, setPanNumber] = useState(profile?.panNumber || '');
  const [bankAccount, setBankAccount] = useState(profile?.bankAccount || '');
  const [bankName, setBankName] = useState(profile?.bankName || '');
  const [ifscCode, setIfscCode] = useState(profile?.ifscCode || '');
  const [upiId, setUpiId] = useState(profile?.upiId || '');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [tokenLoading, setTokenLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !user) return;
    let cancelled = false;
    const loadToken = async () => {
      setTokenLoading(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/member-token', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) setTokenBalance(Number(data.tokenBalance || 0));
      } catch (err) {
        console.warn('Token balance unavailable:', err);
      } finally {
        if (!cancelled) setTokenLoading(false);
      }
    };
    loadToken();
    return () => { cancelled = true; };
  }, [isOpen, user?.uid]);

  if (!isOpen) return null;

  const handleCopyCode = () => {
    if (profile?.referralCode) {
      navigator.clipboard.writeText(profile.referralCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg('');
    try {
      await updateKycData({
        name: name.trim(), phone: phone.trim(), panNumber: panNumber.trim().toUpperCase(),
        bankAccount: bankAccount.trim(), bankName: bankName.trim(), ifscCode: ifscCode.trim().toUpperCase(), upiId: upiId.trim()
      });
      setSuccessMsg('Profile information updated successfully.');
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#0b132b] border border-blue-500/30 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden my-8">
        <div className="p-5 border-b border-blue-500/20 bg-[#080e22] flex items-center justify-between">
          <div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center"><ShieldCheck className="w-5 h-5" /></div><div><h3 className="text-base font-bold text-white">Member Profile & KYC</h3><p className="text-[11px] text-slate-400">Global Finance Digital Identity</p></div></div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#121c40]"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {successMsg && <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/><span>{successMsg}</span></div>}

          <div className="p-4 rounded-xl bg-[#0e173a] border border-blue-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div><div className="text-slate-400">Your Unique Member ID:</div><div className="font-mono text-cyan-400 font-bold text-base mt-0.5 flex items-center gap-2"><span>{profile?.referralCode || '—'}</span><button type="button" onClick={handleCopyCode} className="p-1 text-slate-400 hover:text-white">{copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}</button></div></div>
            <div className="text-left sm:text-right"><div className="text-slate-400">Sponsor ID:</div><div className="font-mono text-slate-200 font-semibold mt-0.5">{profile?.sponsorId || '—'}</div></div>
          </div>

          <div className="p-4 rounded-xl bg-amber-950/15 border border-amber-500/25 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center"><Coins className="w-5 h-5 text-amber-300"/></div><div><div className="text-[10px] uppercase tracking-wider text-slate-500">GF Token Balance</div><div className="text-xl font-bold font-mono text-amber-300">{tokenLoading ? '...' : tokenBalance.toLocaleString('en-IN')} GF</div></div></div>
            <div className="text-[10px] text-slate-500 max-w-[220px] text-right">Admin-issued internal tokens are separate from Fund/Income wallets and do not represent TRX or USDT.</div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#060c20] border border-blue-500/25 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5"><div className={`w-8 h-8 rounded-lg flex items-center justify-center ${profile?.kycStatus === 'verified' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : profile?.kycStatus === 'pending' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-blue-500/20 text-cyan-400 border border-blue-500/40'}`}><ShieldCheck className="w-4 h-4" /></div><div><div className="font-bold text-white">Document KYC Status: <span className="uppercase font-mono text-cyan-400 text-[11px]">{profile?.kycStatus || 'Unverified'}</span></div><div className="text-[11px] text-slate-400">Identity verification status for this member account.</div></div></div>
            {onNavigateToKyc && <button type="button" onClick={() => { onClose(); onNavigateToKyc(); }} className="px-3 py-1.5 rounded-lg bg-blue-600/30 text-cyan-300 font-semibold text-xs border border-cyan-500/30 whitespace-nowrap">Open KYC Vault</button>}
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Personal Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="block text-xs text-slate-300 mb-1">Full Name</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-[#0e173a] border border-blue-500/30 text-white text-xs" /></div>
              <div><label className="block text-xs text-slate-300 mb-1">Phone Number</label><input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-[#0e173a] border border-blue-500/30 text-white text-xs font-mono" /></div>
            </div>

            <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider pt-2">KYC & Optional Payout Details</h4>
            <div><label className="block text-xs text-slate-300 mb-1">Permanent Account Number (PAN)</label><input type="text" maxLength={10} value={panNumber} onChange={(e) => setPanNumber(e.target.value.toUpperCase())} className="w-full px-3 py-2 rounded-xl bg-[#0e173a] border border-blue-500/30 text-white text-xs font-mono uppercase" /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="block text-xs text-slate-300 mb-1">Bank Name</label><input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-[#0e173a] border border-blue-500/30 text-white text-xs" /></div>
              <div><label className="block text-xs text-slate-300 mb-1">Bank Account Number</label><input type="text" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-[#0e173a] border border-blue-500/30 text-white text-xs font-mono" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="block text-xs text-slate-300 mb-1">IFSC Code</label><input type="text" maxLength={11} value={ifscCode} onChange={(e) => setIfscCode(e.target.value.toUpperCase())} className="w-full px-3 py-2 rounded-xl bg-[#0e173a] border border-blue-500/30 text-white text-xs font-mono uppercase" /></div>
              <div><label className="block text-xs text-slate-300 mb-1">UPI ID / VPA</label><input type="text" value={upiId} onChange={(e) => setUpiId(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-[#0e173a] border border-blue-500/30 text-white text-xs font-mono" /></div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-blue-500/20">
              <button type="button" onClick={logout} className="text-xs text-rose-400 hover:text-rose-300 font-semibold">Log Out of Account</button>
              <div className="flex items-center gap-2"><button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-[#101b3d] text-slate-300 text-xs">Close</button><button type="submit" disabled={saving} className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold text-xs flex items-center gap-2 disabled:opacity-50">{saving ? <><RefreshCw className="w-3.5 h-3.5 animate-spin"/><span>Saving...</span></> : <><Save className="w-3.5 h-3.5"/><span>Save Profile</span></>}</button></div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
