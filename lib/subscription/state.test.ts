// NOTE: No hay test runner configurado en este repo (ni jest ni vitest en
// package.json). Este archivo usa sintaxis de vitest. Para ejecutarlo:
//   npm install -D vitest && npx vitest run lib/subscription/state.test.ts

import { describe, it, expect } from 'vitest';
import {
  getSubscriptionState,
  daysLeftInTrial,
  isPubliclyAvailable,
  type StoreBillingFields,
} from './state';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOW = new Date('2026-06-01T12:00:00Z');

function makeStore(overrides: Partial<StoreBillingFields> = {}): StoreBillingFields {
  return {
    payment_exempt: false,
    blocked_at: null,
    mp_subscription_status: null,
    subscription_status_changed_at: null,
    trial_ends_at: null,
    mp_preapproval_id: null,
    ...overrides,
  };
}

// ─── getSubscriptionState ─────────────────────────────────────────────────────

describe('getSubscriptionState', () => {
  // exempt wins over everything
  it('returns exempt when payment_exempt=true regardless of other fields', () => {
    const store = makeStore({
      payment_exempt: true,
      blocked_at: '2026-05-01T00:00:00Z',
      mp_subscription_status: 'cancelled',
    });
    expect(getSubscriptionState(store, NOW)).toBe('exempt');
  });

  // blocked
  it('returns blocked when blocked_at is set (and not exempt)', () => {
    const store = makeStore({ blocked_at: '2026-05-01T00:00:00Z' });
    expect(getSubscriptionState(store, NOW)).toBe('blocked');
  });

  // active wins over grace/trial
  it('returns active when mp_subscription_status is authorized (not exempt/blocked)', () => {
    const store = makeStore({ mp_subscription_status: 'authorized' });
    expect(getSubscriptionState(store, NOW)).toBe('active');
  });

  // grace — paused within 7 days
  it('returns grace when paused less than 7 days ago', () => {
    const changedAt = new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days ago
    const store = makeStore({
      mp_subscription_status: 'paused',
      subscription_status_changed_at: changedAt,
      mp_preapproval_id: 'pa-123',
    });
    expect(getSubscriptionState(store, NOW)).toBe('grace');
  });

  // grace — cancelled within 7 days
  it('returns grace when cancelled less than 7 days ago', () => {
    const changedAt = new Date(NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(); // 1 day ago
    const store = makeStore({
      mp_subscription_status: 'cancelled',
      subscription_status_changed_at: changedAt,
      mp_preapproval_id: 'pa-123',
    });
    expect(getSubscriptionState(store, NOW)).toBe('grace');
  });

  // grace border: exactly 7 days is NOT within grace (7 days < 7 is false)
  it('returns blocked (not grace) when paused exactly 7 days ago', () => {
    const changedAt = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const store = makeStore({
      mp_subscription_status: 'paused',
      subscription_status_changed_at: changedAt,
      mp_preapproval_id: 'pa-123',
    });
    expect(getSubscriptionState(store, NOW)).toBe('blocked');
  });

  // grace expired → blocked
  it('returns blocked when paused more than 7 days ago', () => {
    const changedAt = new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const store = makeStore({
      mp_subscription_status: 'paused',
      subscription_status_changed_at: changedAt,
      mp_preapproval_id: 'pa-123',
    });
    expect(getSubscriptionState(store, NOW)).toBe('blocked');
  });

  // trial — no prior subscription, trial not expired
  it('returns trial when no prior subscription and now < trial_ends_at', () => {
    const trialEndsAt = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days from now
    const store = makeStore({ trial_ends_at: trialEndsAt });
    expect(getSubscriptionState(store, NOW)).toBe('trial');
  });

  // trial expired → blocked
  it('returns blocked when trial has expired and no subscription', () => {
    const trialEndsAt = new Date(NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(); // yesterday
    const store = makeStore({ trial_ends_at: trialEndsAt });
    expect(getSubscriptionState(store, NOW)).toBe('blocked');
  });

  // trial border: trial ends exactly at NOW (not < NOW)
  it('returns blocked when trial ends exactly at now', () => {
    const store = makeStore({ trial_ends_at: NOW.toISOString() });
    expect(getSubscriptionState(store, NOW)).toBe('blocked');
  });

  // no trial_ends_at, no subscription → blocked
  it('returns blocked when no trial and no subscription', () => {
    const store = makeStore();
    expect(getSubscriptionState(store, NOW)).toBe('blocked');
  });

  // active takes precedence over trial (authorized + ongoing trial — unusual but tested)
  it('returns active when authorized even if trial_ends_at is in the future', () => {
    const trialEndsAt = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const store = makeStore({
      mp_subscription_status: 'authorized',
      mp_preapproval_id: 'pa-456',
      trial_ends_at: trialEndsAt,
    });
    expect(getSubscriptionState(store, NOW)).toBe('active');
  });

  // exempt wins over blocked
  it('exempt takes precedence over blocked_at being set', () => {
    const store = makeStore({
      payment_exempt: true,
      blocked_at: '2026-01-01T00:00:00Z',
    });
    expect(getSubscriptionState(store, NOW)).toBe('exempt');
  });
});

// ─── daysLeftInTrial ──────────────────────────────────────────────────────────

describe('daysLeftInTrial', () => {
  it('returns 0 when trial_ends_at is null', () => {
    expect(daysLeftInTrial(makeStore(), NOW)).toBe(0);
  });

  it('returns 0 when trial has expired', () => {
    const store = makeStore({
      trial_ends_at: new Date(NOW.getTime() - 1000).toISOString(),
    });
    expect(daysLeftInTrial(store, NOW)).toBe(0);
  });

  it('returns ceiling of days remaining', () => {
    // 4 days and 1 hour remaining → ceil = 5
    const trialEndsAt = new Date(NOW.getTime() + (4 * 24 + 1) * 60 * 60 * 1000).toISOString();
    expect(daysLeftInTrial(makeStore({ trial_ends_at: trialEndsAt }), NOW)).toBe(5);
  });

  it('returns 1 when less than 1 day remains', () => {
    const trialEndsAt = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString(); // 1 hour
    expect(daysLeftInTrial(makeStore({ trial_ends_at: trialEndsAt }), NOW)).toBe(1);
  });

  it('returns 14 for a brand new store', () => {
    const trialEndsAt = new Date(NOW.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysLeftInTrial(makeStore({ trial_ends_at: trialEndsAt }), NOW)).toBe(14);
  });
});

// ─── isPubliclyAvailable ──────────────────────────────────────────────────────

describe('isPubliclyAvailable', () => {
  it('returns false when blocked', () => {
    const store = makeStore({ blocked_at: '2026-05-01T00:00:00Z' });
    expect(isPubliclyAvailable(store, NOW)).toBe(false);
  });

  it('returns true when exempt', () => {
    expect(isPubliclyAvailable(makeStore({ payment_exempt: true }), NOW)).toBe(true);
  });

  it('returns true when active', () => {
    const store = makeStore({ mp_subscription_status: 'authorized', mp_preapproval_id: 'pa-1' });
    expect(isPubliclyAvailable(store, NOW)).toBe(true);
  });

  it('returns true when in trial', () => {
    const trialEndsAt = new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(isPubliclyAvailable(makeStore({ trial_ends_at: trialEndsAt }), NOW)).toBe(true);
  });

  it('returns true when in grace period', () => {
    const changedAt = new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const store = makeStore({
      mp_subscription_status: 'paused',
      subscription_status_changed_at: changedAt,
      mp_preapproval_id: 'pa-2',
    });
    expect(isPubliclyAvailable(store, NOW)).toBe(true);
  });

  it('returns false when trial expired and no subscription', () => {
    const trialEndsAt = new Date(NOW.getTime() - 1000).toISOString();
    expect(isPubliclyAvailable(makeStore({ trial_ends_at: trialEndsAt }), NOW)).toBe(false);
  });
});
