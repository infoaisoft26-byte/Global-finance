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
  limit
} from 'firebase/firestore';
import { db } from '../lib/firebase.ts';
import type { 
  TransactionLedger, 
  TransactionType, 
  WalletData 
} from '../types/index.ts';

/**
 * USDT compatibility utilities:
 * One USDT has 100 minor units for older two-decimal operations. Exact deposit ledger balances are tracked separately at 8 decimal places.
 */
export function rupeesToPaise(rupees: number): number {
  return Math.round(Number(rupees) * 100);
}

export function paiseToRupees(paise: number): number {
  return Number((paise / 100).toFixed(2));
}

/**
 * Generates an immutable, collision-resistant reference ID
 */
export function generateReferenceId(prefix: string = 'GF'): string {
  const dateStr = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(2, 10);
  const randomChars = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `${prefix}-${dateStr}-${randomChars}`;
}

export interface LedgerJournalEntry {
  userId: string;
  category: 'fund_wallet' | 'income_wallet' | 'platform_liability' | 'payout_clearing';
  flow: 'debit' | 'credit';
  amountPaise: number;
  description: string;
  type: TransactionType;
  metadata?: Record<string, any>;
}

export interface BalancedLedgerResult {
  success: boolean;
  referenceId: string;
  entryIds: string[];
  totalPaise: number;
}

/**
 * Derives accurate user wallet balances directly from the append-only ledger entries.
 * Never trusts client-side numbers.
 */
function usdtToUnits8(value: unknown): bigint {
  const raw = String(value ?? '0').trim();
  if (!raw) return 0n;

  let normalized = raw;
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    const numeric = Number(normalized);
    if (!Number.isFinite(numeric) || numeric < 0) return 0n;
    normalized = numeric.toFixed(8);
  }

  const [wholePart = '0', fractionPart = ''] = normalized.split('.');
  const whole = wholePart.replace(/^0+(?=\d)/, '') || '0';
  const fraction = fractionPart.slice(0, 8).padEnd(8, '0') || '0';
  return BigInt(whole) * 100000000n + BigInt(fraction);
}

function units8ToUsdt(units: bigint): number {
  return Number(units) / 100000000;
}

function units8ToLegacyMinorUnits(units: bigint): number {
  // Legacy package/withdrawal APIs accept two-decimal USDT amounts only.
  // Floor available balance so sub-cent amounts can never overspend a wallet.
  return Number(units / 1000000n);
}

/**
 * Derives wallet balances directly from append-only ledger transactions.
 * Ledger amounts are USDT. The compatibility properties ending in Paise/Rupees
 * are retained for existing callers, but their values are USDT minor units/USDT.
 */
export async function getWalletBalanceFromLedger(userId: string): Promise<{
  fundWalletPaise: number;
  fundWalletRupees: number;
  fundWalletUsdt: number;
  incomeWalletPaise: number;
  incomeWalletRupees: number;
  incomeWalletUsdt: number;
  totalCreditsPaise: number;
  totalDebitsPaise: number;
  entryCount: number;
}> {
  const txnRef = collection(db, 'transactions');
  const q = query(txnRef, where('userId', '==', userId));
  const snap = await getDocs(q);

  let fundUnits8 = 0n;
  let incomeUnits8 = 0n;
  let totalCreditsUnits8 = 0n;
  let totalDebitsUnits8 = 0n;
  let count = 0;

  snap.forEach((docSnap) => {
    const item = docSnap.data() as TransactionLedger;
    count++;

    // amount and metadata.amountUsdt are expressed as USDT. The amountPaise
    // property is only a legacy fallback for older rows without an amount.
    const fallback = typeof item.metadata?.amountPaise === 'number'
      ? item.metadata.amountPaise / 100
      : 0;
    const amount = item.metadata?.amountUsdt ?? item.amount ?? fallback;
    const amountUnits8 = usdtToUnits8(amount);

    if (item.flow === 'credit') {
      totalCreditsUnits8 += amountUnits8;
      if (item.category === 'fund_wallet') fundUnits8 += amountUnits8;
      else if (item.category === 'income_wallet') incomeUnits8 += amountUnits8;
    } else if (item.flow === 'debit') {
      totalDebitsUnits8 += amountUnits8;
      if (item.category === 'fund_wallet') fundUnits8 -= amountUnits8;
      else if (item.category === 'income_wallet') incomeUnits8 -= amountUnits8;
    }
  });

  // Clamp negative results defensively; never derive a negative spendable wallet.
  if (fundUnits8 < 0n) fundUnits8 = 0n;
  if (incomeUnits8 < 0n) incomeUnits8 = 0n;

  return {
    fundWalletPaise: units8ToLegacyMinorUnits(fundUnits8),
    fundWalletRupees: units8ToUsdt(fundUnits8),
    fundWalletUsdt: units8ToUsdt(fundUnits8),
    incomeWalletPaise: units8ToLegacyMinorUnits(incomeUnits8),
    incomeWalletRupees: units8ToUsdt(incomeUnits8),
    incomeWalletUsdt: units8ToUsdt(incomeUnits8),
    totalCreditsPaise: units8ToLegacyMinorUnits(totalCreditsUnits8),
    totalDebitsPaise: units8ToLegacyMinorUnits(totalDebitsUnits8),
    entryCount: count
  };
}

/**
 * Creates a balanced, double-entry immutable ledger transaction.
 * Strict invariants:
 * - Sum of Debits == Sum of Credits
 * - Amount > 0
 * - Atomically executed
 * - Never deletes or updates existing ledger rows
 */
export async function createBalancedLedgerTransaction(
  entries: LedgerJournalEntry[],
  primaryReference?: string
): Promise<BalancedLedgerResult> {
  if (!entries || entries.length < 2) {
    throw new Error('A balanced ledger transaction requires at least 2 entries (debit & credit).');
  }

  let totalDebitsPaise = 0;
  let totalCreditsPaise = 0;

  for (const entry of entries) {
    if (entry.amountPaise <= 0) {
      throw new Error(`Invalid non-positive transaction amount: ${entry.amountPaise} paise`);
    }
    if (entry.flow === 'debit') {
      totalDebitsPaise += entry.amountPaise;
    } else if (entry.flow === 'credit') {
      totalCreditsPaise += entry.amountPaise;
    } else {
      throw new Error(`Invalid flow direction: ${entry.flow}`);
    }
  }

  if (totalDebitsPaise !== totalCreditsPaise) {
    throw new Error(
      `Ledger journal is unbalanced! Total debits (${totalDebitsPaise} paise) != Total credits (${totalCreditsPaise} paise).`
    );
  }

  const txnReference = primaryReference || generateReferenceId('LEDG');
  const now = new Date().toISOString();
  const entryIds: string[] = [];

  // Atomic execution across all records and corresponding wallet balance caches
  await runTransaction(db, async (txn) => {
    // 1. Validate participant wallets if user wallets are involved
    const userWalletCacheUpdates = new Map<string, { fundDiffPaise: number; incomeDiffPaise: number }>();

    for (const entry of entries) {
      if (entry.category === 'fund_wallet' || entry.category === 'income_wallet') {
        const current = userWalletCacheUpdates.get(entry.userId) || { fundDiffPaise: 0, incomeDiffPaise: 0 };
        const factor = entry.flow === 'credit' ? 1 : -1;
        if (entry.category === 'fund_wallet') {
          current.fundDiffPaise += entry.amountPaise * factor;
        } else {
          current.incomeDiffPaise += entry.amountPaise * factor;
        }
        userWalletCacheUpdates.set(entry.userId, current);
      }
    }

    // Check balances for negative results in debiting wallets
    for (const [userId, diffs] of userWalletCacheUpdates.entries()) {
      const walletRef = doc(db, 'wallets', userId);
      const walletSnap = await txn.get(walletRef);
      if (walletSnap.exists()) {
        const wallet = walletSnap.data() as WalletData;
        const currentFundPaise = rupeesToPaise(wallet.fundWallet || 0);
        const currentIncomePaise = rupeesToPaise(wallet.incomeWallet || 0);

        if (currentFundPaise + diffs.fundDiffPaise < 0) {
          throw new Error(`Insufficient Available Fund balance for user ${userId}. Required: ${paiseToRupees(Math.abs(diffs.fundDiffPaise))} USDT`);
        }
        if (currentIncomePaise + diffs.incomeDiffPaise < 0) {
          throw new Error(`Insufficient Available Balance for user ${userId}. Required: ${paiseToRupees(Math.abs(diffs.incomeDiffPaise))} USDT`);
        }

        // Update cached snapshot
        txn.update(walletRef, {
          fundWallet: paiseToRupees(currentFundPaise + diffs.fundDiffPaise),
          incomeWallet: paiseToRupees(currentIncomePaise + diffs.incomeDiffPaise),
          updatedAt: now
        });
      }
    }

    // 2. Append immutable ledger rows
    let index = 0;
    for (const entry of entries) {
      index++;
      const entryId = `${txnReference}-${index}`;
      entryIds.push(entryId);

      const ledgerDocRef = doc(db, 'transactions', entryId);
      const ledgerRecord: TransactionLedger = {
        id: entryId,
        userId: entry.userId,
        type: entry.type,
        category: (entry.category === 'fund_wallet' || entry.category === 'income_wallet') 
          ? entry.category 
          : 'fund_wallet',
        flow: entry.flow,
        amount: paiseToRupees(entry.amountPaise),
        fee: 0,
        netAmount: paiseToRupees(entry.amountPaise),
        description: entry.description,
        referenceId: txnReference,
        status: 'completed',
        metadata: {
          ...entry.metadata,
          amountPaise: entry.amountPaise,
          rawCategory: entry.category,
          batchIndex: index,
          batchSize: entries.length
        },
        createdAt: now
      };

      txn.set(ledgerDocRef, ledgerRecord);
    }
  });

  return {
    success: true,
    referenceId: txnReference,
    entryIds,
    totalPaise: totalDebitsPaise
  };
}

/**
 * Transfers funds between two user accounts or internal wallets via balanced ledger.
 */
export async function executeLedgerP2pTransfer(
  senderUserId: string,
  senderReferralCode: string,
  recipientUserId: string,
  recipientReferralCode: string,
  amountPaise: number,
  userNote?: string,
  referenceId?: string
): Promise<BalancedLedgerResult> {
  if (senderUserId === recipientUserId) {
    throw new Error('Self-transfer is strictly prohibited.');
  }
  if (amountPaise <= 0) {
    throw new Error('Transfer amount must be greater than zero.');
  }

  const ref = referenceId || generateReferenceId('P2P');
  const amountRupees = paiseToRupees(amountPaise);

  const entries: LedgerJournalEntry[] = [
    {
      userId: senderUserId,
      category: 'fund_wallet',
      flow: 'debit',
      amountPaise,
      type: 'p2p_transfer',
      description: `P2P transfer sent to ${recipientReferralCode} (${userNote || 'Direct Member Transfer'})`,
      metadata: {
        counterpartyUserId: recipientUserId,
        counterpartyCode: recipientReferralCode,
        direction: 'sent',
        note: userNote
      }
    },
    {
      userId: recipientUserId,
      category: 'fund_wallet',
      flow: 'credit',
      amountPaise,
      type: 'p2p_transfer',
      description: `P2P transfer received from ${senderReferralCode} (${userNote || 'Direct Member Transfer'})`,
      metadata: {
        counterpartyUserId: senderUserId,
        counterpartyCode: senderReferralCode,
        direction: 'received',
        note: userNote
      }
    }
  ];

  return createBalancedLedgerTransaction(entries, ref);
}

/**
 * Transfers from Income Wallet (Available Balance) to Fund Wallet (Available Fund).
 */
export async function executeLedgerIncomeToFund(
  userId: string,
  amountPaise: number,
  referenceId?: string
): Promise<BalancedLedgerResult> {
  if (amountPaise <= 0) {
    throw new Error('Transfer amount must be greater than zero.');
  }

  const ref = referenceId || generateReferenceId('CONV');
  const amountRupees = paiseToRupees(amountPaise);

  const entries: LedgerJournalEntry[] = [
    {
      userId,
      category: 'income_wallet',
      flow: 'debit',
      amountPaise,
      type: 'income_to_fund',
      description: `Internal transfer of USDT ${amountRupees.toFixed(2)} from Available Balance to Available Fund`,
      metadata: { source: 'income_wallet', target: 'fund_wallet' }
    },
    {
      userId,
      category: 'fund_wallet',
      flow: 'credit',
      amountPaise,
      type: 'income_to_fund',
      description: `Credit of USDT ${amountRupees.toFixed(2)} from Available Balance to Available Fund`,
      metadata: { source: 'income_wallet', target: 'fund_wallet' }
    }
  ];

  return createBalancedLedgerTransaction(entries, ref);
}

/**
 * Executes a package activation funded by the Fund Wallet.
 * Debits user's fund wallet and credits the platform's package liability ledger.
 */
export async function executeLedgerPackageActivation(
  userId: string,
  packageName: string,
  packageType: 'basic' | 'fd',
  amountPaise: number,
  referenceId?: string
): Promise<BalancedLedgerResult> {
  if (amountPaise <= 0) {
    throw new Error('Package activation amount must be greater than zero.');
  }

  const ref = referenceId || generateReferenceId('PKG');
  const amountRupees = paiseToRupees(amountPaise);

  const entries: LedgerJournalEntry[] = [
    {
      userId,
      category: 'fund_wallet',
      flow: 'debit',
      amountPaise,
      type: 'package_activation',
      description: `Package activation debit for ${packageName} (${packageType.toUpperCase()})`,
      metadata: { packageType, packageName }
    },
    {
      userId: 'GLOBAL_FINANCE_LIABILITIES',
      category: 'platform_liability',
      flow: 'credit',
      amountPaise,
      type: 'package_activation',
      description: `Package capital reserve credit for member ${userId} (${packageName})`,
      metadata: { memberUserId: userId, packageType, packageName }
    }
  ];

  return createBalancedLedgerTransaction(entries, ref);
}
