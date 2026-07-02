export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { replenishOrderStock } from '@/lib/store/orders/actions';

// ---------------------------------------------------------------------------
// GET /api/cron/expire-orders
//
// Mercado Pago orders that the buyer never finishes paying stay 'pending'
// forever, holding stock (decremented at order creation) and skewing stats.
// This cron expires stale MP orders: replenishes their stock and cancels them.
//
// Only touches orders that are channel='mercadopago', payment_status in
// ('pending', 'in_process'), status='pending', and older than EXPIRE_AFTER_HOURS.
// Approved/refunded/charged_back/in_mediation/already-cancelled orders are
// never selected. The coupon on these orders was never counted (counting
// happens on approval), so there's nothing to revert there.
// ---------------------------------------------------------------------------

const EXPIRE_AFTER_HOURS = 24;

export async function GET(req: NextRequest): Promise<NextResponse> {
  // --- Auth: Bearer token from CRON_SECRET ---
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    console.warn('[cron/expire-orders] Unauthorized request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - EXPIRE_AFTER_HOURS * 60 * 60 * 1000).toISOString();

  const { data: candidates, error: selectError } = await admin
    .from('orders')
    .select('id')
    .eq('channel', 'mercadopago')
    .eq('status', 'pending')
    .in('payment_status', ['pending', 'in_process'])
    .lt('created_at', cutoff);

  if (selectError) {
    console.error('[cron/expire-orders] Select failed', { selectError });
    return NextResponse.json({ error: 'Select failed', detail: selectError.message }, { status: 500 });
  }

  let expired = 0;
  let failed = 0;

  for (const { id: orderId } of candidates ?? []) {
    try {
      // Replenish stock BEFORE flipping status to 'cancelled' — replenishOrderStock
      // is idempotent based on the order's current status.
      await replenishOrderStock(orderId);

      const { error: updateError } = await admin
        .from('orders')
        .update({ status: 'cancelled', cancelled_at: now, payment_status: 'cancelled' })
        .eq('id', orderId);

      if (updateError) throw updateError;

      expired += 1;
    } catch (err) {
      failed += 1;
      console.error('[cron/expire-orders] Failed to expire order', { orderId, err });
    }
  }

  const summary = {
    candidates: candidates?.length ?? 0,
    expired,
    failed,
    run_at: now,
  };

  console.info('[cron/expire-orders] Run complete', summary);

  return NextResponse.json(summary);
}
