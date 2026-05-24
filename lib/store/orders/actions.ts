'use server';

import { redirect } from 'next/navigation';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';

type CreateOrderInput = {
  store_id: string;
  items: Array<{ product_id: string; quantity: number }>;
};

type CreateOrderResult =
  | { order_id: string }
  | { error: 'store_unavailable' | 'no_valid_items' | 'insert_failed' };

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

  // 3. Fetch valid products with section info, filter to active + belonging to this store
  const { data: products } = await admin
    .from('products')
    .select('id, name, price_cents, section_id, sections(name)')
    .eq('store_id', input.store_id)
    .eq('is_active', true)
    .in('id', productIds);

  if (!products || products.length === 0) {
    return { error: 'no_valid_items' };
  }

  // Build a map for fast lookup
  const productMap = new Map(products.map((p) => [p.id, p]));

  // Filter input items to only those with a valid product
  const validItems = input.items.filter(
    (i) => i.quantity >= 1 && i.quantity <= 100 && productMap.has(i.product_id)
  );

  if (validItems.length === 0) {
    return { error: 'no_valid_items' };
  }

  // 4. Recalculate total server-side
  const totalCents = validItems.reduce((sum, i) => {
    const p = productMap.get(i.product_id)!;
    return sum + p.price_cents * i.quantity;
  }, 0);

  // 5. Insert order
  const { data: order, error: orderError } = await admin
    .from('orders')
    .insert({
      store_id: input.store_id,
      total_cents: totalCents,
      currency: 'ARS',
      status: 'pending',
    })
    .select('id')
    .single();

  if (orderError || !order) {
    console.error('[createPendingOrder] order insert failed:', orderError);
    return { error: 'insert_failed' };
  }

  // 6. Insert order_items with snapshots
  const itemRows = validItems.map((i) => {
    const p = productMap.get(i.product_id)!;
    const section = p.sections as { name: string } | null;
    return {
      order_id: order.id,
      product_id: i.product_id,
      product_name: p.name,
      unit_price_cents: p.price_cents,
      quantity: i.quantity,
      section_id: p.section_id ?? null,
      section_name: section?.name ?? null,
    };
  });

  const { error: itemsError } = await admin.from('order_items').insert(itemRows);

  if (itemsError) {
    console.error('[createPendingOrder] order_items insert failed:', itemsError);
    return { error: 'insert_failed' };
  }

  // 7. Return order reference
  return { order_id: order.id };
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
  items: Array<{
    id: string;
    product_id: string | null;
    product_name: string;
    unit_price_cents: number;
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
    return { orders: [] };
  }

  let orders = (data ?? []).map((row) => ({
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
    items: (row.order_items ?? []) as OrderWithItems['items'],
  }));

  // Client-side filters that PostgREST embeds make complex server-side
  if (filters.section_id) {
    orders = orders.filter((o) =>
      o.items.some((item) => item.section_id === filters.section_id)
    );
  }
  if (filters.search && filters.search.trim() !== '') {
    const s = filters.search.trim().toLowerCase();
    orders = orders.filter(
      (o) =>
        (o.customer_name ?? '').toLowerCase().includes(s) ||
        o.id.toLowerCase().startsWith(s)
    );
  }

  return { orders };
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
      items: (updated.order_items ?? []) as OrderWithItems['items'],
    },
  };
}
