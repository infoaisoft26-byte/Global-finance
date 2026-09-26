import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase.ts';
import type { SystemSettings } from '../types/index.ts';
import { recordAuditLog } from './financeService.ts';

const SETTINGS_DOC_ID = 'global_finance_system_settings';

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  // General
  platformName: 'GLOBAL FINANCE',
  tagline: 'Secure • Transparent • Digital Finance Platform',
  supportEmail: 'support@globalfinance.digital',
  maintenanceMode: false,

  // Transactions (Payments and Payout execution disabled by default per environment constraints)
  rechargeEnabled: false, // PAYMENTS_ENABLED=false
  p2pEnabled: true,
  incomeToFundEnabled: true,
  withdrawalEnabled: false, // PAYOUTS_ENABLED=false

  minRecharge: 500,
  maxRecharge: 500000,

  minP2p: 100,
  maxP2p: 100000,

  minIncomeTransfer: 100,
  maxIncomeTransfer: 200000,

  minWithdrawal: 500,
  maxWithdrawal: 100000,
  withdrawalFeePercent: 5,

  // Package Controls
  basicPackageEnabled: true,
  fdPackageEnabled: true,
  packageActivationApprovalRequired: true,

  // KYC Rules
  requireKycForWithdrawal: true,
  requireKycForP2p: false,
  requireKycForPackageActivation: false,

  // Support
  supportTicketsEnabled: true,

  updatedAt: new Date().toISOString()
};

/**
 * Loads system settings from Firestore or bootstraps defaults
 */
export async function getSystemSettings(): Promise<SystemSettings> {
  try {
    const ref = doc(db, 'system_settings', SETTINGS_DOC_ID);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      return {
        ...DEFAULT_SYSTEM_SETTINGS,
        ...(snap.data() as Partial<SystemSettings>)
      };
    }

    // Bootstrap initial settings if missing
    await setDoc(ref, DEFAULT_SYSTEM_SETTINGS);
    return DEFAULT_SYSTEM_SETTINGS;
  } catch (err) {
    console.warn('Failed to fetch system settings from database, using defaults:', err);
    return DEFAULT_SYSTEM_SETTINGS;
  }
}

/**
 * Updates system settings and records audit log
 */
export async function updateSystemSettings(
  adminUserId: string,
  adminEmail: string | undefined,
  updates: Partial<SystemSettings>
): Promise<SystemSettings> {
  const current = await getSystemSettings();
  const updated: SystemSettings = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
    updatedBy: adminUserId
  };

  const ref = doc(db, 'system_settings', SETTINGS_DOC_ID);
  await setDoc(ref, updated, { merge: true });

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
      p2pEnabled: updated.p2pEnabled
    }
  );

  return updated;
}
