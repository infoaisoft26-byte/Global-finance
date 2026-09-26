import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  runTransaction 
} from 'firebase/firestore';
import { db } from '../lib/firebase.ts';
import type { 
  PackageActivationRequest, 
  PackageActivationStatus, 
  PackageDefinition, 
  UserProfile, 
  WalletData,
  PackageActivationRecord 
} from '../types/index.ts';
import { 
  rupeesToPaise, 
  paiseToRupees, 
  generateReferenceId, 
  getWalletBalanceFromLedger, 
  executeLedgerPackageActivation 
} from './ledgerService.ts';
import { getSystemSettings } from './settingsService.ts';
import { createNotification, notifyAdmins } from './notificationService.ts';
import { recordAuditLog, adminGetPackages } from './financeService.ts';

/**
 * Creates a new package activation request
 */
export async function createPackageActivationRequest(params: {
  userId: string;
  userEmail?: string;
  userName?: string;
  userReferralCode?: string;
  packageId: string;
  amountRupees: number;
}): Promise<{ success: boolean; request: PackageActivationRequest; message: string }> {
  const { userId, userEmail, userName, userReferralCode, packageId, amountRupees } = params;

  if (amountRupees <= 0) {
    throw new Error('Activation amount must be greater than zero.');
  }

  const amountPaise = rupeesToPaise(amountRupees);
  const settings = await getSystemSettings();

  // 1. Fetch user profile
  const userDoc = await getDoc(doc(db, 'users', userId));
  if (!userDoc.exists()) throw new Error('User profile record not found.');
  const userProfile = userDoc.data() as UserProfile;

  if (userProfile.status === 'suspended') {
    throw new Error('Account suspended. Package activations are prohibited.');
  }

  // 2. Check KYC if required by settings
  if (settings.requireKycForPackageActivation && userProfile.kycStatus !== 'verified') {
    throw new Error('KYC verification is mandatory prior to subscribing to investment packages.');
  }

  // 3. Fetch package definition from database
  const packages = await adminGetPackages();
  const pkgDef = packages.find(p => p.id === packageId || p.code === packageId);
  if (!pkgDef) {
    throw new Error(`Package definition "${packageId}" not found in system.`);
  }

  if (!pkgDef.active) {
    throw new Error(`The package "${pkgDef.name}" is currently inactive.`);
  }

  if (pkgDef.type === 'basic' && !settings.basicPackageEnabled) {
    throw new Error('Basic Packages are currently disabled in platform settings.');
  }
  if (pkgDef.type === 'fd' && !settings.fdPackageEnabled) {
    throw new Error('Fixed Deposit (FD) Packages are currently disabled in platform settings.');
  }

  if (amountRupees < pkgDef.minAmount) {
    throw new Error(`Minimum activation amount for ${pkgDef.name} is ₹${pkgDef.minAmount.toFixed(2)}.`);
  }
  if (amountRupees > pkgDef.maxAmount) {
    throw new Error(`Maximum activation amount for ${pkgDef.name} is ₹${pkgDef.maxAmount.toFixed(2)}.`);
  }

  // 4. Validate user's available fund balance via ledger
  const balances = await getWalletBalanceFromLedger(userId);
  if (balances.fundWalletPaise < amountPaise) {
    throw new Error(
      `Insufficient Available Fund balance. Required: ₹${amountRupees.toFixed(2)}, Available: ₹${balances.fundWalletRupees.toFixed(2)}. Please recharge your fund wallet.`
    );
  }

  const reference = generateReferenceId('ACT');
  const now = new Date().toISOString();
  const reqDocRef = doc(collection(db, 'package_activation_requests'));

  const needsApproval = settings.packageActivationApprovalRequired;
  const initialStatus: PackageActivationStatus = needsApproval ? 'pending' : 'active';

  const requestRecord: PackageActivationRequest = {
    id: reqDocRef.id,
    reference,
    userId,
    userEmail: userEmail || userProfile.email,
    userName: userName || userProfile.name,
    userReferralCode: userReferralCode || userProfile.referralCode,
    packageId: pkgDef.id,
    packageName: pkgDef.name,
    packageType: pkgDef.type,
    amountPaise,
    amountRupees,
    fundingSource: 'fund_wallet',
    status: initialStatus,
    createdAt: now,
    updatedAt: now
  };

  // If immediate activation (no approval required), execute ledger debit and create active package
  if (!needsApproval) {
    await executeLedgerPackageActivation(userId, pkgDef.name, pkgDef.type, amountPaise, reference);
    requestRecord.activatedAt = now;

    // Create Package record in packages collection
    const activePkgRef = doc(db, 'packages', reference);
    const activePkg: PackageActivationRecord = {
      id: reference,
      userId,
      packageType: pkgDef.type,
      packageName: pkgDef.name,
      amount: amountRupees,
      roiDailyRate: pkgDef.roiRate,
      durationDays: pkgDef.durationDays,
      totalEarned: 0,
      status: 'active',
      activatedAt: now,
      expiresAt: new Date(Date.now() + pkgDef.durationDays * 24 * 60 * 60 * 1000).toISOString()
    };
    await setDoc(activePkgRef, activePkg);

    // Update active package balance in user wallet snapshot
    const walletRef = doc(db, 'wallets', userId);
    const wSnap = await getDoc(walletRef);
    if (wSnap.exists()) {
      const curWallet = wSnap.data() as WalletData;
      const field = pkgDef.type === 'basic' ? 'basicPackageActive' : 'fdPackageActive';
      await updateDoc(walletRef, {
        [field]: Number(((curWallet[field] || 0) + amountRupees).toFixed(2)),
        updatedAt: now
      });
    }
  }

  await setDoc(reqDocRef, requestRecord);

  // Notifications
  await createNotification(
    userId,
    'package',
    needsApproval ? 'Package Activation Request Submitted' : 'Package Activated Successfully',
    `Activation request for ${pkgDef.name} of ₹${amountRupees.toFixed(2)} (${reference}) status: ${initialStatus.toUpperCase()}.`,
    '/package-activations'
  );

  if (needsApproval) {
    await notifyAdmins(
      'New Package Activation Request',
      `Member ${userProfile.referralCode} requested activation of ${pkgDef.name} for ₹${amountRupees.toFixed(2)}.`,
      'admin',
      '/admin/package-activations'
    );
  }

  // Audit
  await recordAuditLog(
    userId,
    userEmail,
    `Package Activation Request (${initialStatus.toUpperCase()})`,
    'package_activation',
    reqDocRef.id,
    {
      reference,
      packageId: pkgDef.id,
      packageName: pkgDef.name,
      amountRupees,
      status: initialStatus
    }
  );

  return {
    success: true,
    request: requestRecord,
    message: needsApproval 
      ? `Package activation request submitted with status PENDING. Reference: ${reference}. Awaiting compliance authorization.`
      : `Package ${pkgDef.name} activated successfully and recorded in double-entry ledger. Reference: ${reference}`
  };
}

/**
 * Fetch package activation requests for a specific user
 */
export async function getUserPackageActivationRequests(
  userId: string
): Promise<PackageActivationRequest[]> {
  try {
    const ref = collection(db, 'package_activation_requests');
    const q = query(ref, where('userId', '==', userId), orderBy('createdAt', 'desc'), limit(50));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as PackageActivationRequest);
  } catch (err) {
    console.error('Failed to get user package activation requests:', err);
    return [];
  }
}

/**
 * Fetch all package activation requests for Admin
 */
export async function adminGetAllPackageActivationRequests(): Promise<PackageActivationRequest[]> {
  try {
    const ref = collection(db, 'package_activation_requests');
    const q = query(ref, orderBy('createdAt', 'desc'), limit(100));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as PackageActivationRequest);
  } catch (err) {
    console.error('Failed to get admin package activation requests:', err);
    return [];
  }
}

/**
 * Admin reviews and approves/activates or rejects a package activation request
 */
export async function adminUpdatePackageActivationStatus(
  adminUserId: string,
  adminEmail: string | undefined,
  requestId: string,
  targetStatus: PackageActivationStatus,
  adminNote?: string
): Promise<{ success: boolean; request: PackageActivationRequest }> {
  const reqRef = doc(db, 'package_activation_requests', requestId);
  const snap = await getDoc(reqRef);
  if (!snap.exists()) throw new Error('Package activation request not found.');

  const current = snap.data() as PackageActivationRequest;
  const now = new Date().toISOString();

  const updates: Partial<PackageActivationRequest> = {
    status: targetStatus,
    adminNote: adminNote || current.adminNote || '',
    updatedAt: now
  };

  if (targetStatus === 'approved' || targetStatus === 'active') {
    updates.approvedBy = adminUserId;
    updates.approvedAt = now;

    if (targetStatus === 'active' && current.status !== 'active') {
      updates.activatedAt = now;

      // Execute double-entry ledger deduction
      await executeLedgerPackageActivation(
        current.userId,
        current.packageName,
        current.packageType,
        current.amountPaise,
        current.reference
      );

      // Save Package record
      const activePkgRef = doc(db, 'packages', current.reference);
      const activePkg: PackageActivationRecord = {
        id: current.reference,
        userId: current.userId,
        packageType: current.packageType,
        packageName: current.packageName,
        amount: current.amountRupees,
        roiDailyRate: current.packageType === 'basic' ? 0.8 : 1.2,
        durationDays: 200,
        totalEarned: 0,
        status: 'active',
        activatedAt: now,
        expiresAt: new Date(Date.now() + 200 * 24 * 60 * 60 * 1000).toISOString()
      };
      await setDoc(activePkgRef, activePkg);

      // Update wallet snapshot
      const walletRef = doc(db, 'wallets', current.userId);
      const wSnap = await getDoc(walletRef);
      if (wSnap.exists()) {
        const curWallet = wSnap.data() as WalletData;
        const field = current.packageType === 'basic' ? 'basicPackageActive' : 'fdPackageActive';
        await updateDoc(walletRef, {
          [field]: Number(((curWallet[field] || 0) + current.amountRupees).toFixed(2)),
          updatedAt: now
        });
      }
    }
  } else if (targetStatus === 'rejected') {
    updates.rejectedAt = now;
  }

  await updateDoc(reqRef, updates);

  // Notify user
  await createNotification(
    current.userId,
    'package',
    `Package Activation ${targetStatus.toUpperCase()}`,
    `Your activation request for ${current.packageName} (${current.reference}) has been marked as ${targetStatus.toUpperCase()}. ${adminNote ? 'Note: ' + adminNote : ''}`,
    '/package-activations'
  );

  // Audit
  await recordAuditLog(
    adminUserId,
    adminEmail,
    `Package Activation Request ${targetStatus.toUpperCase()}`,
    'package_activation',
    requestId,
    {
      reference: current.reference,
      status: targetStatus,
      adminNote
    }
  );

  return {
    success: true,
    request: { ...current, ...updates }
  };
}
