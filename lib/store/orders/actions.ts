'use server';

import { createAdminClient } from '@/lib/supabase/server';

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
