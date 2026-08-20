// Ejecutar con: npx vitest run lib/store/orders/expiry.test.ts

import { describe, it, expect } from 'vitest';
import { decideWaOrderExpiry, canReactivateOrder, type WaStoreLifecycleSettings } from './expiry';

const NOW = new Date('2026-08-19T12:00:00.000Z');

function storeSettings(overrides: Partial<WaStoreLifecycleSettings> = {}): WaStoreLifecycleSettings {
  return {
    wa_pending_ttl_days: 7,
    wa_auto_confirm: false,
    wa_lifecycle_effective_from: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('decideWaOrderExpiry', () => {
  it('pedido anterior a la fecha de corte de su tienda no se toca', () => {
    const decision = decideWaOrderExpiry('2025-12-01T00:00:00.000Z', storeSettings(), NOW);
    expect(decision).toBe('skip');
  });

  it('pedido dentro de la ventana configurada no se toca', () => {
    const decision = decideWaOrderExpiry(
      '2026-08-15T12:00:00.000Z', // 4 días atrás, ventana de 7
      storeSettings(),
      NOW
    );
    expect(decision).toBe('skip');
  });

  it('pedido vencido sigue la política de la tienda: cancela si auto-confirm está apagado', () => {
    const decision = decideWaOrderExpiry(
      '2026-08-10T00:00:00.000Z', // 9 días atrás, ventana de 7
      storeSettings({ wa_auto_confirm: false }),
      NOW
    );
    expect(decision).toBe('cancel');
  });

  it('pedido vencido sigue la política de la tienda: confirma si auto-confirm está prendido', () => {
    const decision = decideWaOrderExpiry(
      '2026-08-10T00:00:00.000Z',
      storeSettings({ wa_auto_confirm: true }),
      NOW
    );
    expect(decision).toBe('confirm');
  });

  it('respeta la ventana propia de cada tienda, no un valor global', () => {
    const decision = decideWaOrderExpiry(
      '2026-08-17T12:00:00.000Z', // 2 días atrás
      storeSettings({ wa_pending_ttl_days: 1 }),
      NOW
    );
    expect(decision).toBe('cancel');
  });
});

describe('canReactivateOrder', () => {
  it('un pedido cancelado por el sistema se puede revivir', () => {
    expect(canReactivateOrder('system')).toBe(true);
  });

  it('un pedido cancelado por la dueña no se puede revivir', () => {
    expect(canReactivateOrder('owner')).toBe(false);
  });

  it('sin cancelled_by (dato legado, previo a esta migración) no se puede revivir', () => {
    expect(canReactivateOrder(null)).toBe(false);
  });
});
