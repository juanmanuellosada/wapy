// Ejecutar con: npx vitest run lib/store/orders/actions.test.ts
//
// Estas pruebas ejercen assignOrderNumber / incrementCouponUse / revertCouponUse
// directamente contra un fake del admin client (no hay infraestructura de test
// contra Postgres en este repo), mockeando '@/lib/supabase/server',
// '@sentry/nextjs' y 'next/cache' para que importar actions.ts no dispare I/O
// real. 'next/cache' se mockea porque revalidatePath requiere un request
// store de Next.js (static generation store) que no existe fuera de un
// request real — sin el mock, cualquier mutación que la llame revienta acá.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const mockCreateAdminClient = vi.fn();
const mockCreateServerClient = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => mockCreateAdminClient(),
  createServerClient: () => mockCreateServerClient(),
}));

const {
  assignOrderNumber,
  incrementCouponUse,
  revertCouponUse,
  getOrderStats,
  listOrders,
  batchUpdateOrderStatus,
  exportOrdersCsv,
  getOrderById,
  getBacklogPendingCount,
  deleteOrder,
  batchDeleteOrders,
} = await import('./actions');

// Espejo del tamaño de página interno de actions.ts (no se exporta: el archivo
// es 'use server' y solo puede exportar funciones async — ver listOrders).
const ORDERS_PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Fake admin client: solo lo que necesitan assignOrderNumber / incrementCouponUse
// / revertCouponUse / getOrderStats, no un mock genérico de supabase-js.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function makeFakeAdmin(
  tables: {
    orders?: Row[];
    coupons?: Row[];
    stores?: Row[];
    order_items?: Row[];
    products?: Row[];
    product_variants?: Row[];
  } = {}
) {
  const state = {
    orders: tables.orders ?? [],
    coupons: tables.coupons ?? [],
    stores: tables.stores ?? [],
    order_items: tables.order_items ?? [],
    products: tables.products ?? [],
    product_variants: tables.product_variants ?? [],
  };

  function from(table: 'orders' | 'coupons' | 'stores' | 'order_items' | 'products' | 'product_variants') {
    const filters: Array<(r: Row) => boolean> = [];
    let patch: Row | null = null;
    let countRequested = false;
    let orderCol: string | null = null;
    let orderAsc = true;
    let rangeFrom: number | null = null;
    let rangeTo: number | null = null;

    function computeMatches(): Row[] {
      return state[table].filter((r) => filters.every((f) => f(r)));
    }

    function applyPatch(rows: Row[]): Row[] {
      if (patch) rows.forEach((r) => Object.assign(r, patch));
      return rows;
    }

    const builder = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        if (opts?.count === 'exact') countRequested = true;
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return builder;
      },
      gte(col: string, val: unknown) {
        filters.push((r) => (r[col] as string) >= (val as string));
        return builder;
      },
      lte(col: string, val: unknown) {
        filters.push((r) => (r[col] as string) <= (val as string));
        return builder;
      },
      lt(col: string, val: unknown) {
        filters.push((r) => (r[col] as string) < (val as string));
        return builder;
      },
      in(col: string, vals: unknown[]) {
        filters.push((r) => (vals as unknown[]).includes(r[col]));
        return builder;
      },
      is(col: string, val: unknown) {
        filters.push((r) => (val === null ? r[col] == null : r[col] === val));
        return builder;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        orderCol = col;
        orderAsc = opts?.ascending !== false;
        return builder;
      },
      range(from: number, to: number) {
        rangeFrom = from;
        rangeTo = to;
        return builder;
      },
      update(p: Row) {
        patch = p;
        return builder;
      },
      async maybeSingle() {
        const row = state[table].find((r) => filters.every((f) => f(r))) ?? null;
        if (patch && row) Object.assign(row, patch);
        return { data: row ? { ...row } : null, error: null };
      },
      async single() {
        const rows = applyPatch(computeMatches());
        if (rows.length !== 1) return { data: null, error: { message: 'not exactly one row' } };
        return { data: { ...rows[0] }, error: null };
      },
      then(resolve: (v: { data: Row[]; error: null; count: number | null }) => void) {
        const matched = applyPatch(computeMatches());
        const count = countRequested ? matched.length : null;
        let rows = matched;
        if (orderCol) {
          const col = orderCol;
          rows = [...rows].sort((a, b) => {
            const av = a[col] as string;
            const bv = b[col] as string;
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            return orderAsc ? cmp : -cmp;
          });
        }
        if (rangeFrom !== null && rangeTo !== null) {
          rows = rows.slice(rangeFrom, rangeTo + 1);
        }
        resolve({ data: rows, error: null, count });
      },
    };
    return builder;
  }

  // Simula `UPDATE stores SET order_seq = order_seq + 1 RETURNING order_seq`:
  // el incremento ocurre en un único paso síncrono, igual que la sentencia SQL
  // real (Postgres serializa vía row lock — no hay ventana entre leer y
  // escribir para que dos llamadas "concurrentes" puedan pisarse).
  const storeSeq = new Map<string, number>();
  async function rpc(name: string, args: { p_store_id: string }) {
    if (name !== 'next_order_number') return { data: null, error: { message: 'unknown rpc' } };
    const next = (storeSeq.get(args.p_store_id) ?? 0) + 1;
    storeSeq.set(args.p_store_id, next);
    return { data: next, error: null };
  }

  return { from, rpc, __state: state };
}

// ---------------------------------------------------------------------------
// 2.2 — numeración correlativa atómica
// ---------------------------------------------------------------------------

describe('assignOrderNumber', () => {
  it('dos creaciones concurrentes de la misma tienda no colisionan', async () => {
    const admin = makeFakeAdmin();
    const results = await Promise.all([1, 2, 3].map(() => assignOrderNumber(admin as any, 's1')));
    expect(new Set(results).size).toBe(3);
    expect([...results].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([1, 2, 3]);
  });

  it('la numeración es independiente entre tiendas', async () => {
    const admin = makeFakeAdmin();
    const [a, b] = await Promise.all([assignOrderNumber(admin as any, 's1'), assignOrderNumber(admin as any, 's2')]);
    expect(a).toBe(1);
    expect(b).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 3.4 — coupon_counted agnóstico de canal y de status
// ---------------------------------------------------------------------------

describe('incrementCouponUse / revertCouponUse', () => {
  let admin: ReturnType<typeof makeFakeAdmin>;

  beforeEach(() => {
    admin = makeFakeAdmin();
    mockCreateAdminClient.mockReturnValue(admin);
  });

  it('cancelación manual desde pending devuelve el uso del cupón', async () => {
    admin.__state.orders.push({ id: 'o1', store_id: 's1', coupon_code: 'PROMO', coupon_counted: false });
    admin.__state.coupons.push({ id: 'c1', store_id: 's1', code: 'PROMO', uses_count: 0 });

    // WhatsApp cuenta el uso al crear el pedido.
    const inc = await incrementCouponUse('o1');
    expect(inc).toEqual({ ok: true, incremented: true });
    expect(admin.__state.coupons[0].uses_count).toBe(1);
    expect(admin.__state.orders[0].coupon_counted).toBe(true);

    // La dueña cancela el pedido pendiente: el uso se devuelve.
    const rev = await revertCouponUse('o1');
    expect(rev).toEqual({ ok: true, reverted: true });
    expect(admin.__state.coupons[0].uses_count).toBe(0);
    expect(admin.__state.orders[0].coupon_counted).toBe(false);
  });

  it('doble reversión no baja el contador dos veces', async () => {
    admin.__state.orders.push({ id: 'o2', store_id: 's1', coupon_code: 'PROMO', coupon_counted: true });
    admin.__state.coupons.push({ id: 'c1', store_id: 's1', code: 'PROMO', uses_count: 1 });

    const first = await revertCouponUse('o2');
    expect(first).toEqual({ ok: true, reverted: true });
    expect(admin.__state.coupons[0].uses_count).toBe(0);

    const second = await revertCouponUse('o2');
    expect(second).toEqual({ ok: true, reverted: false });
    expect(admin.__state.coupons[0].uses_count).toBe(0);
  });

  it('pedido de Mercado Pago nunca aprobado no modifica el contador al cancelarse', async () => {
    // MP cuenta el uso recién al aprobar el pago (confirmOrderOnApproval →
    // incrementCouponUse); este pedido nunca se aprobó, así que coupon_counted
    // sigue en false y no hay nada que revertir.
    admin.__state.orders.push({ id: 'o3', store_id: 's1', coupon_code: 'PROMO', coupon_counted: false });
    admin.__state.coupons.push({ id: 'c1', store_id: 's1', code: 'PROMO', uses_count: 3 });

    const rev = await revertCouponUse('o3');
    expect(rev).toEqual({ ok: true, reverted: false });
    expect(admin.__state.coupons[0].uses_count).toBe(3);
  });

  it('reactivar un pedido cancelado por el sistema vuelve a contar el cupón', async () => {
    // Simula el paso 2 de la reactivación (Decisión 9): tras cancelar, coupon_counted
    // quedó en false; updateOrderStatus llama a incrementCouponUse de nuevo al revivir.
    admin.__state.orders.push({ id: 'o4', store_id: 's1', coupon_code: 'PROMO', coupon_counted: false });
    admin.__state.coupons.push({ id: 'c1', store_id: 's1', code: 'PROMO', uses_count: 0 });

    const inc = await incrementCouponUse('o4');
    expect(inc).toEqual({ ok: true, incremented: true });
    expect(admin.__state.coupons[0].uses_count).toBe(1);
    expect(admin.__state.orders[0].coupon_counted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8.3 — criterio único de venta en las métricas: ingresos netos y
// consistencia entre indicadores (revenue vs. top_products / orders_by_section)
// ---------------------------------------------------------------------------

describe('getOrderStats', () => {
  const now = new Date().toISOString();

  function setup() {
    const admin = makeFakeAdmin({
      stores: [{ id: 's1', owner_id: 'u1' }],
      orders: [
        // Confirmado con cupón: el ingreso debe descontar el descuento.
        {
          id: 'o1',
          store_id: 's1',
          status: 'confirmed',
          total_cents: 1_000_000,
          discount_cents: 200_000,
          created_at: now,
        },
        // Entregado sin descuento: cuenta entero.
        {
          id: 'o2',
          store_id: 's1',
          status: 'delivered',
          total_cents: 400_000,
          discount_cents: null,
          created_at: now,
        },
        // Pendiente: no debe sumar a ingresos ni aparecer en top_products/orders_by_section.
        {
          id: 'o3',
          store_id: 's1',
          status: 'pending',
          total_cents: 500_000,
          discount_cents: 0,
          created_at: now,
        },
        // Cancelado: tampoco debe sumar.
        {
          id: 'o4',
          store_id: 's1',
          status: 'cancelled',
          total_cents: 300_000,
          discount_cents: 0,
          created_at: now,
        },
      ],
      order_items: [
        { order_id: 'o1', product_name: 'Remera', unit_price_cents: 100_000, quantity: 1, section_name: 'Ropa' },
        { order_id: 'o2', product_name: 'Remera', unit_price_cents: 100_000, quantity: 3, section_name: 'Calzado' },
        { order_id: 'o3', product_name: 'Campera', unit_price_cents: 100_000, quantity: 5, section_name: 'Ropa' },
        { order_id: 'o4', product_name: 'Pantalón', unit_price_cents: 100_000, quantity: 2, section_name: 'Ropa' },
      ],
    });
    mockCreateAdminClient.mockReturnValue(admin);
    mockCreateServerClient.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    });
    return admin;
  }

  it('los ingresos descuentan el cupón (neto, no bruto)', async () => {
    setup();
    const result = await getOrderStats('30d');
    if ('error' in result) throw new Error('unexpected error');

    // o1: 1.000.000 - 200.000 = 800.000; o2: 400.000 (sin descuento).
    expect(result.kpis.revenue_cents).toBe(800_000 + 400_000);
  });

  it('pedidos pendientes o cancelados no computan en los ingresos', async () => {
    setup();
    const result = await getOrderStats('30d');
    if ('error' in result) throw new Error('unexpected error');

    // Si o3 (pending, 500.000) u o4 (cancelled, 300.000) sumaran, el total no daría 1.200.000.
    expect(result.kpis.revenue_cents).toBe(1_200_000);
  });

  it('top_products y orders_by_section usan el mismo criterio confirmed|delivered que los KPIs', async () => {
    setup();
    const result = await getOrderStats('30d');
    if ('error' in result) throw new Error('unexpected error');

    // Solo items de o1 (confirmed) y o2 (delivered): "Campera" (o3, pending) y
    // "Pantalón" (o4, cancelled) no deben aparecer.
    const names = result.top_products.map((p) => p.name);
    expect(names).toContain('Remera');
    expect(names).not.toContain('Campera');
    expect(names).not.toContain('Pantalón');

    const remera = result.top_products.find((p) => p.name === 'Remera');
    expect(remera?.units).toBe(1 + 3); // o1 (qty 1) + o2 (qty 3)

    const sections = Object.fromEntries(
      result.orders_by_section.map((s) => [s.section_name, s.count])
    );
    expect(sections['Ropa']).toBe(1); // solo el item de o1
    expect(sections['Calzado']).toBe(1); // solo el item de o2
  });
});

// ---------------------------------------------------------------------------
// 7.5 — confirmación en lote: resultado parcial, reusando updateOrderStatus
// (Decisión 7: un pedido inválido no aborta el lote).
// ---------------------------------------------------------------------------

describe('batchUpdateOrderStatus', () => {
  function setup(orders: Row[]) {
    const admin = makeFakeAdmin({
      stores: [{ id: 's1', owner_id: 'u1' }],
      orders,
    });
    mockCreateAdminClient.mockReturnValue(admin);
    mockCreateServerClient.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    });
    return admin;
  }

  function pendingOrder(id: string): Row {
    return { id, store_id: 's1', status: 'pending', cancelled_by: null, coupon_code: null, coupon_counted: false, order_items: [] };
  }

  it('lote homogéneo confirma todo', async () => {
    const admin = setup([pendingOrder('o1'), pendingOrder('o2'), pendingOrder('o3')]);

    const result = await batchUpdateOrderStatus(['o1', 'o2', 'o3'], 'confirmed');
    if ('error' in result) throw new Error('unexpected error');

    expect(result.updated.map((o) => o.id).sort()).toEqual(['o1', 'o2', 'o3']);
    expect(result.failed).toEqual([]);
    expect(admin.__state.orders.every((o) => o.status === 'confirmed')).toBe(true);
  });

  it('lote con un pedido ya cancelado confirma el resto e informa el fallo', async () => {
    const admin = setup([
      pendingOrder('o1'),
      pendingOrder('o2'),
      // Cancelado por la dueña: terminal (Decisión 9) — no admite volver a
      // confirmado, y no tiene que abortar el resto del lote.
      { id: 'o3', store_id: 's1', status: 'cancelled', cancelled_by: 'owner', coupon_code: null, coupon_counted: false, order_items: [] },
    ]);

    const result = await batchUpdateOrderStatus(['o1', 'o2', 'o3'], 'confirmed');
    if ('error' in result) throw new Error('unexpected error');

    expect(result.updated.map((o) => o.id).sort()).toEqual(['o1', 'o2']);
    expect(result.failed).toEqual([{ order_id: 'o3', reason: 'invalid_transition' }]);

    const o1 = admin.__state.orders.find((o) => o.id === 'o1')!;
    const o3 = admin.__state.orders.find((o) => o.id === 'o3')!;
    expect(o1.status).toBe('confirmed');
    expect(o3.status).toBe('cancelled'); // no se tocó
  });

  // 7.6: "seleccionar todos los que coinciden con el filtro" no manda ids —
  // manda los filtros, y acá se resuelven server-side reusando
  // fetchFilteredOrders (la misma lógica de filtrado que listOrders).
  it('selección por filtro resuelve y aplica sobre TODO el conjunto filtrado, no solo una página', async () => {
    const pendingOrders = Array.from({ length: 25 }, (_, i) => pendingOrder(`p${i + 1}`));
    const admin = setup(pendingOrders);

    const result = await batchUpdateOrderStatus({ filters: { status: 'pending' } }, 'confirmed');
    if ('error' in result) throw new Error('unexpected error');

    expect(result.updated).toHaveLength(25);
    expect(result.failed).toEqual([]);
    expect(admin.__state.orders.every((o) => o.status === 'confirmed')).toBe(true);
  });

  it('40 seleccionados con 11 en estado terminal: reporta 29 exitosos y 11 fallidos', async () => {
    const pendingOrders = Array.from({ length: 29 }, (_, i) => pendingOrder(`p${i + 1}`));
    const cancelledOrders = Array.from({ length: 11 }, (_, i) => ({
      id: `c${i + 1}`,
      store_id: 's1',
      status: 'cancelled',
      cancelled_by: 'owner',
      coupon_code: null,
      coupon_counted: false,
      order_items: [],
    }));
    const admin = setup([...pendingOrders, ...cancelledOrders]);

    const result = await batchUpdateOrderStatus({ filters: {} }, 'confirmed');
    if ('error' in result) throw new Error('unexpected error');

    expect(result.updated).toHaveLength(29);
    expect(result.failed).toHaveLength(11);
    expect(result.failed.every((f) => f.reason === 'invalid_transition')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 12.5 — paginación: los filtros corren sobre el conjunto completo de la
// tienda, no sobre la página visible (Decisión 10).
// ---------------------------------------------------------------------------

describe('listOrders — paginación', () => {
  function makeOrder(id: string, status: string, createdAt: string): Row {
    return {
      id,
      store_id: 's1',
      status,
      channel: 'whatsapp',
      customer_name: null,
      total_cents: 1000,
      currency: 'ARS',
      notes: null,
      created_at: createdAt,
      confirmed_at: null,
      cancelled_at: null,
      delivered_at: null,
      cancelled_by: null,
      payment_status: 'pending',
      store_order_number: 1,
      order_items: [],
    };
  }

  it('una tienda con más pendientes que una página devuelve todas las coincidencias, no solo la página actual', async () => {
    const pendingOrders = Array.from({ length: 25 }, (_, i) =>
      makeOrder(`p${i + 1}`, 'pending', `2026-08-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`)
    );
    // Ruido: si el filtro de estado se aplicara sobre la página en vez del
    // conjunto completo, estos podrían colarse en el resultado.
    const confirmedOrders = Array.from({ length: 5 }, (_, i) => makeOrder(`c${i + 1}`, 'confirmed', '2026-08-01T00:00:00Z'));

    const admin = makeFakeAdmin({
      stores: [{ id: 's1', owner_id: 'u1' }],
      orders: [...pendingOrders, ...confirmedOrders],
    });
    mockCreateAdminClient.mockReturnValue(admin);
    mockCreateServerClient.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    });

    const page1 = await listOrders({ status: 'pending', page: 1 });
    const page2 = await listOrders({ status: 'pending', page: 2 });
    if ('error' in page1 || 'error' in page2) throw new Error('unexpected error');

    expect(page1.total).toBe(25);
    expect(page2.total).toBe(25);
    expect(page1.orders).toHaveLength(ORDERS_PAGE_SIZE);
    expect(page2.orders).toHaveLength(25 - ORDERS_PAGE_SIZE);

    const idsAcrossPages = [...page1.orders, ...page2.orders].map((o) => o.id).sort();
    expect(idsAcrossPages).toEqual(pendingOrders.map((o) => o.id).sort());
    expect(idsAcrossPages.some((id) => id.startsWith('c'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Filtro de sección + búsqueda combinados: el resultado debe ser la
// intersección de ambos, no la unión (regresión: dos `.in('id', ...)`
// encadenados sobre la misma columna nunca se verificaron contra un
// PostgREST real — ver fetchFilteredOrders).
// ---------------------------------------------------------------------------

describe('listOrders — filtro de sección + búsqueda combinados', () => {
  function makeOrder(id: string, storeOrderNumber: number): Row {
    return {
      id,
      store_id: 's1',
      status: 'pending',
      channel: 'whatsapp',
      customer_name: null,
      total_cents: 1000,
      currency: 'ARS',
      notes: null,
      created_at: '2026-08-01T00:00:00Z',
      confirmed_at: null,
      cancelled_at: null,
      delivered_at: null,
      cancelled_by: null,
      payment_status: 'pending',
      store_order_number: storeOrderNumber,
      order_items: [],
    };
  }

  it('devuelve solo los pedidos que matchean AMBOS filtros, no la unión ni un solo filtro', async () => {
    // Sección "sec1" matchea m1 y n1. Búsqueda "m" matchea m1 y m2 (prefijo de id).
    // La intersección real es solo m1 — si el código aplicara únicamente el
    // último filtro encadenado devolvería [m1, m2]; si aplicara solo el
    // primero devolvería [m1, n1]; una unión devolvería los cuatro.
    const admin = makeFakeAdmin({
      stores: [{ id: 's1', owner_id: 'u1' }],
      orders: [makeOrder('m1', 101), makeOrder('m2', 102), makeOrder('n1', 103), makeOrder('n2', 104)],
      order_items: [
        { order_id: 'm1', section_id: 'sec1' },
        { order_id: 'n1', section_id: 'sec1' },
      ],
    });
    mockCreateAdminClient.mockReturnValue(admin);
    mockCreateServerClient.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    });

    const result = await listOrders({ section_id: 'sec1', search: 'm' });
    if ('error' in result) throw new Error('unexpected error');

    expect(result.orders.map((o) => o.id)).toEqual(['m1']);
  });

  it('intersección vacía devuelve cero filas, no todas las de un solo filtro', async () => {
    const admin = makeFakeAdmin({
      stores: [{ id: 's1', owner_id: 'u1' }],
      orders: [makeOrder('m1', 101), makeOrder('n1', 102)],
      order_items: [{ order_id: 'm1', section_id: 'sec1' }],
    });
    mockCreateAdminClient.mockReturnValue(admin);
    mockCreateServerClient.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    });

    // 'n' matchea solo n1 por prefijo de id, que no está en sec1: intersección vacía.
    const result = await listOrders({ section_id: 'sec1', search: 'n' });
    if ('error' in result) throw new Error('unexpected error');

    expect(result.orders).toEqual([]);
    expect(result.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// exportOrdersCsv — la dueña identifica pedidos por store_order_number en
// todos lados (panel, búsqueda, WhatsApp), así que el CSV lo tiene que incluir.
// ---------------------------------------------------------------------------

describe('exportOrdersCsv', () => {
  it('incluye store_order_number en el header y en la fila', async () => {
    const admin = makeFakeAdmin({
      stores: [{ id: 's1', owner_id: 'u1' }],
      orders: [
        {
          id: 'o1',
          store_id: 's1',
          status: 'confirmed',
          channel: 'whatsapp',
          customer_name: 'Juan',
          total_cents: 150000,
          currency: 'ARS',
          notes: null,
          created_at: '2026-08-01T12:00:00Z',
          confirmed_at: null,
          cancelled_at: null,
          delivered_at: null,
          cancelled_by: null,
          payment_status: 'pending',
          store_order_number: 42,
          order_items: [],
        },
      ],
    });
    mockCreateAdminClient.mockReturnValue(admin);
    mockCreateServerClient.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    });

    const result = await exportOrdersCsv({});
    if ('error' in result) throw new Error('unexpected error');

    const [header, row] = result.csv.replace(/^﻿/, '').split('\r\n');
    const headerCols = header.split(',');
    expect(headerCols).toContain('store_order_number');

    const rowCols = row.split(',');
    expect(rowCols[headerCols.indexOf('store_order_number')]).toBe('42');
  });

  it('incluye customer_phone en el header y en la fila', async () => {
    const admin = makeFakeAdmin({
      stores: [{ id: 's1', owner_id: 'u1' }],
      orders: [
        {
          id: 'o1',
          store_id: 's1',
          status: 'confirmed',
          channel: 'whatsapp',
          customer_name: 'Juan',
          customer_phone: '+5491122334455',
          customer_email: null,
          delivery_address: null,
          total_cents: 150000,
          currency: 'ARS',
          notes: null,
          created_at: '2026-08-01T12:00:00Z',
          confirmed_at: null,
          cancelled_at: null,
          delivered_at: null,
          cancelled_by: null,
          payment_status: 'pending',
          store_order_number: 42,
          order_items: [],
        },
      ],
    });
    mockCreateAdminClient.mockReturnValue(admin);
    mockCreateServerClient.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    });

    const result = await exportOrdersCsv({});
    if ('error' in result) throw new Error('unexpected error');

    const [header, row] = result.csv.replace(/^﻿/, '').split('\r\n');
    const headerCols = header.split(',');
    expect(headerCols).toContain('customer_phone');

    // parseCsvRow (no naive split): la fecha viene entrecomillada porque
    // formatCsvDate produce una coma ("01/08/2026, 12:00"), así que un split
    // ingenuo por ',' desalinearía las columnas siguientes.
    const rowCols = parseCsvRow(row);
    expect(rowCols[headerCols.indexOf('customer_phone')]).toBe('+5491122334455');
  });
});

/** Parser CSV mínimo que respeta comillas — solo para leer filas en los tests. */
function parseCsvRow(row: string): string[] {
  const cols: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (inQuotes) {
      if (ch === '"' && row[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cols.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cols.push(current);
  return cols;
}

// ---------------------------------------------------------------------------
// mapOrderRow expone los datos de contacto de la compradora (customer_phone,
// customer_email, delivery_address), no solo customer_name — el panel de
// pedidos los necesita para mostrar el bloque de contacto.
// ---------------------------------------------------------------------------

describe('mapOrderRow — datos de contacto', () => {
  it('getOrderById expone customer_phone, customer_email y delivery_address', async () => {
    const admin = makeFakeAdmin({
      stores: [{ id: 's1', owner_id: 'u1' }],
      orders: [
        {
          id: 'o1',
          store_id: 's1',
          status: 'confirmed',
          channel: 'mercadopago',
          customer_name: 'María',
          customer_phone: '+5491133445566',
          customer_email: 'maria@example.com',
          delivery_address: 'Av. Siempre Viva 742',
          total_cents: 200000,
          currency: 'ARS',
          notes: null,
          created_at: '2026-08-01T12:00:00Z',
          confirmed_at: null,
          cancelled_at: null,
          delivered_at: null,
          cancelled_by: null,
          payment_status: 'approved',
          store_order_number: 7,
          deleted_at: null,
          order_items: [],
        },
      ],
    });
    mockCreateAdminClient.mockReturnValue(admin);
    mockCreateServerClient.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    });

    const result = await getOrderById('o1');
    if ('error' in result) throw new Error('unexpected error');

    expect(result.order.customer_phone).toBe('+5491133445566');
    expect(result.order.customer_email).toBe('maria@example.com');
    expect(result.order.delivery_address).toBe('Av. Siempre Viva 742');
  });
});

// ---------------------------------------------------------------------------
// 2.5 — un pedido borrado no aparece en listado, búsqueda, exportación,
// backlog ni métricas (add-order-soft-delete, grupo 2).
// ---------------------------------------------------------------------------

describe('deleted_at — un pedido borrado no aparece en ningún lado (2.5)', () => {
  function baseOrder(id: string, storeOrderNumber: number, deletedAt: string | null): Row {
    return {
      id,
      store_id: 's1',
      status: 'confirmed',
      channel: 'whatsapp',
      customer_name: null,
      total_cents: 100_000,
      discount_cents: 0,
      currency: 'ARS',
      notes: null,
      created_at: new Date().toISOString(),
      confirmed_at: null,
      cancelled_at: null,
      delivered_at: null,
      cancelled_by: null,
      payment_status: 'pending',
      store_order_number: storeOrderNumber,
      deleted_at: deletedAt,
      order_items: [],
    };
  }

  function setup(extra: { orders?: Row[]; order_items?: Row[] } = {}) {
    const admin = makeFakeAdmin({
      stores: [{ id: 's1', owner_id: 'u1', wa_lifecycle_effective_from: '2099-01-01T00:00:00Z' }],
      orders: extra.orders ?? [
        baseOrder('o1', 1, new Date().toISOString()), // borrado
        baseOrder('o2', 2, null), // vigente
      ],
      order_items: extra.order_items,
    });
    mockCreateAdminClient.mockReturnValue(admin);
    mockCreateServerClient.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    });
    return admin;
  }

  it('listOrders excluye el pedido borrado', async () => {
    setup();
    const result = await listOrders({});
    if ('error' in result) throw new Error('unexpected error');
    expect(result.orders.map((o) => o.id)).toEqual(['o2']);
    expect(result.total).toBe(1);
  });

  it('la búsqueda por número de pedido no encuentra un borrado', async () => {
    setup();
    const result = await listOrders({ search: '1' });
    if ('error' in result) throw new Error('unexpected error');
    expect(result.orders).toEqual([]);
  });

  it('getOrderById no encuentra un pedido borrado', async () => {
    setup();
    const result = await getOrderById('o1');
    expect(result).toEqual({ error: 'not_found' });
  });

  it('exportOrdersCsv excluye el pedido borrado', async () => {
    setup();
    const result = await exportOrdersCsv({});
    if ('error' in result) throw new Error('unexpected error');
    const rows = result.csv.replace(/^﻿/, '').split('\r\n');
    expect(rows).toHaveLength(2); // header + o2, sin o1
    expect(result.csv).not.toContain('o1');
  });

  it('getBacklogPendingCount no cuenta un pendiente borrado', async () => {
    setup({
      orders: [
        { ...baseOrder('o1', 1, new Date().toISOString()), status: 'pending' },
        { ...baseOrder('o2', 2, null), status: 'pending' },
      ],
    });
    const result = await getBacklogPendingCount();
    if ('error' in result) throw new Error('unexpected error');
    expect(result.count).toBe(1);
  });

  it('getOrderStats no computa ingresos ni top_products de un pedido borrado', async () => {
    setup({
      orders: [
        baseOrder('o1', 1, new Date().toISOString()),
        baseOrder('o2', 2, null),
      ],
      order_items: [
        { order_id: 'o1', product_name: 'Borrado', unit_price_cents: 100_000, quantity: 1, section_name: 'Ropa' },
        { order_id: 'o2', product_name: 'Vigente', unit_price_cents: 100_000, quantity: 1, section_name: 'Ropa' },
      ],
    });
    const result = await getOrderStats('30d');
    if ('error' in result) throw new Error('unexpected error');
    expect(result.kpis.revenue_cents).toBe(100_000);
    expect(result.top_products.map((p) => p.name)).toEqual(['Vigente']);
  });
});

// ---------------------------------------------------------------------------
// 3.4 — borrar repone stock, devuelve el cupón, no lo hace dos veces sobre un
// pedido ya cancelado, no repone sobre un entregado (venta concretada), y se
// rechaza sobre un pedido de otra tienda (add-order-soft-delete, grupo 3).
// ---------------------------------------------------------------------------

describe('deleteOrder (3.4)', () => {
  function setup(tables: Parameters<typeof makeFakeAdmin>[0]) {
    const admin = makeFakeAdmin({
      stores: [{ id: 's1', owner_id: 'u1' }],
      ...tables,
    });
    mockCreateAdminClient.mockReturnValue(admin);
    mockCreateServerClient.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    });
    return admin;
  }

  it('borrar un pedido pendiente con stock comprometido repone las unidades', async () => {
    const admin = setup({
      orders: [{ id: 'o1', store_id: 's1', status: 'pending', coupon_code: null, coupon_counted: false, deleted_at: null }],
      order_items: [{ order_id: 'o1', product_id: 'p1', variant_id: null, quantity: 3 }],
      products: [{ id: 'p1', stock: 10 }],
    });

    const result = await deleteOrder('o1');
    expect(result).toEqual({ ok: true });
    expect(admin.__state.products[0].stock).toBe(13);
    expect(admin.__state.orders[0].deleted_at).not.toBeNull();
  });

  it('borrar un pedido que había consumido un cupón devuelve el uso', async () => {
    const admin = setup({
      orders: [{ id: 'o1', store_id: 's1', status: 'confirmed', coupon_code: 'PROMO', coupon_counted: true, deleted_at: null }],
      coupons: [{ id: 'c1', store_id: 's1', code: 'PROMO', uses_count: 1 }],
      order_items: [],
    });

    const result = await deleteOrder('o1');
    expect(result).toEqual({ ok: true });
    expect(admin.__state.coupons[0].uses_count).toBe(0);
    expect(admin.__state.orders[0].coupon_counted).toBe(false);
  });

  it('borrar un pedido ya cancelado no repone stock ni cupón una segunda vez', async () => {
    const admin = setup({
      orders: [{ id: 'o1', store_id: 's1', status: 'cancelled', coupon_code: 'PROMO', coupon_counted: false, deleted_at: null }],
      coupons: [{ id: 'c1', store_id: 's1', code: 'PROMO', uses_count: 0 }],
      order_items: [{ order_id: 'o1', product_id: 'p1', variant_id: null, quantity: 3 }],
      products: [{ id: 'p1', stock: 10 }],
    });

    const result = await deleteOrder('o1');
    expect(result).toEqual({ ok: true });
    // replenishOrderStock no-opea porque el status ya es 'cancelled', y
    // revertCouponUse no-opea porque coupon_counted ya está en false.
    expect(admin.__state.products[0].stock).toBe(10);
    expect(admin.__state.coupons[0].uses_count).toBe(0);
  });

  it('borrar un pedido entregado no repone stock ni cupón (venta concretada)', async () => {
    const admin = setup({
      orders: [{ id: 'o1', store_id: 's1', status: 'delivered', coupon_code: 'PROMO', coupon_counted: true, deleted_at: null }],
      coupons: [{ id: 'c1', store_id: 's1', code: 'PROMO', uses_count: 1 }],
      order_items: [{ order_id: 'o1', product_id: 'p1', variant_id: null, quantity: 3 }],
      products: [{ id: 'p1', stock: 10 }],
    });

    const result = await deleteOrder('o1');
    expect(result).toEqual({ ok: true });
    expect(admin.__state.products[0].stock).toBe(10); // no se repuso: el producto ya salió del catálogo
    expect(admin.__state.coupons[0].uses_count).toBe(1); // el cupón se usó de verdad
    expect(admin.__state.orders[0].deleted_at).not.toBeNull(); // pero el pedido igual se borra
  });

  it('borrar un pedido de otra tienda se rechaza y no lo modifica', async () => {
    const admin = setup({
      orders: [{ id: 'o1', store_id: 'OTHER_STORE', status: 'pending', coupon_code: null, coupon_counted: false, deleted_at: null }],
    });

    const result = await deleteOrder('o1');
    expect(result).toEqual({ error: 'not_found' });
    expect(admin.__state.orders[0].deleted_at).toBeNull();
  });

  it('batchDeleteOrders borra varios y reusa deleteOrder por cada uno', async () => {
    const admin = setup({
      orders: [
        { id: 'o1', store_id: 's1', status: 'pending', coupon_code: null, coupon_counted: false, deleted_at: null },
        { id: 'o2', store_id: 's1', status: 'confirmed', coupon_code: null, coupon_counted: false, deleted_at: null },
      ],
      order_items: [],
    });

    const result = await batchDeleteOrders(['o1', 'o2']);
    if ('error' in result) throw new Error('unexpected error');
    expect(result.deletedCount).toBe(2);
    expect(result.failed).toEqual([]);
    expect(admin.__state.orders.every((o) => o.deleted_at !== null)).toBe(true);
  });
});
