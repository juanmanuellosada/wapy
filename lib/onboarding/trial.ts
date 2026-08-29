import { TRIAL_DAYS } from '@/lib/subscription/constants';

/** Minimal whitelist fields needed to resolve a new store's trial. */
export interface WhitelistTrialFields {
  trial_ends_at: string | null;
  trial_days: number | null;
}

/**
 * Resolves the `trial_ends_at` for a store being created, following a
 * three-step precedence:
 *   1. `whitelist.trial_ends_at` — explicit date (lead approval path, or a
 *      manual DB edit).
 *   2. `whitelist.trial_days` — duration pledged at invite time, counted
 *      from the moment the store is created (not from the invite).
 *   3. `TRIAL_DAYS` — system default.
 *
 * Pure — takes an explicit `now` date so it's easy to test.
 *
 * Uses `??`, not `||`: `trial_days = 0` is a valid "no trial" value and
 * must not fall back to the default.
 */
export function resolveTrialEndsAt(
  whitelistRow: WhitelistTrialFields | null | undefined,
  now: Date
): string {
  if (whitelistRow?.trial_ends_at) return whitelistRow.trial_ends_at;
  const days = whitelistRow?.trial_days ?? TRIAL_DAYS;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}
