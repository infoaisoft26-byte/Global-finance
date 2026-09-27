import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase.ts';
import type { SystemSettings } from '../types/index.ts';
import { recordAuditLog } from './financeService.ts';

const SETTINGS_DOC_ID = 'global_finance_system_settings';
const CACHE_TTL_MS = 60_000;
let cachedSettings: SystemSettings | null = null;
let cachedAt = 0;

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  platformName: 'GLOBAL FINANCE',
  tagline: 'Secure • Transparent • Digital Finance Platform',
  supportEmail: 'support@globalfinance.digital',
  maintenanceMode: false,

  // Real-money execution stays disabled until the configured provider/wallet flow is approved.
  rechargeEnabled: false,
  p2pEnabled: true,
  incomeToFundEnabled: true,
  withdrawalEnabled: false,

  // Legacy numeric bounds are retained internally for compatibility. User-facing deposits are crypto-only.
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

  // Crypto-only deposit configuration. Intentionally blank until Admin supplies addresses.
  trxDepositAddress: '',
  usdtTrc20DepositAddress: '',
  depositNetworkNotice: 'TRON network only. Send only TRX or USDT (TRC20) to the matching address.',

  updatedAt: new Date().toISOString()
} as SystemSettings;

export async function getSystemSettings(force = false): Promise<SystemSettings> {
  const now = Date.now();
  if (!force && cachedSettings && now - cachedAt < CACHE_TTL_MS) return cachedSettings;

  try {
    const ref = doc(db, 'system_settings', SETTINGS_DOC_ID);
    const snap = await getDoc(ref);
    const merged = snap.exists()
      ? ({ ...DEFAULT_SYSTEM_SETTINGS, ...(snap.data() as Partial<SystemSettings>) } as SystemSettings)
      : DEFAULT_SYSTEM_SETTINGS;

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
  updates: Partial<SystemSettings>
): Promise<SystemSettings> {
  const current = await getSystemSettings();
  const updated = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
    updatedBy: adminUserId
  } as SystemSettings;

  const ref = doc(db, 'system_settings', SETTINGS_DOC_ID);
  await setDoc(ref, updated, { merge: true });
  cachedSettings = updated;
  cachedAt = Date.now();

  await recordAuditLog(
    adminUserId,
    adminEmail,
    'System Settings Updated',
    'settings',
    SETTINGS_DOC_ID,
    {
      changedFields: Object.keys(updates),
      maintenanceMode: updated.maintenanceMode,
      rechargeEnabled: updated.rechargeEnabled,
      withdrawalEnabled: updated.withdrawalEnabled,
      p2pEnabled: updated.p2pEnabled,
      cryptoDepositConfigurationUpdated:
        Object.prototype.hasOwnProperty.call(updates, 'trxDepositAddress') ||
        Object.prototype.hasOwnProperty.call(updates, 'usdtTrc20DepositAddress')
    }
  );

  return updated;
}
