export type PlanId = 'inicial' | 'medio' | 'pro';

export interface PlanLimits {
  maxProducts: number;
  maxSections: number;
  maxImagesPerProduct: number;
  allowVariants: boolean;
  allowBulkProducts: boolean;
  allowCostTracking: boolean;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  inicial: { maxProducts: 20, maxSections: 1, maxImagesPerProduct: 1, allowVariants: false, allowBulkProducts: false, allowCostTracking: false },
  medio:   { maxProducts: 50, maxSections: 3, maxImagesPerProduct: Infinity, allowVariants: true, allowBulkProducts: false, allowCostTracking: false },
  pro:     { maxProducts: Infinity, maxSections: Infinity, maxImagesPerProduct: Infinity, allowVariants: true, allowBulkProducts: true, allowCostTracking: true },
};

export function getPlanLimits(plan: PlanId | null | undefined): PlanLimits {
  // Default a 'inicial' si por algún motivo el plan no está seteado — fail closed.
  return PLAN_LIMITS[plan ?? 'inicial'];
}

export function isUnlimited(value: number) {
  return value === Infinity;
}
