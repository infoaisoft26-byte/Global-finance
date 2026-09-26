import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  auth,
  googleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  type FirebaseUser
} from '../lib/firebase.ts';
import { updateUserKyc } from '../services/financeService.ts';
import type { UserProfile, WalletData } from '../types/index.ts';

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  wallet: WalletData | null;
  loading: boolean;
  isAdmin: boolean;
  isSuspended: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (name: string, email: string, pass: string, sponsorCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshWallet: () => Promise<void>;
  updateKycData: (data: Partial<UserProfile>) => Promise<void>;
  sponsorReferralParam: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function syncWithServer(currentUser: FirebaseUser, sponsorCode?: string) {
  const idToken = await currentUser.getIdToken();
  const response = await fetch('/api/auth-sync', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idToken,
      name: currentUser.displayName || '',
      sponsorCode: sponsorCode || undefined,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to complete secure login.');
  return data as { profile: UserProfile; wallet: WalletData };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [sponsorReferralParam, setSponsorReferralParam] = useState<string>('');

  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const ref = urlParams.get('r') || urlParams.get('ref') || urlParams.get('sponsor');
      if (ref && /^GF\d{6}$/i.test(ref)) setSponsorReferralParam(ref.toUpperCase());
    } catch {
      // Browser URL parsing is non-critical.
    }
  }, []);

  const loadUserData = async (currentUser: FirebaseUser, sponsorCode?: string) => {
    const data = await syncWithServer(currentUser, sponsorCode || sponsorReferralParam);
    setProfile(data.profile);
    setWallet(data.wallet);
    return data;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      try {
        if (currentUser) {
          await loadUserData(currentUser);
        } else {
          setProfile(null);
          setWallet(null);
        }
      } catch (err) {
        console.error('Secure profile sync failed:', err);
        setProfile(null);
        setWallet(null);
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [sponsorReferralParam]);

  const refreshWallet = async () => {
    if (user) await loadUserData(user);
  };

  const loginWithGoogle = async () => {
    setLoading(true);
    try {
      const res = await signInWithPopup(auth, googleAuthProvider);
      if (res.user) {
        setUser(res.user);
        await loadUserData(res.user);
      }
    } catch (err: any) {
      console.error('Google Sign-in failed:', err);
      throw new Error(err?.message || 'Google sign-in could not be completed.');
    } finally {
      setLoading(false);
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    setLoading(true);
    try {
      const res = await signInWithEmailAndPassword(auth, email, pass);
      if (res.user) {
        setUser(res.user);
        await loadUserData(res.user);
      }
    } catch (err: any) {
      console.error('Email Sign-in failed:', err);
      if (err?.code === 'auth/wrong-password' || err?.code === 'auth/user-not-found' || err?.code === 'auth/invalid-credential') {
        throw new Error('Invalid email or password. Please verify credentials.');
      }
      throw new Error(err?.message || 'Sign-in could not be completed.');
    } finally {
      setLoading(false);
    }
  };

  const registerWithEmail = async (name: string, email: string, pass: string, sponsorCode?: string) => {
    setLoading(true);
    try {
      const res = await createUserWithEmailAndPassword(auth, email, pass);
      if (res.user) {
        await updateProfile(res.user, { displayName: name });
        setUser(res.user);
        const data = await loadUserData(res.user, sponsorCode || sponsorReferralParam);
        setProfile(data.profile);
        setWallet(data.wallet);
      }
    } catch (err: any) {
      console.error('Email Registration failed:', err);
      if (err?.code === 'auth/email-already-in-use') {
        throw new Error('An account with this email address already exists. Please sign in instead.');
      }
      throw new Error(err?.message || 'Registration could not be completed.');
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await Promise.allSettled([
      fetch('/api/logout', { method: 'POST', credentials: 'include' }),
      signOut(auth),
    ]);
    setUser(null);
    setProfile(null);
    setWallet(null);
  };

  const updateKycData = async (data: Partial<UserProfile>) => {
    if (user && profile) {
      await updateUserKyc(user.uid, data);
      setProfile({ ...profile, ...data, kycStatus: 'pending' });
    }
  };

  const isAdmin = profile?.role === 'admin';
  const isSuspended = profile?.status === 'suspended';

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      wallet,
      loading,
      isAdmin,
      isSuspended,
      loginWithGoogle,
      loginWithEmail,
      registerWithEmail,
      logout,
      refreshWallet,
      updateKycData,
      sponsorReferralParam
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
