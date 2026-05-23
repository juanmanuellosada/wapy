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
