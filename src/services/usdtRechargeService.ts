import type { FirebaseUser } from '../lib/firebase.ts';

export interface UsdtRechargeRequest {
  id: string; userId: string; userName?: string; userEmail?: string; referralCode?: string;
  txHash: string; amountUsdt: string; status: 'pending' | 'approved' | 'rejected';
  creditInr: string | null; reviewNote: string | null; createdAt: string; reviewedAt: string | null;
  proofUrl?: string | null;
}

async function call(user: FirebaseUser, scope: 'member' | 'admin', method: 'GET' | 'POST', body?: object) {
  const response = await fetch(`/api/usdt-recharge${scope === 'admin' ? '?scope=admin' : ''}`, {
    method, credentials: 'include', headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    }, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to process recharge');
  return data;
}

export async function listUsdtRecharges(user: FirebaseUser, scope: 'member' | 'admin' = 'member'):
  Promise<{requests: UsdtRechargeRequest[]; enabled: boolean; depositAddress: string}> {
  return call(user,scope,'GET');
}

export async function submitUsdtRecharge(user: FirebaseUser, amountUsdt: string, txHash: string, paymentProofUrl?: string) {
  return call(user,'member','POST',{action:'submit',amountUsdt,txHash,paymentProofUrl});
}

export async function reviewUsdtRecharge(user: FirebaseUser, id: string, action: 'approve' | 'reject', note: string, creditInr?: string) {
  return call(user,'admin','POST',{action,id,note,creditInr});
}
