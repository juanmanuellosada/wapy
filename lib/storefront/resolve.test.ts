// Ejecutar con: npx vitest run lib/storefront/resolve.test.ts
//
// Regresión de fix-store-public-payload: `stores` tiene columnas comerciales
// (plan, contador de pedidos, estado de suscripción/MP, owner_id, config
// interna de WhatsApp) que RLS no filtra — filtra filas, no columnas — y que
// no deben cruzar al cliente. Estos tests no miran el `select()` de la
// consulta (eso pasaría igual si alguien reenvía la fila completa por otro
// camino): miran el objeto `store` que `resolveStoreSlug` efectivamente
// entrega, para los dos caminos que existen (tienda publicada y tienda en
// mantenimiento), y afirman por nombre qué claves están prohibidas.

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => {
    throw new Error('createAdminClient no debería llamarse en estos casos');
  },
}));

type Row = Record<string, unknown>;

// Fake mínimo del query builder de supabase-js: sólo lo que resolve.ts
// encadena (select/eq/order/maybeSingle, o awaitear la lista directamente).
function makeFakeAnon(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      let rows = tables[table] ?? [];
      const builder = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          rows = rows.filter((r) => r[col] === val);
          return builder;
        },
        in(col: string, vals: unknown[]) {
          rows = rows.filter((r) => vals.includes(r[col]));
          return builder;
        },
        is(col: string, val: unknown) {
          rows = rows.filter((r) => r[col] === val);
          return builder;
        },
        order() {
          return builder;
        },
        maybeSingle() {
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
        then(
          resolve: (result: { data: Row[]; error: null }) => void
        ) {
          resolve({ data: rows, error: null });
        },
      };
      return builder;
    },
  };
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => fakeAnon,
}));

let fakeAnon: ReturnType<typeof makeFakeAnon>;

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

const { resolveStoreSlug } = await import('./resolve');

// Fila completa de `stores` tal como la devuelve `select('*')` — todas las
// columnas, incluidas las comerciales que nunca deben llegar al cliente.
function makeStoreRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'store-1',
    name: 'Tienda Test',
    slug: 'tienda-test',
    description: 'Una tienda de prueba',
    logo_url: 'https://example.com/logo.png',
    theme: { accent_color: '#22c55e' },
    social_links: { instagram: 'tienda_test' },
    whatsapp_number: '5491100000000',
    checkout_mode: 'whatsapp',
    default_product_sort: 'manual',
    out_of_stock_last: true,
    status: 'published',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    published_at: '2026-01-01T00:00:00Z',
    // Comerciales / sensibles — deben quedar afuera del objeto público.
    plan: 'pro',
    order_seq: 42,
    mp_preapproval_id: null,
    mp_subscription_status: null,
    subscription_status_changed_at: null,
    trial_ends_at: null,
    payment_exempt: true, // exento: simplifica el estado de suscripción a "disponible"
    payment_exempt_reason: 'cortesía',
    blocked_at: null,
    owner_id: 'owner-1',
    wa_pending_ttl_days: 3,
    wa_auto_confirm: false,
    wa_lifecycle_effective_from: '2026-01-01T00:00:00Z',
    onboarding_step: 5,
    ...overrides,
  };
}

const FORBIDDEN_KEYS = [
  'plan',
  'order_seq',
  'mp_preapproval_id',
  'mp_subscription_status',
  'subscription_status_changed_at',
  'trial_ends_at',
  'payment_exempt',
  'payment_exempt_reason',
  'blocked_at',
  'owner_id',
  'wa_pending_ttl_days',
  'wa_auto_confirm',
  'wa_lifecycle_effective_from',
  'onboarding_step',
] as const;

describe('resolveStoreSlug — payload público de stores', () => {
  it('tienda publicada: el store que llega al cliente no trae columnas comerciales/sensibles', async () => {
    fakeAnon = makeFakeAnon({
      stores: [makeStoreRow()],
      sections: [],
      products: [],
    });

    const resolution = await resolveStoreSlug('tienda-test');

    expect(resolution.kind).toBe('render');
    if (resolution.kind !== 'render') throw new Error('expected render');

    const keys = Object.keys(resolution.store);
    for (const forbidden of FORBIDDEN_KEYS) {
      expect(keys).not.toContain(forbidden);
    }
    expect(new Set(keys)).toEqual(
      new Set([
        'id',
        'name',
        'slug',
        'description',
        'logo_url',
        'theme',
        'social_links',
        'whatsapp_number',
        'checkout_mode',
        'default_product_sort',
        'out_of_stock_last',
      ])
    );
  });

  it('tienda bloqueada: la pantalla de mantenimiento no recibe la fila completa', async () => {
    fakeAnon = makeFakeAnon({
      stores: [
        makeStoreRow({
          payment_exempt: false,
          blocked_at: '2026-01-01T00:00:00Z', // bloqueada por el cron
        }),
      ],
      sections: [],
      products: [],
    });

    const resolution = await resolveStoreSlug('tienda-test');

    expect(resolution.kind).toBe('maintenance');
    if (resolution.kind !== 'maintenance') throw new Error('expected maintenance');

    const keys = Object.keys(resolution.store);
    for (const forbidden of FORBIDDEN_KEYS) {
      expect(keys).not.toContain(forbidden);
    }
    expect(new Set(keys)).toEqual(new Set(['name', 'logo_url', 'theme']));
  });
});
