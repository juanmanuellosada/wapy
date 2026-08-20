// Ejecutar con: npx vitest run lib/store/orders/createPendingOrder.test.ts
//
// Cubre el requisito de "checkout por WhatsApp exige teléfono": createPendingOrder
// debe rechazar el pedido si falta o es inválido para channel='whatsapp', y debe
// persistir el número normalizado en orders.customer_phone cuando es válido.
// Usa un fake mínimo del admin client (mismo espíritu que actions.test.ts, pero
// acotado a las tablas que createPendingOrder toca en el camino feliz).

import { describe, it, expect, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

const mockCreateAdminClient = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => mockCreateAdminClient(),
  createServerClient: () => ({}),
}));

const { createPendingOrder } = await import('./actions');

type TableResponse = { data: unknown; error?: unknown; count?: number };

function makeChainable(response: TableResponse) {
  const builder: Record<string, unknown> = {};
  const passthrough = ['select', 'eq', 'in', 'gte', 'lte', 'neq', 'order', 'range', 'insert', 'update'];
  for (const method of passthrough) {
    builder[method] = () => builder;
  }
  builder.maybeSingle = async () => ({ data: response.data, error: response.error ?? null });
  builder.single = async () => ({ data: response.data, error: response.error ?? null });
  builder.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve({ data: response.data, error: response.error ?? null, count: response.count }).then(
      resolve,
      reject
    );
  return builder;
}

/** Un fake que responde con una respuesta fija por tabla (cada tabla se consulta una sola vez en el camino feliz). */
function makeFakeAdmin(perTable: Record<string, TableResponse>) {
  const from = vi.fn((table: string) => makeChainable(perTable[table] ?? { data: null, error: null }));
  const rpc = vi.fn(async () => ({ data: 1, error: null }));
  return { from, rpc };
}

const STORE_ID = 'store-1';
const PRODUCT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function baseTables(overrides: Partial<Record<string, TableResponse>> = {}) {
  return {
    stores: { data: { id: STORE_ID }, error: null },
    products: {
      data: [
        {
          id: PRODUCT_ID,
          name: 'Producto test',
          price_cents: 10000,
          promo_price_cents: null,
          stock: null,
          section_id: null,
          min_quantity: 1,
          qty_step: 1,
          sections: null,
        },
      ],
      error: null,
    },
    product_option_types: { data: [], error: null },
    product_price_tiers: { data: [], error: null },
    orders: { data: { id: 'order-1', store_order_number: 1 }, error: null },
    order_items: { data: null, error: null },
    ...overrides,
  };
}

function baseInput(customer_phone: string | null | undefined) {
  return {
    store_id: STORE_ID,
    items: [{ product_id: PRODUCT_ID, quantity: 1 }],
    customer_phone,
  };
}

describe('createPendingOrder — teléfono de la compradora (canal whatsapp)', () => {
  it('rechaza el pedido si no se manda teléfono', async () => {
    mockCreateAdminClient.mockReturnValue(makeFakeAdmin(baseTables()));
    const result = await createPendingOrder(baseInput(undefined));
    expect(result).toEqual({ error: 'invalid_phone' });
  });

  it('rechaza el pedido si el teléfono es inválido (muy corto)', async () => {
    mockCreateAdminClient.mockReturnValue(makeFakeAdmin(baseTables()));
    const result = await createPendingOrder(baseInput('123'));
    expect(result).toEqual({ error: 'invalid_phone' });
  });

  it('acepta un número argentino sin "+" (crea el pedido)', async () => {
    mockCreateAdminClient.mockReturnValue(makeFakeAdmin(baseTables()));

    const result = await createPendingOrder(baseInput('11 1234-5678'));

    expect('order_id' in result).toBe(true);
  });

  it('persiste el teléfono normalizado en el insert de orders', async () => {
    const admin = makeFakeAdmin(baseTables());
    // Reemplaza el builder de 'orders' para capturar el payload de insert().
    let insertedPayload: Record<string, unknown> | null = null;
    const originalFrom = admin.from as ReturnType<typeof vi.fn>;
    admin.from = vi.fn((table: string) => {
      if (table === 'orders') {
        const builder = makeChainable({ data: { id: 'order-1', store_order_number: 1 }, error: null });
        const originalInsert = builder.insert as (payload: unknown) => typeof builder;
        builder.insert = (payload: Record<string, unknown>) => {
          insertedPayload = payload;
          return originalInsert(payload);
        };
        return builder;
      }
      return originalFrom(table);
    });
    mockCreateAdminClient.mockReturnValue(admin);

    const result = await createPendingOrder(baseInput('11 1234-5678'));

    expect('order_id' in result).toBe(true);
    expect(insertedPayload).not.toBeNull();
    expect((insertedPayload as Record<string, unknown>).customer_phone).toBe('+5491112345678');
  });

  it('respeta un número ya en formato E.164 (con "+") sin anteponer +549', async () => {
    let insertedPayload: Record<string, unknown> | null = null;
    const admin = makeFakeAdmin(baseTables());
    admin.from = vi.fn((table: string) => {
      if (table === 'orders') {
        const builder = makeChainable({ data: { id: 'order-1', store_order_number: 1 }, error: null });
        const originalInsert = builder.insert as (payload: unknown) => typeof builder;
        builder.insert = (payload: Record<string, unknown>) => {
          insertedPayload = payload;
          return originalInsert(payload);
        };
        return builder;
      }
      return makeChainable(baseTables()[table as keyof ReturnType<typeof baseTables>] ?? { data: null, error: null });
    });
    mockCreateAdminClient.mockReturnValue(admin);

    await createPendingOrder(baseInput('+56912345678'));

    expect((insertedPayload as Record<string, unknown> | null)?.customer_phone).toBe('+56912345678');
  });
});
