import { auth } from '../lib/firebase.ts';
import type { TransactionLedger } from '../types/index.ts';

export type AdjudicationTransaction = TransactionLedger & {
  userName?: string;
  userEmail?: string;
  userReferralCode?: string;
  referralLevel?: number | string;
  referralAmount?: number;
  referredUserId?: string;
  referredUserName?: string;
  referrerUserId?: string;
  referrerReferralCode?: string;
  commissionPercentage?: number;
  baseAmount?: number;
};

const mapLedger = (x: any): AdjudicationTransaction => {
  const m = x.metadata || {};
  const isReferral = String(x.type || '').includes('referral') || String(x.type || '').includes('level');
  return {
    ...x,
    userName: m.userName || m.memberName,
    userEmail: m.userEmail || m.memberEmail,
    userReferralCode: m.userReferralCode || m.memberReferralCode,
    referralLevel: m.referralLevel ?? m.level ?? m.levelNumber,
    referralAmount: Number(m.referralAmount ?? m.levelAmount ?? (isReferral ? x.amount : 0)) || 0,
    commissionPercentage: Number(m.percentage ?? m.commissionPercentage ?? 0) || 0,
    baseAmount: Number(m.baseAmount ?? 0) || 0,
    referredUserId: m.referredUserId || m.downlineUserId || m.sourceUserId,
    referredUserName: m.referredUserName || m.downlineName,
    referrerUserId: m.referrerUserId || m.sponsorUserId,
    referrerReferralCode: m.referrerReferralCode || m.sponsorReferralCode
  };
};

export async function getLedgerTransactions(userId?: string, maxRows = 500): Promise<AdjudicationTransaction[]> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Authentication required');
  const token = await currentUser.getIdToken();
  const response = await fetch('/api/usdt-recharge?scope=ledger', {
    method: 'GET', credentials: 'include', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(data.transactions)) throw new Error(data.error || 'Unable to load transaction ledger');
  let list = data.transactions.map(mapLedger);
  if (userId) list = list.filter((t: AdjudicationTransaction) => t.userId === userId);
  return list.slice(0, maxRows).sort((a: AdjudicationTransaction,b: AdjudicationTransaction) => new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());
}


export async function reconcileReferralIncome(): Promise<{
  success: boolean;
  activationsProcessed: number;
  distributionsCreated: number;
  amountCredited: number;
  message: string;
}> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Authentication required');
  const token = await currentUser.getIdToken();
  const response = await fetch('/api/usdt-bep20-deposit', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'admin_reconcile_referral_income' }),
    cache: 'no-store'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Unable to reconcile referral income');
  }
  return data;
}
