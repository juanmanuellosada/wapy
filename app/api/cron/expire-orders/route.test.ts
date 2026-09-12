// Ejecutar con: npx vitest run app/api/cron/expire-orders/route.test.ts
//
// add-manual-sales, tarea 7.1: fija la propiedad de la que depende D4 del
// design — ambas consultas de expiración filtran por `channel` explícito
// ('whatsapp' / 'mercadopago'), así que una venta manual nunca puede quedar
// alcanzada por el cron, ni siquiera en un estado corrupto/inesperado
// (pending). Esta prueba llama al handler GET real contra un fake mínimo del
// admin client que respeta las mismas llamadas .eq/.in/.lt/.is encadenadas
// que route.ts emite — así, si alguien cambia el filtro de canal por un
// `NOT IN` o lo saca, esta prueba se rompe sin que nadie tenga que acordarse
// de tocarla a mano.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/store/orders/actions', () => ({
  replenishOrderStock: vi.fn(async () => ({ ok: true, alreadyReplenished: false })),
  incrementCouponUse: vi.fn(async () => ({ ok: true, incremented: false })),
  revertCouponUse: vi.fn(async () => ({ ok: true, reverted: false })),
}));

const mockCreateAdminClient = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => mockCreateAdminClient(),
}));

const { GET } = await import('./route');

type Row = Record<string, unknown>;

/** Fake mínimo: solo soporta lo que route.ts usa sobre 'orders' (select con
 * eq/is/in/lt encadenados, y update con eq). Evalúa los filtros de verdad
 * sobre las filas, así que ejercita el mismo camino que produción. */
function makeFakeAdmin(orders: Row[]) {
  function from(_table: 'orders') {
    const filters: Array<(r: Row) => boolean> = [];
    let patch: Row | null = null;
    const builder = {
      select(_cols?: string) {
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return builder;
      },
      is(col: string, val: unknown) {
        filters.push((r) => (val === null ? r[col] == null : r[col] === val));
        return builder;
      },
      in(col: string, vals: unknown[]) {
        filters.push((r) => (vals as unknown[]).includes(r[col]));
        return builder;
      },
      lt(col: string, val: unknown) {
        filters.push((r) => (r[col] as string) < (val as string));
        return builder;
      },
      update(p: Row) {
        patch = p;
        return builder;
      },
      then(resolve: (v: { data: Row[]; error: null }) => void) {
        const matched = orders.filter((r) => filters.every((f) => f(r)));
        if (patch) matched.forEach((r) => Object.assign(r, patch));
        resolve({ data: matched, error: null });
      },
    };
    return builder;
  }
  return { from };
}

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/cron/expire-orders', {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
}

beforeEach(() => {
  process.env.CRON_SECRET = 'test-secret';
  vi.clearAllMocks();
});

describe('cron/expire-orders no toca ventas manuales (add-manual-sales, 7.1)', () => {
  it('una venta manual pending (estado inesperado) queda intacta; un pending vencido de MP sí se cancela', async () => {
    const oldEnough = new Date(Date.now() - 40 * 60 * 60 * 1000).toISOString(); // 40h — vencido para MP (24h) y para WA (default 7d si aplicara)

    const manualOrder: Row = {
      id: 'manual-1',
      channel: 'manual',
      status: 'pending', // no debería pasar nunca (D4), pero la prueba no depende de eso
      payment_status: 'pending',
      deleted_at: null,
      created_at: oldEnough,
      stores: { wa_pending_ttl_days: 7, wa_auto_confirm: false, wa_lifecycle_effective_from: '2020-01-01T00:00:00.000Z' },
    };
    const mpOrder: Row = {
      id: 'mp-1',
      channel: 'mercadopago',
      status: 'pending',
      payment_status: 'pending',
      deleted_at: null,
      created_at: oldEnough,
    };

    const admin = makeFakeAdmin([manualOrder, mpOrder]);
    mockCreateAdminClient.mockReturnValue(admin);

    const res = await GET(makeRequest());
    const body = await res.json();

    // Control: el cron SÍ agarra el pending vencido de Mercado Pago.
    expect(mpOrder.status).toBe('cancelled');
    expect(body.cancelled).toBe(1);
    expect(body.failed).toBe(0);

    // La venta manual, ni tocada: ninguna de las dos consultas (MP ni WA) la
    // selecciona porque ninguna coincide con su canal.
    expect(manualOrder.status).toBe('pending');
  });
});
