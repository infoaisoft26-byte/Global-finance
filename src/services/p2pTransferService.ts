import type { FirebaseUser } from '../lib/firebase.ts';
import type { TransactionRequest } from '../types/index.ts';

async function call(user: FirebaseUser, url: string, method: 'GET' | 'POST' = 'GET', body?: object) {
  const response = await fetch(url, {
    method,
    credentials: 'include',
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to process P2P transfer.');
  return data;
}

export async function lookupP2pRecipient(user: FirebaseUser, referralCode: string): Promise<{ name: string; referralCode: string }> {
  const code = referralCode.trim().toUpperCase();
  const data = await call(user, `/api/p2p-transfer?recipient=${encodeURIComponent(code)}`);
  return data.recipient;
}

export async function listP2pTransfers(user: FirebaseUser): Promise<TransactionRequest[]> {
  const data = await call(user, '/api/p2p-transfer');
  return Array.isArray(data.history) ? data.history : [];
}

export async function sendP2pTransfer(user: FirebaseUser, recipientCode: string, amount: number, note?: string): Promise<{
  success: boolean;
  reference: string;
  fundWallet: number;
  message: string;
}> {
  return call(user, '/api/p2p-transfer', 'POST', {
    recipientCode: recipientCode.trim().toUpperCase(),
    amount: Number(amount.toFixed(2)),
    note: String(note || '').trim(),
  });
}


export async function requestTransactionOtp(user: FirebaseUser, payload: { purpose: 'p2p_transfer' | 'withdrawal'; amount: number; recipientCode?: string; walletAddress?: string; note?: string }): Promise<{otpId:string;maskedEmail:string;message:string}> {
  return call(user, '/api/transaction-otp', 'POST', { ...payload, action: 'send' });
}
export async function verifyTransactionOtp(user: FirebaseUser, payload: { purpose: 'p2p_transfer' | 'withdrawal'; amount: number; recipientCode?: string; walletAddress?: string; note?: string; otpId:string; code:string }): Promise<{success:boolean;otpId:string;message:string}> {
  return call(user, '/api/transaction-otp', 'POST', { ...payload, action: 'verify' });
}
