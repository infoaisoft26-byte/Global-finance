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
  TransactionRequest, 
  TransactionRequestType, 
  TransactionRequestStatus, 
  UserProfile 
} from '../types/index.ts';
import { 
  rupeesToPaise, 
  paiseToRupees, 
  generateReferenceId, 
  getWalletBalanceFromLedger,
  executeLedgerP2pTransfer,
  executeLedgerIncomeToFund
} from './ledgerService.ts';
import { getSystemSettings } from './settingsService.ts';
import { createNotification, notifyAdmins } from './notificationService.ts';
import { recordAuditLog } from './financeService.ts';

/**
 * Valid allowed state transitions for transaction requests
 */
export const ALLOWED_TRANSITIONS: Record<TransactionRequestStatus, TransactionRequestStatus[]> = {
  pending: ['under_review', 'approved', 'rejected', 'cancelled'],
  under_review: ['approved', 'rejected'],
  approved: ['processing', 'completed', 'rejected'],
  processing: ['completed', 'failed'],
  completed: [],
  rejected: [],
  failed: [],
  cancelled: []
};

/**
 * Create a new transaction request server/service-side
 */
export async function createTransactionRequest(params: {
  userId: string;
  userEmail?: string;
  userName?: string;
  userReferralCode?: string;
  requestType: TransactionRequestType;
  sourceWalletType: 'fund_wallet' | 'income_wallet';
  destinationWalletType: 'fund_wallet' | 'income_wallet' | 'external_bank' | 'external_upi' | 'peer_user';
  amountRupees: number;
  beneficiaryReferralCode?: string;
  userNote?: string;
  metadata?: Record<string, any>;
}): Promise<{ success: boolean; request: TransactionRequest; message: string }> {
  if (params.requestType === 'recharge') throw new Error('Use the secure USDT recharge submission flow.');
  const {
    userId,
    userEmail,
    userName,
    userReferralCode,
    requestType,
    sourceWalletType,
    destinationWalletType,
    amountRupees,
    beneficiaryReferralCode,
    userNote,
    metadata
  } = params;

  if (amountRupees <= 0) {
    throw new Error('Transaction amount must be strictly greater than zero.');
  }

  const amountPaise = rupeesToPaise(amountRupees);
  const settings = await getSystemSettings();

  // 1. Fetch user profile and verify active status
  const userDoc = await getDoc(doc(db, 'users', userId));
  if (!userDoc.exists()) {
    throw new Error('User profile record not found.');
  }
  const userProfile = userDoc.data() as UserProfile;
  if (userProfile.status === 'suspended') {
    throw new Error('Account is suspended. Financial operations are blocked.');
  }

  // 2. Fetch real ledger-derived balances
  const balances = await getWalletBalanceFromLedger(userId);

  let beneficiaryUserId: string | undefined;
  let beneficiaryName: string | undefined;
  let feePaise = 0;

  // 3. Validation per transaction type
  switch (requestType) {
    case 'p2p_transfer': {
      if (!settings.p2pEnabled) {
        throw new Error('P2P transfers are currently disabled in platform settings.');
      }
      if (settings.requireKycForP2p && userProfile.kycStatus !== 'verified') {
        throw new Error('KYC verification is required before sending P2P transfers.');
      }
      if (amountRupees < settings.minP2p) {
        throw new Error(`Minimum P2P transfer amount is ₹${settings.minP2p.toFixed(2)}.`);
      }
      if (amountRupees > settings.maxP2p) {
        throw new Error(`Maximum P2P transfer amount is ₹${settings.maxP2p.toFixed(2)}.`);
      }
      if (!beneficiaryReferralCode) {
        throw new Error('Recipient GF Member ID is required for P2P transfers.');
      }
      if (beneficiaryReferralCode.toUpperCase() === (userReferralCode || userProfile.referralCode).toUpperCase()) {
        throw new Error('Self-transfer is not permitted.');
      }

      // Check sender Available Fund balance
      if (balances.fundWalletPaise < amountPaise) {
        throw new Error(
          `Insufficient Available Fund. Required: ₹${amountRupees.toFixed(2)}, Available: ₹${balances.fundWalletRupees.toFixed(2)}`
        );
      }

      // Lookup recipient user
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('referralCode', '==', beneficiaryReferralCode.toUpperCase()));
      const snap = await getDocs(q);
      if (snap.empty) {
        throw new Error(`Recipient with GF code "${beneficiaryReferralCode}" was not found.`);
      }
      const recipientDoc = snap.docs[0];
      const recipient = recipientDoc.data() as UserProfile;
      if (recipient.status === 'suspended') {
        throw new Error('Recipient account is currently suspended and cannot receive transfers.');
      }

      beneficiaryUserId = recipientDoc.id;
      beneficiaryName = recipient.name || 'Global Finance Member';
      break;
    }

    case 'income_to_fund': {
      if (!settings.incomeToFundEnabled) {
        throw new Error('Transfer from Available Balance to Fund is currently disabled.');
      }
      if (amountRupees < settings.minIncomeTransfer) {
        throw new Error(`Minimum internal transfer is ₹${settings.minIncomeTransfer.toFixed(2)}.`);
      }
      if (amountRupees > settings.maxIncomeTransfer) {
        throw new Error(`Maximum internal transfer is ₹${settings.maxIncomeTransfer.toFixed(2)}.`);
      }
      if (balances.incomeWalletPaise < amountPaise) {
        throw new Error(
          `Insufficient Available Balance. Required: ₹${amountRupees.toFixed(2)}, Available: ₹${balances.incomeWalletRupees.toFixed(2)}`
        );
      }
      break;
    }

    case 'withdrawal': {
      if (!settings.withdrawalEnabled) {
        throw new Error('Automated fund withdrawals are temporarily suspended by platform compliance.');
      }
      if (settings.requireKycForWithdrawal && userProfile.kycStatus !== 'verified') {
        throw new Error('KYC verification is strictly mandatory for fund withdrawal requests.');
      }
      if (amountRupees < settings.minWithdrawal) {
        throw new Error(`Minimum withdrawal amount is ₹${settings.minWithdrawal.toFixed(2)}.`);
      }
      if (amountRupees > settings.maxWithdrawal) {
        throw new Error(`Maximum withdrawal amount is ₹${settings.maxWithdrawal.toFixed(2)}.`);
      }
      if (balances.incomeWalletPaise < amountPaise) {
        throw new Error(
          `Insufficient Available Balance for withdrawal. Available: ₹${balances.incomeWalletRupees.toFixed(2)}`
        );
      }

      // Check existing pending withdrawal
      const reqRef = collection(db, 'transaction_requests');
      const pendingQ = query(
        reqRef, 
        where('userId', '==', userId), 
        where('requestType', '==', 'withdrawal'),
        where('status', 'in', ['pending', 'under_review', 'approved', 'processing'])
      );
      const pendingSnap = await getDocs(pendingQ);
      if (!pendingSnap.empty) {
        throw new Error('You already have an active pending withdrawal request in queue. Please wait until it is processed.');
      }

      // Calculate 5% TDS / deduction fee
      const feePercent = settings.withdrawalFeePercent || 5;
      feePaise = Math.round(amountPaise * (feePercent / 100));
      break;
    }

  }

  const netAmountPaise = amountPaise - feePaise;
  const reference = generateReferenceId(
    requestType === 'p2p_transfer' ? 'P2P' :
    requestType === 'withdrawal' ? 'WTH' :
    requestType === 'income_to_fund' ? 'CONV' : 'RCH'
  );

  const reqDocRef = doc(collection(db, 'transaction_requests'));
  const now = new Date().toISOString();

  // If internal transfer (Income to Fund) or P2P: can be executed immediately via balanced double-entry if configured
  // For Recharge & Withdrawal: always created in 'pending' awaiting gateway/compliance
  const requestRecord: TransactionRequest = {
    id: reqDocRef.id,
    reference,
    userId,
    userEmail: userEmail || userProfile.email,
    userName: userName || userProfile.name,
    userReferralCode: userReferralCode || userProfile.referralCode,
    requestType,
    sourceWalletType,
    destinationWalletType,
    beneficiaryUserId,
    beneficiaryReferralCode,
    beneficiaryName,
    amountPaise,
    amountRupees,
    feePaise,
    feeRupees: paiseToRupees(feePaise),
    netAmountPaise,
    netAmountRupees: paiseToRupees(netAmountPaise),
    status: 'pending',
    userNote,
    metadata: metadata || {},
    createdAt: now,
    updatedAt: now
  };

  // Immediate double-entry execution for internal wallet transfer
  if (requestType === 'income_to_fund') {
    await executeLedgerIncomeToFund(userId, amountPaise, reference);
    requestRecord.status = 'completed';
    requestRecord.completedAt = now;
  }

  // Immediate execution for P2P if sender has verified balance
  if (requestType === 'p2p_transfer' && beneficiaryUserId) {
    await executeLedgerP2pTransfer(
      userId,
      userProfile.referralCode,
      beneficiaryUserId,
      beneficiaryReferralCode!,
      amountPaise,
      userNote,
      reference
    );
    requestRecord.status = 'completed';
    requestRecord.completedAt = now;

    // Notify recipient
    await createNotification(
      beneficiaryUserId,
      'transaction',
      'P2P Funds Received',
      `You received ₹${amountRupees.toFixed(2)} from ${userProfile.referralCode} (${userProfile.name}). Ref: ${reference}`,
      '/transactions'
    );
  }

  await setDoc(reqDocRef, requestRecord);

  // Notify user
  await createNotification(
    userId,
    'transaction',
    requestRecord.status === 'completed' ? 'Transaction Completed' : 'Transaction Request Submitted',
    `${requestType.replace(/_/g, ' ').toUpperCase()} request of ₹${amountRupees.toFixed(2)} (${reference}) status: ${requestRecord.status.toUpperCase()}.`,
    '/transactions'
  );

  // Notify admins if pending approval required
  if (requestRecord.status === 'pending') {
    await notifyAdmins(
      `New ${requestType.toUpperCase()} Request`,
      `Member ${userProfile.referralCode} submitted a ${requestType} request for ₹${amountRupees.toFixed(2)} (${reference}).`,
      'admin',
      '/admin/transactions'
    );
  }

  // Audit log
  await recordAuditLog(
    userId,
    userEmail,
    `Transaction Request Created (${requestType.toUpperCase()})`,
    'transaction_request',
    reqDocRef.id,
    {
      reference,
      amountRupees,
      status: requestRecord.status,
      beneficiaryReferralCode
    }
  );

  return {
    success: true,
    request: requestRecord,
    message: requestRecord.status === 'completed'
      ? `Transaction executed and confirmed via cryptographic ledger. Reference: ${reference}`
      : `Request created with status "${requestRecord.status.toUpperCase()}". Reference: ${reference}. Awaiting compliance verification.`
  };
}

/**
 * Fetch all transaction requests for a user
 */
export async function getUserTransactionRequests(
  userId: string,
  filterType?: TransactionRequestType
): Promise<TransactionRequest[]> {
  try {
    const ref = collection(db, 'transaction_requests');
    let q = query(ref, where('userId', '==', userId), orderBy('createdAt', 'desc'), limit(100));
    const snap = await getDocs(q);

    let list = snap.docs.map(d => d.data() as TransactionRequest);
    if (filterType) {
      list = list.filter(r => r.requestType === filterType);
    }
    return list;
  } catch (err) {
    console.error('Failed to get user transaction requests:', err);
    return [];
  }
}

/**
 * Fetch all transaction requests for Admin with optional filters
 */
export async function adminGetAllTransactionRequests(filters?: {
  requestType?: TransactionRequestType | 'all';
  status?: TransactionRequestStatus | 'all';
  search?: string;
}): Promise<TransactionRequest[]> {
  try {
    const ref = collection(db, 'transaction_requests');
    const q = query(ref, orderBy('createdAt', 'desc'), limit(150));
    const snap = await getDocs(q);
    let list = snap.docs.map(d => d.data() as TransactionRequest).filter(r => r.requestType !== 'recharge');

    if (filters?.requestType && filters.requestType !== 'all') {
      list = list.filter(r => r.requestType === filters.requestType);
    }
    if (filters?.status && filters.status !== 'all') {
      list = list.filter(r => r.status === filters.status);
    }
    if (filters?.search && filters.search.trim()) {
      const qText = filters.search.toLowerCase().trim();
      list = list.filter(r => 
        r.reference.toLowerCase().includes(qText) ||
        (r.userReferralCode && r.userReferralCode.toLowerCase().includes(qText)) ||
        (r.userName && r.userName.toLowerCase().includes(qText)) ||
        (r.userEmail && r.userEmail.toLowerCase().includes(qText))
      );
    }

    return list;
  } catch (err) {
    console.error('Failed to fetch admin transaction requests:', err);
    return [];
  }
}

/**
 * Admin updates transaction request status enforcing state machine transitions
 */
export async function adminUpdateTransactionRequestStatus(
  adminUserId: string,
  adminEmail: string | undefined,
  requestId: string,
  targetStatus: TransactionRequestStatus,
  adminNote?: string,
  providerReference?: string
): Promise<{ success: boolean; request: TransactionRequest }> {
  const reqDocRef = doc(db, 'transaction_requests', requestId);
  const snap = await getDoc(reqDocRef);

  if (!snap.exists()) {
    throw new Error('Transaction request not found.');
  }

  const current = snap.data() as TransactionRequest;
  if (current.requestType === 'recharge') throw new Error('Legacy recharge review is closed. Use the secure USDT recharge accounting queue.');
  const currentStatus = current.status;

  // Enforce strict state machine transitions
  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(targetStatus)) {
    throw new Error(
      `Invalid state transition: Cannot transition request from "${currentStatus.toUpperCase()}" to "${targetStatus.toUpperCase()}". Allowed: ${allowed?.join(', ') || 'none'}.`
    );
  }

  const now = new Date().toISOString();
  const updates: Partial<TransactionRequest> = {
    status: targetStatus,
    adminNote: adminNote || current.adminNote || '',
    updatedAt: now
  };

  if (targetStatus === 'approved') {
    updates.approvedBy = adminUserId;
    updates.approvedAt = now;
  } else if (targetStatus === 'rejected') {
    updates.rejectedBy = adminUserId;
    updates.rejectedAt = now;
    updates.failureReason = adminNote || 'Rejected by compliance administrator.';
  } else if (targetStatus === 'completed') {
    updates.completedAt = now;
    if (providerReference) updates.providerReference = providerReference;
  }

  await updateDoc(reqDocRef, updates);

  // Notify user
  await createNotification(
    current.userId,
    'transaction',
    `Transaction Request Status: ${targetStatus.toUpperCase()}`,
    `Your ${current.requestType.replace(/_/g, ' ')} request (${current.reference}) of ₹${current.amountRupees.toFixed(2)} is now ${targetStatus.toUpperCase()}. ${adminNote ? 'Note: ' + adminNote : ''}`,
    '/transactions'
  );

  // Record audit log
  await recordAuditLog(
    adminUserId,
    adminEmail,
    `Transaction Request ${targetStatus.toUpperCase()}`,
    'transaction_request',
    requestId,
    {
      reference: current.reference,
      previousStatus: currentStatus,
      newStatus: targetStatus,
      adminNote
    }
  );

  return {
    success: true,
    request: { ...current, ...updates }
  };
}
