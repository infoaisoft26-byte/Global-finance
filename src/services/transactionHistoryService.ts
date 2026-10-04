import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '../lib/firebase.ts';
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
};

const mapLedger = (d: any): AdjudicationTransaction => {
  const x = d.data() as TransactionLedger;
  const m = x.metadata || {};
  return {
    ...x,
    userName: m.userName || m.memberName,
    userEmail: m.userEmail || m.memberEmail,
    userReferralCode: m.userReferralCode || m.memberReferralCode,
    referralLevel: m.referralLevel ?? m.level ?? m.levelNumber,
    referralAmount: Number(m.referralAmount ?? m.levelAmount ?? (x.type === 'referral_bonus' || String(x.type).includes('referral') || String(x.type).includes('level') ? x.amount : 0)) || 0,
    referredUserId: m.referredUserId || m.downlineUserId || m.sourceUserId,
    referredUserName: m.referredUserName || m.downlineName,
    referrerUserId: m.referrerUserId || m.sponsorUserId,
    referrerReferralCode: m.referrerReferralCode || m.sponsorReferralCode
  };
};

export async function getLedgerTransactions(userId?: string, maxRows = 500): Promise<AdjudicationTransaction[]> {
  const ref = collection(db, 'transactions');
  const q = userId
    ? query(ref, where('userId', '==', userId), limit(maxRows))
    : query(ref, limit(maxRows));
  const snap = await getDocs(q);
  return snap.docs
    .map(mapLedger)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
