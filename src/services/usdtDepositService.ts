import type { FirebaseUser } from '../lib/firebase.ts';

export interface UsdtDepositEvent {
  id: string;
  txHash: string;
  amountUsdt: string;
  status: 'credited' | 'ignored' | 'pending';
  blockNumber: string;
  confirmations: number;
  createdAt: string;
  creditedAt?: string | null;
}

export interface UsdtDepositAddressResponse {
  configured: boolean;
  network: 'BSC';
  token: 'USDT';
  contractAddress: string | null;
  depositAddress: string;
  derivationIndex: number;
  confirmationsRequired: number;
  deposits: UsdtDepositEvent[];
}

export async function getUsdtDepositAddress(user: FirebaseUser): Promise<UsdtDepositAddressResponse> {
  const response = await fetch('/api/usdt-deposit-address', {
    method: 'GET',
    credentials: 'include',
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(data?.error || 'Unable to load USDT deposit address'));
  return data as UsdtDepositAddressResponse;
}
