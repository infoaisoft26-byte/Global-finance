import React, { useEffect, useState } from 'react';
import { User, Copy, Check, Save, X, RefreshCw, Coins, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

interface ProfileKycModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToKyc?: () => void;
}

export const ProfileKycModal: React.FC<ProfileKycModalProps> = ({ isOpen, onClose }) => {
  const { profile, user, updateKycData, logout } = useAuth();
  const [name, setName] = useState(profile?.name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [tokenLoading, setTokenLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(profile?.name || '');
    setPhone(profile?.phone || '');
  }, [isOpen, profile?.name, profile?.phone]);

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
    if (!profile?.referralCode) return;
    navigator.clipboard.writeText(profile.referralCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg('');
    try {
      await updateKycData({ name: name.trim(), phone: phone.trim() });
      setSuccessMsg('Profile information updated successfully.');
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden my-8">
        <div className="p-5 border-b border-slate-200 bg-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white shadow-sm">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Member Profile</h3>
              <p className="text-[11px] text-slate-500">Global Finance Account</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto bg-slate-50/50">
          {successMsg && <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2"><Check className="w-4 h-4"/><span>{successMsg}</span></div>}

          <div className="p-4 rounded-xl bg-white border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-sm">
            <div>
              <div className="text-slate-500">Your Unique Member ID</div>
              <div className="font-mono text-blue-600 font-bold text-base mt-0.5 flex items-center gap-2">
                <span>{profile?.referralCode || '—'}</span>
                <button type="button" onClick={handleCopyCode} className="p-1 text-slate-500 hover:text-blue-600">{copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}</button>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <div className="text-slate-500">Sponsor ID</div>
              <div className="font-mono text-slate-800 font-semibold mt-0.5">{profile?.sponsorId || '—'}</div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center"><Coins className="w-5 h-5 text-amber-600"/></div>
              <div><div className="text-[10px] uppercase tracking-wider text-slate-500">GF Token Balance</div><div className="text-xl font-bold font-mono text-amber-700">{tokenLoading ? '...' : tokenBalance.toLocaleString('en-IN')} GF</div></div>
            </div>
            <div className="text-[10px] text-slate-500 max-w-[220px] text-right">Admin-issued internal tokens are separate from Fund/Income wallets and do not represent TRX or USDT.</div>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wider">Personal Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-600 mb-1">Full Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Phone Number</label>
                <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs font-mono focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-200">
              <button type="button" onClick={logout} className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1.5"><LogOut className="w-3.5 h-3.5" />Log Out</button>
              <div className="flex items-center gap-2">
                <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs border border-slate-200">Close</button>
                <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold text-xs flex items-center gap-2 disabled:opacity-50">{saving ? <><RefreshCw className="w-3.5 h-3.5 animate-spin"/><span>Saving...</span></> : <><Save className="w-3.5 h-3.5"/><span>Save Profile</span></>}</button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
