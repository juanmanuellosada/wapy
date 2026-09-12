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
//
// Regresión de confidencialidad del costo (add-product-cost-tracking, Decisión
// D7 / grupo 8): el payload que arma `resolveStoreSlug` para la tienda pública
// NUNCA debe incluir el costo de mercadería, ni siquiera si la fila real en la
// base lo tiene cargado.
//
// A propósito ninguno de los dos casos se fija en cómo está escrito el
// `select(...)` de resolve.ts (eso es frágil: cualquier refactor que
// mantenga el resultado pero cambie el string de la query lo rompería sin
// necesidad). En cambio, el fake de Postgrest de acá abajo PROYECTA columnas
// según el `select` que el código pida — igual que Postgrest — y los tests
// verifican el PAYLOAD final que recibiría el cliente. Si mañana alguien
// vuelve a un `select('*')` en cualquiera de las dos consultas, el fake
// empieza a devolver también los campos sensibles y el test correspondiente
// lo detecta.

import { describe, it, expect, vi } from 'vitest';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

// resolve.ts importa createAdminClient de acá pero solo lo usa en las ramas de
// redirect/paused/not_found — no se llega a esa rama en estos tests.
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => {
    throw new Error('createAdminClient no se usa en el camino "render" de estos tests');
  },
}));

type Row = Record<string, unknown>;

/** Proyecta una fila según un string de `select(...)` al estilo Postgrest (solo columnas planas). */
function project(row: Row, selectExpr: string): Row {
  if (selectExpr.trim() === '*') return { ...row };
  const cols = selectExpr.split(',').map((c) => c.trim()).filter(Boolean);
  const out: Row = {};
  for (const col of cols) {
    if (col.includes('(')) continue; // sintaxis de relación anidada; no hace falta acá
    if (col in row) out[col] = row[col];
  }
  return out;
}

// Fake del query builder de supabase-js: sólo lo que resolve.ts encadena
// (select/eq/in/is/order/maybeSingle, o awaitear la lista directamente).
// Proyecta las columnas según el `select(...)` pedido, igual que Postgrest.
function makeFakeAnonClient(db: Record<string, Row[]>) {
  function makeBuilder(table: string) {
    let rows = [...(db[table] ?? [])];
    let selectExpr = '*';
    const builder = {
      select(expr: string) {
        selectExpr = expr;
        return builder;
      },
      eq(col: string, val: unknown) {
        rows = rows.filter((r) => r[col] === val);
        return builder;
      },
      in(col: string, vals: unknown[]) {
        rows = rows.filter((r) => vals.includes(r[col] as never));
        return builder;
      },
      is(col: string, val: unknown) {
        rows = rows.filter((r) => (r[col] ?? null) === val);
        return builder;
      },
      order() {
        return builder;
      },
      async maybeSingle() {
        return { data: rows[0] ? project(rows[0], selectExpr) : null, error: null };
      },
      then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
        return Promise.resolve({ data: rows.map((r) => project(r, selectExpr)), error: null }).then(
          resolve,
          reject
        );
      },
    };
    return builder;
  }
  return { from: (table: string) => makeBuilder(table) };
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => fakeAnon,
}));

let fakeAnon: ReturnType<typeof makeFakeAnonClient>;

const { resolveStoreSlug } = await import('./resolve');

describe('resolveStoreSlug — payload público de stores', () => {
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

  it('tienda publicada: el store que llega al cliente no trae columnas comerciales/sensibles', async () => {
    fakeAnon = makeFakeAnonClient({
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
    fakeAnon = makeFakeAnonClient({
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

describe('resolveStoreSlug — el costo de mercadería nunca llega al payload público', () => {
  const STORE_ID = 'store-1';
  const PRODUCT_ID = 'product-1';

  function baseDb(): Record<string, Row[]> {
    return {
      stores: [
        {
          id: STORE_ID,
          slug: 'tienda-test',
          status: 'published',
          // isPubliclyAvailable: payment_exempt=true alcanza para "no bloqueada",
          // sin depender del resto de los campos de suscripción.
          payment_exempt: true,
          blocked_at: null,
          mp_subscription_status: null,
          subscription_status_changed_at: null,
          trial_ends_at: null,
          mp_preapproval_id: null,
          checkout_mode: 'whatsapp',
        },
      ],
      sections: [],
      products: [
        {
          id: PRODUCT_ID,
          store_id: STORE_ID,
          section_id: null,
          name: 'Remera',
          description: null,
          price_cents: 10000,
          promo_price_cents: null,
          // Cargado en la base real — NO debe llegar al público (D7).
          cost_cents: 6000,
          currency: 'ARS',
          image_urls: [],
          stock: null,
          is_active: true,
          position: 0,
          min_quantity: 1,
          qty_step: 1,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      product_price_tiers: [],
      product_option_types: [],
      product_variants: [],
      slug_history: [],
    };
  }

  it('el producto resuelto no trae cost_cents aunque la fila real lo tenga cargado', async () => {
    fakeAnon = makeFakeAnonClient(baseDb());

    const resolution = await resolveStoreSlug('tienda-test');

    expect(resolution.kind).toBe('render');
    if (resolution.kind !== 'render') return;

    expect(resolution.products.length).toBe(1);
    // El resto de los campos sí tiene que llegar (si no, el fake estaría roto
    // y el test pasaría por las razones equivocadas).
    expect(resolution.products[0].name).toBe('Remera');
    expect(resolution.products[0].price_cents).toBe(10000);

    for (const p of resolution.products) {
      expect(p).not.toHaveProperty('cost_cents');
    }

    // Blindaje extra: tal cual se serializaría al pasar por props a un client
    // component (JSON.stringify aproxima lo que React serializa al armar el
    // payload de la página).
    const serialized = JSON.stringify(resolution.products);
    expect(serialized).not.toMatch(/cost_cents|cost_override/);
  });
});
