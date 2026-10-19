import type { PackageDefinition } from '../types/index.ts';

const createdAt = '2026-09-27T00:00:00.000Z';

const amounts = [2, 5, 10, 20, 25, 10000, 20000, 50000, 100000, 200000, 500000];
const dailyRates = [5, 5, 1, 5, 5, 1, 1, 1, 1, 1, 1];
const durations = [25, 25, 25, 24, 25, 25, 25, 25, 25, 25, 25];

/**
 * Global Finance Base Plan terms. Displayed rates and durations match the
 * configured plan records. Returns are estimates, not guarantees.
 */
export const BASIC_PACKAGE_TEMPLATES: PackageDefinition[] = amounts.map((amount, index) => ({
  id: `gf-basic-${index + 1}`,
  name: `Base Plan ${index + 1}`,
  code: `GF_BASE_${String(index + 1).padStart(2, '0')}`,
  type: 'basic',
  minAmount: amount,
  maxAmount: amount,
  roiRate: dailyRates[index],
  durationDays: durations[index],
  description: `Fixed ${amount.toLocaleString('en-IN')} USDT plan with configured daily return terms for ${durations[index]} days.`,
  terms: `Configured daily return: ${dailyRates[index]}% of plan amount for ${durations[index]} days. Subject to platform terms and admin controls.`,
  active: true,
  createdAt,
  updatedAt: createdAt
}));

/** Daily ROI amount = principal × daily rate ÷ 100. */
export function getBasicPlanDailyReturn(pkg: PackageDefinition): number {
  return Number(((pkg.minAmount * pkg.roiRate) / 100).toFixed(4));
}

/** Total ROI only. Principal is intentionally NOT included. */
export function getBasicPlanScheduledReturn(pkg: PackageDefinition): number {
  const daily = getBasicPlanDailyReturn(pkg);
  return Number((daily * pkg.durationDays).toFixed(4));
}

/**
 * Backward-compatible alias used by existing package cards.
 * Historically this function added principal, which made a 200 plan at 1% for
 * 25 days display 250 as the "Scheduled Total". The cards are showing ROI,
 * therefore return ROI only: 200 × 1% × 25 = 50.
 */
export function getBasicPlanTotalWithPrincipal(pkg: PackageDefinition): number {
  return getBasicPlanScheduledReturn(pkg);
}

/** Maturity value when a screen explicitly needs principal + ROI. */
export function getBasicPlanMaturityValue(pkg: PackageDefinition): number {
  return Number((pkg.minAmount + getBasicPlanScheduledReturn(pkg)).toFixed(4));
}
