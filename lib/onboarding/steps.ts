/**
 * Step constants and helpers — safe to import from both Client and Server Components.
 * No server-only imports here.
 */

export const STEP_NAMES = [
  'basics',
  'look',
  'sections',
  'products',
  'whatsapp',
  'payment',
  'review',
] as const;

export type StepName = (typeof STEP_NAMES)[number];

/**
 * Maps onboarding_step integer → URL slug.
 */
export function stepNameFor(index: number): StepName {
  const clamped = Math.max(0, Math.min(index, STEP_NAMES.length - 1));
  return STEP_NAMES[clamped];
}

export function stepIndexFor(name: StepName): number {
  return STEP_NAMES.indexOf(name);
}

/**
 * Returns true if the owner can navigate to `targetStep`
 * (i.e., it is <= their current completed step).
 */
export function canNavigateTo(currentStep: StepName, targetStep: StepName): boolean {
  return stepIndexFor(targetStep) <= stepIndexFor(currentStep);
}

/**
 * Returns the ordered list of steps visible to the user for a given checkout mode.
 * For non-mercadopago stores, the 'payment' step is hidden.
 */
export function visibleSteps(checkoutMode: string): StepName[] {
  if (checkoutMode === 'mercadopago') return [...STEP_NAMES];
  return STEP_NAMES.filter((s) => s !== 'payment');
}

/**
 * Returns the next visible step after `current` for the given checkout mode,
 * or null if `current` is the last visible step.
 */
export function nextStepName(current: StepName, checkoutMode: string): StepName | null {
  const visible = visibleSteps(checkoutMode);
  const idx = visible.indexOf(current);
  if (idx === -1 || idx >= visible.length - 1) return null;
  return visible[idx + 1];
}

/**
 * Returns the previous visible step before `current` for the given checkout mode,
 * or null if `current` is the first visible step.
 */
export function prevStepName(current: StepName, checkoutMode: string): StepName | null {
  const visible = visibleSteps(checkoutMode);
  const idx = visible.indexOf(current);
  if (idx <= 0) return null;
  return visible[idx - 1];
}
