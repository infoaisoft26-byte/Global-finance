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
