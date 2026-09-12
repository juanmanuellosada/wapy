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
  updateOrderStatus,
  listUndoableOrderActions,
  undoOrderAction,
  replenishOrderStock,
  createManualSale,
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
    order_action_log?: Row[];
  } = {}
) {
  const state = {
    orders: tables.orders ?? [],
    coupons: tables.coupons ?? [],
    stores: tables.stores ?? [],
    order_items: tables.order_items ?? [],
    products: tables.products ?? [],
    product_variants: tables.product_variants ?? [],
    order_action_log: tables.order_action_log ?? [],
    // Test hook (add-order-action-undo, 2.5/2.8): forzar que el INSERT en
    // order_action_log falle, para probar que un fallo de registro no
    // aborta la acción ya aplicada.
    __forceOrderActionLogInsertError: false,
  };

  let nextInsertId = 0;

  function from(
    table: 'orders' | 'coupons' | 'stores' | 'order_items' | 'products' | 'product_variants' | 'order_action_log'
  ) {
    const filters: Array<(r: Row) => boolean> = [];
    let patch: Row | null = null;
    let countRequested = false;
    let orderCol: string | null = null;
    let orderAsc = true;
    let rangeFrom: number | null = null;
    let rangeTo: number | null = null;
    let limitCount: number | null = null;

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
      limit(n: number) {
        limitCount = n;
        return builder;
      },
      update(p: Row) {
        patch = p;
        return builder;
      },
      insert(rows: Row | Row[]) {
        const forceError = table === 'order_action_log' && state.__forceOrderActionLogInsertError;
        const toInsert = (Array.isArray(rows) ? rows : [rows]).map((r) => ({
          id: (r.id as string | undefined) ?? `gen_${table}_${++nextInsertId}`,
          ...r,
        }));
        if (!forceError) state[table].push(...toInsert);
        const errorResult = { message: 'forced insert error' };
        return {
          then(resolve: (v: { data: Row[] | null; error: Row | null }) => void) {
            resolve(forceError ? { data: null, error: errorResult } : { data: toInsert, error: null });
          },
          // logOrderAction (add-order-action-undo, grupo 5) encadena
          // .select('id').single() para devolver el id insertado.
          select(_cols?: string) {
            return {
              async single() {
                return forceError ? { data: null, error: errorResult } : { data: toInsert[0] ?? null, error: null };
              },
            };
          },
        };
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
        if (limitCount !== null) {
          rows = rows.slice(0, limitCount);
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
      // plan 'pro': estos tests ejercitan el cálculo real de margen (5.5), que
      // 5b.6 gatea server-side a Pro — sin esto, getOrderStats devolvería el
      // margen "vacío" sin importar los costos cargados en los fixtures.
      stores: [{ id: 's1', owner_id: 'u1', plan: 'pro' }],
      orders: [
        // Confirmado con cupón: el ingreso debe descontar el descuento.
        {
          id: 'o1',
          store_id: 's1',
          status: 'confirmed',
          total_cents: 1_000_000,
          discount_cents: 200_000,
          created_at: now,
          sold_at: now,
        },
        // Entregado sin descuento: cuenta entero.
        {
          id: 'o2',
          store_id: 's1',
          status: 'delivered',
          total_cents: 400_000,
          discount_cents: null,
          created_at: now,
          sold_at: now,
        },
        // Pendiente: no debe sumar a ingresos ni aparecer en top_products/orders_by_section.
        {
          id: 'o3',
          store_id: 's1',
          status: 'pending',
          total_cents: 500_000,
          discount_cents: 0,
          created_at: now,
          sold_at: now,
        },
        // Cancelado: tampoco debe sumar.
        {
          id: 'o4',
          store_id: 's1',
          status: 'cancelled',
          total_cents: 300_000,
          discount_cents: 0,
          created_at: now,
          sold_at: now,
        },
      ],
      order_items: [
        // o1 (confirmed): costo cargado — participa de costo/ganancia.
        { order_id: 'o1', product_name: 'Remera', unit_price_cents: 100_000, quantity: 1, section_name: 'Ropa', cost_at_purchase: 60_000 },
        // o2 (delivered): sin costo cargado — no participa, pero sí de ingresos/top_products.
        { order_id: 'o2', product_name: 'Remera', unit_price_cents: 100_000, quantity: 3, section_name: 'Calzado', cost_at_purchase: null },
        // o3 (pending) y o4 (cancelled): tienen costo cargado pero no deben aportar nada.
        { order_id: 'o3', product_name: 'Campera', unit_price_cents: 100_000, quantity: 5, section_name: 'Ropa', cost_at_purchase: 50_000 },
        { order_id: 'o4', product_name: 'Pantalón', unit_price_cents: 100_000, quantity: 2, section_name: 'Ropa', cost_at_purchase: 50_000 },
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

  // -------------------------------------------------------------------------
  // Costo, ganancia y margen (add-product-cost-tracking, Decisión D4)
  // -------------------------------------------------------------------------

  it('la ganancia solo cuenta las líneas con costo congelado, ignorando las que no tienen', async () => {
    setup();
    const result = await getOrderStats('30d');
    if ('error' in result) throw new Error('unexpected error');

    // Solo el item de o1 tiene costo: ingreso 100.000, costo 60.000 → ganancia 40.000.
    // El item de o2 (sin costo) no participa, aunque sí cuenta para ingresos/top_products.
    expect(result.margin.costed_revenue_cents).toBe(100_000);
    expect(result.margin.cost_cents).toBe(60_000);
    expect(result.margin.profit_cents).toBe(40_000);
    expect(result.margin.margin_pct).toBeCloseTo(0.4);
  });

  it('la cobertura es parcial cuando no todas las líneas tienen costo', async () => {
    setup();
    const result = await getOrderStats('30d');
    if ('error' in result) throw new Error('unexpected error');

    // Facturación total confirmada: o1 (100.000) + o2 (300.000) = 400.000.
    // Con costo: solo o1 (100.000) → cobertura 25%.
    expect(result.margin.cost_coverage_pct).toBeCloseTo(0.25);
  });

  it('sin ningún costo cargado en el período, la cobertura es cero y el margen es null', async () => {
    const admin = makeFakeAdmin({
      stores: [{ id: 's1', owner_id: 'u1', plan: 'pro' }],
      orders: [{ id: 'o1', store_id: 's1', status: 'confirmed', total_cents: 100_000, discount_cents: 0, created_at: now, sold_at: now }],
      order_items: [
        { order_id: 'o1', product_name: 'Remera', unit_price_cents: 100_000, quantity: 1, section_name: 'Ropa', cost_at_purchase: null },
      ],
    });
    mockCreateAdminClient.mockReturnValue(admin);
    mockCreateServerClient.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    });

    const result = await getOrderStats('30d');
    if ('error' in result) throw new Error('unexpected error');

    expect(result.margin.cost_coverage_pct).toBe(0);
    expect(result.margin.margin_pct).toBeNull();
    // El KPI de ingresos no se ve afectado por la ausencia de costo.
    expect(result.kpis.revenue_cents).toBe(100_000);
  });

  it('los pedidos pendientes o cancelados no aportan a costo, ganancia ni cobertura aunque tengan costo congelado', async () => {
    setup();
    const result = await getOrderStats('30d');
    if ('error' in result) throw new Error('unexpected error');

    // o3 (pending) y o4 (cancelled) tienen cost_at_purchase cargado en el fixture,
    // pero si aportaran, cost_cents sería 60.000 + 50.000 + 50.000 = 160.000 en vez de 60.000.
    expect(result.margin.cost_cents).toBe(60_000);
  });

  it('una tienda sin allowCostTracking recibe el margen vacío aunque haya costo congelado (5b.6)', async () => {
    const admin = makeFakeAdmin({
      // Sin 'plan' → getPlanLimits(undefined) cae a 'inicial' (fail closed).
      stores: [{ id: 's1', owner_id: 'u1' }],
      orders: [{ id: 'o1', store_id: 's1', status: 'confirmed', total_cents: 100_000, discount_cents: 0, created_at: now, sold_at: now }],
      order_items: [
        { order_id: 'o1', product_name: 'Remera', unit_price_cents: 100_000, quantity: 1, section_name: 'Ropa', cost_at_purchase: 60_000 },
      ],
    });
    mockCreateAdminClient.mockReturnValue(admin);
    mockCreateServerClient.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    });

    const result = await getOrderStats('30d');
    if ('error' in result) throw new Error('unexpected error');

    // El gating es server-side, no solo de la UI: aunque el item tiene costo
    // congelado, una tienda no-Pro no debe recibirlo en la respuesta.
    expect(result.margin).toEqual({
      costed_revenue_cents: 0,
      cost_cents: 0,
      profit_cents: 0,
      margin_pct: null,
      cost_coverage_pct: 0,
      has_estimated_cost: false,
    });
    // El KPI de ingresos no depende del plan.
    expect(result.kpis.revenue_cents).toBe(100_000);
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

  // add-manual-sales (7.2): la columna de fecha del CSV es la de VENTA
  // (sold_at), no la de carga del registro — una venta manual cargada hoy
  // con fecha pasada tiene que aparecer en la fila con esa fecha pasada.
  it('la columna de fecha usa sold_at, no created_at (add-manual-sales, 7.2)', async () => {
    const admin = makeFakeAdmin({
      stores: [{ id: 's1', owner_id: 'u1' }],
      orders: [
        {
          id: 'o1',
          store_id: 's1',
          status: 'confirmed',
          channel: 'manual',
          customer_name: null,
          total_cents: 10000,
          currency: 'ARS',
          notes: null,
          created_at: '2026-09-11T09:00:00Z', // cargada hoy...
          sold_at: '2026-09-08T15:00:00Z', // ...pero vendida el martes anterior
          confirmed_at: null,
          cancelled_at: null,
          delivered_at: null,
          cancelled_by: null,
          payment_status: 'approved',
          store_order_number: 7,
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
    expect(headerCols).toContain('sold_at');
    expect(headerCols).not.toContain('created_at');

    const rowCols = parseCsvRow(row);
    const dateCol = rowCols[headerCols.indexOf('sold_at')];
    expect(dateCol).toContain('08/09/2026'); // fecha de venta, no la de carga (11/09)
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

  // -------------------------------------------------------------------------
  // Costo, ganancia y margen en el CSV (add-product-cost-tracking, D8)
  // -------------------------------------------------------------------------

  function csvOrderRow(overrides: Row = {}): Row {
    return {
      id: 'o1',
      store_id: 's1',
      status: 'confirmed',
      channel: 'whatsapp',
      customer_name: 'Juan',
      customer_phone: null,
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
      ...overrides,
    };
  }

  it('tienda Pro con costo congelado: agrega costo/ganancia/margen al final, sin tocar las columnas existentes', async () => {
    const admin = makeFakeAdmin({
      stores: [{ id: 's1', owner_id: 'u1', plan: 'pro' }],
      orders: [
        csvOrderRow({
          order_items: [
            { unit_price_cents: 100000, cost_at_purchase: 60000, quantity: 1, product_name: 'Remera' },
          ],
        }),
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
    // Las columnas previas conservan exactamente su orden y contenido.
    expect(headerCols.slice(0, 11)).toEqual([
      'id', 'store_order_number', 'sold_at', 'status', 'customer_name',
      'customer_phone', 'total', 'currency', 'items_count', 'items_summary', 'notes',
    ]);
    expect(headerCols.slice(11)).toEqual(['cost_total', 'profit_total', 'margin_pct']);

    const rowCols = parseCsvRow(row);
    expect(rowCols[headerCols.indexOf('cost_total')]).toBe('600,00');
    expect(rowCols[headerCols.indexOf('profit_total')]).toBe('400,00');
    expect(rowCols[headerCols.indexOf('margin_pct')]).toContain('40,00');
  });

  it('pedido Pro sin ningún costo congelado exporta las celdas vacías, no en cero', async () => {
    const admin = makeFakeAdmin({
      stores: [{ id: 's1', owner_id: 'u1', plan: 'pro' }],
      orders: [
        csvOrderRow({
          order_items: [
            { unit_price_cents: 100000, cost_at_purchase: null, quantity: 1, product_name: 'Remera' },
          ],
        }),
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
    const rowCols = parseCsvRow(row);

    expect(rowCols[headerCols.indexOf('cost_total')]).toBe('');
    expect(rowCols[headerCols.indexOf('profit_total')]).toBe('');
    expect(rowCols[headerCols.indexOf('margin_pct')]).toBe('');
  });

  it('tienda sin plan Pro no incluye ninguna columna de costo, ganancia ni margen', async () => {
    const admin = makeFakeAdmin({
      stores: [{ id: 's1', owner_id: 'u1', plan: 'medio' }],
      orders: [
        csvOrderRow({
          order_items: [
            { unit_price_cents: 100000, cost_at_purchase: 60000, quantity: 1, product_name: 'Remera' },
          ],
        }),
      ],
    });
    mockCreateAdminClient.mockReturnValue(admin);
    mockCreateServerClient.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    });

    const result = await exportOrdersCsv({});
    if ('error' in result) throw new Error('unexpected error');

    const [header] = result.csv.replace(/^﻿/, '').split('\r\n');
    const headerCols = header.split(',');
    expect(headerCols).not.toContain('cost_total');
    expect(headerCols).not.toContain('profit_total');
    expect(headerCols).not.toContain('margin_pct');
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
      sold_at: new Date().toISOString(),
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
    expect(result).toMatchObject({ ok: true });
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
    expect(result).toMatchObject({ ok: true });
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
    expect(result).toMatchObject({ ok: true });
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
    expect(result).toMatchObject({ ok: true });
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
    // add-order-action-undo (3.1): sin los ids no hay forma de deshacer un
    // borrado en lote.
    expect(result.deletedIds.sort()).toEqual(['o1', 'o2']);
    expect(result.failed).toEqual([]);
    expect(admin.__state.orders.every((o) => o.deleted_at !== null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// add-order-action-undo, grupo 2 — registro de acciones
// ---------------------------------------------------------------------------

describe('registro de acciones (order_action_log)', () => {
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

  function pendingOrder(id: string): Row {
    return { id, store_id: 's1', status: 'pending', cancelled_by: null, deleted_at: null, coupon_code: null, coupon_counted: false };
  }

  it('una acción individual queda registrada con una entrada', async () => {
    const admin = setup({ orders: [pendingOrder('o1')], order_items: [] });

    const result = await updateOrderStatus('o1', 'confirmed');
    if (!('ok' in result)) throw new Error('unexpected error');

    expect(admin.__state.order_action_log).toHaveLength(1);
    const op = admin.__state.order_action_log[0];
    expect(op.action_type).toBe('confirm');
    expect(op.store_id).toBe('s1');
    expect(op.entries).toHaveLength(1);
    expect(op.entries[0]).toMatchObject({
      order_id: 'o1',
      status_before: 'pending',
      status_after: 'confirmed',
      stock_restored: false,
      coupon_reverted: false,
    });
  });

  it('un lote queda registrado como UNA sola operación con todas las entradas', async () => {
    const admin = setup({
      orders: [pendingOrder('o1'), pendingOrder('o2'), pendingOrder('o3')],
      order_items: [],
    });

    const result = await batchUpdateOrderStatus(['o1', 'o2', 'o3'], 'confirmed');
    if ('error' in result) throw new Error('unexpected error');

    expect(admin.__state.order_action_log).toHaveLength(1);
    expect(admin.__state.order_action_log[0].entries).toHaveLength(3);
  });

  it('un lote con fallos registra solo las entradas de los pedidos efectivamente aplicados', async () => {
    const admin = setup({
      orders: [
        pendingOrder('o1'),
        pendingOrder('o2'),
        { id: 'o3', store_id: 's1', status: 'cancelled', cancelled_by: 'owner', deleted_at: null, coupon_code: null, coupon_counted: false },
      ],
      order_items: [],
    });

    const result = await batchUpdateOrderStatus(['o1', 'o2', 'o3'], 'confirmed');
    if ('error' in result) throw new Error('unexpected error');

    expect(result.failed).toHaveLength(1);
    expect(admin.__state.order_action_log).toHaveLength(1);
    expect(admin.__state.order_action_log[0].entries).toHaveLength(2);
  });

  it('cancelar registra stock_restored/coupon_reverted según lo que realmente ocurrió', async () => {
    const admin = setup({
      orders: [{ id: 'o1', store_id: 's1', status: 'pending', cancelled_by: null, deleted_at: null, coupon_code: 'PROMO', coupon_counted: true }],
      coupons: [{ id: 'c1', store_id: 's1', code: 'PROMO', uses_count: 1 }],
      order_items: [{ order_id: 'o1', product_id: 'p1', variant_id: null, quantity: 2 }],
      products: [{ id: 'p1', stock: 5 }],
    });

    const result = await updateOrderStatus('o1', 'cancelled');
    if (!('ok' in result)) throw new Error('unexpected error');

    const entry = admin.__state.order_action_log[0].entries[0];
    expect(entry.stock_restored).toBe(true);
    expect(entry.coupon_reverted).toBe(true);
    expect(admin.__state.products[0].stock).toBe(7);
  });

  it('borrar un pedido pendiente registra stock_restored=true (repuso stock de verdad)', async () => {
    const admin = setup({
      orders: [pendingOrder('o1')],
      order_items: [{ order_id: 'o1', product_id: 'p1', variant_id: null, quantity: 3 }],
      products: [{ id: 'p1', stock: 10 }],
    });

    const result = await deleteOrder('o1');
    if (!('ok' in result)) throw new Error('unexpected error');

    const entry = admin.__state.order_action_log[0].entries[0];
    expect(entry.stock_restored).toBe(true);
    expect(admin.__state.products[0].stock).toBe(13);
  });

  it('borrar un pedido entregado registra stock_restored=false (venta concretada, no repuso nada)', async () => {
    const admin = setup({
      orders: [{ id: 'o1', store_id: 's1', status: 'delivered', cancelled_by: null, deleted_at: null, coupon_code: null, coupon_counted: false }],
      order_items: [{ order_id: 'o1', product_id: 'p1', variant_id: null, quantity: 3 }],
      products: [{ id: 'p1', stock: 10 }],
    });

    const result = await deleteOrder('o1');
    if (!('ok' in result)) throw new Error('unexpected error');

    const entry = admin.__state.order_action_log[0].entries[0];
    expect(entry.stock_restored).toBe(false);
    expect(admin.__state.products[0].stock).toBe(10);
  });

  it('un fallo al registrar la operación no revierte la acción ya aplicada', async () => {
    const admin = setup({ orders: [pendingOrder('o1')], order_items: [] });
    admin.__state.__forceOrderActionLogInsertError = true;

    const result = await updateOrderStatus('o1', 'confirmed');
    if (!('ok' in result)) throw new Error('unexpected error');

    expect(admin.__state.orders[0].status).toBe('confirmed'); // la acción se aplicó igual
    expect(admin.__state.order_action_log).toHaveLength(0); // pero no quedó registrada
  });

  it('un lote que supera el tope de entradas se registra como no deshacible, sin guardar una fila gigante', async () => {
    const orders = Array.from({ length: 501 }, (_, i) => pendingOrder(`o${i}`));
    const admin = setup({ orders, order_items: [] });

    const result = await batchUpdateOrderStatus(orders.map((o) => o.id as string), 'confirmed');
    if ('error' in result) throw new Error('unexpected error');

    expect(admin.__state.order_action_log).toHaveLength(1);
    const op = admin.__state.order_action_log[0];
    expect(op.non_undoable_reason).toBe('too_many_entries');
    expect(op.entries).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// add-order-action-undo, grupo 4 — deshacer
// ---------------------------------------------------------------------------

describe('listUndoableOrderActions', () => {
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

  it('lista solo operaciones de la propia tienda, no deshechas y dentro de las 24hs, más reciente primero', async () => {
    const now = Date.now();
    const admin = setup({
      order_action_log: [
        { id: 'op_mine', store_id: 's1', action_type: 'confirm', performed_at: new Date(now - 1_000).toISOString(), undone_at: null, non_undoable_reason: null, entries: [{}] },
        { id: 'op_undone', store_id: 's1', action_type: 'cancel', performed_at: new Date(now - 2_000).toISOString(), undone_at: new Date().toISOString(), non_undoable_reason: null, entries: [] },
        { id: 'op_other_store', store_id: 'OTHER_STORE', action_type: 'delete', performed_at: new Date(now - 500).toISOString(), undone_at: null, non_undoable_reason: null, entries: [] },
        { id: 'op_old', store_id: 's1', action_type: 'deliver', performed_at: new Date(now - 30 * 60 * 60 * 1000).toISOString(), undone_at: null, non_undoable_reason: null, entries: [] },
      ],
    });

    const result = await listUndoableOrderActions();
    if ('error' in result) throw new Error('unexpected error');
    expect(result.operations.map((o) => o.id)).toEqual(['op_mine']);
  });

  it('limita a las 5 operaciones más recientes', async () => {
    const now = Date.now();
    const ops = Array.from({ length: 8 }, (_, i) => ({
      id: `op${i}`,
      store_id: 's1',
      action_type: 'confirm',
      performed_at: new Date(now - i * 1_000).toISOString(),
      undone_at: null,
      non_undoable_reason: null,
      entries: [],
    }));
    const admin = setup({ order_action_log: ops });

    const result = await listUndoableOrderActions();
    if ('error' in result) throw new Error('unexpected error');
    expect(result.operations).toHaveLength(5);
    expect(result.operations[0].id).toBe('op0'); // la más reciente primero
  });
});

describe('undoOrderAction', () => {
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

  it('deshacer una entrega vuelve a confirmado y limpia delivered_at', async () => {
    const admin = setup({
      orders: [{ id: 'o1', store_id: 's1', status: 'delivered', cancelled_by: null, deleted_at: null, delivered_at: '2026-01-01T00:00:00.000Z' }],
      order_action_log: [
        {
          id: 'op1',
          store_id: 's1',
          action_type: 'deliver',
          performed_at: new Date().toISOString(),
          undone_at: null,
          non_undoable_reason: null,
          entries: [
            {
              order_id: 'o1',
              status_before: 'confirmed',
              status_after: 'delivered',
              cancelled_by_before: null,
              cancelled_by_after: null,
              deleted_at_before: null,
              deleted_at_after: null,
              stock_restored: false,
              coupon_reverted: false,
            },
          ],
        },
      ],
    });

    const result = await undoOrderAction('op1');
    if ('error' in result) throw new Error('unexpected error');

    expect(result.undone).toBe(1);
    expect(result.failed).toEqual([]);
    expect(admin.__state.orders[0].status).toBe('confirmed');
    expect(admin.__state.orders[0].delivered_at).toBeNull();
  });

  it('deshacer una cancelación vuelve a descontar el stock y a contar el cupón', async () => {
    const admin = setup({
      orders: [{ id: 'o1', store_id: 's1', status: 'cancelled', cancelled_by: 'owner', deleted_at: null, cancelled_at: '2026-01-01T00:00:00.000Z', coupon_code: 'PROMO', coupon_counted: false }],
      coupons: [{ id: 'c1', store_id: 's1', code: 'PROMO', uses_count: 0 }],
      order_items: [{ order_id: 'o1', product_id: 'p1', product_name: 'Remera', variant_id: null, quantity: 3 }],
      products: [{ id: 'p1', stock: 13 }], // ya con las 3 unidades repuestas por la cancelación
      order_action_log: [
        {
          id: 'op1',
          store_id: 's1',
          action_type: 'cancel',
          performed_at: new Date().toISOString(),
          undone_at: null,
          non_undoable_reason: null,
          entries: [
            {
              order_id: 'o1',
              status_before: 'pending',
              status_after: 'cancelled',
              cancelled_by_before: null,
              cancelled_by_after: 'owner',
              deleted_at_before: null,
              deleted_at_after: null,
              stock_restored: true,
              coupon_reverted: true,
            },
          ],
        },
      ],
    });

    const result = await undoOrderAction('op1');
    if ('error' in result) throw new Error('unexpected error');

    expect(result.undone).toBe(1);
    expect(admin.__state.orders[0].status).toBe('pending');
    expect(admin.__state.orders[0].cancelled_by).toBeNull();
    expect(admin.__state.orders[0].cancelled_at).toBeNull();
    expect(admin.__state.products[0].stock).toBe(10);
    expect(admin.__state.coupons[0].uses_count).toBe(1);
  });

  // Este es EL caso que rompe cualquier implementación que infiera el efecto
  // desde el estado actual del pedido en vez de leer los flags del log
  // (Decisión D3): borrar un pendiente repone stock sin tocar `status`, así
  // que un pedido 'pending' con stock ya repuesto es indistinguible —
  // mirando solo el pedido— de uno nunca tocado.
  it('deshacer el borrado de un pedido pendiente descuenta el stock exactamente una vez', async () => {
    const admin = setup({
      orders: [{ id: 'o1', store_id: 's1', status: 'pending', cancelled_by: null, deleted_at: '2026-01-01T00:00:00.000Z', coupon_code: null, coupon_counted: false }],
      order_items: [{ order_id: 'o1', product_id: 'p1', product_name: 'Remera', variant_id: null, quantity: 3 }],
      products: [{ id: 'p1', stock: 13 }], // ya con las 3 unidades repuestas por el borrado
      order_action_log: [
        {
          id: 'op1',
          store_id: 's1',
          action_type: 'delete',
          performed_at: new Date().toISOString(),
          undone_at: null,
          non_undoable_reason: null,
          entries: [
            {
              order_id: 'o1',
              status_before: 'pending',
              status_after: 'pending',
              cancelled_by_before: null,
              cancelled_by_after: null,
              deleted_at_before: null,
              deleted_at_after: '2026-01-01T00:00:00.000Z',
              stock_restored: true,
              coupon_reverted: false,
            },
          ],
        },
      ],
    });

    const result = await undoOrderAction('op1');
    if ('error' in result) throw new Error('unexpected error');

    expect(result.undone).toBe(1);
    expect(admin.__state.orders[0].deleted_at).toBeNull();
    expect(admin.__state.orders[0].status).toBe('pending');
    // La trampa: si se infiriera desde `status === 'pending'` que nunca se
    // repuso stock, esto quedaría en 13 en vez de 10 (double-count).
    expect(admin.__state.products[0].stock).toBe(10);
  });

  it('si el pedido cambió después de la acción, esa entrada se saltea con modified_since', async () => {
    const admin = setup({
      orders: [{ id: 'o1', store_id: 's1', status: 'cancelled', cancelled_by: 'owner', deleted_at: null }],
      order_action_log: [
        {
          id: 'op1',
          store_id: 's1',
          action_type: 'confirm',
          performed_at: new Date().toISOString(),
          undone_at: null,
          non_undoable_reason: null,
          entries: [
            {
              order_id: 'o1',
              status_before: 'pending',
              status_after: 'confirmed',
              cancelled_by_before: null,
              cancelled_by_after: null,
              deleted_at_before: null,
              deleted_at_after: null,
              stock_restored: false,
              coupon_reverted: false,
            },
          ],
        },
      ],
    });

    const result = await undoOrderAction('op1');
    if ('error' in result) throw new Error('unexpected error');

    expect(result.undone).toBe(0);
    expect(result.failed).toEqual([{ order_id: 'o1', reason: 'modified_since' }]);
    expect(admin.__state.orders[0].status).toBe('cancelled'); // no se tocó
  });

  it('si el stock no alcanza, esa entrada se bloquea y no toca el pedido', async () => {
    const admin = setup({
      orders: [{ id: 'o1', store_id: 's1', status: 'cancelled', cancelled_by: 'owner', deleted_at: null, cancelled_at: '2026-01-01T00:00:00.000Z' }],
      order_items: [{ order_id: 'o1', product_id: 'p1', product_name: 'Remera', variant_id: null, quantity: 5 }],
      products: [{ id: 'p1', stock: 2 }], // ya se vendió a otra persona, no alcanza
      order_action_log: [
        {
          id: 'op1',
          store_id: 's1',
          action_type: 'cancel',
          performed_at: new Date().toISOString(),
          undone_at: null,
          non_undoable_reason: null,
          entries: [
            {
              order_id: 'o1',
              status_before: 'pending',
              status_after: 'cancelled',
              cancelled_by_before: null,
              cancelled_by_after: 'owner',
              deleted_at_before: null,
              deleted_at_after: null,
              stock_restored: true,
              coupon_reverted: false,
            },
          ],
        },
      ],
    });

    const result = await undoOrderAction('op1');
    if ('error' in result) throw new Error('unexpected error');

    expect(result.undone).toBe(0);
    expect(result.failed).toEqual([
      { order_id: 'o1', reason: 'stock_insufficient', details: [{ productId: 'p1', productName: 'Remera', requested: 5, available: 2 }] },
    ]);
    expect(admin.__state.orders[0].status).toBe('cancelled'); // no se tocó
    expect(admin.__state.products[0].stock).toBe(2); // no se dedujo nada
  });

  it('deshacer una operación ya deshecha no modifica ningún pedido', async () => {
    const admin = setup({
      orders: [{ id: 'o1', store_id: 's1', status: 'pending', cancelled_by: null, deleted_at: null }],
      order_action_log: [
        {
          id: 'op1',
          store_id: 's1',
          action_type: 'confirm',
          performed_at: new Date().toISOString(),
          undone_at: new Date().toISOString(),
          non_undoable_reason: null,
          entries: [
            {
              order_id: 'o1',
              status_before: 'pending',
              status_after: 'confirmed',
              cancelled_by_before: null,
              cancelled_by_after: null,
              deleted_at_before: null,
              deleted_at_after: null,
              stock_restored: false,
              coupon_reverted: false,
            },
          ],
        },
      ],
    });

    const result = await undoOrderAction('op1');
    expect(result).toEqual({ error: 'already_undone' });
    expect(admin.__state.orders[0].status).toBe('pending'); // no se tocó
  });

  it('deshacer un lote completo revierte todos los pedidos en una sola operación', async () => {
    const admin = setup({
      orders: [
        { id: 'o1', store_id: 's1', status: 'confirmed', cancelled_by: null, deleted_at: null },
        { id: 'o2', store_id: 's1', status: 'confirmed', cancelled_by: null, deleted_at: null },
      ],
      order_action_log: [
        {
          id: 'op1',
          store_id: 's1',
          action_type: 'confirm',
          performed_at: new Date().toISOString(),
          undone_at: null,
          non_undoable_reason: null,
          entries: [
            { order_id: 'o1', status_before: 'pending', status_after: 'confirmed', cancelled_by_before: null, cancelled_by_after: null, deleted_at_before: null, deleted_at_after: null, stock_restored: false, coupon_reverted: false },
            { order_id: 'o2', status_before: 'pending', status_after: 'confirmed', cancelled_by_before: null, cancelled_by_after: null, deleted_at_before: null, deleted_at_after: null, stock_restored: false, coupon_reverted: false },
          ],
        },
      ],
    });

    const result = await undoOrderAction('op1');
    if ('error' in result) throw new Error('unexpected error');

    expect(result.undone).toBe(2);
    expect(admin.__state.orders.every((o) => o.status === 'pending')).toBe(true);
  });

  it('deshacer una operación de otra tienda se rechaza', async () => {
    const admin = setup({
      order_action_log: [
        { id: 'op1', store_id: 'OTHER_STORE', action_type: 'confirm', performed_at: new Date().toISOString(), undone_at: null, non_undoable_reason: null, entries: [] },
      ],
    });

    const result = await undoOrderAction('op1');
    expect(result).toEqual({ error: 'not_found' });
  });
});

// ---------------------------------------------------------------------------
// add-manual-sales, grupo 2 (tareas 2.3/2.4) — sold_at reemplaza a created_at
// como eje temporal de getOrderStats.
// ---------------------------------------------------------------------------

describe('getOrderStats usa sold_at, no created_at (add-manual-sales, 2.3/2.4)', () => {
  function setup(tables: Parameters<typeof makeFakeAdmin>[0]) {
    const admin = makeFakeAdmin({ stores: [{ id: 's1', owner_id: 'u1' }], ...tables });
    mockCreateAdminClient.mockReturnValue(admin);
    mockCreateServerClient.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    });
    return admin;
  }

  // 2.3: una venta cargada hoy pero con sold_at pasado cae en el día en que
  // ocurrió, no en el día en que se cargó (created_at).
  it('una venta con sold_at pasado cae en el día correcto de revenue_by_day, no en el de created_at', async () => {
    const today = new Date();
    const pastDate = new Date();
    pastDate.setHours(12, 0, 0, 0);
    pastDate.setDate(pastDate.getDate() - 5);

    setup({
      orders: [
        {
          id: 'o1',
          store_id: 's1',
          status: 'confirmed',
          total_cents: 50_000,
          discount_cents: 0,
          created_at: today.toISOString(), // cargada hoy...
          sold_at: pastDate.toISOString(), // ...pero vendida hace 5 días
        },
      ],
      order_items: [],
    });

    const result = await getOrderStats('30d');
    if ('error' in result) throw new Error('unexpected error');

    const dayKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const pastEntry = result.revenue_by_day.find((r) => r.date === dayKey(pastDate));
    const todayEntry = result.revenue_by_day.find((r) => r.date === dayKey(today));

    expect(pastEntry?.cents).toBe(50_000);
    expect(todayEntry?.cents).toBe(0);
  });

  // 2.4: no-regresión — con sold_at backfilleado a created_at (lo que hace la
  // migración 044 para todo pedido preexistente), las métricas dan
  // exactamente los mismos valores que daban antes del sweep a sold_at (mismo
  // fixture que la suite original de getOrderStats, que ejercitaba estos
  // números keying off created_at).
  it('con sold_at = created_at (pedidos preexistentes backfilleados), las métricas no cambian', async () => {
    const now = new Date().toISOString();
    setup({
      stores: [{ id: 's1', owner_id: 'u1', plan: 'pro' }],
      orders: [
        { id: 'o1', store_id: 's1', status: 'confirmed', total_cents: 1_000_000, discount_cents: 200_000, created_at: now, sold_at: now },
        { id: 'o2', store_id: 's1', status: 'delivered', total_cents: 400_000, discount_cents: null, created_at: now, sold_at: now },
        { id: 'o3', store_id: 's1', status: 'pending', total_cents: 500_000, discount_cents: 0, created_at: now, sold_at: now },
        { id: 'o4', store_id: 's1', status: 'cancelled', total_cents: 300_000, discount_cents: 0, created_at: now, sold_at: now },
      ],
      order_items: [
        { order_id: 'o1', product_name: 'Remera', unit_price_cents: 100_000, quantity: 1, section_name: 'Ropa', cost_at_purchase: 60_000 },
        { order_id: 'o2', product_name: 'Remera', unit_price_cents: 100_000, quantity: 3, section_name: 'Calzado', cost_at_purchase: null },
        { order_id: 'o3', product_name: 'Campera', unit_price_cents: 100_000, quantity: 5, section_name: 'Ropa', cost_at_purchase: 50_000 },
        { order_id: 'o4', product_name: 'Pantalón', unit_price_cents: 100_000, quantity: 2, section_name: 'Ropa', cost_at_purchase: 50_000 },
      ],
    });

    const result = await getOrderStats('30d');
    if ('error' in result) throw new Error('unexpected error');

    // Mismos números que verificaba la suite original de getOrderStats sobre
    // este fixture (antes del sweep, cuando la consulta usaba created_at).
    expect(result.kpis.revenue_cents).toBe(1_200_000);
    expect(result.kpis.order_count).toBe(4);
    const names = result.top_products.map((p) => p.name);
    expect(names).toContain('Remera');
    expect(names).not.toContain('Campera');
    expect(names).not.toContain('Pantalón');
    const remera = result.top_products.find((p) => p.name === 'Remera');
    expect(remera?.units).toBe(1 + 3);
    expect(result.margin.cost_cents).toBe(60_000);
  });
});

// ---------------------------------------------------------------------------
// add-manual-sales, tarea 7.3 — las ventas manuales aportan a top_products y
// orders_by_section como cualquier otro pedido confirmado; las líneas sueltas
// (sin producto ni sección) caen en el grupo "Sin sección" con etiqueta
// clara, no en un hueco vacío.
// ---------------------------------------------------------------------------

describe('getOrderStats incluye ventas manuales, con líneas sueltas agrupadas en "Sin sección" (add-manual-sales, 7.3)', () => {
  it('un pedido manual confirmado suma a top_products y a orders_by_section, y su línea suelta cae en "Sin sección"', async () => {
    const now = new Date().toISOString();
    const admin = makeFakeAdmin({
      stores: [{ id: 's1', owner_id: 'u1' }],
      orders: [
        { id: 'o1', store_id: 's1', status: 'confirmed', channel: 'manual', total_cents: 18_000, discount_cents: 0, created_at: now, sold_at: now },
      ],
      order_items: [
        // Línea de catálogo: tiene sección, como cualquier pedido del sitio.
        { order_id: 'o1', product_name: 'Remera', unit_price_cents: 10_000, quantity: 1, section_name: 'Ropa', cost_at_purchase: null },
        // Línea suelta (sin producto en el catálogo): section_name es null.
        { order_id: 'o1', product_name: 'Remera lisa (sin catálogo)', unit_price_cents: 8_000, quantity: 1, section_name: null, cost_at_purchase: null },
      ],
    });
    mockCreateAdminClient.mockReturnValue(admin);
    mockCreateServerClient.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    });

    const result = await getOrderStats('30d');
    if ('error' in result) throw new Error('unexpected error');

    const names = result.top_products.map((p) => p.name);
    expect(names).toContain('Remera');
    expect(names).toContain('Remera lisa (sin catálogo)');

    const sections = Object.fromEntries(result.orders_by_section.map((s) => [s.section_name, s.count]));
    expect(sections['Ropa']).toBe(1);
    expect(sections['Sin sección']).toBe(1); // la línea suelta, con una etiqueta clara, no un hueco vacío
  });
});

// ---------------------------------------------------------------------------
// add-manual-sales, grupo 3 (tarea 3.8) — alta de una venta manual.
// ---------------------------------------------------------------------------

describe('createManualSale (add-manual-sales, 3.8)', () => {
  function setup(tables: Parameters<typeof makeFakeAdmin>[0]) {
    const admin = makeFakeAdmin({ ...tables });
    mockCreateAdminClient.mockReturnValue(admin);
    mockCreateServerClient.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    });
    return admin;
  }

  function proStore(overrides: Row = {}): Row {
    return { id: 's1', owner_id: 'u1', plan: 'pro', ...overrides };
  }

  it('venta de catálogo: descuenta stock, congela el costo del producto y no confía en un total enviado por el cliente', async () => {
    const admin = setup({
      stores: [proStore()],
      products: [{ id: 'p1', store_id: 's1', name: 'Remera', cost_cents: 6_000, section_id: null, sections: null, stock: 10 }],
    });

    const result = await createManualSale({
      sold_at: new Date().toISOString(),
      lines: [{ product_id: 'p1', quantity: 2, unit_price_cents: 10_000 }],
    });

    if ('error' in result) throw new Error(`unexpected error: ${JSON.stringify(result)}`);
    const order = admin.__state.orders.find((o) => o.id === result.order_id)!;
    expect(order.channel).toBe('manual');
    expect(order.status).toBe('confirmed');
    expect(order.payment_status).toBe('approved');
    expect(order.total_cents).toBe(20_000); // 2 × 10.000, calculado server-side
    expect(order.stock_applied).toBe(true);
    expect(admin.__state.products[0].stock).toBe(8); // 10 - 2

    const item = admin.__state.order_items.find((i) => i.order_id === result.order_id)!;
    expect(item.cost_at_purchase).toBe(6_000); // costo del catálogo, no lo que mandó el cliente
    expect(item.cost_is_estimated).toBe(false);
  });

  it('venta con una línea suelta: no toca stock ni catálogo, y acepta costo escrito a mano', async () => {
    const admin = setup({ stores: [proStore()] });

    const result = await createManualSale({
      sold_at: new Date().toISOString(),
      lines: [{ name: 'Remera lisa (sin catálogo)', quantity: 2, unit_price_cents: 8_000, cost_cents: 3_000 }],
    });

    if ('error' in result) throw new Error(`unexpected error: ${JSON.stringify(result)}`);
    const order = admin.__state.orders.find((o) => o.id === result.order_id)!;
    expect(order.total_cents).toBe(16_000);
    expect(order.stock_applied).toBe(true); // el checkbox estaba prendido, pero no había nada que descontar

    const item = admin.__state.order_items.find((i) => i.order_id === result.order_id)!;
    expect(item.product_id).toBeNull();
    expect(item.cost_at_purchase).toBe(3_000);
    expect(item.cost_is_estimated).toBe(false);
  });

  it('venta mixta (catálogo + suelta): el total server-side suma ambas líneas, sin depender de ningún total enviado por el cliente', async () => {
    const admin = setup({
      stores: [proStore()],
      products: [{ id: 'p1', store_id: 's1', name: 'Remera', cost_cents: null, section_id: null, sections: null, stock: null }],
    });

    // createManualSale no acepta un total como input (Decisión D6): el único
    // total posible es el que el servidor suma a partir de las líneas.
    const result = await createManualSale({
      sold_at: new Date().toISOString(),
      discount_stock: false,
      lines: [
        { product_id: 'p1', quantity: 1, unit_price_cents: 12_000 },
        { name: 'Suelta', quantity: 3, unit_price_cents: 1_000 },
      ],
    });

    if ('error' in result) throw new Error(`unexpected error: ${JSON.stringify(result)}`);
    const order = admin.__state.orders.find((o) => o.id === result.order_id)!;
    expect(order.total_cents).toBe(12_000 * 1 + 1_000 * 3);
    const items = admin.__state.order_items.filter((i) => i.order_id === result.order_id);
    expect(items).toHaveLength(2);
  });

  it('el checkbox de stock apagado no descuenta nada y queda registrado en stock_applied', async () => {
    const admin = setup({
      stores: [proStore()],
      products: [{ id: 'p1', store_id: 's1', name: 'Remera', cost_cents: null, section_id: null, sections: null, stock: 10 }],
    });

    const result = await createManualSale({
      sold_at: new Date().toISOString(),
      discount_stock: false,
      lines: [{ product_id: 'p1', quantity: 4, unit_price_cents: 5_000 }],
    });

    if ('error' in result) throw new Error(`unexpected error: ${JSON.stringify(result)}`);
    const order = admin.__state.orders.find((o) => o.id === result.order_id)!;
    expect(order.stock_applied).toBe(false);
    expect(admin.__state.products[0].stock).toBe(10); // sin tocar
  });

  it('rechaza una fecha futura sin crear ningún pedido', async () => {
    const admin = setup({ stores: [proStore()] });
    const future = new Date();
    future.setDate(future.getDate() + 1);

    const result = await createManualSale({
      sold_at: future.toISOString(),
      lines: [{ name: 'Suelta', quantity: 1, unit_price_cents: 1_000 }],
    });

    expect(result).toEqual({ error: 'future_date' });
    expect(admin.__state.orders).toHaveLength(0);
  });

  it('rechaza una venta sin líneas', async () => {
    setup({ stores: [proStore()] });

    const result = await createManualSale({ sold_at: new Date().toISOString(), lines: [] });
    expect(result).toEqual({ error: 'no_valid_items' });
  });

  it('rechaza un producto que pertenece a otra tienda', async () => {
    const admin = setup({
      stores: [proStore()],
      products: [{ id: 'p_other', name: 'Ajeno', cost_cents: null, section_id: null, sections: null, stock: 10, store_id: 'OTHER_STORE' }],
    });

    const result = await createManualSale({
      sold_at: new Date().toISOString(),
      lines: [{ product_id: 'p_other', quantity: 1, unit_price_cents: 1_000 }],
    });

    expect(result).toEqual({ error: 'product_not_found' });
    expect(admin.__state.orders).toHaveLength(0);
  });

  it('rechaza la carga si la tienda no es Pro', async () => {
    const admin = setup({ stores: [{ id: 's1', owner_id: 'u1', plan: 'medio' }] });

    const result = await createManualSale({
      sold_at: new Date().toISOString(),
      lines: [{ name: 'Suelta', quantity: 1, unit_price_cents: 1_000 }],
    });

    expect(result).toEqual({ error: 'not_pro' });
    expect(admin.__state.orders).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// add-manual-sales, grupo 4 (tarea 4.3) — stock_applied gobierna la
// reposición, incluida la cadena completa borrar → deshacer.
// ---------------------------------------------------------------------------

describe('stock_applied gobierna replenishOrderStock (add-manual-sales, 4.3)', () => {
  function manualOrder(id: string, overrides: Row = {}): Row {
    return {
      id,
      store_id: 's1',
      status: 'confirmed',
      channel: 'manual',
      cancelled_by: null,
      deleted_at: null,
      coupon_code: null,
      coupon_counted: false,
      stock_applied: true,
      ...overrides,
    };
  }

  function setup(tables: Parameters<typeof makeFakeAdmin>[0]) {
    const admin = makeFakeAdmin({ stores: [{ id: 's1', owner_id: 'u1' }], ...tables });
    mockCreateAdminClient.mockReturnValue(admin);
    mockCreateServerClient.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    });
    return admin;
  }

  it('cancelar una venta manual sin descuento de stock no repone nada', async () => {
    const admin = setup({
      orders: [manualOrder('o1', { stock_applied: false })],
      order_items: [{ order_id: 'o1', product_id: 'p1', variant_id: null, quantity: 3 }],
      products: [{ id: 'p1', stock: 10 }],
    });

    const result = await updateOrderStatus('o1', 'cancelled');
    if (!('ok' in result)) throw new Error('unexpected error');

    expect(admin.__state.products[0].stock).toBe(10);
    const entry = admin.__state.order_action_log[0].entries[0];
    expect(entry.stock_restored).toBe(false);
  });

  it('borrar una venta manual sin descuento de stock no repone nada', async () => {
    const admin = setup({
      orders: [manualOrder('o1', { stock_applied: false })],
      order_items: [{ order_id: 'o1', product_id: 'p1', variant_id: null, quantity: 3 }],
      products: [{ id: 'p1', stock: 10 }],
    });

    const result = await deleteOrder('o1');
    if (!('ok' in result)) throw new Error('unexpected error');

    expect(admin.__state.products[0].stock).toBe(10);
  });

  it('cancelar una venta manual con descuento de stock repone exactamente una vez', async () => {
    const admin = setup({
      orders: [manualOrder('o1', { stock_applied: true })],
      order_items: [{ order_id: 'o1', product_id: 'p1', variant_id: null, quantity: 3 }],
      products: [{ id: 'p1', stock: 7 }],
    });

    const result = await updateOrderStatus('o1', 'cancelled');
    if (!('ok' in result)) throw new Error('unexpected error');
    expect(admin.__state.products[0].stock).toBe(10);

    // Intentar reponer de nuevo no-opea: el status ya es 'cancelled'.
    await replenishOrderStock('o1');
    expect(admin.__state.products[0].stock).toBe(10);
  });

  it('una línea suelta (sin producto) nunca toca stock aunque stock_applied sea true', async () => {
    const admin = setup({
      orders: [manualOrder('o1', { stock_applied: true })],
      order_items: [{ order_id: 'o1', product_id: null, variant_id: null, quantity: 2 }],
      products: [{ id: 'p1', stock: 10 }],
    });

    const result = await deleteOrder('o1');
    if (!('ok' in result)) throw new Error('unexpected error');
    expect(admin.__state.products[0].stock).toBe(10);
  });

  // Cadena completa exigida por el orquestador: borrar una venta manual que
  // NO había descontado stock, deshacer ese borrado, y verificar que el
  // stock queda igual en los tres puntos (antes, después de borrar, después
  // de deshacer) — nunca se descuenta algo que nunca se había repuesto.
  it('borrar sin descuento de stock y deshacer el borrado no descuenta ni repone stock en ningún punto', async () => {
    const admin = setup({
      orders: [manualOrder('o1', { stock_applied: false })],
      order_items: [{ order_id: 'o1', product_id: 'p1', product_name: 'Remera', variant_id: null, quantity: 3 }],
      products: [{ id: 'p1', stock: 10 }],
    });

    expect(admin.__state.products[0].stock).toBe(10); // antes de borrar

    const deleteResult = await deleteOrder('o1');
    if (!('ok' in deleteResult)) throw new Error('unexpected error');
    expect(admin.__state.products[0].stock).toBe(10); // después de borrar: no se repuso nada
    expect(admin.__state.orders[0].deleted_at).not.toBeNull();

    expect(deleteResult.operationId).not.toBeNull();
    const undoResult = await undoOrderAction(deleteResult.operationId as string);
    if ('error' in undoResult) throw new Error('unexpected error');
    expect(undoResult.undone).toBe(1);

    expect(admin.__state.products[0].stock).toBe(10); // después de deshacer: tampoco se descontó
    expect(admin.__state.orders[0].deleted_at).toBeNull();
  });
});
