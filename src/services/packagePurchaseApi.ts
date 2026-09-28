import type { PackageActivationRequest } from '../types/index.ts';

export async function purchasePackageWithUsdt(user: { getIdToken: () => Promise<string> }, packageId: string) {
  const idToken = await user.getIdToken();
  const response = await fetch('/api/package-purchase', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ packageId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Package purchase failed.') as Error & { available?: number; required?: number };
    error.available = Number(data.available || 0);
    error.required = Number(data.required || 0);
    throw error;
  }
  return data as {
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
  const idToken = await user.getIdToken();
  const response = await fetch('/api/package-purchase', {
    method: 'GET',
    headers: { Authorization: `Bearer ${idToken}` },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to load package purchase history.');
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
