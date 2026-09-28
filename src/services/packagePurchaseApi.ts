import type { PackageActivationRequest } from '../types/index.ts';

async function callUsdtEndpoint(user: { getIdToken: () => Promise<string> }, body: Record<string, unknown>) {
  const idToken = await user.getIdToken();
  const response = await fetch('/api/usdt-bep20-deposit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'USDT operation failed.') as Error & { available?: number; required?: number };
    error.available = Number(data.available || 0);
    error.required = Number(data.required || 0);
    throw error;
  }
  return data;
}

export async function purchasePackageWithUsdt(user: { getIdToken: () => Promise<string> }, packageId: string) {
  return await callUsdtEndpoint(user, { action: 'package_purchase', packageId }) as {
    success: boolean;
    purchaseId: string;
    packageName: string;
    packageType: string;
    amount: number;
    fundWallet: number;
    message: string;
  };
}

export async function getPackagePurchaseHistory(user: { getIdToken: () => Promise<string> }): Promise<PackageActivationRequest[]> {
  const data = await callUsdtEndpoint(user, { action: 'package_history' });
  return (Array.isArray(data.items) ? data.items : []).map((row: any) => ({
    id: row.id,
    reference: row.id,
    userId: row.user_id,
    packageId: row.package_id,
    packageName: row.package_name,
    packageType: row.package_type,
    amountPaise: Math.round(Number(row.amount || 0) * 100),
    amountRupees: Number(row.amount || 0),
    fundingSource: 'fund_wallet',
    status: row.status,
    createdAt: row.activated_at,
    updatedAt: row.activated_at,
    activatedAt: row.activated_at,
  })) as PackageActivationRequest[];
}
