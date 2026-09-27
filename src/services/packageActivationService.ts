import { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase.ts';
import type { PackageActivationRequest, PackageActivationStatus, PackageDefinition, UserProfile, WalletData, PackageActivationRecord } from '../types/index.ts';
import { rupeesToPaise, generateReferenceId, getWalletBalanceFromLedger, executeLedgerPackageActivation } from './ledgerService.ts';
import { getSystemSettings } from './settingsService.ts';
import { createNotification, notifyAdmins } from './notificationService.ts';
import { recordAuditLog, adminGetPackages } from './financeService.ts';
import { BASIC_PACKAGE_TEMPLATES } from '../data/basicPackageTemplates.ts';

async function resolvePackageDefinition(packageId: string): Promise<PackageDefinition> {
  const saved = await adminGetPackages();
  const fromDb = saved.find(p => p.id === packageId || p.code === packageId);
  if (fromDb) return fromDb;
  const template = BASIC_PACKAGE_TEMPLATES.find(p => p.id === packageId || p.code === packageId);
  if (template) return template;
  throw new Error(`Package definition "${packageId}" not found in system.`);
}

export async function createPackageActivationRequest(params: {
  userId: string;
  userEmail?: string;
  userName?: string;
  userReferralCode?: string;
  packageId: string;
  amountRupees: number;
}): Promise<{ success: boolean; request: PackageActivationRequest; message: string }> {
  const { userId, userEmail, userName, userReferralCode, packageId, amountRupees } = params;
  if (amountRupees <= 0) throw new Error('Activation amount must be greater than zero.');

  const amountPaise = rupeesToPaise(amountRupees);
  const settings = await getSystemSettings();
  const userDoc = await getDoc(doc(db, 'users', userId));
  if (!userDoc.exists()) throw new Error('User profile record not found.');
  const userProfile = userDoc.data() as UserProfile;
  if (userProfile.status === 'suspended') throw new Error('Account suspended. Package activations are prohibited.');
  if (settings.requireKycForPackageActivation && userProfile.kycStatus !== 'verified') {
    throw new Error('KYC verification is mandatory prior to package activation.');
  }

  const pkgDef = await resolvePackageDefinition(packageId);
  if (!pkgDef.active) throw new Error(`The package "${pkgDef.name}" is currently inactive.`);
  if (pkgDef.type === 'basic' && !settings.basicPackageEnabled) throw new Error('Basic Packages are currently disabled in platform settings.');
  if (pkgDef.type === 'fd' && !settings.fdPackageEnabled) throw new Error('FD Packages are currently disabled in platform settings.');
  if (amountRupees < pkgDef.minAmount || amountRupees > pkgDef.maxAmount) {
    throw new Error(`Allowed amount for ${pkgDef.name}: ${pkgDef.minAmount.toFixed(2)} - ${pkgDef.maxAmount.toFixed(2)}.`);
  }

  const balances = await getWalletBalanceFromLedger(userId);
  if (balances.fundWalletPaise < amountPaise) {
    throw new Error(`Insufficient Available Fund balance. Required: ${amountRupees.toFixed(2)}, Available: ${balances.fundWalletRupees.toFixed(2)}. Add funds using TRX / USDT.`);
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

  if (!needsApproval) {
    await activateRequestWithDefinition(requestRecord, pkgDef, now);
    requestRecord.activatedAt = now;
  }
  await setDoc(reqDocRef, requestRecord);

  await createNotification(userId, 'package', needsApproval ? 'Package Activation Request Submitted' : 'Package Activated', `${pkgDef.name} activation for ${amountRupees.toFixed(2)} (${reference}) is ${initialStatus.toUpperCase()}.`, '/package-activations');
  if (needsApproval) {
    await notifyAdmins('New Package Activation Request', `Member ${userProfile.referralCode} requested ${pkgDef.name} for ${amountRupees.toFixed(2)}.`, 'admin', '/admin/package-activations');
  }
  await recordAuditLog(userId, userEmail, `Package Activation Request (${initialStatus.toUpperCase()})`, 'package_activation', reqDocRef.id, {
    reference, packageId: pkgDef.id, packageName: pkgDef.name, amountRupees, roiRate: pkgDef.roiRate, durationDays: pkgDef.durationDays, status: initialStatus
  });

  return {
    success: true,
    request: requestRecord,
    message: needsApproval ? `Package activation request submitted. Reference: ${reference}. Awaiting admin approval.` : `Package ${pkgDef.name} activated. Reference: ${reference}`
  };
}

async function activateRequestWithDefinition(current: PackageActivationRequest, pkgDef: PackageDefinition, now: string): Promise<void> {
  await executeLedgerPackageActivation(current.userId, current.packageName, current.packageType, current.amountPaise, current.reference);

  const activePkgRef = doc(db, 'packages', current.reference);
  const activePkg: PackageActivationRecord = {
    id: current.reference,
    userId: current.userId,
    packageType: current.packageType,
    packageName: current.packageName,
    amount: current.amountRupees,
    roiDailyRate: pkgDef.roiRate,
    durationDays: pkgDef.durationDays,
    totalEarned: 0,
    status: 'active',
    activatedAt: now,
    expiresAt: new Date(Date.now() + pkgDef.durationDays * 24 * 60 * 60 * 1000).toISOString()
  };
  await setDoc(activePkgRef, activePkg);

  const walletRef = doc(db, 'wallets', current.userId);
  const wSnap = await getDoc(walletRef);
  if (wSnap.exists()) {
    const curWallet = wSnap.data() as WalletData;
    const field = current.packageType === 'basic' ? 'basicPackageActive' : 'fdPackageActive';
    await updateDoc(walletRef, { [field]: Number(((curWallet[field] || 0) + current.amountRupees).toFixed(2)), updatedAt: now });
  }
}

export async function getUserPackageActivationRequests(userId: string): Promise<PackageActivationRequest[]> {
  try {
    const q = query(collection(db, 'package_activation_requests'), where('userId', '==', userId), orderBy('createdAt', 'desc'), limit(50));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as PackageActivationRequest);
  } catch (err) {
    console.error('Failed to get user package activation requests:', err);
    return [];
  }
}

export async function adminGetAllPackageActivationRequests(): Promise<PackageActivationRequest[]> {
  try {
    const q = query(collection(db, 'package_activation_requests'), orderBy('createdAt', 'desc'), limit(100));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as PackageActivationRequest);
  } catch (err) {
    console.error('Failed to get admin package activation requests:', err);
    return [];
  }
}

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
  const updates: Partial<PackageActivationRequest> = { status: targetStatus, adminNote: adminNote || current.adminNote || '', updatedAt: now };

  if (targetStatus === 'approved' || targetStatus === 'active') {
    updates.approvedBy = adminUserId;
    updates.approvedAt = now;
    if (targetStatus === 'active' && current.status !== 'active') {
      const pkgDef = await resolvePackageDefinition(current.packageId);
      updates.activatedAt = now;
      await activateRequestWithDefinition(current, pkgDef, now);
    }
  } else if (targetStatus === 'rejected') {
    updates.rejectedAt = now;
  }

  await updateDoc(reqRef, updates);
  await createNotification(current.userId, 'package', `Package Activation ${targetStatus.toUpperCase()}`, `Your ${current.packageName} request (${current.reference}) is ${targetStatus.toUpperCase()}.${adminNote ? ` Note: ${adminNote}` : ''}`, '/package-activations');
  await recordAuditLog(adminUserId, adminEmail, `Package Activation Request ${targetStatus.toUpperCase()}`, 'package_activation', requestId, {
    reference: current.reference, packageId: current.packageId, status: targetStatus, adminNote
  });

  return { success: true, request: { ...current, ...updates } };
}
