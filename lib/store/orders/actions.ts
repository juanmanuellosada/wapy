'use server';

import * as Sentry from '@sentry/nextjs';
import { redirect } from 'next/navigation';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';

// 3.1 Each cart item may carry an optional variantId.
type CreateOrderInput = {
  store_id: string;
  items: Array<{ product_id: string; quantity: number; variant_id?: string | null }>;
  // Coupon applied at checkout (optional)
  coupon_code?: string | null;
  discount_amount?: number | null;
  // MP checkout fields (task 5.2): set when channel='mercadopago'
  channel?: 'whatsapp' | 'mercadopago';
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  delivery_address?: string | null;
};

/** Line item ready to pass to Mercado Pago Checkout Pro (unit_price in ARS). */
export type MpOrderItem = {
  title: string;
  quantity: number;
  unit_price: number; // in ARS (price_cents / 100)
  currency_id: 'ARS';
};

type StockInsufficientDetail = {
  productId: string;
  productName: string;
  requested: number;
  available: number;
};

type CreateOrderResult =
  | { order_id: string; mp_items: MpOrderItem[] }
  | { error: 'store_unavailable' | 'no_valid_items' | 'insert_failed' }
  | { error: 'stock_insufficient'; details: StockInsufficientDetail[] }
  | { error: 'qty_violation'; productId: string; productName: string; min: number; step: number };

export async function createPendingOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const admin = createAdminClient();

  // 1. Validate store exists and is published
  const { data: store } = await admin
    .from('stores')
    .select('id')
    .eq('id', input.store_id)
    .eq('status', 'published')
    .maybeSingle();

  if (!store) {
    return { error: 'store_unavailable' };
  }

  // 2. Basic input validation
  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 50) {
    return { error: 'no_valid_items' };
  }

  const productIds = input.items
    .filter((i) => i.quantity >= 1 && i.quantity <= 100)
    .map((i) => i.product_id);

  if (productIds.length === 0) {
    return { error: 'no_valid_items' };
  }

  // 3. Fetch valid products with section info, filter to active + belonging to this store.
  type ProductRow = {
    id: string;
    name: string;
    price_cents: number;
    stock: number | null;
    section_id: string | null;
    min_quantity: number;
    qty_step: number;
    sections: { name: string } | null;
  };
  const { data: products } = (await admin
    .from('products')
    .select('id, name, price_cents, stock, section_id, min_quantity, qty_step, sections(name)')
    .eq('store_id', input.store_id)
    .eq('is_active', true)
    .in('id', productIds)) as { data: ProductRow[] | null };

  if (!products || products.length === 0) {
    return { error: 'no_valid_items' };
  }

  // Build a map for fast lookup
  const productMap = new Map(products.map((p) => [p.id, p]));

  // Filter input items to only those with a valid product
  const rawValidItems = input.items.filter(
    (i) => i.quantity >= 1 && i.quantity <= 100 && productMap.has(i.product_id)
  );

  if (rawValidItems.length === 0) {
    return { error: 'no_valid_items' };
  }

  // 3.1 Validate variant presence: collect unique variant ids to validate in bulk
  const variantIds = rawValidItems
    .map((i) => i.variant_id)
    .filter((id): id is string => typeof id === 'string');

  // Fetch all referenced variants in one query
  const variantMap = new Map<
    string,
    {
      id: string;
      product_id: string;
      stock: number | null; // null = no tracking (infinite stock)
      price_override: number | null;
      deleted_at: string | null;
      product_variant_option_values: Array<{
        option_value_id: string;
        product_option_values: {
          value: string;
          product_option_types: { position: number; name: string } | null;
        } | null;
      }>;
    }
  >();

  if (variantIds.length > 0) {
    const { data: variantRows } = await admin
      .from('product_variants')
      .select(
        'id, product_id, stock, price_override, deleted_at, product_variant_option_values(option_value_id, product_option_values(value, product_option_types(position, name)))'
      )
      .in('id', variantIds);

    for (const v of variantRows ?? []) {
      variantMap.set(v.id, v as typeof variantMap extends Map<string, infer V> ? V : never);
    }
  }

  // 3.1 Fetch option types per product to know which products have variants
  // A product "has variants" when it has at least one product_option_type row.
  const { data: optionTypeRows } = await admin
    .from('product_option_types')
    .select('product_id')
    .in('product_id', productIds);

  const productsWithVariants = new Set((optionTypeRows ?? []).map((r) => r.product_id));

  // Validate variant_id presence rules per item
  for (const item of rawValidItems) {
    const hasVariants = productsWithVariants.has(item.product_id);
    if (hasVariants && !item.variant_id) {
      return { error: 'no_valid_items' }; // product has variants but no variantId provided
    }
    if (!hasVariants && item.variant_id) {
      return { error: 'no_valid_items' }; // simple product but variantId provided
    }
    if (item.variant_id) {
      const variant = variantMap.get(item.variant_id);
      if (!variant || variant.product_id !== item.product_id || variant.deleted_at !== null) {
        return { error: 'no_valid_items' }; // invalid/deleted variant
      }
    }
  }

  const validItems = rawValidItems;

  // 3.2 + 3.3 Stock validation:
  // - For items with variant_id: validate against variant.stock
  // - For simple items: validate against product.stock (null = unlimited)
  const stockFailures: StockInsufficientDetail[] = [];
  for (const item of validItems) {
    const p = productMap.get(item.product_id)!;
    if (item.variant_id) {
      const variant = variantMap.get(item.variant_id)!;
      // null stock = no tracking (infinite) — skip validation
      if (variant.stock !== null && item.quantity > variant.stock) {
        stockFailures.push({
          productId: p.id,
          productName: p.name,
          requested: item.quantity,
          available: variant.stock,
        });
      }
    } else {
      // Simple product — existing behavior preserved (3.3)
      if (p.stock !== null && item.quantity > p.stock) {
        stockFailures.push({
          productId: p.id,
          productName: p.name,
          requested: item.quantity,
          available: p.stock,
        });
      }
    }
  }
  if (stockFailures.length > 0) {
    return { error: 'stock_insufficient', details: stockFailures };
  }

  // D7: validate min_quantity and qty_step per product (aggregated across all variants).
  // Group valid items by product_id and sum quantities.
  const qtyByProduct = new Map<string, number>();
  for (const item of validItems) {
    qtyByProduct.set(item.product_id, (qtyByProduct.get(item.product_id) ?? 0) + item.quantity);
  }
  for (const [productId, totalQty] of qtyByProduct.entries()) {
    const p = productMap.get(productId)!;
    const minQty: number = p.min_quantity ?? 1;
    const qtyStep: number = p.qty_step ?? 1;
    if (totalQty < minQty) {
      return { error: 'qty_violation', productId, productName: p.name, min: minQty, step: qtyStep };
    }
    if (qtyStep > 1 && totalQty % qtyStep !== 0) {
      return { error: 'qty_violation', productId, productName: p.name, min: minQty, step: qtyStep };
    }
  }

  // 3.4 Compute effective price per item (variant.price_override ?? product.price_cents)
  // and build variant_label for items with variants.
  type EnrichedItem = typeof validItems[number] & {
    effectivePrice: number;
    variantLabel: string | null;
  };

  const enrichedItems: EnrichedItem[] = validItems.map((item) => {
    if (item.variant_id) {
      const variant = variantMap.get(item.variant_id)!;
      const effectivePrice =
        variant.price_override !== null
          ? variant.price_override
          : productMap.get(item.product_id)!.price_cents;

      // Build label: values sorted by option type position, joined with " / "
      const valueEntries = (variant.product_variant_option_values ?? [])
        .map((ov) => ({
          position: ov.product_option_values?.product_option_types?.position ?? 0,
          value: ov.product_option_values?.value ?? '',
        }))
        .sort((a, b) => a.position - b.position);
      const variantLabel = valueEntries.map((e) => e.value).join(' / ') || null;

      return { ...item, effectivePrice, variantLabel };
    } else {
      return {
        ...item,
        effectivePrice: productMap.get(item.product_id)!.price_cents,
        variantLabel: null,
      };
    }
  });

  // 4. Recalculate total server-side using effective prices
  const totalCents = enrichedItems.reduce((sum, i) => sum + i.effectivePrice * i.quantity, 0);

  // 5. Insert order
  // Compute discount_cents from discount_amount (which is in ARS, same as totalCents units... but
  // discount_amount is passed as a raw number matching totalPrice units in the cart — cents).
  // The cart totalPrice is already in cents (price_cents / 100 * qty), but looking at handleWhatsApp,
  // formatARS(totalPrice) is called directly, meaning totalPrice is in ARS (not cents).
  // Actually: StoreClient cart uses price from CartItem.price which is set from product.price_cents/100
  // in ProductCardClient — so totalPrice is in ARS units, and discount_amount is also in ARS.
  // totalCents above is computed server-side from price_cents, so it is in cents.
  // We convert discount_amount (ARS) → discount_cents by multiplying by 100.
  const discountCents = input.discount_amount != null
    ? Math.round(input.discount_amount * 100)
    : null;

  const { data: order, error: orderError } = await admin
    .from('orders')
    .insert({
      store_id: input.store_id,
      total_cents: totalCents,
      currency: 'ARS',
      status: 'pending',
      coupon_code: input.coupon_code ?? null,
      discount_cents: discountCents,
      // task 5.2: MP checkout fields (null for whatsapp orders)
      channel: input.channel ?? 'whatsapp',
      customer_name: input.customer_name ?? null,
      customer_email: input.customer_email ?? null,
      customer_phone: input.customer_phone ?? null,
      delivery_address: input.delivery_address ?? null,
    })
    .select('id')
    .single();

  if (orderError || !order) {
    console.error('[createPendingOrder] order insert failed:', orderError);
    Sentry.captureException(orderError ?? new Error('order insert returned no data'), {
      tags: { feature: 'checkout-persist' },
      extra: { storeId: input.store_id, totalCents, itemCount: enrichedItems.length },
    });
    return { error: 'insert_failed' };
  }

  // 6. Insert order_items with snapshots (3.4)
  const itemRows = enrichedItems.map((i) => {
    const p = productMap.get(i.product_id)!;
    const section = p.sections as { name: string } | null;
    return {
      order_id: order.id,
      product_id: i.product_id,
      product_name: p.name,
      unit_price_cents: i.effectivePrice,
      quantity: i.quantity,
      section_id: p.section_id ?? null,
      section_name: section?.name ?? null,
      // 3.4 snapshot fields
      variant_id: i.variant_id ?? null,
      price_at_purchase: i.effectivePrice,
      variant_label: i.variantLabel,
    };
  });

  const { error: itemsError } = await admin.from('order_items').insert(itemRows);

  if (itemsError) {
    console.error('[createPendingOrder] order_items insert failed:', itemsError);
    Sentry.captureException(itemsError, {
      tags: { feature: 'checkout-persist' },
      extra: { storeId: input.store_id, orderId: order.id, itemCount: itemRows.length },
    });
    return { error: 'insert_failed' };
  }

  // 3.2 Atomic stock deduction per variant.
  // Note: Supabase JS client does not support BEGIN/COMMIT transactions directly.
  // The stock validation above (step 3b) prevents most failures, so we do sequential
  // UPDATE … WHERE stock >= qty and treat 0-rows-affected as a rollback signal.
  // For a true atomic guarantee, a Postgres RPC would be preferable; we keep JS
  // updates here because the project has no RPC precedent and the validation step
  // already provides strong optimistic concurrency protection.
  for (const item of enrichedItems) {
    if (item.variant_id) {
      const variantStock = variantMap.get(item.variant_id)!.stock;
      // null stock = no tracking (infinite) — skip deduction
      if (variantStock !== null) {
        const { data: updated } = await admin
          .from('product_variants')
          .update({ stock: variantStock - item.quantity })
          .eq('id', item.variant_id)
          .gte('stock', item.quantity) // guard: only update if stock still sufficient
          .select('stock');

        if (!updated || updated.length === 0) {
          // Stock was depleted between validation and deduction — compensate
          Sentry.captureException(
            new Error('stock_race_condition: variant stock depleted between validation and deduction'),
            {
              tags: { feature: 'checkout-stock' },
              extra: { variantId: item.variant_id, orderId: order.id },
            }
          );
          // The order is already inserted; mark it cancelled to avoid fulfillment
          await admin
            .from('orders')
            .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
            .eq('id', order.id);
          return { error: 'stock_insufficient', details: [] };
        }
      }
    } else {
      // Simple product — deduct from products.stock (existing behavior preserved)
      const p = productMap.get(item.product_id)!;
      if (p.stock !== null) {
        await admin
          .from('products')
          .update({ stock: p.stock - item.quantity })
          .eq('id', item.product_id)
          .gte('stock', item.quantity);
      }
    }
  }

  // 7. Increment coupon uses_count (best-effort — does not block order creation if it fails).
  // Note: Supabase JS does not support atomic increment via .update(), so we fetch then update.
  // This is an approximation: uses_count may drift under concurrent load, which is acceptable per design.
  if (input.coupon_code) {
    try {
      const { data: couponRow } = await admin
        .from('coupons')
        .select('id, uses_count')
        .eq('store_id', input.store_id)
        .eq('code', input.coupon_code)
        .maybeSingle();
      if (couponRow) {
        await admin
          .from('coupons')
          .update({ uses_count: (couponRow.uses_count ?? 0) + 1 })
          .eq('id', couponRow.id);
      }
    } catch (e) {
      console.warn('[createPendingOrder] coupon uses_count increment failed (best-effort):', e);
    }
  }

  // 8. Return order reference + MP-ready items (unit_price in ARS, for createCheckoutPreference)
  const mp_items: MpOrderItem[] = enrichedItems.map((i) => ({
    title: productMap.get(i.product_id)!.name,
    quantity: i.quantity,
    unit_price: i.effectivePrice / 100,
    currency_id: 'ARS',
  }));

  return { order_id: order.id, mp_items };
}

// ---------------------------------------------------------------------------
// Shared auth helpers (mirror of lib/store/actions.ts pattern)
// ---------------------------------------------------------------------------

async function requireOwnerStore() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const admin = createAdminClient();
  const { data: store } = await admin
    .from('stores')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();
  return { user, store };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OrderStatus = 'pending' | 'confirmed' | 'cancelled' | 'delivered';
export type OrderChannel = 'whatsapp' | 'mercadopago';
export type OrderPaymentStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type OrderWithItems = {
  id: string;
  status: OrderStatus;
  customer_name: string | null;
  total_cents: number;
  currency: string;
  notes: string | null;
  created_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  delivered_at: string | null;
  channel: OrderChannel;
  payment_status: OrderPaymentStatus;
  items: Array<{
    id: string;
    product_id: string | null;
    product_name: string;
    unit_price_cents: number;
    price_at_purchase: number;
    variant_label: string | null;
    quantity: number;
    section_id: string | null;
    section_name: string | null;
  }>;
};

export type ListOrdersFilters = {
  status?: OrderStatus | 'all';
  date_from?: string;
  date_to?: string;
  section_id?: string;
  search?: string;
};

// ---------------------------------------------------------------------------
// listOrders
// ---------------------------------------------------------------------------

export async function listOrders(
  filters: ListOrdersFilters
): Promise<{ orders: OrderWithItems[] } | { error: 'unauthorized' }> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'unauthorized' };

  const admin = createAdminClient();

  let query = admin
    .from('orders')
    .select('*, order_items(*)')
    .eq('store_id', store.id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  }
  if (filters.date_from) {
    query = query.gte('created_at', filters.date_from);
  }
  if (filters.date_to) {
    query = query.lte('created_at', filters.date_to + ' 23:59:59');
  }

  const { data, error } = await query;

  if (error) {
    console.error('[listOrders] query failed:', error);
    Sentry.captureException(error, {
      tags: { feature: 'orders-dashboard' },
      extra: { storeId: store.id },
    });
    // TODO: surface error to caller — currently returns empty list silently
    return { orders: [] };
  }

  let orders = (data ?? []).map((row) => {
    return {
      id: row.id,
      status: row.status as OrderStatus,
      customer_name: row.customer_name,
      total_cents: row.total_cents,
      currency: row.currency,
      notes: row.notes,
      created_at: row.created_at,
      confirmed_at: row.confirmed_at,
      cancelled_at: row.cancelled_at,
      delivered_at: row.delivered_at,
      channel: (row.channel ?? 'whatsapp') as OrderChannel,
      payment_status: (row.payment_status ?? 'pending') as OrderPaymentStatus,
      items: (row.order_items ?? []) as OrderWithItems['items'],
    };
  });

  // Client-side filters that PostgREST embeds make complex server-side
  if (filters.section_id) {
    orders = orders.filter((o) =>
      o.items.some((item) => item.section_id === filters.section_id)
    );
  }
  if (filters.search && filters.search.trim() !== '') {
    const s = filters.search.trim().toLowerCase().replace(/^#/, '');
    orders = orders.filter((o) => o.id.toLowerCase().startsWith(s));
  }

  return { orders };
}

// ---------------------------------------------------------------------------
// getOrderStats
// ---------------------------------------------------------------------------

export type OrderStatsRange = '30d' | '90d' | 'ytd';

export type OrderStatsResult = {
  kpis: {
    revenue_cents: number;
    order_count: number;
    avg_ticket_cents: number;
    confirmation_rate: number;
  };
  revenue_by_day: Array<{ date: string; cents: number }>;
  top_products: Array<{ name: string; units: number; revenue_cents: number }>;
  orders_by_section: Array<{ section_name: string; count: number }>;
};

function getRangeStart(range: OrderStatsRange): Date {
  const now = new Date();
  if (range === '30d') {
    const d = new Date(now);
    d.setDate(d.getDate() - 29);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (range === '90d') {
    const d = new Date(now);
    d.setDate(d.getDate() - 89);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  // ytd
  return new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
}

function toArgentinaDateStr(isoStr: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(isoStr));
  } catch {
    return isoStr.slice(0, 10);
  }
}

export async function getOrderStats(
  range: OrderStatsRange
): Promise<OrderStatsResult | { error: 'unauthorized' }> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'unauthorized' };

  const admin = createAdminClient();
  const rangeStart = getRangeStart(range);

  const { data: orders } = await admin
    .from('orders')
    .select('id, status, total_cents, created_at')
    .eq('store_id', store.id)
    .gte('created_at', rangeStart.toISOString());

  const { data: items } = await admin
    .from('order_items')
    .select('order_id, product_name, unit_price_cents, quantity, section_name')
    .in(
      'order_id',
      (orders ?? []).map((o) => o.id)
    );

  const allOrders = orders ?? [];
  const allItems = items ?? [];

  const totalOrders = allOrders.length;

  const confirmedOrders = allOrders.filter(
    (o) => o.status === 'confirmed' || o.status === 'delivered'
  );

  const revenueCents = confirmedOrders.reduce((s, o) => s + (o.total_cents ?? 0), 0);
  const confirmationRate = totalOrders > 0 ? confirmedOrders.length / totalOrders : 0;
  const avgTicketCents = confirmedOrders.length > 0
    ? Math.round(revenueCents / confirmedOrders.length)
    : 0;

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const msPerDay = 86_400_000;
  const dayCount = Math.max(
    1,
    Math.ceil((today.getTime() - rangeStart.getTime()) / msPerDay)
  );
  const dayMap = new Map<string, number>();
  for (let i = dayCount - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    dayMap.set(key, 0);
  }
  for (const o of confirmedOrders) {
    const dateKey = toArgentinaDateStr(o.created_at);
    if (dayMap.has(dateKey)) {
      dayMap.set(dateKey, (dayMap.get(dateKey) ?? 0) + (o.total_cents ?? 0));
    }
  }
  const revenue_by_day = Array.from(dayMap.entries()).map(([date, cents]) => ({ date, cents }));

  // top_products
  const productMap = new Map<string, { units: number; revenue_cents: number }>();
  for (const item of allItems) {
    const name = item.product_name ?? 'Producto';
    const existing = productMap.get(name) ?? { units: 0, revenue_cents: 0 };
    productMap.set(name, {
      units: existing.units + item.quantity,
      revenue_cents: existing.revenue_cents + item.unit_price_cents * item.quantity,
    });
  }
  const top_products = Array.from(productMap.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.units - a.units)
    .slice(0, 5);

  // orders_by_section
  const sectionMap = new Map<string, number>();
  for (const item of allItems) {
    const name = item.section_name ?? 'Sin sección';
    sectionMap.set(name, (sectionMap.get(name) ?? 0) + 1);
  }
  const orders_by_section = Array.from(sectionMap.entries()).map(([section_name, count]) => ({
    section_name,
    count,
  }));

  return {
    kpis: {
      revenue_cents: revenueCents,
      order_count: totalOrders,
      avg_ticket_cents: avgTicketCents,
      confirmation_rate: confirmationRate,
    },
    revenue_by_day,
    top_products,
    orders_by_section,
  };
}

// ---------------------------------------------------------------------------
// exportOrdersCsv
// ---------------------------------------------------------------------------

function csvEscape(value: string | null | undefined): string {
  const s = value ?? '';
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function formatCsvDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatCsvTotal(cents: number): string {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export async function exportOrdersCsv(
  filters: ListOrdersFilters
): Promise<{ csv: string } | { error: 'unauthorized' | 'empty' }> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'unauthorized' };

  const result = await listOrders(filters);
  if ('error' in result) return { error: 'unauthorized' };

  const { orders } = result;
  if (orders.length === 0) return { error: 'empty' };

  const header = ['id', 'created_at', 'status', 'customer_name', 'total', 'currency', 'items_count', 'items_summary', 'notes'].join(',');

  const rows = orders.map((order) => {
    const itemsSummary = order.items
      .map((i) => `${i.quantity}x ${i.product_name}`)
      .join(' | ');

    return [
      csvEscape(order.id),
      csvEscape(formatCsvDate(order.created_at)),
      csvEscape(order.status),
      csvEscape(order.customer_name),
      csvEscape(formatCsvTotal(order.total_cents)),
      csvEscape(order.currency),
      String(order.items.length),
      csvEscape(itemsSummary),
      csvEscape(order.notes),
    ].join(',');
  });

  // BOM UTF-8 so Excel (es-AR) opens accents correctly
  const csv = '﻿' + [header, ...rows].join('\r\n');
  return { csv };
}

// ---------------------------------------------------------------------------
// updateOrderStatus
// ---------------------------------------------------------------------------

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

export async function updateOrderStatus(
  order_id: string,
  next_status: OrderStatus
): Promise<
  | { ok: true; order: OrderWithItems }
  | { error: 'unauthorized' | 'invalid_transition' | 'not_found' }
> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'unauthorized' };

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('orders')
    .select('id, status, store_id')
    .eq('id', order_id)
    .eq('store_id', store.id)
    .maybeSingle();

  if (!existing) return { error: 'not_found' };

  const current = existing.status as OrderStatus;
  if (!ALLOWED_TRANSITIONS[current].includes(next_status)) {
    return { error: 'invalid_transition' };
  }

  const now = new Date().toISOString();
  const timestampField =
    next_status === 'confirmed'
      ? { confirmed_at: now }
      : next_status === 'cancelled'
        ? { cancelled_at: now }
        : next_status === 'delivered'
          ? { delivered_at: now }
          : {};

  const { data: updated, error: updateError } = await admin
    .from('orders')
    .update({ status: next_status, ...timestampField })
    .eq('id', order_id)
    .select('*, order_items(*)')
    .single();

  if (updateError || !updated) {
    console.error('[updateOrderStatus] update failed:', updateError);
    Sentry.captureException(updateError ?? new Error('order update returned no data'), {
      tags: { feature: 'orders-dashboard' },
      extra: { orderId: order_id, nextStatus: next_status },
    });
    return { error: 'not_found' };
  }

  return {
    ok: true,
    order: {
      id: updated.id,
      status: updated.status as OrderStatus,
      customer_name: updated.customer_name,
      total_cents: updated.total_cents,
      currency: updated.currency,
      notes: updated.notes,
      created_at: updated.created_at,
      confirmed_at: updated.confirmed_at,
      cancelled_at: updated.cancelled_at,
      delivered_at: updated.delivered_at,
      channel: (updated.channel ?? 'whatsapp') as OrderChannel,
      payment_status: (updated.payment_status ?? 'pending') as OrderPaymentStatus,
      items: (updated.order_items ?? []) as OrderWithItems['items'],
    },
  };
}
