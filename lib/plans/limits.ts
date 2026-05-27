export type PlanId = 'inicial' | 'pro';

export const PLAN_LIMITS: Record<PlanId, { maxProducts: number; maxSections: number }> = {
  inicial: { maxProducts: 50, maxSections: 3 },
  pro: { maxProducts: Infinity, maxSections: Infinity },
};

export function getPlanLimits(plan: PlanId | null | undefined) {
  // Default a 'inicial' si por algún motivo el plan no está seteado — fail closed.
  return PLAN_LIMITS[plan ?? 'inicial'];
}

export function isUnlimited(value: number) {
  return value === Infinity;
}
