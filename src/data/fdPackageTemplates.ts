import type { PackageDefinition } from '../types/index.ts';

const createdAt = '2026-09-27T00:00:00.000Z';
const amounts = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];

/**
 * FD package templates reproduced from the user-supplied reference structure.
 * Base plans: 365 days with a 1% configured daily rate.
 * Prime plans: 515 days with a 1.5% configured daily rate.
 * These are configurable plan terms, not a guarantee of returns.
 */
export const FD_PACKAGE_TEMPLATES: PackageDefinition[] = amounts.flatMap((amount, index) => {
  const number = index + 1;
  const base: PackageDefinition = {
    id: `gf-fd-base-${number}`,
    name: `Base FD Plan ${number}`,
    code: `GF_FD_BASE_${String(number).padStart(2, '0')}`,
    type: 'fd',
    minAmount: amount,
    maxAmount: amount,
    roiRate: 1,
    durationDays: 365,
    description: `Fixed USDT ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} FD plan for 365 days.`,
    terms: 'All plan values are denominated in USDT. Configured daily rate: 1% for 365 days. Credits depend on recorded platform transactions and admin controls.',
    active: true,
    createdAt,
    updatedAt: createdAt
  };
  const prime: PackageDefinition = {
    id: `gf-fd-prime-${number}`,
    name: `Prime FD Plan ${number}`,
    code: `GF_FD_PRIME_${String(number).padStart(2, '0')}`,
    type: 'fd',
    minAmount: amount,
    maxAmount: amount,
    roiRate: 1.5,
    durationDays: 515,
    description: `Fixed USDT ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Prime FD plan for 515 days.`,
    terms: 'All plan values are denominated in USDT. Configured daily rate: 1.5% for 515 days. Credits depend on recorded platform transactions and admin controls.',
    active: true,
    createdAt,
    updatedAt: createdAt
  };
  return [base, prime];
});

export function getFdPlanDailyReturn(pkg: PackageDefinition): number {
  return Number(((pkg.minAmount * pkg.roiRate) / 100).toFixed(2));
}

/** Total FD profit over the configured duration. */
export function getFdPlanScheduledReturn(pkg: PackageDefinition): number {
  return Number((getFdPlanDailyReturn(pkg) * pkg.durationDays).toFixed(2));
}

/** Final maturity amount = principal + total FD profit. */
export function getFdPlanMaturityValue(pkg: PackageDefinition): number {
  return Number((pkg.minAmount + getFdPlanScheduledReturn(pkg)).toFixed(2));
}
