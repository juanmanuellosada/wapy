// Ejecutar con: npx vitest run lib/onboarding/trial.test.ts

import { describe, it, expect } from 'vitest';
import { resolveTrialEndsAt } from './trial';
import { TRIAL_DAYS } from '@/lib/subscription/constants';

const NOW = new Date('2026-08-29T12:00:00.000Z');

function daysFromNow(days: number): string {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

describe('resolveTrialEndsAt', () => {
  it('sin datos en whitelist, usa el default TRIAL_DAYS', () => {
    const result = resolveTrialEndsAt(null, NOW);
    expect(result).toBe(daysFromNow(TRIAL_DAYS));
  });

  it('trial_days = 30, cuenta 30 días desde la creación de la tienda', () => {
    const result = resolveTrialEndsAt({ trial_ends_at: null, trial_days: 30 }, NOW);
    expect(result).toBe(daysFromNow(30));
  });

  it('trial_ends_at explícito gana sobre trial_days', () => {
    const explicitDate = '2026-12-25T00:00:00.000Z';
    const result = resolveTrialEndsAt(
      { trial_ends_at: explicitDate, trial_days: 30 },
      NOW
    );
    expect(result).toBe(explicitDate);
  });

  it('trial_days = 0 deja el trial vencido al instante (no cae al default)', () => {
    const result = resolveTrialEndsAt({ trial_ends_at: null, trial_days: 0 }, NOW);
    expect(result).toBe(NOW.toISOString());
  });
});
