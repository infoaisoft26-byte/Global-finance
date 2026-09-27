import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase.ts';
import type { SystemSettings } from '../types/index.ts';
import { recordAuditLog } from './financeService.ts';

const SETTINGS_DOC_ID = 'global_finance_system_settings';
const CACHE_TTL_MS = 60_000;
let cachedSettings: SystemSettings | null = null;
let cachedAt = 0;

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
  withdrawalEnabled: false,
  minRecharge: 1,
  maxRecharge: 1000000,
  minP2p: 1,
  maxP2p: 1000000,
  minIncomeTransfer: 1,
  maxIncomeTransfer: 1000000,
  minWithdrawal: 1,
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

export async function getSystemSettings(force = false): Promise<SystemSettings> {
  const now = Date.now();
  if (!force && cachedSettings && now - cachedAt < CACHE_TTL_MS) return cachedSettings;
  try {
    const ref = doc(db, 'system_settings', SETTINGS_DOC_ID);
    const snap = await getDoc(ref);
    const stored = snap.exists() ? (snap.data() as Partial<SystemSettings> & Record<string, any>) : {};
    const merged = {
      ...DEFAULT_SYSTEM_SETTINGS,
      ...stored,
      // Keep the member/admin deposit experience BEP20-only and make sure
      // legacy blank values do not hide the configured production display.
      usdtBep20DepositAddress: String((stored as any).usdtBep20DepositAddress || DEFAULT_BEP20_ADDRESS),
      depositQrImageUrl: String((stored as any).depositQrImageUrl || DEFAULT_BEP20_QR),
      depositNetworkLabel: 'BNB Smart Chain (BEP20)',
      basicPackageEnabled: true,
      fdPackageEnabled: true,
      rechargeEnabled: false,
      withdrawalEnabled: false
    } as SystemSettings;
    if (!snap.exists()) await setDoc(ref, DEFAULT_SYSTEM_SETTINGS);
    cachedSettings = merged;
    cachedAt = now;
    return merged;
  } catch (err) {
    console.warn('Failed to fetch system settings, using cached/default configuration:', err);
    return cachedSettings || DEFAULT_SYSTEM_SETTINGS;
  }
}

export async function updateSystemSettings(
  adminUserId: string,
  adminEmail: string | undefined,
  updates: Partial<SystemSettings> & Record<string, any>
): Promise<SystemSettings> {
  const current = await getSystemSettings();
  const updated = {
    ...current,
    ...updates,
    // Keep network locked so all users always see the same BEP20 rail.
    depositNetworkLabel: 'BNB Smart Chain (BEP20)',
    basicPackageEnabled: true,
    fdPackageEnabled: true,
    rechargeEnabled: false,
    withdrawalEnabled: false,
    updatedAt: new Date().toISOString(),
    updatedBy: adminUserId
  } as SystemSettings;

  const ref = doc(db, 'system_settings', SETTINGS_DOC_ID);
  await setDoc(ref, updated, { merge: true });
  cachedSettings = updated;
  cachedAt = Date.now();

  await recordAuditLog(adminUserId, adminEmail, 'System Settings Updated', 'settings', SETTINGS_DOC_ID, {
    changedFields: Object.keys(updates),
    maintenanceMode: updated.maintenanceMode,
    rechargeEnabled: false,
    withdrawalEnabled: false,
    p2pEnabled: updated.p2pEnabled,
    cryptoDepositConfigurationUpdated: [
      'usdtBep20DepositAddress',
      'depositWalletLink',
      'depositQrImageUrl',
      'depositNetworkNotice',
      'depositDisplayEnabled'
    ].some((key) => Object.prototype.hasOwnProperty.call(updates, key)),
    depositNetwork: 'BEP20'
  });

  return updated;
}
