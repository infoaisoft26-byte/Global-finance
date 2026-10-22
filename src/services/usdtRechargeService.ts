import type { FirebaseUser } from '../lib/firebase.ts';

export interface UsdtRechargeRequest {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  referralCode?: string;
  txHash: string;
  amountUsdt: string;
  status: 'pending' | 'approved' | 'rejected';
  creditUsdt: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  proofUrl?: string | null;
}

export interface AutomaticUsdtDepositEvent {
  id: string;
  txHash: string;
  amountUsdt: string;
  status: 'credited' | 'pending' | 'ignored' | string;
  confirmations: number;
  blockNumber: string;
  createdAt: string;
  creditedAt: string | null;
  note?: string | null;
}

export interface AutomaticUsdtDepositInfo {
  configured: boolean;
  mode?: 'personal' | 'shared';
  network: string;
  token: 'USDT' | string;
  contractAddress: string;
  depositAddress: string;
  derivationIndex: number;
  confirmationsRequired: number;
  deposits: AutomaticUsdtDepositEvent[];
}

async function call(user: FirebaseUser, scope: 'member' | 'admin', method: 'GET' | 'POST', body?: object) {
  const response = await fetch(`/api/usdt-recharge${scope === 'admin' ? '?scope=admin' : ''}`, {
    method,
    credentials: 'include',
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String(data?.error || data?.message || `Recharge request failed (HTTP ${response.status})`));
    Object.assign(error, { status: response.status, data });
    throw error;
  }
  return data;
}

export async function getAutomaticDepositInfo(user: FirebaseUser): Promise<AutomaticUsdtDepositInfo> {
  const response = await fetch('/api/usdt-recharge?action=deposit-address', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String(data?.error || data?.message || `Deposit address request failed (HTTP ${response.status})`));
    Object.assign(error, { status: response.status, data });
    throw error;
  }
  return data as AutomaticUsdtDepositInfo;
}

export async function listUsdtRecharges(
  user: FirebaseUser,
  scope: 'member' | 'admin' = 'member'
): Promise<{ requests: UsdtRechargeRequest[]; enabled: boolean; automaticDepositConfigured?: boolean; autoCreditEnabled?: boolean; depositAddress: string }> {
  return call(user, scope, 'GET');
}

export function createUsdtDepositClaimMessage(userId: string, txHash: string, amountUsdt: string, walletAddress: string) {
  return [
    'Global Finance USDT Deposit Claim',
    'Domain: globalfinance1.online',
    `User ID: ${String(userId || '').trim()}`,
    `TXID: ${String(txHash || '').trim().toLowerCase()}`,
    `Amount: ${String(amountUsdt || '').trim()}`,
    `Wallet: ${String(walletAddress || '').trim().toLowerCase()}`,
  ].join('\n');
}

export async function submitUsdtRecharge(
  user: FirebaseUser,
  amountUsdt: string,
  txHash: string,
  paymentProofUrl?: string,
  walletAddress?: string,
  walletSignature?: string
) {
  return call(user, 'member', 'POST', {
    action: 'submit',
    amountUsdt,
    txHash,
    paymentProofUrl: paymentProofUrl || '',
    walletAddress: walletAddress || '',
    walletSignature: walletSignature || '',
  });
}

export async function reviewUsdtRecharge(
  user: FirebaseUser,
  id: string,
  action: 'approve' | 'reject',
  note: string
) {
  return call(user, 'admin', 'POST', { action, id, note });
}


export async function manualCreditUsdt(
  user: FirebaseUser,
  memberKey: string,
  amountUsdt: string,
  reference: string,
  note: string
): Promise<{ success: boolean; memberId: string; memberEmail: string; referralCode: string; creditUsdt: number; ledgerId: string }> {
  return call(user, 'admin', 'POST', {
    action: 'manual-credit',
    memberKey,
    amountUsdt,
    reference,
    note,
  });
}
