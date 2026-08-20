'use server';

import * as Sentry from '@sentry/nextjs';
import { redirect } from 'next/navigation';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { validateCoupon } from '@/lib/store/coupons/actions';
import { resolveTieredPrice, tierGroupKey, type PriceTier } from '@/lib/store/pricing';
import { canReactivateOrder, type OrderCancelledBy } from './expiry';

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
  // Idempotency (Ola 1 hardening): when provided and an order with the same
  // key already exists, that existing order is returned instead of creating
  // a new one (and stock is not deducted twice).
  idempotency_key?: string | null;
};

/** Line item ready to pass to Mercado Pago Checkout Pro (unit_price in ARS). */
export type MpOrderItem = {
  title: string;
  quantity: number;
  unit_price: number; // in ARS (price_cents / 100)
  currency_id: 'ARS';
};

export type StockInsufficientDetail = {
  productId: string;
  productName: string;
  requested: number;
  available: number;
};

type CreateOrderResult =
  | { order_id: string; mp_items: MpOrderItem[]; store_order_number: number | null }
  | { error: 'store_unavailable' | 'no_valid_items' | 'insert_failed' }
  | { error: 'stock_insufficient'; details: StockInsufficientDetail[] }
  | { error: 'qty_violation'; productId: string; productName: string; min: number; step: number }
  | { error: 'coupon_invalid'; message: string }
  | { error: 'invalid_price'; productId: string; productName: string }
  | { error: 'rounding_error' };

export async function createPendingOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const admin = createAdminClient();
  const channel = input.channel ?? 'whatsapp';

  // 0. Idempotency: if a key is provided and an order already used it, return
  // that existing order instead of creating a new one (no double stock deduction).
  if (input.idempotency_key) {
    const existing = await findOrderByIdempotencyKey(admin, input.idempotency_key);
    if (existing) return existing;
  }

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
    promo_price_cents: number | null;
    stock: number | null;
    section_id: string | null;
    min_quantity: number;
    qty_step: number;
    sections: { name: string } | null;
  };
  const { data: products } = (await admin
    .from('products')
    .select('id, name, price_cents, promo_price_cents, stock, section_id, min_quantity, qty_step, sections(name)')
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
      promo_price_override: number | null;
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
        'id, product_id, stock, price_override, promo_price_override, deleted_at, product_variant_option_values(option_value_id, product_option_values(value, product_option_types(position, name)))'
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

  // Tramos de precio por cantidad. Se agrupan por producto; los productos sin
  // tramos simplemente no aparecen en el mapa y se cobran como hasta ahora.
  const { data: tierRows } = await admin
    .from('product_price_tiers')
    .select('product_id, min_quantity, unit_price_cents')
    .in('product_id', productIds);

  const tiersByProduct = new Map<string, PriceTier[]>();
  for (const t of tierRows ?? []) {
    const list = tiersByProduct.get(t.product_id) ?? [];
    list.push({ min_quantity: t.min_quantity, unit_price_cents: t.unit_price_cents });
    tiersByProduct.set(t.product_id, list);
  }

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

  // Cantidad agregada por GRUPO de tramos: los productos que comparten la misma
  // escalera suman entre sí (3 alfajores de sabores distintos cumplen "llevá 3").
  // Es un mapa aparte de `qtyByProduct` a propósito: min_quantity y qty_step se
  // siguen validando por producto, solo el precio se agrupa.
  const qtyByTierGroup = new Map<string, number>();
  for (const item of validItems) {
    const groupKey = tierGroupKey(tiersByProduct.get(item.product_id));
    if (!groupKey) continue;
    qtyByTierGroup.set(groupKey, (qtyByTierGroup.get(groupKey) ?? 0) + item.quantity);
  }

  // 3.4 Compute effective price per item (promo + tramo por cantidad) and build
  // variant_label for items with variants. La cantidad que activa el tramo sale del
  // grupo, no de esta línea sola: 2 talles M + 1 L son 3 unidades, y 1 alfajor de
  // cada sabor con la misma escalera también.
  type EnrichedItem = typeof validItems[number] & {
    effectivePrice: number;
    variantLabel: string | null;
  };

  const enrichedItems: EnrichedItem[] = validItems.map((item) => {
    const product = productMap.get(item.product_id)!;

    const tiers = tiersByProduct.get(item.product_id);
    const groupKey = tierGroupKey(tiers);
    const aggregatedQty = groupKey ? qtyByTierGroup.get(groupKey) ?? item.quantity : item.quantity;

    if (item.variant_id) {
      const variant = variantMap.get(item.variant_id)!;
      const { unitCents } = resolveTieredPrice(product, variant, aggregatedQty, tiers);

      // Build label: values sorted by option type position, joined with " / "
      const valueEntries = (variant.product_variant_option_values ?? [])
        .map((ov) => ({
          position: ov.product_option_values?.product_option_types?.position ?? 0,
          value: ov.product_option_values?.value ?? '',
        }))
        .sort((a, b) => a.position - b.position);
      const variantLabel = valueEntries.map((e) => e.value).join(' / ') || null;

      return { ...item, effectivePrice: unitCents, variantLabel };
    } else {
      const { unitCents } = resolveTieredPrice(product, null, aggregatedQty, tiers);
      return { ...item, effectivePrice: unitCents, variantLabel: null };
    }
  });

  // 3.5 MP guard: a $0 item cannot be charged through Mercado Pago (still fine
  // for WhatsApp/catalog browsing, where $0 remains a valid "consult price" case).
  if (channel === 'mercadopago') {
    const zeroPriceItem = enrichedItems.find((i) => i.effectivePrice <= 0);
    if (zeroPriceItem) {
      const p = productMap.get(zeroPriceItem.product_id)!;
      return { error: 'invalid_price', productId: p.id, productName: p.name };
    }
  }

  // 4. Recalculate total server-side using effective prices
  const totalCents = enrichedItems.reduce((sum, i) => sum + i.effectivePrice * i.quantity, 0);

  // 5. Coupon validation + discount computation
  //
  // Two paths:
  //   a) MP flow: coupon_code present, discount_amount absent → validate server-side against
  //      the DB-computed total so the client cannot manipulate the discount.
  //   b) WhatsApp flow: discount_amount present (client-provided, ARS) → use as-is (existing
  //      behavior; WA orders are fulfilled manually by the owner so trust is acceptable).
  //
  // mpFinalTotalCents drives the proportional distribution of mp_items unit prices sent to MP.
  // It equals totalCents when there is no discount.
  let discountCents: number | null = null;
  let mpFinalTotalCents = totalCents;

  if (input.coupon_code && input.discount_amount == null) {
    // MP flow — re-validate the coupon against server-computed prices.
    const couponResult = await validateCoupon({
      storeId: input.store_id,
      code: input.coupon_code,
      cartTotal: totalCents / 100, // ARS
    });
    if ('error' in couponResult) {
      return { error: 'coupon_invalid', message: couponResult.error };
    }
    if (couponResult.finalTotal <= 0) {
      return { error: 'coupon_invalid', message: 'El cupón no puede cubrir el total del pedido.' };
    }
    discountCents = Math.round(couponResult.discount * 100);
    mpFinalTotalCents = Math.round(couponResult.finalTotal * 100);
  } else if (input.discount_amount != null) {
    // WhatsApp flow — use client-provided discount (ARS → cents).
    discountCents = Math.round(input.discount_amount * 100);
  }

  // 5.1 Build MP-ready items (unit_price in ARS) BEFORE writing anything to the DB,
  // so a rounding failure aborts cleanly with no order/stock side effects.
  //
  // When a coupon was validated server-side (mpFinalTotalCents < totalCents), distribute the
  // discount proportionally across items so the MP preference charges exactly mpFinalTotalCents.
  // Each non-last item's unit price is the proportional price rounded to the nearest centavo;
  // the LAST item absorbs whatever is left so the sum matches mpFinalTotalCents EXACTLY.
  // If the remainder can't be expressed as a clean per-unit centavo price (degenerate case,
  // e.g. very small amounts split across many units), we abort instead of sending MP an
  // inconsistent total.
  let mp_items: MpOrderItem[];
  if (mpFinalTotalCents < totalCents && totalCents > 0) {
    const ratio = mpFinalTotalCents / totalCents;
    const items: MpOrderItem[] = [];
    let allocatedCents = 0;
    let degenerate = false;

    enrichedItems.forEach((item, idx) => {
      const title = productMap.get(item.product_id)!.name;
      const isLast = idx === enrichedItems.length - 1;

      if (!isLast) {
        const centsPerUnit = Math.round((item.effectivePrice / 100) * ratio * 100);
        if (centsPerUnit < 1) {
          degenerate = true;
          return;
        }
        allocatedCents += centsPerUnit * item.quantity;
        items.push({ title, quantity: item.quantity, unit_price: centsPerUnit / 100, currency_id: 'ARS' });
      } else {
        const remainingCents = mpFinalTotalCents - allocatedCents;
        if (remainingCents < item.quantity || remainingCents % item.quantity !== 0) {
          degenerate = true;
          return;
        }
        items.push({
          title,
          quantity: item.quantity,
          unit_price: remainingCents / item.quantity / 100,
          currency_id: 'ARS',
        });
      }
    });

    if (degenerate) {
      Sentry.captureMessage('createPendingOrder: mp_items rounding could not be reconciled exactly', {
        tags: { feature: 'checkout-mp-rounding' },
        extra: { storeId: input.store_id, totalCents, mpFinalTotalCents },
      });
      return { error: 'rounding_error' };
    }
    mp_items = items;
  } else {
    mp_items = enrichedItems.map((i) => ({
      title: productMap.get(i.product_id)!.name,
      quantity: i.quantity,
      unit_price: i.effectivePrice / 100,
      currency_id: 'ARS' as const,
    }));
  }

  // 5.2 Numeración correlativa (Decisión 2): atómica en una sola sentencia vía
  // RPC, para que dos creaciones simultáneas de la misma tienda nunca choquen.
  const orderNumber = await assignOrderNumber(admin, input.store_id);
  if (orderNumber === null) {
    return { error: 'insert_failed' };
  }

  const { data: order, error: orderError } = await admin
    .from('orders')
    .insert({
      store_id: input.store_id,
      total_cents: totalCents,
      currency: 'ARS',
      status: 'pending',
      coupon_code: input.coupon_code ?? null,
      discount_cents: discountCents,
      store_order_number: orderNumber,
      // task 5.2: MP checkout fields (null for whatsapp orders)
      channel,
      customer_name: input.customer_name ?? null,
      customer_email: input.customer_email ?? null,
      customer_phone: input.customer_phone ?? null,
      delivery_address: input.delivery_address ?? null,
      idempotency_key: input.idempotency_key ?? null,
    })
    .select('id, store_order_number')
    .single();

  if (orderError || !order) {
    // Unique-index collision on idempotency_key: another request for the same key
    // won the race and already created the order — return that one instead of failing.
    if (orderError?.code === '23505' && input.idempotency_key) {
      const existing = await findOrderByIdempotencyKey(admin, input.idempotency_key);
      if (existing) return existing;
    }
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
  // Tracks items whose stock was actually deducted in this loop, so that if a
  // later item aborts the order we only replenish what we actually took (not
  // the whole order — items after the failure point were never deducted).
  const deductedItems: Array<{ product_id: string | null; variant_id: string | null; quantity: number }> = [];

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
          // Reponer lo que ya se descontó de items previos de este mismo pedido.
          await replenishStockItems(admin, deductedItems);
          // The order is already inserted; mark it cancelled to avoid fulfillment
          await admin
            .from('orders')
            .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
            .eq('id', order.id);
          return { error: 'stock_insufficient', details: [] };
        }
        deductedItems.push({ product_id: null, variant_id: item.variant_id, quantity: item.quantity });
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
        deductedItems.push({ product_id: item.product_id, variant_id: null, quantity: item.quantity });
      }
    }
  }

  // 7. Coupon uses_count timing:
  //   - WhatsApp: counted immediately at creation (existing behavior, preserved).
  //   - Mercado Pago: NOT counted here — counted on payment approval instead, via
  //     confirmOrderOnApproval() → incrementCouponUse() (Ola 2 webhook).
  if (input.coupon_code && channel === 'whatsapp') {
    await incrementCouponUse(order.id);
  }

  // 8. Return order reference + the MP-ready items computed in step 5.1.
  return { order_id: order.id, mp_items, store_order_number: order.store_order_number };
}

// ---------------------------------------------------------------------------
// createPendingOrder internals
// ---------------------------------------------------------------------------

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Asigna el número correlativo de un pedido (Decisión 2). Delegar todo a la
 * RPC `next_order_number` es lo que hace esto atómico bajo concurrencia: es
 * una sola sentencia `UPDATE stores SET order_seq = order_seq + 1 RETURNING
 * order_seq` del lado de Postgres. NO se implementa acá como
 * lectura+escritura (SELECT order_seq, luego UPDATE) porque eso sí tiene
 * carrera entre dos pedidos simultáneos de la misma tienda.
 */
export async function assignOrderNumber(admin: AdminClient, storeId: string): Promise<number | null> {
  const { data, error } = await admin.rpc('next_order_number', { p_store_id: storeId });
  if (error || data == null) {
    console.error('[assignOrderNumber] rpc failed:', error);
    Sentry.captureException(error ?? new Error('next_order_number returned no data'), {
      tags: { feature: 'checkout-persist' },
      extra: { storeId },
    });
    return null;
  }
  return data;
}

/** Idempotency lookup: reconstructs the CreateOrderResult for an order that already exists. */
async function findOrderByIdempotencyKey(
  admin: AdminClient,
  idempotencyKey: string
): Promise<CreateOrderResult | null> {
  const { data } = await admin
    .from('orders')
    .select('id, store_order_number, order_items(product_name, unit_price_cents, quantity)')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (!data) return null;

  return {
    order_id: data.id,
    store_order_number: data.store_order_number,
    mp_items: (data.order_items ?? []).map((i) => ({
      title: i.product_name,
      quantity: i.quantity,
      unit_price: i.unit_price_cents / 100,
      currency_id: 'ARS' as const,
    })),
  };
}

/** Adds `quantity` back to product/variant stock for each item. No-op for infinite-stock (null) items. */
async function replenishStockItems(
  admin: AdminClient,
  items: Array<{ product_id: string | null; variant_id: string | null; quantity: number }>
): Promise<void> {
  for (const item of items) {
    if (item.variant_id) {
      const { data: variant } = await admin
        .from('product_variants')
        .select('stock')
        .eq('id', item.variant_id)
        .maybeSingle();
      if (variant && variant.stock !== null) {
        await admin
          .from('product_variants')
          .update({ stock: variant.stock + item.quantity })
          .eq('id', item.variant_id);
      }
    } else if (item.product_id) {
      const { data: product } = await admin
        .from('products')
        .select('stock')
        .eq('id', item.product_id)
        .maybeSingle();
      if (product && product.stock !== null) {
        await admin
          .from('products')
          .update({ stock: product.stock + item.quantity })
          .eq('id', item.product_id);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// MP order lifecycle helpers (Ola 1 hardening)
//
// These are called by createPendingOrder (WhatsApp path) and are exported for
// the Mercado Pago webhook (Ola 2) to call on payment approval / refund /
// chargeback. Each one is idempotent by re-checking the order's current state
// before acting — no extra "already processed" column is needed.
// ---------------------------------------------------------------------------

/**
 * Replenishes stock for every item of an order. Idempotent: no-ops if the
 * order is already 'cancelled' (assumes stock was replenished when it was).
 * Must be called BEFORE the caller flips the order's status to 'cancelled'.
 */
export async function replenishOrderStock(
  orderId: string
): Promise<{ ok: true; alreadyReplenished: boolean } | { error: 'not_found' }> {
  const admin = createAdminClient();

  const { data: order } = await admin.from('orders').select('id, status').eq('id', orderId).maybeSingle();
  if (!order) return { error: 'not_found' };
  if (order.status === 'cancelled') {
    return { ok: true, alreadyReplenished: true };
  }

  const { data: items } = await admin
    .from('order_items')
    .select('product_id, variant_id, quantity')
    .eq('order_id', orderId);

  await replenishStockItems(admin, items ?? []);
  return { ok: true, alreadyReplenished: false };
}

/**
 * Increments the applied coupon's uses_count for an order. Idempotent via
 * `orders.coupon_counted` (Decisión 3): only acts while that flag is still
 * false, regardless of channel or current status — so this also works when
 * re-counting a reactivated order (cancelled → confirmed, see
 * updateOrderStatus), where status is 'cancelled' at call time, not 'pending'.
 * Must be called BEFORE the caller flips the order's status forward.
 */
export async function incrementCouponUse(
  orderId: string
): Promise<{ ok: true; incremented: boolean } | { error: 'not_found' }> {
  const admin = createAdminClient();

  const { data: order } = await admin
    .from('orders')
    .select('id, store_id, coupon_code, coupon_counted')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) return { error: 'not_found' };
  if (!order.coupon_code || order.coupon_counted) {
    return { ok: true, incremented: false };
  }

  const { data: couponRow } = await admin
    .from('coupons')
    .select('id, uses_count')
    .eq('store_id', order.store_id)
    .eq('code', order.coupon_code)
    .maybeSingle();
  if (!couponRow) return { ok: true, incremented: false };

  await admin
    .from('coupons')
    .update({ uses_count: (couponRow.uses_count ?? 0) + 1 })
    .eq('id', couponRow.id);
  await admin.from('orders').update({ coupon_counted: true }).eq('id', orderId);

  return { ok: true, incremented: true };
}

/**
 * Reverts a previously-counted coupon use for an order. Idempotent via
 * `orders.coupon_counted` (Decisión 3): decides by that flag instead of by
 * `status`, because *cuándo* se cuenta el uso depende del canal (WhatsApp al
 * crear, Mercado Pago al aprobar) mientras que el status no. Agnóstico de
 * canal y de status. Must be called BEFORE the caller flips the order's
 * status to 'cancelled'.
 */
export async function revertCouponUse(
  orderId: string
): Promise<{ ok: true; reverted: boolean } | { error: 'not_found' }> {
  const admin = createAdminClient();

  const { data: order } = await admin
    .from('orders')
    .select('id, store_id, coupon_code, coupon_counted')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) return { error: 'not_found' };
  if (!order.coupon_code || !order.coupon_counted) {
    return { ok: true, reverted: false };
  }

  const { data: couponRow } = await admin
    .from('coupons')
    .select('id, uses_count')
    .eq('store_id', order.store_id)
    .eq('code', order.coupon_code)
    .maybeSingle();
  if (!couponRow) return { ok: true, reverted: false };

  await admin
    .from('coupons')
    .update({ uses_count: Math.max(0, (couponRow.uses_count ?? 0) - 1) })
    .eq('id', couponRow.id);
  await admin.from('orders').update({ coupon_counted: false }).eq('id', orderId);

  return { ok: true, reverted: true };
}

/**
 * Confirms an order on MP payment approval: sets status='confirmed' + confirmed_at,
 * and counts the coupon use. Idempotent: no-ops unless the order is currently 'pending'.
 * Uses the admin client because status/confirmed_at transitions here happen with no
 * authenticated owner session (called from the webhook).
 */
export async function confirmOrderOnApproval(
  orderId: string
): Promise<{ ok: true; alreadyConfirmed: boolean } | { error: 'not_found' }> {
  const admin = createAdminClient();

  const { data: order } = await admin.from('orders').select('id, status').eq('id', orderId).maybeSingle();
  if (!order) return { error: 'not_found' };
  if (order.status !== 'pending') {
    return { ok: true, alreadyConfirmed: true };
  }

  // Count the coupon use while status is still 'pending' in the DB.
  await incrementCouponUse(orderId);

  const { error } = await admin
    .from('orders')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('status', 'pending');

  if (error) {
    console.error('[confirmOrderOnApproval] update failed:', error);
    Sentry.captureException(error, { tags: { feature: 'mp-order-lifecycle' }, extra: { orderId } });
  }

  return { ok: true, alreadyConfirmed: false };
}

/**
 * Reverts an order on MP refund/chargeback: replenishes stock, reverts the
 * coupon use, and sets status='cancelled'. Idempotent — each step no-ops if
 * already applied (see replenishOrderStock / revertCouponUse).
 */
export async function revertOrderOnRefund(
  orderId: string
): Promise<{ ok: true } | { error: 'not_found' }> {
  const admin = createAdminClient();

  const { data: order } = await admin.from('orders').select('id, status').eq('id', orderId).maybeSingle();
  if (!order) return { error: 'not_found' };

  await revertCouponUse(orderId);
  await replenishOrderStock(orderId);

  if (order.status !== 'cancelled') {
    const { error } = await admin
      .from('orders')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', orderId)
      .neq('status', 'cancelled');
    if (error) {
      console.error('[revertOrderOnRefund] update failed:', error);
      Sentry.captureException(error, { tags: { feature: 'mp-order-lifecycle' }, extra: { orderId } });
    }
  }

  return { ok: true };
}

/**
 * Net amount in cents — total minus the applied discount. Shared by
 * getOrderNetAmount (reconciliation contra Mercado Pago) y getOrderStats
 * (ingresos del panel), para que ambos usen la misma fórmula.
 */
function computeNetCents(totalCents: number, discountCents: number | null | undefined): number {
  return totalCents - (discountCents ?? 0);
}

/**
 * Returns the net amount (ARS) expected to have been charged for an order —
 * total minus the applied discount — so the webhook can reconcile it against
 * payment.transaction_amount from Mercado Pago. Returns null if not found.
 */
export async function getOrderNetAmount(orderId: string): Promise<number | null> {
  const admin = createAdminClient();

  const { data: order } = await admin
    .from('orders')
    .select('total_cents, discount_cents')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) return null;

  return computeNetCents(order.total_cents, order.discount_cents) / 100;
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
export type OrderPaymentStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'refunded'
  | 'charged_back'
  | 'in_mediation'
  | 'in_process';

export type { OrderCancelledBy };

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
  cancelled_by: OrderCancelledBy | null;
  channel: OrderChannel;
  payment_status: OrderPaymentStatus;
  store_order_number: number | null;
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
  channel?: OrderChannel | 'all';
  /** 10.4: cutoff del banner de backlog — pedidos creados ANTES de esta fecha ISO. */
  created_before?: string;
  /** 1-based; default 1. */
  page?: number;
};

export type ListOrdersResult = {
  orders: OrderWithItems[];
  total: number;
  page: number;
  pageSize: number;
};

// Tamaño de página fijo (12.2/12.3): el panel pagina sobre esto. No se exporta
// porque este archivo es 'use server' — solo puede exportar funciones async —
// así que listOrders devuelve `pageSize` en su resultado para que el cliente
// lo conozca sin importar la constante.
const ORDERS_PAGE_SIZE = 20;

function mapOrderRow(row: {
  id: string;
  status: string;
  customer_name: string | null;
  total_cents: number;
  currency: string;
  notes: string | null;
  created_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  delivered_at: string | null;
  cancelled_by: string | null;
  channel: string | null;
  payment_status: string | null;
  store_order_number: number | null;
  order_items: unknown;
}): OrderWithItems {
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
    cancelled_by: row.cancelled_by as OrderCancelledBy | null,
    channel: (row.channel ?? 'whatsapp') as OrderChannel,
    payment_status: (row.payment_status ?? 'pending') as OrderPaymentStatus,
    store_order_number: row.store_order_number,
    items: (row.order_items ?? []) as OrderWithItems['items'],
  };
}

// ---------------------------------------------------------------------------
// Consulta filtrada compartida por listOrders y exportOrdersCsv (Decisión 10:
// paginar obliga a mover TODOS los filtros a la consulta — sección, búsqueda,
// canal, estado y rango de fechas — para no filtrar la página en vez del
// conjunto). `page: null` trae el conjunto filtrado completo sin recortar,
// que es lo que necesita la exportación a CSV (12.4).
// ---------------------------------------------------------------------------

async function fetchFilteredOrders(
  admin: AdminClient,
  storeId: string,
  filters: ListOrdersFilters,
  page: number | null
): Promise<{ rows: Parameters<typeof mapOrderRow>[0][]; count: number } | { queryError: unknown }> {
  // La sección vive en order_items, no en orders: se resuelve aparte para no
  // depender de un inner-join embebido que recortaría los items devueltos.
  let sectionOrderIds: string[] | null = null;
  if (filters.section_id) {
    const { data: sectionItems, error: sectionErr } = await admin
      .from('order_items')
      .select('order_id')
      .eq('section_id', filters.section_id);
    if (sectionErr) return { queryError: sectionErr };
    sectionOrderIds = Array.from(
      new Set((sectionItems ?? []).map((r) => r.order_id).filter((id): id is string => !!id))
    );
    if (sectionOrderIds.length === 0) {
      return { rows: [], count: 0 };
    }
  }

  // 6.3/6.4: acepta el número correlativo (match exacto) o la referencia
  // corta de UUID (prefijo) con la que circularon en chats los pedidos
  // anteriores a este change. PostgREST no permite castear una columna
  // dentro de un filtro (uuid no tiene ilike nativo), así que se resuelve
  // en JS sobre id + store_order_number de TODA la tienda (sin paginar,
  // sin traer items) y se aplica como .in(), igual que el filtro de sección.
  let searchOrderIds: string[] | null = null;
  if (filters.search && filters.search.trim() !== '') {
    const cleaned = filters.search.trim().toLowerCase().replace(/^#/, '').replace(/[^a-z0-9]/g, '');
    if (cleaned) {
      const { data: candidateRows, error: candidateErr } = await admin
        .from('orders')
        .select('id, store_order_number')
        .eq('store_id', storeId);
      if (candidateErr) return { queryError: candidateErr };
      const numeric = /^\d+$/.test(cleaned) ? cleaned : null;
      searchOrderIds = (candidateRows ?? [])
        .filter(
          (r) =>
            (numeric !== null && String(r.store_order_number) === numeric) ||
            (r.id as string).toLowerCase().startsWith(cleaned)
        )
        .map((r) => r.id as string);
      if (searchOrderIds.length === 0) {
        return { rows: [], count: 0 };
      }
    }
  }

  let query = admin
    .from('orders')
    .select('*, order_items(*)', { count: 'exact' })
    .eq('store_id', storeId)
    .order('created_at', { ascending: false });

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  }
  if (filters.channel && filters.channel !== 'all') {
    query = query.eq('channel', filters.channel);
  }
  if (filters.date_from) {
    query = query.gte('created_at', filters.date_from);
  }
  if (filters.date_to) {
    query = query.lte('created_at', filters.date_to + ' 23:59:59');
  }
  if (filters.created_before) {
    query = query.lt('created_at', filters.created_before);
  }
  // Antes se encadenaban dos `.in('id', ...)` sobre la misma columna asumiendo
  // que PostgREST los combina con AND — eso nunca se verificó contra un
  // PostgREST real (solo contra el fake de los tests, que sí los ANDea). Acá
  // se calcula la intersección explícitamente en JS y se emite un solo `.in()`.
  let filterOrderIds: string[] | null = null;
  if (sectionOrderIds && searchOrderIds) {
    const searchSet = new Set(searchOrderIds);
    filterOrderIds = sectionOrderIds.filter((id) => searchSet.has(id));
    if (filterOrderIds.length === 0) {
      return { rows: [], count: 0 };
    }
  } else if (sectionOrderIds) {
    filterOrderIds = sectionOrderIds;
  } else if (searchOrderIds) {
    filterOrderIds = searchOrderIds;
  }
  if (filterOrderIds) {
    query = query.in('id', filterOrderIds);
  }

  if (page !== null) {
    query = query.range((page - 1) * ORDERS_PAGE_SIZE, page * ORDERS_PAGE_SIZE - 1);
  }

  const { data, error, count } = await query;
  if (error) return { queryError: error };
  return { rows: (data ?? []) as Parameters<typeof mapOrderRow>[0][], count: count ?? 0 };
}

// ---------------------------------------------------------------------------
// listOrders
// ---------------------------------------------------------------------------

export async function listOrders(filters: ListOrdersFilters): Promise<ListOrdersResult | { error: 'unauthorized' }> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'unauthorized' };

  const admin = createAdminClient();
  const page = Math.max(1, filters.page ?? 1);

  const result = await fetchFilteredOrders(admin, store.id, filters, page);

  if ('queryError' in result) {
    console.error('[listOrders] query failed:', result.queryError);
    Sentry.captureException(result.queryError, {
      tags: { feature: 'orders-dashboard' },
      extra: { storeId: store.id },
    });
    // TODO: surface error to caller — currently returns empty list silently
    return { orders: [], total: 0, page, pageSize: ORDERS_PAGE_SIZE };
  }

  return {
    orders: result.rows.map(mapOrderRow),
    total: result.count,
    page,
    pageSize: ORDERS_PAGE_SIZE,
  };
}

// ---------------------------------------------------------------------------
// getOrderById (12.x deep link: un pedido viejo abierto por enlace directo se
// tiene que poder encontrar aunque no esté en la página actual del listado)
// ---------------------------------------------------------------------------

export async function getOrderById(
  orderId: string
): Promise<{ order: OrderWithItems } | { error: 'unauthorized' | 'not_found' }> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'unauthorized' };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', orderId)
    .eq('store_id', store.id)
    .maybeSingle();

  if (error || !data) return { error: 'not_found' };
  return { order: mapOrderRow(data as Parameters<typeof mapOrderRow>[0]) };
}

// ---------------------------------------------------------------------------
// getBacklogPendingCount (10.4/10.5): pendientes de WhatsApp anteriores a la
// fecha de vigencia de la política de la tienda.
// ---------------------------------------------------------------------------

export async function getBacklogPendingCount(): Promise<
  { count: number; effectiveFrom: string } | { error: 'unauthorized' }
> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'unauthorized' };

  const admin = createAdminClient();
  const { data: storeRow } = await admin
    .from('stores')
    .select('wa_lifecycle_effective_from')
    .eq('id', store.id)
    .maybeSingle();

  const effectiveFrom = storeRow?.wa_lifecycle_effective_from ?? new Date().toISOString();

  const { count } = await admin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', store.id)
    .eq('status', 'pending')
    .eq('channel', 'whatsapp')
    .lt('created_at', effectiveFrom);

  return { count: count ?? 0, effectiveFrom };
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
    .select('id, status, total_cents, discount_cents, created_at')
    .eq('store_id', store.id)
    .gte('created_at', rangeStart.toISOString());

  const allOrders = orders ?? [];

  const totalOrders = allOrders.length;

  const confirmedOrders = allOrders.filter(
    (o) => o.status === 'confirmed' || o.status === 'delivered'
  );

  // top_products y orders_by_section deben contar solo lo que también cuenta
  // como venta en los KPIs: items de pedidos confirmados o entregados.
  const { data: items } = await admin
    .from('order_items')
    .select('order_id, product_name, unit_price_cents, quantity, section_name')
    .in('order_id', confirmedOrders.map((o) => o.id));

  const allItems = items ?? [];

  const revenueCents = confirmedOrders.reduce(
    (s, o) => s + computeNetCents(o.total_cents, o.discount_cents),
    0
  );
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
      dayMap.set(dateKey, (dayMap.get(dateKey) ?? 0) + computeNetCents(o.total_cents, o.discount_cents));
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

  const admin = createAdminClient();
  // 12.4: exporta el conjunto filtrado COMPLETO, no la página visible —
  // por eso pasa page=null en vez de reusar listOrders (que sí pagina).
  const result = await fetchFilteredOrders(admin, store.id, filters, null);
  if ('queryError' in result) {
    console.error('[exportOrdersCsv] query failed:', result.queryError);
    Sentry.captureException(result.queryError, {
      tags: { feature: 'orders-dashboard' },
      extra: { storeId: store.id },
    });
    return { error: 'empty' };
  }

  const orders = result.rows.map(mapOrderRow);
  if (orders.length === 0) return { error: 'empty' };

  const header = ['id', 'store_order_number', 'created_at', 'status', 'customer_name', 'total', 'currency', 'items_count', 'items_summary', 'notes'].join(',');

  const rows = orders.map((order) => {
    const itemsSummary = order.items
      .map((i) => `${i.quantity}x ${i.product_name}`)
      .join(' | ');

    return [
      csvEscape(order.id),
      csvEscape(order.store_order_number != null ? String(order.store_order_number) : ''),
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

/**
 * Vuelve a comprometer stock para cada ítem de un pedido (Decisión 9: revivir
 * un pedido cancelado por el sistema). Si algún ítem no tiene stock
 * suficiente, no deduce nada de ese pedido: repone lo que sí llegó a deducir
 * en este mismo intento y rechaza, dejando el pedido como estaba (4.7).
 */
async function deductOrderStock(
  admin: AdminClient,
  orderId: string
): Promise<{ ok: true } | { error: 'stock_insufficient'; details: StockInsufficientDetail[] }> {
  const { data: items } = await admin
    .from('order_items')
    .select('product_id, product_name, variant_id, quantity')
    .eq('order_id', orderId);

  const deducted: Array<{ product_id: string | null; variant_id: string | null; quantity: number }> = [];

  for (const item of items ?? []) {
    const id = item.variant_id ?? item.product_id;
    if (!id) continue;

    const table: 'products' | 'product_variants' = item.variant_id ? 'product_variants' : 'products';
    const { data: current } = await admin.from(table).select('stock').eq('id', id).maybeSingle();
    const stock = current?.stock ?? null;
    if (stock === null) continue; // sin tracking de stock (infinito) — nada que deducir

    if (item.quantity > stock) {
      await replenishStockItems(admin, deducted);
      return {
        error: 'stock_insufficient',
        details: [{ productId: item.product_id ?? id, productName: item.product_name, requested: item.quantity, available: stock }],
      };
    }

    const { data: updatedRow } = await admin
      .from(table)
      .update({ stock: stock - item.quantity })
      .eq('id', id)
      .gte('stock', item.quantity) // guard: otro proceso pudo consumir stock mientras tanto
      .select('stock');

    if (!updatedRow || updatedRow.length === 0) {
      await replenishStockItems(admin, deducted);
      return {
        error: 'stock_insufficient',
        details: [{ productId: item.product_id ?? id, productName: item.product_name, requested: item.quantity, available: 0 }],
      };
    }

    deducted.push({
      product_id: item.variant_id ? null : id,
      variant_id: item.variant_id ?? null,
      quantity: item.quantity,
    });
  }

  return { ok: true };
}

export async function updateOrderStatus(
  order_id: string,
  next_status: OrderStatus
): Promise<
  | { ok: true; order: OrderWithItems }
  | { error: 'unauthorized' | 'invalid_transition' | 'not_found' }
  | { error: 'stock_insufficient'; details: StockInsufficientDetail[] }
> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'unauthorized' };

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('orders')
    .select('id, status, store_id, cancelled_by')
    .eq('id', order_id)
    .eq('store_id', store.id)
    .maybeSingle();

  if (!existing) return { error: 'not_found' };

  const current = existing.status as OrderStatus;

  // Decisión 9: cancelled → confirmed es la única excepción a ALLOWED_TRANSITIONS,
  // y solo cuando la cancelación fue del sistema (cron por vencimiento). Una
  // cancelación de la dueña sigue siendo terminal.
  const isReactivation = current === 'cancelled' && next_status === 'confirmed';
  if (isReactivation) {
    if (!canReactivateOrder(existing.cancelled_by as OrderCancelledBy | null)) {
      return { error: 'invalid_transition' };
    }
  } else if (!ALLOWED_TRANSITIONS[current].includes(next_status)) {
    return { error: 'invalid_transition' };
  }

  if (isReactivation) {
    // 4.6/4.7: revivir vuelve a comprometer stock y a contabilizar el cupón.
    // Si ya no alcanza el stock, se rechaza acá y el pedido queda como estaba.
    const stockResult = await deductOrderStock(admin, order_id);
    if ('error' in stockResult) {
      return stockResult;
    }
    await incrementCouponUse(order_id);
  }

  // Replenish stock BEFORE flipping the status to 'cancelled' — replenishOrderStock
  // checks the order's current status to stay idempotent, so it must run while
  // the order is still 'pending'/'confirmed' in the DB. revertCouponUse ya no
  // depende del status (Decisión 3), pero se agrupa acá con la misma reversión.
  if (next_status === 'cancelled') {
    await replenishOrderStock(order_id);
    await revertCouponUse(order_id);
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

  // 4.5: toda cancelación disparada desde el panel es de origen 'owner'. Las
  // automáticas ('system') las marca el cron (app/api/cron/expire-orders).
  const cancelledByField = next_status === 'cancelled' ? { cancelled_by: 'owner' as const } : {};

  const { data: updated, error: updateError } = await admin
    .from('orders')
    .update({ status: next_status, ...timestampField, ...cancelledByField })
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
      cancelled_by: updated.cancelled_by as OrderCancelledBy | null,
      channel: (updated.channel ?? 'whatsapp') as OrderChannel,
      payment_status: (updated.payment_status ?? 'pending') as OrderPaymentStatus,
      store_order_number: updated.store_order_number,
      items: (updated.order_items ?? []) as OrderWithItems['items'],
    },
  };
}

// ---------------------------------------------------------------------------
// batchUpdateOrderStatus (grupo 7): confirmación/cancelación en lote con
// resultado parcial. Reusa updateOrderStatus por pedido en vez de reimplementar
// la validación contra ALLOWED_TRANSITIONS ni las reversiones de stock/cupón:
// eso ya vive ahí (Decisión 7 del design).
// ---------------------------------------------------------------------------

export type BatchUpdateOrderStatusResult = {
  updated: OrderWithItems[];
  failed: Array<
    | { order_id: string; reason: 'invalid_transition' | 'not_found' }
    | { order_id: string; reason: 'stock_insufficient'; details: StockInsufficientDetail[] }
  >;
};

export async function batchUpdateOrderStatus(
  orderIds: string[],
  next_status: OrderStatus
): Promise<BatchUpdateOrderStatusResult | { error: 'unauthorized' }> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'unauthorized' };

  const updated: OrderWithItems[] = [];
  const failed: BatchUpdateOrderStatusResult['failed'] = [];

  for (const orderId of orderIds) {
    const result = await updateOrderStatus(orderId, next_status);
    if ('ok' in result) {
      updated.push(result.order);
    } else if (result.error === 'stock_insufficient') {
      failed.push({ order_id: orderId, reason: 'stock_insufficient', details: result.details });
    } else if (result.error === 'unauthorized') {
      // No debería pasar dentro de un lote ya autorizado arriba; se agrupa
      // con 'not_found' para no inventar un motivo fuera del vocabulario del lote.
      failed.push({ order_id: orderId, reason: 'not_found' });
    } else {
      failed.push({ order_id: orderId, reason: result.error });
    }
  }

  return { updated, failed };
}
