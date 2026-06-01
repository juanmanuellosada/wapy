import type { PlanId } from '@/lib/plans/limits';

/** Monthly price in ARS for each plan. */
export const PLAN_PRICES: Record<PlanId, number> = {
  inicial: 7000,
  medio:   9000,
  pro:    18000,
};

/**
 * Formats a plan price as a human-readable ARS string.
 * e.g. 9900 → "$9.900"
 */
export function formatPlanPrice(plan: PlanId): string {
  return '$' + PLAN_PRICES[plan].toLocaleString('es-AR');
}
