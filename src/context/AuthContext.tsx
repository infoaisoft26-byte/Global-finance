import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
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
import type { UserProfile, WalletData } from '../types/index.ts';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase.ts';

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  wallet: WalletData | null;
  loading: boolean;
  isAdmin: boolean;
  isSuspended: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (memberId: string, pass: string) => Promise<void>;
  registerWithEmail: (name: string, email: string, pass: string, sponsorCode?: string, phone?: string, country?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshWallet: () => Promise<void>;
  updateKycData: (data: Partial<UserProfile>) => Promise<void>;
  sponsorReferralParam: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const syncInFlight = new Map<string, Promise<{ profile: UserProfile; wallet: WalletData }>>();
const AUTH_SYNC_TIMEOUT_MS = 15_000;

async function syncWithServer(currentUser: FirebaseUser, sponsorCode?: string, forceToken = false, profileUpdates?: { phone?: string; country?: string }) {
  const key = `${currentUser.uid}:${sponsorCode || ''}:${profileUpdates?.phone || ''}:${profileUpdates?.country || ''}`;
  const existing = syncInFlight.get(key);
  if (existing) return existing;

  const task = (async () => {
    const idToken = await currentUser.getIdToken(forceToken);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AUTH_SYNC_TIMEOUT_MS);
    try {
      const response = await fetch('/api/auth-sync', {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          name: currentUser.displayName || '',
          sponsorCode: sponsorCode || undefined,
          ...(profileUpdates?.phone !== undefined ? { phone: profileUpdates.phone } : {}),
          ...(profileUpdates?.country !== undefined ? { country: profileUpdates.country } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to complete secure login.');
      return data as { profile: UserProfile; wallet: WalletData };
    } catch (err: any) {
      if (err?.name === 'AbortError') throw new Error('Login sync timed out. Please retry.');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  })();

  syncInFlight.set(key, task);
  try {
    return await task;
  } finally {
    syncInFlight.delete(key);
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [sponsorReferralParam, setSponsorReferralParam] = useState<string>('');
  const pendingSponsorRef = useRef<string>('');

  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const ref = urlParams.get('r') || urlParams.get('ref') || urlParams.get('sponsor');
      if (ref && /^GF\d{6}$/i.test(ref)) setSponsorReferralParam(ref.toUpperCase());
    } catch {
      // Browser URL parsing is non-critical.
    }
  }, []);

  const loadUserData = async (currentUser: FirebaseUser, sponsorCode?: string, forceToken = false, profileUpdates?: { phone?: string; secondPhone?: string }) => {
    const sponsor = sponsorCode || pendingSponsorRef.current || sponsorReferralParam;
    const data = await syncWithServer(currentUser, sponsor, forceToken, profileUpdates);
    setProfile(data.profile);
    setWallet(data.wallet);
    return data;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setProfile(null);
        setWallet(null);
        setLoading(false);
        return;
      }

      try {
        await loadUserData(currentUser);
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
    if (!user) return;
    try {
      await loadUserData(user);
    } catch (err) {
      console.error('Wallet refresh failed:', err);
    }
  };

  // Firestore is the wallet source of truth. Listen directly so an automatic
  // deposit credit appears for the member without waiting for a refresh.
  useEffect(() => {
    if (!user) return;
    const walletRef = doc(db, 'wallets', user.uid);
    const unsubscribe = onSnapshot(walletRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as WalletData & { updatedAt?: any };
      setWallet({
        ...data,
        userId: user.uid,
        fundWallet: Number(data.fundWallet || 0),
        incomeWallet: Number(data.incomeWallet || 0),
        totalIncome: Number(data.totalIncome || 0),
        totalWithdrawal: Number(data.totalWithdrawal || 0),
        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || String(data.updatedAt || new Date().toISOString()),
      });
    }, (error) => {
      console.warn('Realtime wallet listener unavailable:', error);
    });
    return () => unsubscribe();
  }, [user?.uid]);

  const loginWithGoogle = async () => {
    setLoading(true);
    try {
      const res = await signInWithPopup(auth, googleAuthProvider);
      if (res.user) {
        setUser(res.user);
        await loadUserData(res.user, undefined, true);
      }
    } catch (err: any) {
      console.error('Google Sign-in failed:', err);
      throw new Error(err?.message || 'Google sign-in could not be completed.');
    } finally {
      setLoading(false);
    }
  };

  const loginWithEmail = async (memberId: string, pass: string) => {
    setLoading(true);
    try {
      const identifier = memberId.trim();
      if (!identifier) throw new Error('Please enter your GF Member ID or email address.');

      let loginEmail = identifier;
      if (!identifier.includes('@')) {
        const lookupResponse = await fetch('/api/auth-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({ action: 'member-login-lookup', memberId: identifier.toUpperCase() }),
        });
        const lookup = await lookupResponse.json().catch(() => ({}));
        if (!lookupResponse.ok || !lookup?.email) {
          throw new Error('Invalid GF Member ID or password.');
        }
        loginEmail = String(lookup.email).trim().toLowerCase();
      } else {
        loginEmail = identifier.toLowerCase();
      }

      const res = await signInWithEmailAndPassword(auth, loginEmail, pass);
      if (res.user) {
        setUser(res.user);
        // Firebase Auth is the source of truth for authentication. Profile
        // synchronization happens after the credential is accepted.
        const data = await loadUserData(res.user, undefined, true);
        setProfile(data.profile);
        setWallet(data.wallet);
      }
    } catch (err: any) {
      console.error('Member Sign-in failed:', err);
      if (
        err?.message === 'Invalid GF Member ID or password.' ||
        err?.code === 'auth/wrong-password' ||
        err?.code === 'auth/user-not-found' ||
        err?.code === 'auth/invalid-credential' ||
        err?.code === 'auth/invalid-email'
      ) {
        throw new Error('Invalid GF Member ID or password.');
      }
      throw new Error(err?.message || 'Sign-in could not be completed.');
    } finally {
      setLoading(false);
    }
  };

  const registerWithEmail = async (name: string, email: string, pass: string, sponsorCode?: string, phone?: string, country?: string) => {
    setLoading(true);
    const sponsor = sponsorCode || sponsorReferralParam;
    pendingSponsorRef.current = sponsor;
    try {
      const res = await createUserWithEmailAndPassword(auth, email, pass);
      if (res.user) {
        await updateProfile(res.user, { displayName: name });
        setUser(res.user);
        await loadUserData(res.user, sponsor, true, { phone, country });
        await signOut(auth);
        setUser(null);
        setProfile(null);
        setWallet(null);
        window.history.replaceState({}, '', '/');
      }
    } catch (err: any) {
      console.error('Email Registration failed:', err);
      if (err?.code === 'auth/email-already-in-use') {
        throw new Error('An account with this email address already exists. Please sign in instead.');
      }
      throw new Error(err?.message || 'Registration could not be completed.');
    } finally {
      pendingSponsorRef.current = '';
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
    if (!user || !profile) return;

    const token = await user.getIdToken();
    const response = await fetch('/api/member-profile', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        idToken: token,
        name: data.name,
        phone: data.phone,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.profile) {
      throw new Error(result.error || 'Unable to update profile.');
    }

    const nextProfile = result.profile as UserProfile;
    if (data.name && data.name.trim() && data.name !== user.displayName) {
      await updateProfile(user, { displayName: data.name.trim() });
    }
    setProfile(nextProfile);
  };

  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin' || profile?.role === 'administrator';
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
