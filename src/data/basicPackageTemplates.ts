import type { PackageDefinition } from '../types/index.ts';

const createdAt = '2026-09-27T00:00:00.000Z';

const amounts = [200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000];

/**
 * GLOBAL FINANCE basic-package templates adapted from the approved reference structure.
 * Values are configurable plan terms, not a guarantee of return.
 */
export const BASIC_PACKAGE_TEMPLATES: PackageDefinition[] = amounts.map((amount, index) => ({
  id: `gf-basic-${index + 1}`,
  name: `Base Plan ${index + 1}`,
  code: `GF_BASE_${String(index + 1).padStart(2, '0')}`,
  type: 'basic',
  minAmount: amount,
  maxAmount: amount,
  roiRate: 5,
  durationDays: 25,
  description: `Fixed ${amount.toLocaleString('en-IN')} plan with admin-configured daily return terms for 25 days.`,
  terms: 'Configured daily return: 5% of plan amount for 25 days. Subject to platform terms and admin controls.',
  active: true,
  createdAt,
  updatedAt: createdAt
}));

export function getBasicPlanDailyReturn(pkg: PackageDefinition): number {
  return Number(((pkg.minAmount * pkg.roiRate) / 100).toFixed(4));
}

export function getBasicPlanScheduledReturn(pkg: PackageDefinition): number {
  const daily = getBasicPlanDailyReturn(pkg);
  return Number((daily * pkg.durationDays).toFixed(4));
}

export function getBasicPlanTotalWithPrincipal(pkg: PackageDefinition): number {
  return Number((pkg.minAmount + getBasicPlanScheduledReturn(pkg)).toFixed(4));
}
