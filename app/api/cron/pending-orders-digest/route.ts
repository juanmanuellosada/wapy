export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { sendPendingOrdersDigestEmail } from '@/lib/email';
import { buildOrderDashboardUrl } from '@/lib/store/orders/links';

// ---------------------------------------------------------------------------
// GET /api/cron/pending-orders-digest
//
// WhatsApp orders have no automated confirmation signal — the owner has to
// notice the chat message and confirm manually. This cron sends each store
// with pending WhatsApp orders a single grouped digest email (never one email
// per order) so pendings don't go unnoticed between visits to the panel.
//
// Runs separately from expire-orders (05:00 UTC / 02:00 ART): this one runs
// mid-morning Argentina time, after the owner is likely to be checking email.
//
// Only stores with at least one pending WhatsApp order receive an email —
// absence of a digest is meant to be informative on its own.
// ---------------------------------------------------------------------------

interface PendingOrderRow {
  id: string;
  store_id: string;
  store_order_number: number | null;
  customer_name: string | null;
  total_cents: number;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // --- Auth: Bearer token from CRON_SECRET ---
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    console.warn('[cron/pending-orders-digest] Unauthorized request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: pendingOrders, error: selectError } = await admin
    .from('orders')
    .select('id, store_id, store_order_number, customer_name, total_cents')
    .eq('channel', 'whatsapp')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (selectError) {
    console.error('[cron/pending-orders-digest] Select failed', { selectError });
    return NextResponse.json({ error: 'Select failed', detail: selectError.message }, { status: 500 });
  }

  const ordersByStore = new Map<string, PendingOrderRow[]>();
  for (const order of (pendingOrders ?? []) as PendingOrderRow[]) {
    const bucket = ordersByStore.get(order.store_id);
    if (bucket) bucket.push(order);
    else ordersByStore.set(order.store_id, [order]);
  }

  const storeIds = [...ordersByStore.keys()];
  let sent = 0;
  let failed = 0;
  let skippedNoEmail = 0;

  if (storeIds.length > 0) {
    const { data: stores, error: storesError } = await admin
      .from('stores')
      .select('id, name, owner_id')
      .in('id', storeIds);

    if (storesError) {
      console.error('[cron/pending-orders-digest] Store lookup failed', { storesError });
      return NextResponse.json({ error: 'Store lookup failed', detail: storesError.message }, { status: 500 });
    }

    for (const store of stores ?? []) {
      const orders = ordersByStore.get(store.id) ?? [];
      if (orders.length === 0) continue;

      try {
        const { data: ownerData } = await admin.auth.admin.getUserById(store.owner_id);
        const ownerEmail = ownerData?.user?.email ?? null;

        if (!ownerEmail) {
          skippedNoEmail += 1;
          continue;
        }

        await sendPendingOrdersDigestEmail({
          to: ownerEmail,
          storeName: store.name,
          orders: orders.map((order) => ({
            orderRef: String(order.store_order_number ?? order.id.slice(0, 8)),
            customerName: order.customer_name,
            totalCents: order.total_cents,
            url: buildOrderDashboardUrl(order.id),
          })),
        });

        sent += 1;
      } catch (err) {
        failed += 1;
        console.error('[cron/pending-orders-digest] Failed to send digest', { storeId: store.id, err });
      }
    }
  }

  const summary = {
    stores_with_pending: storeIds.length,
    sent,
    failed,
    skipped_no_email: skippedNoEmail,
    run_at: new Date().toISOString(),
  };

  console.info('[cron/pending-orders-digest] Run complete', summary);

  return NextResponse.json(summary);
}
