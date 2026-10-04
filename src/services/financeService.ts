import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  runTransaction,
  orderBy,
  limit,
  serverTimestamp,
  addDoc
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase.ts';
import type { 
  UserProfile, 
  WalletData, 
  TransactionLedger, 
  PackageActivationRecord, 
  PackageDefinition,
  DownlineMember,
  SupportTicket,
  TicketMessage,
  KycSubmission,
  AuditLog,
  AdminSettings,
  TransactionType
} from '../types/index.ts';

// Helper to generate unique referral code like GF152551
export function generateReferralCode(): string {
  const digits = Math.floor(100000 + Math.random() * 900000);
  return `GF${digits}`;
}

// Generate transaction reference
export function generateReferenceId(prefix = 'TXN'): string {
  const rand = Math.floor(10000000 + Math.random() * 90000000);
  return `${prefix}${Date.now().toString().slice(-4)}${rand.toString().slice(0, 4)}`;
}

// Initial default wallet
export const defaultWallet = (userId: string): WalletData => ({
  userId,
  fundWallet: 0.00,
  incomeWallet: 0.00,
  totalIncome: 0.00,
  totalWithdrawal: 0.00,
  basicPackageActive: 0.00,
  fdPackageActive: 0.00,
  directTeamCount: 0,
  totalTeamCount: 0,
  joiningBonus: 0.00,
  referralIncome: 0.00,
  todayRoiIncome: 0.00,
  todayLevelIncome: 0.00,
  totalRoiIncome: 0.00,
  totalLevelIncome: 0.00,
  fdTodayRoiIncome: 0.00,
  fdTodayLevelIncome: 0.00,
  fdTotalRoiIncome: 0.00,
  fdTotalLevelIncome: 0.00,
  fdReferralIncome: 0.00,
  fdReleased: 0.00,
  totalSalary: 0.00,
  updatedAt: new Date().toISOString()
});

/**
 * Record an immutable audit log entry
 */
export async function recordAuditLog(
  actorUserId: string,
  actorEmail: string | undefined,
  action: string,
  entityType: AuditLog['entityType'],
  entityId: string,
  metadata?: Record<string, any>
): Promise<string> {
  try {
    const logRef = doc(collection(db, 'audit_logs'));
    const logEntry: AuditLog = {
      id: logRef.id,
      actorUserId,
      actorEmail: actorEmail || 'system',
      action,
      entityType,
      entityId,
      metadata: metadata || {},
      timestamp: new Date().toISOString()
    };
    await setDoc(logRef, logEntry);
    return logRef.id;
  } catch (err) {
    console.error('Audit log write error:', err);
    return '';
  }
}

/**
 * Get or create User Profile and Wallet
 */
export async function getOrCreateUserProfile(
  uid: string, 
  email: string, 
  name: string,
  sponsorReferralCode?: string
): Promise<{ profile: UserProfile; wallet: WalletData }> {
  const userRef = doc(db, 'users', uid);
  const walletRef = doc(db, 'wallets', uid);

  const [userSnap, walletSnap] = await Promise.all([
    getDoc(userRef),
    getDoc(walletRef)
  ]);

  let profile: UserProfile;
  let wallet: WalletData;

  // Bootstrap Super Admin role for designated email
  const isAdminEmail = email.toLowerCase() === 'infoaisoft26@gmail.com';

  if (!userSnap.exists()) {
    // Generate unique referral code
    let refCode = generateReferralCode();
    // Validate uniqueness
    const existingRefQ = query(collection(db, 'users'), where('referralCode', '==', refCode));
    const existingRefSnap = await getDocs(existingRefQ);
    if (!existingRefSnap.empty) {
      refCode = generateReferralCode();
    }

    profile = {
      uid,
      name: name || (isAdminEmail ? 'Global Finance Admin' : 'Global Finance Member'),
      email: email || '',
      referralCode: refCode,
      sponsorId: sponsorReferralCode || 'GF788872',
      role: isAdminEmail ? 'admin' : 'user',
      status: 'active',
      kycStatus: isAdminEmail ? 'verified' : 'unverified',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    wallet = defaultWallet(uid);

    await setDoc(userRef, profile);
    await setDoc(walletRef, wallet);

    // Record audit log for new registration
    await recordAuditLog(uid, email, 'User Registered', 'user', uid, {
      referralCode: refCode,
      sponsorId: profile.sponsorId,
      role: profile.role
    });

    // If sponsor exists, increment sponsor's direct team count
    if (profile.sponsorId) {
      try {
        const sponsorQ = query(collection(db, 'users'), where('referralCode', '==', profile.sponsorId));
        const sponsorSnap = await getDocs(sponsorQ);
        if (!sponsorSnap.empty) {
          const sponsorDoc = sponsorSnap.docs[0];
          const sponsorWalletRef = doc(db, 'wallets', sponsorDoc.id);
          await runTransaction(db, async (txn) => {
            const spWalletSnap = await txn.get(sponsorWalletRef);
            if (spWalletSnap.exists()) {
              const spData = spWalletSnap.data() as WalletData;
              txn.update(sponsorWalletRef, {
                directTeamCount: (spData.directTeamCount || 0) + 1,
                totalTeamCount: (spData.totalTeamCount || 0) + 1,
                updatedAt: new Date().toISOString()
              });
            }
          });
        }
      } catch (err) {
        console.warn('Could not update sponsor team counts:', err);
      }
    }
  } else {
    profile = userSnap.data() as UserProfile;
    // Elevate admin if email matches
    if (isAdminEmail && profile.role !== 'admin') {
      profile.role = 'admin';
      await updateDoc(userRef, { role: 'admin' });
    }

    if (!walletSnap.exists()) {
      wallet = defaultWallet(uid);
      await setDoc(walletRef, wallet);
    } else {
      wallet = walletSnap.data() as WalletData;
    }
  }

  return { profile, wallet };
}

/**
 * Recompute and verify wallet balances from immutable ledger entries
 */
export async function calculateBalancesFromLedger(userId: string): Promise<{
  derivedFundWallet: number;
  derivedIncomeWallet: number;
  totalCredits: number;
  totalDebits: number;
  entryCount: number;
}> {
  const txnRef = collection(db, 'transactions');
  const q = query(txnRef, where('userId', '==', userId));
  const snap = await getDocs(q);

  let fund = 0;
  let income = 0;
  let totalCredits = 0;
  let totalDebits = 0;

  snap.forEach(d => {
    const t = d.data() as TransactionLedger;
    if (t.status === 'completed') {
      if (t.category === 'fund_wallet') {
        if (t.flow === 'credit') {
          fund += t.amount;
          totalCredits += t.amount;
        } else {
          fund -= t.amount;
          totalDebits += t.amount;
        }
      } else if (t.category === 'income_wallet') {
        if (t.flow === 'credit') {
          income += t.amount;
          totalCredits += t.amount;
        } else {
          income -= t.amount;
          totalDebits += t.amount;
        }
      }
    }
  });

  return {
    derivedFundWallet: Number(Math.max(0, fund).toFixed(2)),
    derivedIncomeWallet: Number(Math.max(0, income).toFixed(2)),
    totalCredits: Number(totalCredits.toFixed(2)),
    totalDebits: Number(totalDebits.toFixed(2)),
    entryCount: snap.size
  };
}

/**
 * Update KYC details
 */
export async function updateUserKyc(
  uid: string, 
  data: Partial<UserProfile>
): Promise<void> {
  const userRef = doc(db, 'users', uid);
  await updateDoc(userRef, {
    ...data,
    kycStatus: 'pending',
    updatedAt: new Date().toISOString()
  });
}

/**
 * Submit KYC Documents (User side)
 */
export async function submitKycDocuments(
  userId: string,
  userEmail: string,
  userName: string,
  legalName: string,
  documentType: KycSubmission['documentType'],
  documentLast4: string,
  idDocFile: { name: string; dataUrl: string; storageId?: string },
  addressDocFile: { name: string; dataUrl: string; storageId?: string }
): Promise<string> {
  const subRef = doc(collection(db, 'kyc_submissions'));
  const submission: KycSubmission = {
    id: subRef.id,
    userId,
    userEmail,
    userName,
    legalName,
    documentType,
    documentLast4,
    idDocName: idDocFile.name,
    idDocStorageId: idDocFile.storageId || subRef.id + '_id',
    idDocDataUrl: idDocFile.dataUrl,
    addressDocName: addressDocFile.name,
    addressDocStorageId: addressDocFile.storageId || subRef.id + '_addr',
    addressDocDataUrl: addressDocFile.dataUrl,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await setDoc(subRef, submission);

  // Update user KYC status to pending
  await updateDoc(doc(db, 'users', userId), {
    kycStatus: 'pending',
    updatedAt: new Date().toISOString()
  });

  await recordAuditLog(userId, userEmail, 'KYC Submission Uploaded', 'kyc', subRef.id, {
    documentType,
    documentLast4
  });

  return subRef.id;
}

/**
 * Get user KYC submission
 */
export async function getUserKycSubmission(userId: string): Promise<KycSubmission | null> {
  try {
    const q = query(
      collection(db, 'kyc_submissions'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs[0].data() as KycSubmission;
    }
    return null;
  } catch (err) {
    console.error('Error fetching user KYC submission:', err);
    return null;
  }
}

/**
 * Recharge Available Fund (Deposit) inside an atomic transaction
 */
export async function executeRecharge(
  userId: string,
  amount: number,
  paymentMethod: string,
  utrRef: string
): Promise<{ success: boolean; transactionId: string }> {
  if (amount <= 0) throw new Error('Recharge amount must be greater than zero');

  const walletRef = doc(db, 'wallets', userId);
  const txnId = generateReferenceId('DEP');

  await runTransaction(db, async (transaction) => {
    const walletDoc = await transaction.get(walletRef);
    if (!walletDoc.exists()) {
      throw new Error('Wallet not found');
    }
    const currentWallet = walletDoc.data() as WalletData;
    const newFundWallet = (currentWallet.fundWallet || 0) + amount;

    // 1. Update Wallet
    transaction.update(walletRef, {
      fundWallet: Number(newFundWallet.toFixed(2)),
      updatedAt: new Date().toISOString()
    });

    // 2. Append to Immutable Ledger
    const ledgerRef = doc(db, 'transactions', txnId);
    const ledgerRecord: TransactionLedger = {
      id: txnId,
      userId,
      type: 'recharge',
      category: 'fund_wallet',
      flow: 'credit',
      amount,
      fee: 0,
      netAmount: amount,
      description: `Fund Wallet Recharge via ${paymentMethod} (UTR: ${utrRef})`,
      referenceId: utrRef || txnId,
      status: 'completed',
      createdAt: new Date().toISOString()
    };
    transaction.set(ledgerRef, ledgerRecord);
  });

  await recordAuditLog(userId, undefined, 'Recharge Executed', 'ledger', txnId, {
    amount,
    utrRef,
    paymentMethod
  });

  return { success: true, transactionId: txnId };
}

/**
 * Activate Package (Basic Package or FD Package)
 */
export async function activatePackage(
  userId: string,
  packageType: 'basic' | 'fd',
  packageName: string,
  amount: number,
  roiRate: number,
  durationDays: number
): Promise<{ success: boolean; packageId: string }> {
  const walletRef = doc(db, 'wallets', userId);
  const pkgId = generateReferenceId(packageType === 'basic' ? 'PKG' : 'FD');

  await runTransaction(db, async (transaction) => {
    const walletDoc = await transaction.get(walletRef);
    if (!walletDoc.exists()) {
      throw new Error('Wallet record not found');
    }
    const currentWallet = walletDoc.data() as WalletData;
    const currentFunds = currentWallet.fundWallet || 0;

    if (currentFunds < amount) {
      throw new Error(`Insufficient Available Fund balance. Required: ₹${amount.toFixed(2)}, Available: ₹${currentFunds.toFixed(2)}`);
    }

    const updatedFunds = currentFunds - amount;
    const updates: Partial<WalletData> = {
      fundWallet: Number(updatedFunds.toFixed(2)),
      updatedAt: new Date().toISOString()
    };

    if (packageType === 'basic') {
      updates.basicPackageActive = (currentWallet.basicPackageActive || 0) + amount;
    } else {
      updates.fdPackageActive = (currentWallet.fdPackageActive || 0) + amount;
    }

    // Update wallet balance
    transaction.update(walletRef, updates);

    // Save Package record
    const pkgDocRef = doc(db, 'packages', pkgId);
    const pkgRecord: PackageActivationRecord = {
      id: pkgId,
      userId,
      packageType,
      packageName,
      amount,
      roiDailyRate: roiRate,
      durationDays,
      totalEarned: 0,
      status: 'active',
      activatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString()
    };
    transaction.set(pkgDocRef, pkgRecord);

    // Immutable ledger record
    const ledgerRef = doc(db, 'transactions', pkgId);
    const ledgerRecord: TransactionLedger = {
      id: pkgId,
      userId,
      type: 'package_activation',
      category: 'fund_wallet',
      flow: 'debit',
      amount,
      fee: 0,
      netAmount: amount,
      description: `Activated ${packageName} (${packageType.toUpperCase()}) for ₹${amount.toFixed(2)}`,
      referenceId: pkgId,
      status: 'completed',
      createdAt: new Date().toISOString()
    };
    transaction.set(ledgerRef, ledgerRecord);
  });

  await recordAuditLog(userId, undefined, 'Package Activated', 'package', pkgId, {
    packageName,
    packageType,
    amount
  });

  return { success: true, packageId: pkgId };
}

/**
 * P2P Transfer (Transfer funds to another user by Referral Code)
 */
export async function executeP2PTransfer(
  senderUserId: string,
  recipientReferralCode: string,
  sourceWalletType: 'fund_wallet' | 'income_wallet',
  amount: number,
  remarks?: string
): Promise<{ success: boolean; transactionId: string; recipientName: string }> {
  if (amount <= 0) throw new Error('Transfer amount must be positive');

  // Find recipient
  const usersRef = collection(db, 'users');
  const recipientQ = query(usersRef, where('referralCode', '==', recipientReferralCode.trim().toUpperCase()));
  const recipientSnap = await getDocs(recipientQ);

  if (recipientSnap.empty) {
    throw new Error(`Recipient with Referral ID "${recipientReferralCode}" not found.`);
  }

  const recipientDoc = recipientSnap.docs[0];
  const recipientData = recipientDoc.data() as UserProfile;
  const recipientUserId = recipientDoc.id;

  if (recipientUserId === senderUserId) {
    throw new Error('You cannot transfer funds to your own account.');
  }

  const txnId = generateReferenceId('P2P');
  const senderWalletRef = doc(db, 'wallets', senderUserId);
  const recipientWalletRef = doc(db, 'wallets', recipientUserId);

  await runTransaction(db, async (transaction) => {
    const [senderWalletDoc, recipientWalletDoc] = await Promise.all([
      transaction.get(senderWalletRef),
      transaction.get(recipientWalletRef)
    ]);

    if (!senderWalletDoc.exists()) throw new Error('Sender wallet not found');
    if (!recipientWalletDoc.exists()) throw new Error('Recipient wallet not found');

    const senderWallet = senderWalletDoc.data() as WalletData;
    const recipientWallet = recipientWalletDoc.data() as WalletData;

    const available = sourceWalletType === 'fund_wallet' ? senderWallet.fundWallet : senderWallet.incomeWallet;
    if (available < amount) {
      throw new Error(`Insufficient balance in selected wallet. Available: ₹${available.toFixed(2)}`);
    }

    // Deduct from sender
    if (sourceWalletType === 'fund_wallet') {
      transaction.update(senderWalletRef, {
        fundWallet: Number((senderWallet.fundWallet - amount).toFixed(2)),
        updatedAt: new Date().toISOString()
      });
    } else {
      transaction.update(senderWalletRef, {
        incomeWallet: Number((senderWallet.incomeWallet - amount).toFixed(2)),
        updatedAt: new Date().toISOString()
      });
    }

    // Credit to recipient's Available Fund
    transaction.update(recipientWalletRef, {
      fundWallet: Number(((recipientWallet.fundWallet || 0) + amount).toFixed(2)),
      updatedAt: new Date().toISOString()
    });

    // Sender Ledger Record (Debit)
    const senderLedgerRef = doc(db, 'transactions', `${txnId}_OUT`);
    transaction.set(senderLedgerRef, {
      id: `${txnId}_OUT`,
      userId: senderUserId,
      type: 'p2p_transfer',
      category: sourceWalletType,
      flow: 'debit',
      amount,
      fee: 0,
      netAmount: amount,
      description: `P2P Transfer to ${recipientData.name} (${recipientReferralCode})${remarks ? ` - ${remarks}` : ''}`,
      referenceId: txnId,
      recipientUserId,
      status: 'completed',
      createdAt: new Date().toISOString()
    });

    // Recipient Ledger Record (Credit)
    const recipientLedgerRef = doc(db, 'transactions', `${txnId}_IN`);
    transaction.set(recipientLedgerRef, {
      id: `${txnId}_IN`,
      userId: recipientUserId,
      type: 'p2p_transfer',
      category: 'fund_wallet',
      flow: 'credit',
      amount,
      fee: 0,
      netAmount: amount,
      description: `P2P Received from GF Member${remarks ? ` - ${remarks}` : ''}`,
      referenceId: txnId,
      senderUserId,
      status: 'completed',
      createdAt: new Date().toISOString()
    });
  });

  return { success: true, transactionId: txnId, recipientName: recipientData.name };
}

/**
 * Transfer Income Wallet To Fund Wallet
 */
export async function transferIncomeToFund(
  userId: string,
  amount: number
): Promise<{ success: boolean; transactionId: string }> {
  if (amount <= 0) throw new Error('Transfer amount must be greater than zero');

  const walletRef = doc(db, 'wallets', userId);
  const txnId = generateReferenceId('CONV');

  await runTransaction(db, async (transaction) => {
    const walletDoc = await transaction.get(walletRef);
    if (!walletDoc.exists()) throw new Error('Wallet not found');

    const wallet = walletDoc.data() as WalletData;
    if ((wallet.incomeWallet || 0) < amount) {
      throw new Error(`Insufficient Available Balance. Available: ₹${(wallet.incomeWallet || 0).toFixed(2)}`);
    }

    const newIncome = Number((wallet.incomeWallet - amount).toFixed(2));
    const newFund = Number(((wallet.fundWallet || 0) + amount).toFixed(2));

    transaction.update(walletRef, {
      incomeWallet: newIncome,
      fundWallet: newFund,
      updatedAt: new Date().toISOString()
    });

    const ledgerRef = doc(db, 'transactions', txnId);
    transaction.set(ledgerRef, {
      id: txnId,
      userId,
      type: 'income_to_fund',
      category: 'fund_wallet',
      flow: 'credit',
      amount,
      fee: 0,
      netAmount: amount,
      description: `Transferred ₹${amount.toFixed(2)} from Available Balance to Available Fund`,
      referenceId: txnId,
      status: 'completed',
      createdAt: new Date().toISOString()
    });
  });

  return { success: true, transactionId: txnId };
}

/**
 * Fund Withdrawal (Payout)
 */
export async function requestWithdrawal(
  userId: string,
  amount: number,
  withdrawalType: 'bank' | 'upi',
  destinationDetails: string
): Promise<{ success: boolean; transactionId: string; netAmount: number; tdsFee: number }> {
  if (amount < 500) {
    throw new Error('Minimum withdrawal amount is ₹500.00');
  }

  const walletRef = doc(db, 'wallets', userId);
  const txnId = generateReferenceId('WTH');
  const tdsFee = Number((amount * 0.05).toFixed(2)); // 5% TDS / Processing
  const netAmount = Number((amount - tdsFee).toFixed(2));

  await runTransaction(db, async (transaction) => {
    const walletDoc = await transaction.get(walletRef);
    if (!walletDoc.exists()) throw new Error('Wallet not found');

    const wallet = walletDoc.data() as WalletData;
    if ((wallet.incomeWallet || 0) < amount) {
      throw new Error(`Insufficient Available Balance. Available: ₹${(wallet.incomeWallet || 0).toFixed(2)}`);
    }

    const newIncomeWallet = Number((wallet.incomeWallet - amount).toFixed(2));
    const newTotalWithdrawal = Number(((wallet.totalWithdrawal || 0) + amount).toFixed(2));

    transaction.update(walletRef, {
      incomeWallet: newIncomeWallet,
      totalWithdrawal: newTotalWithdrawal,
      updatedAt: new Date().toISOString()
    });

    const ledgerRef = doc(db, 'transactions', txnId);
    transaction.set(ledgerRef, {
      id: txnId,
      userId,
      type: 'withdrawal',
      category: 'income_wallet',
      flow: 'debit',
      amount,
      fee: tdsFee,
      netAmount,
      description: `Withdrawal via ${withdrawalType.toUpperCase()} to ${destinationDetails} (5% TDS/Govt deduction applied: ₹${tdsFee})`,
      referenceId: txnId,
      status: 'completed',
      createdAt: new Date().toISOString()
    });
  });

  return { success: true, transactionId: txnId, netAmount, tdsFee };
}

/**
 * Fetch Transactions Ledger
 */
export async function getTransactions(
  userId: string,
  filterCategory?: 'fund_wallet' | 'income_wallet',
  filterType?: TransactionType
): Promise<TransactionLedger[]> {
  try {
    const currentUser = auth.currentUser;
    if (currentUser && currentUser.uid === userId) {
      const token = await currentUser.getIdToken();
      const response = await fetch('/api/usdt-recharge?scope=ledger', {
        method: 'GET',
        credentials: 'include',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && Array.isArray(data.transactions)) {
        let list = data.transactions as TransactionLedger[];
        if (filterCategory) list = list.filter(t => t.category === filterCategory);
        if (filterType) list = list.filter(t => t.type === filterType);
        return list;
      }
    }

    // Legacy Firestore fallback for non-migrated historical records.
    const txnRef = collection(db, 'transactions');
    const q = query(txnRef, where('userId', '==', userId), orderBy('createdAt', 'desc'), limit(100));
    const snap = await getDocs(q);
    let list: TransactionLedger[] = snap.docs.map(d => d.data() as TransactionLedger);
    if (filterCategory) list = list.filter(t => t.category === filterCategory);
    if (filterType) list = list.filter(t => t.type === filterType);
    return list;
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return [];
  }
}

/**
 * Fetch Downline Members
 */
export async function getDownlineMembers(referralCode: string): Promise<DownlineMember[]> {
  try {
    // 1. Direct team
    const usersRef = collection(db, 'users');
    const directQ = query(usersRef, where('sponsorId', '==', referralCode));
    const directSnap = await getDocs(directQ);

    const directList: DownlineMember[] = [];
    const directCodes: string[] = [];

    for (const d of directSnap.docs) {
      const u = d.data() as UserProfile;
      directCodes.push(u.referralCode);
      directList.push({
        id: d.id,
        userId: u.uid,
        sponsorId: u.sponsorId || '',
        referralCode: u.referralCode,
        name: u.name,
        email: u.email,
        phone: u.phone || '—',
        level: 1,
        joinDate: u.createdAt,
        activePackage: 0,
        status: u.status === 'suspended' ? 'inactive' : 'active'
      });
    }

    // 2. Level 2 members (referred by level 1)
    if (directCodes.length > 0) {
      const level2Batches = [];
      for (let i = 0; i < Math.min(directCodes.length, 10); i++) {
        const l2Q = query(usersRef, where('sponsorId', '==', directCodes[i]));
        level2Batches.push(getDocs(l2Q));
      }
      const l2Snaps = await Promise.all(level2Batches);
      for (const snap of l2Snaps) {
        for (const d of snap.docs) {
          const u = d.data() as UserProfile;
          directList.push({
            id: d.id,
            userId: u.uid,
            sponsorId: u.sponsorId || '',
            referralCode: u.referralCode,
            name: u.name,
            email: u.email,
            phone: u.phone || '—',
            level: 2,
            joinDate: u.createdAt,
            activePackage: 0,
            status: u.status === 'suspended' ? 'inactive' : 'active'
          });
        }
      }
    }

    return directList;
  } catch (err) {
    console.error('Failed to get downline members:', err);
    return [];
  }
}

/**
 * Support Tickets
 */
export async function createSupportTicket(
  userId: string,
  userEmail: string,
  userName: string,
  subject: string,
  category: SupportTicket['category'],
  priority: SupportTicket['priority'],
  message: string
): Promise<string> {
  const ticketRef = doc(collection(db, 'tickets'));
  const initialMsg: TicketMessage = {
    id: generateReferenceId('MSG'),
    senderId: userId,
    senderRole: 'user',
    senderName: userName || userEmail,
    message,
    createdAt: new Date().toISOString()
  };

  const ticket: SupportTicket = {
    id: ticketRef.id,
    userId,
    userEmail,
    userName: userName || userEmail,
    subject,
    category,
    priority,
    message,
    status: 'open',
    messages: [initialMsg],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await setDoc(ticketRef, ticket);

  await recordAuditLog(userId, userEmail, 'Support Ticket Created', 'ticket', ticketRef.id, {
    subject,
    category,
    priority
  });

  return ticketRef.id;
}

export async function getSupportTickets(userId?: string): Promise<SupportTicket[]> {
  try {
    const ticketRef = collection(db, 'tickets');
    let q;
    if (userId) {
      q = query(ticketRef, where('userId', '==', userId), orderBy('createdAt', 'desc'), limit(50));
    } else {
      q = query(ticketRef, orderBy('createdAt', 'desc'), limit(100));
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as SupportTicket);
  } catch (err) {
    console.error('Failed to fetch tickets:', err);
    return [];
  }
}

export async function addTicketReply(
  ticketId: string,
  senderId: string,
  senderRole: 'user' | 'admin',
  senderName: string,
  messageText: string,
  newStatus?: SupportTicket['status']
): Promise<void> {
  const ticketRef = doc(db, 'tickets', ticketId);
  const snap = await getDoc(ticketRef);
  if (!snap.exists()) throw new Error('Ticket not found');

  const ticketData = snap.data() as SupportTicket;
  const newMsg: TicketMessage = {
    id: generateReferenceId('MSG'),
    senderId,
    senderRole,
    senderName,
    message: messageText,
    createdAt: new Date().toISOString()
  };

  const currentMessages = ticketData.messages || [];
  const updates: Partial<SupportTicket> = {
    messages: [...currentMessages, newMsg],
    updatedAt: new Date().toISOString()
  };

  if (senderRole === 'admin') {
    updates.adminReply = messageText;
  }
  if (newStatus) {
    updates.status = newStatus;
  }

  await updateDoc(ticketRef, updates);

  await recordAuditLog(senderId, undefined, `Ticket Reply (${senderRole})`, 'ticket', ticketId, {
    status: newStatus || ticketData.status
  });
}

/**
 * =====================================================================
 * ADMIN MANAGEMENT SERVICES
 * =====================================================================
 */

/**
 * Fetch all users for Admin
 */
export async function adminGetAllUsers(): Promise<UserProfile[]> {
  const usersRef = collection(db, 'users');
  const snap = await getDocs(usersRef);
  return snap.docs.map(d => d.data() as UserProfile);
}

/**
 * Fetch user profile and corresponding wallet
 */
export async function adminGetUserDetail(userId: string): Promise<{
  profile: UserProfile | null;
  wallet: WalletData | null;
  ledgerStats: {
    derivedFundWallet: number;
    derivedIncomeWallet: number;
    totalCredits: number;
    totalDebits: number;
    entryCount: number;
  };
  packages: PackageActivationRecord[];
}> {
  const userSnap = await getDoc(doc(db, 'users', userId));
  const walletSnap = await getDoc(doc(db, 'wallets', userId));
  const ledgerStats = await calculateBalancesFromLedger(userId);

  // Packages
  const pkgQ = query(collection(db, 'packages'), where('userId', '==', userId));
  const pkgSnap = await getDocs(pkgQ);
  const packages = pkgSnap.docs.map(d => d.data() as PackageActivationRecord);

  return {
    profile: userSnap.exists() ? (userSnap.data() as UserProfile) : null,
    wallet: walletSnap.exists() ? (walletSnap.data() as WalletData) : null,
    ledgerStats,
    packages
  };
}

/**
 * Suspend / Reactivate User (Admin only)
 */
export async function adminSetUserStatus(
  adminUserId: string,
  targetUserId: string,
  newStatus: 'active' | 'suspended',
  reason?: string
): Promise<void> {
  const userRef = doc(db, 'users', targetUserId);
  await updateDoc(userRef, {
    status: newStatus,
    updatedAt: new Date().toISOString()
  });

  await recordAuditLog(
    adminUserId, 
    undefined, 
    newStatus === 'suspended' ? 'User Suspended' : 'User Reactivated', 
    'user', 
    targetUserId, 
    { reason }
  );
}

/**
 * Admin Audited Financial Adjustment (Never sets balance directly, creates ledger transaction)
 */
export async function adminAuditedFinancialAdjustment(
  adminUserId: string,
  targetUserId: string,
  walletType: 'fund_wallet' | 'income_wallet',
  flow: 'credit' | 'debit',
  amount: number,
  reason: string
): Promise<{ success: boolean; transactionId: string }> {
  if (amount <= 0) throw new Error('Adjustment amount must be positive');
  if (!reason.trim()) throw new Error('An audit reason is required for any financial adjustment');

  const walletRef = doc(db, 'wallets', targetUserId);
  const txnId = generateReferenceId('ADJ');

  await runTransaction(db, async (txn) => {
    const walletDoc = await txn.get(walletRef);
    if (!walletDoc.exists()) throw new Error('Target user wallet not found');

    const wallet = walletDoc.data() as WalletData;
    const currentVal = walletType === 'fund_wallet' ? wallet.fundWallet : wallet.incomeWallet;

    let newVal = currentVal;
    if (flow === 'credit') {
      newVal = currentVal + amount;
    } else {
      if (currentVal < amount) {
        throw new Error(`Insufficient wallet balance for debit. Current balance: ₹${currentVal}`);
      }
      newVal = currentVal - amount;
    }

    const updates: Partial<WalletData> = {
      [walletType]: Number(newVal.toFixed(2)),
      updatedAt: new Date().toISOString()
    };
    txn.update(walletRef, updates);

    const ledgerRef = doc(db, 'transactions', txnId);
    const record: TransactionLedger = {
      id: txnId,
      userId: targetUserId,
      type: 'admin_adjustment',
      category: walletType,
      flow,
      amount,
      fee: 0,
      netAmount: amount,
      description: `[Audited Adjustment] ${flow.toUpperCase()} ₹${amount.toFixed(2)}: ${reason}`,
      referenceId: txnId,
      status: 'completed',
      metadata: { adminUserId, reason },
      createdAt: new Date().toISOString()
    };
    txn.set(ledgerRef, record);
  });

  await recordAuditLog(adminUserId, undefined, `Audited Ledger Adjustment (${flow.toUpperCase()})`, 'ledger', txnId, {
    targetUserId,
    walletType,
    amount,
    reason
  });

  return { success: true, transactionId: txnId };
}

/**
 * Admin KYC Management
 */
export async function adminGetAllKycSubmissions(): Promise<KycSubmission[]> {
  try {
    const q = query(collection(db, 'kyc_submissions'), orderBy('createdAt', 'desc'), limit(100));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as KycSubmission);
  } catch (err) {
    console.error('Failed to get KYC submissions:', err);
    return [];
  }
}

export async function adminReviewKycSubmission(
  adminUserId: string,
  submissionId: string,
  status: 'verified' | 'rejected' | 'in_review',
  adminNotes?: string
): Promise<void> {
  const subRef = doc(db, 'kyc_submissions', submissionId);
  const snap = await getDoc(subRef);
  if (!snap.exists()) throw new Error('KYC submission not found');

  const sub = snap.data() as KycSubmission;

  await updateDoc(subRef, {
    status,
    adminNotes: adminNotes || '',
    reviewedBy: adminUserId,
    reviewedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  // Update User profile KYC status
  const userRef = doc(db, 'users', sub.userId);
  await updateDoc(userRef, {
    kycStatus: status === 'in_review' ? 'pending' : status,
    updatedAt: new Date().toISOString()
  });

  await recordAuditLog(adminUserId, undefined, `KYC Marked ${status.toUpperCase()}`, 'kyc', submissionId, {
    targetUserId: sub.userId,
    status,
    adminNotes
  });
}

/**
 * Admin Packages Management (Database-driven configuration)
 */
export const defaultPackageDefinitions: PackageDefinition[] = [
  {
    id: 'pkg-basic-standard',
    name: 'Basic Growth Package',
    code: 'BASIC_GROWTH',
    type: 'basic',
    minAmount: 1000,
    maxAmount: 50000,
    roiRate: 0.8,
    durationDays: 200,
    description: 'Standard Daily Growth Package offering 0.8% everyday ROI with verified ledger transparency.',
    terms: 'Daily disbursement to Available Balance. Capital locked for package period.',
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'pkg-fd-premium',
    name: 'Fixed Deposit (FD) Yield',
    code: 'FD_PREMIUM',
    type: 'fd',
    minAmount: 5000,
    maxAmount: 500000,
    roiRate: 1.2,
    durationDays: 180,
    description: 'High-yield Fixed Deposit with guaranteed maturity release and periodic level incentives.',
    terms: 'Compounded rate release. Early liquidation subject to 10% administrative levy.',
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export async function adminGetPackageDefinitions(): Promise<PackageDefinition[]> {
  try {
    const snap = await getDocs(collection(db, 'package_definitions'));
    if (snap.empty) {
      // Seed initial package definitions into DB
      for (const p of defaultPackageDefinitions) {
        await setDoc(doc(db, 'package_definitions', p.id), p);
      }
      return defaultPackageDefinitions;
    }
    return snap.docs.map(d => d.data() as PackageDefinition);
  } catch (err) {
    console.error('Error fetching package definitions:', err);
    return defaultPackageDefinitions;
  }
}

export const adminGetPackages = adminGetPackageDefinitions;

export async function adminSavePackageDefinition(
  adminUserId: string,
  pkg: PackageDefinition
): Promise<void> {
  const pkgRef = doc(db, 'package_definitions', pkg.id);
  await setDoc(pkgRef, {
    ...pkg,
    updatedAt: new Date().toISOString()
  });

  await recordAuditLog(adminUserId, undefined, 'Package Configuration Saved', 'package', pkg.id, {
    name: pkg.name,
    type: pkg.type,
    minAmount: pkg.minAmount,
    maxAmount: pkg.maxAmount,
    roiRate: pkg.roiRate,
    active: pkg.active
  });
}

/**
 * Admin Audit Logs
 */
export async function adminGetAuditLogs(limitCount = 100): Promise<AuditLog[]> {
  try {
    const q = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(limitCount));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as AuditLog);
  } catch (err) {
    console.error('Failed to get audit logs:', err);
    return [];
  }
}

/**
 * Admin Global Settings
 */
export async function adminGetSettings(): Promise<AdminSettings> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'global'));
    if (snap.exists()) {
      return snap.data() as AdminSettings;
    }
    const defaultSettings: AdminSettings = {
      id: 'global',
      platformName: 'GLOBAL FINANCE',
      paymentsEnabled: false, // Default safety flag
      payoutsEnabled: false,  // Default safety flag
      maintenanceMode: false,
      minWithdrawal: 500,
      withdrawalFeePercent: 5,
      supportEmail: 'support@globalfinance.digital',
      updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, 'settings', 'global'), defaultSettings);
    return defaultSettings;
  } catch (err) {
    return {
      id: 'global',
      platformName: 'GLOBAL FINANCE',
      paymentsEnabled: false,
      payoutsEnabled: false,
      maintenanceMode: false,
      minWithdrawal: 500,
      withdrawalFeePercent: 5,
      supportEmail: 'support@globalfinance.digital',
      updatedAt: new Date().toISOString()
    };
  }
}

export async function adminSaveSettings(
  adminUserId: string,
  settings: Partial<AdminSettings>
): Promise<void> {
  const ref = doc(db, 'settings', 'global');
  await updateDoc(ref, {
    ...settings,
    updatedAt: new Date().toISOString(),
    updatedBy: adminUserId
  });

  await recordAuditLog(adminUserId, undefined, 'Admin Global Settings Updated', 'settings', 'global', settings);
}

/**
 * Admin Dashboard Metrics (Calculated exclusively from real database records)
 */
export async function adminGetDashboardMetrics(): Promise<{
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  pendingKyc: number;
  verifiedKyc: number;
  rejectedKyc: number;
  openTickets: number;
  inProgressTickets: number;
  closedTickets: number;
  totalBasicActivations: number;
  totalFdActivations: number;
  ledgerTransactionCount: number;
}> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Admin authentication required');

  const token = await currentUser.getIdToken();
  const response = await fetch('/api/admin-network?mode=dashboard-metrics', {
    method: 'GET',
    credentials: 'include',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Unable to load live dashboard metrics');
  }

  return {
    totalUsers: Number(data.totalUsers || 0),
    activeUsers: Number(data.activeUsers || 0),
    suspendedUsers: Number(data.suspendedUsers || 0),
    pendingKyc: Number(data.pendingKyc || 0),
    verifiedKyc: Number(data.verifiedKyc || 0),
    rejectedKyc: Number(data.rejectedKyc || 0),
    openTickets: Number(data.openTickets || 0),
    inProgressTickets: Number(data.inProgressTickets || 0),
    closedTickets: Number(data.closedTickets || 0),
    totalBasicActivations: Number(data.totalBasicActivations || 0),
    totalFdActivations: Number(data.totalFdActivations || 0),
    ledgerTransactionCount: Number(data.ledgerTransactionCount || 0),
  };
}> {
  const [usersSnap, kycSnap, ticketsSnap, packagesSnap, txnsSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'kyc_submissions')),
    getDocs(collection(db, 'tickets')),
    getDocs(collection(db, 'packages')),
    getDocs(collection(db, 'transactions'))
  ]);

  let totalUsers = usersSnap.size;
  let activeUsers = 0;
  let suspendedUsers = 0;

  usersSnap.forEach(d => {
    const u = d.data() as UserProfile;
    if (u.status === 'suspended') {
      suspendedUsers++;
    } else {
      activeUsers++;
    }
  });

  let pendingKyc = 0;
  let verifiedKyc = 0;
  let rejectedKyc = 0;

  kycSnap.forEach(d => {
    const k = d.data() as KycSubmission;
    if (k.status === 'pending' || k.status === 'in_review') pendingKyc++;
    else if (k.status === 'verified') verifiedKyc++;
    else if (k.status === 'rejected') rejectedKyc++;
  });

  let openTickets = 0;
  let inProgressTickets = 0;
  let closedTickets = 0;

  ticketsSnap.forEach(d => {
    const t = d.data() as SupportTicket;
    if (t.status === 'open') openTickets++;
    else if (t.status === 'in_progress') inProgressTickets++;
    else closedTickets++;
  });

  let totalBasicActivations = 0;
  let totalFdActivations = 0;

  packagesSnap.forEach(d => {
    const p = d.data() as PackageActivationRecord;
    if (p.packageType === 'basic') totalBasicActivations++;
    else if (p.packageType === 'fd') totalFdActivations++;
  });

  return {
    totalUsers,
    activeUsers,
    suspendedUsers,
    pendingKyc,
    verifiedKyc,
    rejectedKyc,
    openTickets,
    inProgressTickets,
    closedTickets,
    totalBasicActivations,
    totalFdActivations,
    ledgerTransactionCount: txnsSnap.size
  };
}
