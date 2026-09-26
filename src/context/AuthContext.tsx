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
import { 
  getOrCreateUserProfile, 
  updateUserKyc 
} from '../services/financeService.ts';
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [sponsorReferralParam, setSponsorReferralParam] = useState<string>('GF788872');

  // Check URL params for referral parameter "?r=GF..." or "?ref=GF..."
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const ref = urlParams.get('r') || urlParams.get('ref') || urlParams.get('sponsor');
      if (ref && ref.startsWith('GF')) {
        setSponsorReferralParam(ref.toUpperCase());
      }
    } catch {
      // ignore
    }
  }, []);

  const loadUserData = async (currentUser: FirebaseUser) => {
    try {
      const { profile: userProfile, wallet: userWallet } = await getOrCreateUserProfile(
        currentUser.uid,
        currentUser.email || '',
        currentUser.displayName || '',
        sponsorReferralParam
      );

      // Check if user is suspended
      if (userProfile.status === 'suspended') {
        console.warn('Account is suspended');
      }

      setProfile(userProfile);
      setWallet(userWallet);
    } catch (err) {
      console.error('Error loading user profile & wallet:', err);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await loadUserData(currentUser);
      } else {
        setProfile(null);
        setWallet(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [sponsorReferralParam]);

  const refreshWallet = async () => {
    if (user) {
      await loadUserData(user);
    }
  };

  const loginWithGoogle = async () => {
    setLoading(true);
    try {
      const res = await signInWithPopup(auth, googleAuthProvider);
      if (res.user) {
        await loadUserData(res.user);
      }
    } catch (err: any) {
      console.error('Google Sign-in failed:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    setLoading(true);
    try {
      const res = await signInWithEmailAndPassword(auth, email, pass);
      if (res.user) {
        await loadUserData(res.user);
      }
    } catch (err: any) {
      console.error('Email Sign-in failed:', err);
      // Generic safe auth error message to prevent account enumeration
      if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        throw new Error('Invalid email or password. Please verify credentials.');
      }
      throw err;
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
        const { profile: p, wallet: w } = await getOrCreateUserProfile(
          res.user.uid,
          email,
          name,
          sponsorCode || sponsorReferralParam
        );
        setProfile(p);
        setWallet(w);
      }
    } catch (err: any) {
      console.error('Email Registration failed:', err);
      if (err.code === 'auth/email-already-in-use') {
        throw new Error('An account with this email address already exists. Please sign in instead.');
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setProfile(null);
    setWallet(null);
  };

  const updateKycData = async (data: Partial<UserProfile>) => {
    if (user && profile) {
      await updateUserKyc(user.uid, data);
      setProfile({
        ...profile,
        ...data,
        kycStatus: 'pending'
      });
    }
  };

  const isAdmin = profile?.role === 'admin' || user?.email?.toLowerCase() === 'infoaisoft26@gmail.com';
  const isSuspended = profile?.status === 'suspended';

  return (
    <AuthContext.Provider
      value={{
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
