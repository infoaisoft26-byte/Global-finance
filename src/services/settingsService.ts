import { auth } from '../lib/firebase.ts';
import type { SystemSettings } from '../types/index.ts';

const CACHE_TTL_MS = 5 * 60_000;
const READ_TIMEOUT_MS = 5000;
const WRITE_TIMEOUT_MS = 8000;
let cachedSettings: SystemSettings | null = null;
let cachedAt = 0;
let inFlightRead: Promise<SystemSettings> | null = null;

const DEFAULT_BEP20_ADDRESS = '0x062D87BE020291b34D08fdCfa7E432248680910E';
const DEFAULT_BEP20_QR = '/usdt-bep20-qr.svg';

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  platformName: 'GLOBAL FINANCE',
  tagline: 'Secure • Transparent • Digital Finance Platform',
  supportEmail: 'support@globalfinance.digital',
  maintenanceMode: false,
  rechargeEnabled: false,
  p2pEnabled: true,
  incomeToFundEnabled: true,
  withdrawalEnabled: true,
  minRecharge: 1,
  maxRecharge: 1000000,
  minP2p: 1,
  maxP2p: 1000000,
  minIncomeTransfer: 1,
  maxIncomeTransfer: 1000000,
  minWithdrawal: 2,
  withdrawalWindowStart: '10:30',
  withdrawalWindowEnd: '15:30',
  withdrawalTimezone: 'Asia/Kolkata',
  maxWithdrawal: 1000000,
  withdrawalFeePercent: 0,
  basicPackageEnabled: true,
  fdPackageEnabled: true,
  packageActivationApprovalRequired: true,
  requireKycForWithdrawal: true,
  requireKycForP2p: false,
  requireKycForPackageActivation: false,
  supportTicketsEnabled: true,
  usdtBep20DepositAddress: DEFAULT_BEP20_ADDRESS,
  depositNetworkLabel: 'BNB Smart Chain (BEP20)',
  depositNetworkNotice: 'Send only USDT using the BNB Smart Chain (BEP20) network to this address. Sending any other asset or network may result in loss.',
  depositWalletLink: '',
  depositQrImageUrl: DEFAULT_BEP20_QR,
  depositDisplayEnabled: true,
  updatedAt: new Date().toISOString()
} as SystemSettings;

const withTimeout = async <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), ms); })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const normalizeSettings = (stored: Partial<SystemSettings> & Record<string, any> = {}): SystemSettings => ({
  ...DEFAULT_SYSTEM_SETTINGS,
  ...stored,
  usdtBep20DepositAddress: String((stored as any).usdtBep20DepositAddress || DEFAULT_BEP20_ADDRESS),
  depositQrImageUrl: String((stored as any).depositQrImageUrl || DEFAULT_BEP20_QR),
  depositNetworkLabel: 'BNB Smart Chain (BEP20)',
  basicPackageEnabled: true,
  fdPackageEnabled: true,
  rechargeEnabled: false,
  withdrawalEnabled: true
} as SystemSettings);

async function authHeaders(): Promise<Record<string, string>> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Authentication required');
  const idToken = await currentUser.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${idToken}`,
  };
}

export async function getSystemSettings(force = false): Promise<SystemSettings> {
  const now = Date.now();
  if (!force && cachedSettings && now - cachedAt < CACHE_TTL_MS) return cachedSettings;
  if (inFlightRead && !force) return inFlightRead;

  const fetchSettings = async (): Promise<SystemSettings> => {
    const fallback = cachedSettings || DEFAULT_SYSTEM_SETTINGS;
    try {
      const headers = await authHeaders();
      const response = await withTimeout(
        fetch('/api/system-settings', { method: 'GET', credentials: 'include', headers }),
        READ_TIMEOUT_MS,
        null as any
      );
      if (!response) return fallback;
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to load system settings');
      const merged = normalizeSettings(data.settings || {});
      cachedSettings = merged;
      cachedAt = Date.now();
      return merged;
    } catch (err) {
      console.warn('Failed to fetch system settings, using cached/default configuration:', err);
      return fallback;
    }
  };

  const request = fetchSettings();
  if (!force) inFlightRead = request;
  try { return await request; }
  finally { if (!force && inFlightRead === request) inFlightRead = null; }
}

export function getCachedSystemSettings(): SystemSettings {
  return cachedSettings || DEFAULT_SYSTEM_SETTINGS;
}

export async function refreshSystemSettings(): Promise<SystemSettings> {
  return getSystemSettings(true);
}

export async function updateSystemSettings(
  adminUserId: string,
  _adminEmail: string | undefined,
  updates: Partial<SystemSettings> & Record<string, any>
): Promise<SystemSettings> {
  const current = cachedSettings || await getSystemSettings();
  const updated = normalizeSettings({
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
    updatedBy: adminUserId
  } as Partial<SystemSettings> & Record<string, any>);

  const previous = cachedSettings;
  cachedSettings = updated;
  cachedAt = Date.now();

  try {
    const headers = await authHeaders();
    const response = await withTimeout(
      fetch('/api/system-settings', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ settings: updated }),
      }),
      WRITE_TIMEOUT_MS,
      null as any
    );
    if (!response) throw new Error('Settings save timed out. Please retry.');
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Unable to save system settings');

    const persisted = normalizeSettings(data.settings || updated);
    cachedSettings = persisted;
    cachedAt = Date.now();
    return persisted;
  } catch (err) {
    cachedSettings = previous || current;
    cachedAt = Date.now();
    throw err;
  }
}
