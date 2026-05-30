/** The five possible subscription states for a store. */
export type SubscriptionState = 'exempt' | 'trial' | 'active' | 'grace' | 'blocked';

/** Minimal billing fields needed to derive the subscription state. */
export interface StoreBillingFields {
  payment_exempt: boolean;
  blocked_at: string | null;
  mp_subscription_status: string | null;
  subscription_status_changed_at: string | null;
  trial_ends_at: string | null;
  mp_preapproval_id: string | null;
}

const GRACE_DAYS = 7;

/**
 * Derives the subscription state from raw store fields.
 * This function is pure — it takes an explicit `now` date and does not call
 * `Date.now()` internally, making it easy to test.
 *
 * Precedence: exempt > blocked > active > grace > trial
 * Anything that doesn't match a state above is treated as blocked-candidate
 * (the cron is the only actor that sets blocked_at).
 */
export function getSubscriptionState(
  store: StoreBillingFields,
  now: Date
): SubscriptionState {
  if (store.payment_exempt) return 'exempt';

  if (store.blocked_at !== null) return 'blocked';

  if (store.mp_subscription_status === 'authorized') return 'active';

  if (
    (store.mp_subscription_status === 'paused' ||
      store.mp_subscription_status === 'cancelled') &&
    store.subscription_status_changed_at !== null
  ) {
    const changedAt = new Date(store.subscription_status_changed_at);
    const diffMs = now.getTime() - changedAt.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays < GRACE_DAYS) return 'grace';
  }

  if (
    store.mp_preapproval_id === null &&
    store.trial_ends_at !== null &&
    now < new Date(store.trial_ends_at)
  ) {
    return 'trial';
  }

  // No state matched: the store is a candidate for blocking by the cron.
  // Return 'blocked' only if blocked_at is set (checked above); otherwise
  // this store hasn't been blocked yet — return 'blocked' so callers treat
  // it as unavailable until the cron runs.
  return 'blocked';
}

/**
 * Returns the number of days remaining in the store's trial period.
 * Returns 0 if the trial has expired or the store is not in trial state.
 */
export function daysLeftInTrial(store: StoreBillingFields, now: Date): number {
  if (!store.trial_ends_at) return 0;
  const trialEnd = new Date(store.trial_ends_at);
  const diffMs = trialEnd.getTime() - now.getTime();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Returns true when the store's public storefront should be accessible.
 * A blocked store is not publicly available regardless of `stores.status`.
 */
export function isPubliclyAvailable(store: StoreBillingFields, now: Date): boolean {
  const state = getSubscriptionState(store, now);
  return state !== 'blocked';
}
