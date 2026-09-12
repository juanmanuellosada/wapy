// Ejecutar con: npx vitest run lib/store/actions.test.ts
//
// Cubre countUncostedOrders / backfillProductCost (add-cost-backfill-on-save).
// Fake mínimo del admin client con una tabla `order_items` en memoria para
// poder verificar mutaciones reales entre llamadas (idempotencia, D1).

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('unexpected redirect');
  }),
}));

const mockCreateAdminClient = vi.fn();
const mockCreateServerClient = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => mockCreateAdminClient(),
  createServerClient: () => mockCreateServerClient(),
}));

// lib/store/actions.ts importa esto para otras funciones del archivo (no las
// que cubre este test) pero arrastra `import 'server-only'`, que no resuelve
// fuera del build de Next. Se mockea para poder importar el módulo bajo vitest.
vi.mock('@/lib/store/checkout/oauth', () => ({
  getStoreMpConnectionStatus: vi.fn(),
}));

const { countUncostedOrders, backfillProductCost } = await import('./actions');

const STORE_ID = 'store-1';
const OTHER_STORE_ID = 'store-2';
const PRODUCT_ID = 'product-1';

type Filter = { col: string; op: 'eq' | 'is' | 'in'; val: unknown };

function matches(row: Record<string, unknown>, filters: Filter[]): boolean {
  return filters.every((f) => {
    const rowVal = row[f.col];
    if (f.op === 'eq') return rowVal === f.val;
    if (f.op === 'is') return f.val === null ? rowVal == null : rowVal === f.val;
    if (f.op === 'in') return Array.isArray(f.val) && (f.val as unknown[]).includes(rowVal);
    return false;
  });
}

function makeQueryBuilder(
  resolve: (
    op: 'select' | 'update',
    filters: Filter[],
    payload: Record<string, unknown> | undefined
  ) => { data: unknown; error?: unknown }
) {
  let op: 'select' | 'update' = 'select';
  let payload: Record<string, unknown> | undefined;
  const filters: Filter[] = [];

  const builder = {
    select: () => builder,
    update: (p: Record<string, unknown>) => {
      op = 'update';
      payload = p;
      return builder;
    },
    eq: (col: string, val: unknown) => {
      filters.push({ col, op: 'eq', val });
      return builder;
    },
    is: (col: string, val: unknown) => {
      filters.push({ col, op: 'is', val });
      return builder;
    },
    in: (col: string, val: unknown) => {
      filters.push({ col, op: 'in', val });
      return builder;
    },
    maybeSingle: async () => resolve(op, filters, payload),
    then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
      Promise.resolve(resolve(op, filters, payload)).then(res, rej),
  };
  return builder;
}

type OrderItemRow = {
  id: string;
  product_id: string | null;
  variant_id: string | null;
  cost_at_purchase: number | null;
  cost_is_estimated: boolean;
  order_id: string;
};

function makeFakeAdmin(opts: {
  store: { id: string; plan: string } | null;
  product: { id: string; store_id: string; cost_cents: number | null } | null;
  variants: Array<{ id: string; product_id: string; cost_override: number | null }>;
  orderItems: OrderItemRow[];
}) {
  const from = vi.fn((table: string) => {
    if (table === 'stores') {
      return makeQueryBuilder((_op, filters) => {
        const ownerFilter = filters.find((f) => f.col === 'owner_id');
        if (opts.store && ownerFilter?.val === 'u1') return { data: opts.store, error: null };
        return { data: null, error: null };
      });
    }
    if (table === 'products') {
      return makeQueryBuilder((_op, filters) => {
        if (!opts.product) return { data: null, error: null };
        const rowMatches = matches(
          { id: opts.product.id, store_id: opts.product.store_id },
          filters.filter((f) => f.col === 'id' || f.col === 'store_id')
        );
        return { data: rowMatches ? opts.product : null, error: null };
      });
    }
    if (table === 'product_variants') {
      return makeQueryBuilder((_op, filters) => {
        const productFilter = filters.find((f) => f.col === 'product_id');
        const rows = opts.variants.filter((v) => v.product_id === productFilter?.val);
        return { data: rows, error: null };
      });
    }
    if (table === 'order_items') {
      return makeQueryBuilder((op, filters, payload) => {
        if (op === 'select') {
          const rows = opts.orderItems.filter((r) => matches(r as unknown as Record<string, unknown>, filters));
          return { data: rows, error: null };
        }
        // update: solo toca filas que matchean TODOS los filtros (incluye el
        // guard `cost_at_purchase IS NULL` — D1), y refleja la mutación en el
        // array en memoria para que una segunda llamada vea el estado nuevo.
        const updatedRows: Array<{ id: string }> = [];
        for (const row of opts.orderItems) {
          if (matches(row as unknown as Record<string, unknown>, filters)) {
            Object.assign(row, payload);
            updatedRows.push({ id: row.id });
          }
        }
        return { data: updatedRows, error: null };
      });
    }
    return makeQueryBuilder(() => ({ data: null, error: null }));
  });
  return { from };
}

function mockAuth(userId: string | null) {
  mockCreateServerClient.mockReturnValue({
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) },
  });
}

beforeEach(() => {
  mockCreateAdminClient.mockReset();
  mockCreateServerClient.mockReset();
});

describe('countUncostedOrders', () => {
  it('cuenta líneas y pedidos distintos sin costo, ignorando las que ya tienen', () => {
    mockAuth('u1');
    const admin = makeFakeAdmin({
      store: { id: STORE_ID, plan: 'pro' },
      product: { id: PRODUCT_ID, store_id: STORE_ID, cost_cents: 500 },
      variants: [],
      orderItems: [
        { id: 'i1', product_id: PRODUCT_ID, variant_id: null, cost_at_purchase: null, cost_is_estimated: false, order_id: 'o1' },
        { id: 'i2', product_id: PRODUCT_ID, variant_id: null, cost_at_purchase: null, cost_is_estimated: false, order_id: 'o1' },
        { id: 'i3', product_id: PRODUCT_ID, variant_id: null, cost_at_purchase: null, cost_is_estimated: false, order_id: 'o2' },
        { id: 'i4', product_id: PRODUCT_ID, variant_id: null, cost_at_purchase: 300, cost_is_estimated: false, order_id: 'o3' },
      ],
    });
    mockCreateAdminClient.mockReturnValue(admin);

    return countUncostedOrders(PRODUCT_ID).then((result) => {
      expect(result).toEqual({ ok: true, lineCount: 3, orderCount: 2 });
    });
  });

  it('rechaza una tienda sin plan Pro', async () => {
    mockAuth('u1');
    mockCreateAdminClient.mockReturnValue(
      makeFakeAdmin({
        store: { id: STORE_ID, plan: 'medio' },
        product: { id: PRODUCT_ID, store_id: STORE_ID, cost_cents: 500 },
        variants: [],
        orderItems: [],
      })
    );

    const result = await countUncostedOrders(PRODUCT_ID);
    expect('error' in result).toBe(true);
  });

  it('rechaza un producto de otra tienda', async () => {
    mockAuth('u1');
    mockCreateAdminClient.mockReturnValue(
      makeFakeAdmin({
        store: { id: STORE_ID, plan: 'pro' },
        product: { id: PRODUCT_ID, store_id: OTHER_STORE_ID, cost_cents: 500 },
        variants: [],
        orderItems: [],
      })
    );

    const result = await countUncostedOrders(PRODUCT_ID);
    expect('error' in result).toBe(true);
  });
});

describe('backfillProductCost', () => {
  it('completa solo las líneas sin costo; nunca pisa una ya congelada aunque difiera', async () => {
    mockAuth('u1');
    const orderItems: OrderItemRow[] = [
      { id: 'i1', product_id: PRODUCT_ID, variant_id: null, cost_at_purchase: null, cost_is_estimated: false, order_id: 'o1' },
      { id: 'i2', product_id: PRODUCT_ID, variant_id: null, cost_at_purchase: 999, cost_is_estimated: false, order_id: 'o2' },
    ];
    mockCreateAdminClient.mockReturnValue(
      makeFakeAdmin({
        store: { id: STORE_ID, plan: 'pro' },
        product: { id: PRODUCT_ID, store_id: STORE_ID, cost_cents: 500 },
        variants: [],
        orderItems,
      })
    );

    const result = await backfillProductCost(PRODUCT_ID);
    expect(result).toEqual({ ok: true, updated: 1 });
    expect(orderItems.find((i) => i.id === 'i1')).toMatchObject({ cost_at_purchase: 500, cost_is_estimated: true });
    // La línea con costo ya congelado no se toca, ni su valor ni su marca de estimada.
    expect(orderItems.find((i) => i.id === 'i2')).toMatchObject({ cost_at_purchase: 999, cost_is_estimated: false });
  });

  it('una variante con cost_override propio toma el suyo; sin override hereda el del producto', async () => {
    mockAuth('u1');
    const orderItems: OrderItemRow[] = [
      { id: 'i1', product_id: PRODUCT_ID, variant_id: 'v-own', cost_at_purchase: null, cost_is_estimated: false, order_id: 'o1' },
      { id: 'i2', product_id: PRODUCT_ID, variant_id: 'v-inherits', cost_at_purchase: null, cost_is_estimated: false, order_id: 'o2' },
    ];
    mockCreateAdminClient.mockReturnValue(
      makeFakeAdmin({
        store: { id: STORE_ID, plan: 'pro' },
        product: { id: PRODUCT_ID, store_id: STORE_ID, cost_cents: 500 },
        variants: [
          { id: 'v-own', product_id: PRODUCT_ID, cost_override: 700 },
          { id: 'v-inherits', product_id: PRODUCT_ID, cost_override: null },
        ],
        orderItems,
      })
    );

    const result = await backfillProductCost(PRODUCT_ID);
    expect(result).toEqual({ ok: true, updated: 2 });
    expect(orderItems.find((i) => i.id === 'i1')?.cost_at_purchase).toBe(700);
    expect(orderItems.find((i) => i.id === 'i2')?.cost_at_purchase).toBe(500);
  });

  it('excluye líneas de un producto que ya no existe en el catálogo', async () => {
    mockAuth('u1');
    const orderItems: OrderItemRow[] = [
      { id: 'i1', product_id: PRODUCT_ID, variant_id: null, cost_at_purchase: null, cost_is_estimated: false, order_id: 'o1' },
      // Producto borrado: product_id quedó en NULL (ON DELETE SET NULL) y nunca matchea el filtro por id.
      { id: 'i2', product_id: null, variant_id: null, cost_at_purchase: null, cost_is_estimated: false, order_id: 'o2' },
    ];
    mockCreateAdminClient.mockReturnValue(
      makeFakeAdmin({
        store: { id: STORE_ID, plan: 'pro' },
        product: { id: PRODUCT_ID, store_id: STORE_ID, cost_cents: 500 },
        variants: [],
        orderItems,
      })
    );

    const result = await backfillProductCost(PRODUCT_ID);
    expect(result).toEqual({ ok: true, updated: 1 });
    expect(orderItems.find((i) => i.id === 'i2')?.cost_at_purchase).toBeNull();
  });

  it('completar dos veces no cambia nada la segunda vez (idempotente)', async () => {
    mockAuth('u1');
    const orderItems: OrderItemRow[] = [
      { id: 'i1', product_id: PRODUCT_ID, variant_id: null, cost_at_purchase: null, cost_is_estimated: false, order_id: 'o1' },
    ];
    const admin = makeFakeAdmin({
      store: { id: STORE_ID, plan: 'pro' },
      product: { id: PRODUCT_ID, store_id: STORE_ID, cost_cents: 500 },
      variants: [],
      orderItems,
    });
    mockCreateAdminClient.mockReturnValue(admin);

    const first = await backfillProductCost(PRODUCT_ID);
    expect(first).toEqual({ ok: true, updated: 1 });

    const second = await backfillProductCost(PRODUCT_ID);
    expect(second).toEqual({ ok: true, updated: 0 });
    expect(orderItems[0].cost_at_purchase).toBe(500);
  });

  it('rechaza una tienda sin plan Pro', async () => {
    mockAuth('u1');
    mockCreateAdminClient.mockReturnValue(
      makeFakeAdmin({
        store: { id: STORE_ID, plan: 'inicial' },
        product: { id: PRODUCT_ID, store_id: STORE_ID, cost_cents: 500 },
        variants: [],
        orderItems: [],
      })
    );

    const result = await backfillProductCost(PRODUCT_ID);
    expect('error' in result).toBe(true);
  });

  it('rechaza un producto de otra tienda', async () => {
    mockAuth('u1');
    mockCreateAdminClient.mockReturnValue(
      makeFakeAdmin({
        store: { id: STORE_ID, plan: 'pro' },
        product: { id: PRODUCT_ID, store_id: OTHER_STORE_ID, cost_cents: 500 },
        variants: [],
        orderItems: [],
      })
    );

    const result = await backfillProductCost(PRODUCT_ID);
    expect('error' in result).toBe(true);
  });
});
