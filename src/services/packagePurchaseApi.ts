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

function mapActivationRow(row: any): PackageActivationRequest {
  return {
    id: row.id,
    reference: row.id,
    userId: row.user_id,
    userName: row.user_name || 'Member',
    userEmail: row.user_email || '',
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
  } as PackageActivationRequest;
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
  return (Array.isArray(data.items) ? data.items : []).map(mapActivationRow);
}

export async function adminGetPackagePurchaseHistory(user: { getIdToken: () => Promise<string> }): Promise<PackageActivationRequest[]> {
  const data = await callUsdtEndpoint(user, { action: 'admin_package_history' });
  return (Array.isArray(data.items) ? data.items : []).map(mapActivationRow);
}

function mapPackageDefinition(row: any) {
  return {
    id: String(row.id || ''),
    name: String(row.name || ''),
    code: String(row.code || ''),
    type: row.type === 'fd' ? 'fd' : 'basic',
    minAmount: Number(row.min_amount ?? row.minAmount ?? 0),
    maxAmount: Number(row.max_amount ?? row.maxAmount ?? row.min_amount ?? row.minAmount ?? 0),
    roiRate: Number(row.roi_rate ?? row.roiRate ?? 0),
    durationDays: Number(row.duration_days ?? row.durationDays ?? 0),
    description: String(row.description || ''),
    terms: String(row.terms || ''),
    active: row.active !== false,
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString(),
  } as import('../types/index.ts').PackageDefinition;
}

export async function getLivePackageDefinitions(user: { getIdToken: () => Promise<string> }) {
  const data = await callUsdtEndpoint(user, { action: 'package_list' });
  return (Array.isArray(data.items) ? data.items : []).map(mapPackageDefinition);
}

export async function saveLivePackageDefinition(user: { getIdToken: () => Promise<string> }, pkg: import('../types/index.ts').PackageDefinition) {
  return await callUsdtEndpoint(user, { action: 'admin_save_package', package: pkg });
}

export async function syncExistingLivePackageDefinitions(
  user: { getIdToken: () => Promise<string> },
  packages: import('../types/index.ts').PackageDefinition[]
) {
  return await callUsdtEndpoint(user, { action: 'admin_sync_packages', packages });
}
