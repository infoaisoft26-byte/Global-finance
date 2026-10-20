import React, { useEffect, useState } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
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
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [tokenLoading, setTokenLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(profile?.name || '');
    setPhone(profile?.phone || '');
    setOldPassword(''); setNewPassword(''); setConfirmPassword('');
    setErrorMsg('');
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
    setErrorMsg('');
    try {
      await updateKycData({ name: name.trim(), phone: phone.trim() });
      setSuccessMsg('Profile information updated successfully.');
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (err) {
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(''); setSuccessMsg('');
    if (!user?.email) { setErrorMsg('Your sign-in email is unavailable.'); return; }
    if (!oldPassword || !newPassword) { setErrorMsg('Enter your old password and new password.'); return; }
    if (newPassword.length < 8) { setErrorMsg('New password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setErrorMsg('New password and confirmation do not match.'); return; }
    if (oldPassword === newPassword) { setErrorMsg('New password must be different from the old password.'); return; }
    setPasswordSaving(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, oldPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setOldPassword(''); setNewPassword(''); setConfirmPassword('');
      setSuccessMsg('Password changed successfully.');
    } catch (err: any) {
      const code = String(err?.code || '');
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials') setErrorMsg('Old password is incorrect.');
      else if (code === 'auth/weak-password') setErrorMsg('Choose a stronger password (at least 8 characters).');
      else if (code === 'auth/requires-recent-login') setErrorMsg('For security, log out and sign in again, then retry.');
      else if (code === 'auth/provider-already-linked' || code === 'auth/operation-not-allowed') setErrorMsg('Password sign-in is not enabled for this account.');
      else setErrorMsg(err instanceof Error ? err.message : 'Unable to change password.');
    } finally { setPasswordSaving(false); }
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
          {errorMsg && <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">{errorMsg}</div>}

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
            <div className="mb-3">
              <label className="block text-xs text-slate-600 mb-1">Email Address</label>
              <input type="email" value={profile?.email || user?.email || ''} readOnly className="w-full px-3 py-2.5 rounded-xl bg-slate-100 border border-slate-300 text-slate-600 text-xs cursor-not-allowed" />
              <p className="text-[10px] text-slate-500 mt-1">Your sign-in email is shown here and cannot be changed from this form.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-600 mb-1">Full Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Primary Mobile Number</label>
                <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs font-mono focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </div>
            </div>


          <form onSubmit={handlePasswordChange} className="space-y-3 p-4 rounded-xl bg-white border border-slate-200">
            <div>
              <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wider">Change Password</h4>
              <p className="text-[10px] text-slate-500 mt-1">Confirm your current password before setting a new one.</p>
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">Old Password</label>
              <input type="password" autoComplete="current-password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs" required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-600 mb-1">New Password</label>
                <input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs" required />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Confirm New Password</label>
                <input type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs" required />
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={passwordSaving} className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs flex items-center gap-2 disabled:opacity-50">{passwordSaving ? <><RefreshCw className="w-3.5 h-3.5 animate-spin"/><span>Changing...</span></> : <span>Change Password</span>}</button>
            </div>
          </form>

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
