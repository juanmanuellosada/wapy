export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { replenishOrderStock, incrementCouponUse, revertCouponUse } from '@/lib/store/orders/actions';
import { decideWaOrderExpiry, type WaStoreLifecycleSettings } from '@/lib/store/orders/expiry';

// ---------------------------------------------------------------------------
// GET /api/cron/expire-orders
//
// Applies the pending-order expiration policy to BOTH channels, each with its
// own rule (openspec/changes/fix-whatsapp-order-lifecycle/design.md, decisión 4):
//
//   - mercadopago: unchanged. 24h hardcoded window, always cancels + replenishes
//     stock. The coupon on these orders was never counted (counting happens on
//     approval), so there's nothing to revert.
//   - whatsapp: per-store window (stores.wa_pending_ttl_days), only reaching
//     orders created on/after stores.wa_lifecycle_effective_from (decisión 5 —
//     el backlog previo al release queda intacto). On expiry: cancels
//     (replenishing stock + reverting the coupon) unless the store turned on
//     wa_auto_confirm, in which case it confirms instead (stock stays deducted,
//     coupon gets counted).
//
// Cancellations applied here are origin 'system' and, per decisión 9, are
// reversible from the dashboard (cancelled → confirmed) unlike manual ones.
// ---------------------------------------------------------------------------

const MP_EXPIRE_AFTER_HOURS = 24;

export async function GET(req: NextRequest): Promise<NextResponse> {
  // --- Auth: Bearer token from CRON_SECRET ---
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    console.warn('[cron/expire-orders] Unauthorized request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();

  let cancelled = 0;
  let confirmed = 0;
  let failed = 0;

  // ─── Mercado Pago: 24h fijas, siempre cancela ──────────────────────────────

  const mpCutoff = new Date(now.getTime() - MP_EXPIRE_AFTER_HOURS * 60 * 60 * 1000).toISOString();

  const { data: mpCandidates, error: mpSelectError } = await admin
    .from('orders')
    .select('id')
    .eq('channel', 'mercadopago')
    .eq('status', 'pending')
    .in('payment_status', ['pending', 'in_process'])
    .lt('created_at', mpCutoff);

  if (mpSelectError) {
    console.error('[cron/expire-orders] MP select failed', { mpSelectError });
    return NextResponse.json({ error: 'Select failed', detail: mpSelectError.message }, { status: 500 });
  }

  for (const { id: orderId } of mpCandidates ?? []) {
    try {
      // Replenish BEFORE flipping status — replenishOrderStock is idempotent
      // based on the order's current status.
      await replenishOrderStock(orderId);
      const { error } = await admin
        .from('orders')
        .update({ status: 'cancelled', cancelled_at: nowIso, cancelled_by: 'system', payment_status: 'cancelled' })
        .eq('id', orderId)
        .eq('status', 'pending');
      if (error) throw error;
      cancelled += 1;
    } catch (err) {
      failed += 1;
      console.error('[cron/expire-orders] Failed to expire MP order', { orderId, err });
    }
  }

  // ─── WhatsApp: ventana por tienda, cancela o confirma según wa_auto_confirm ─

  const { data: waCandidates, error: waSelectError } = await admin
    .from('orders')
    .select('id, created_at, stores(wa_pending_ttl_days, wa_auto_confirm, wa_lifecycle_effective_from)')
    .eq('channel', 'whatsapp')
    .eq('status', 'pending');

  if (waSelectError) {
    console.error('[cron/expire-orders] WhatsApp select failed', { waSelectError });
    return NextResponse.json({ error: 'Select failed', detail: waSelectError.message }, { status: 500 });
  }

  for (const order of waCandidates ?? []) {
    const store = order.stores as WaStoreLifecycleSettings | null;
    if (!store) continue; // pedido huérfano — no debería pasar, se salta por seguridad

    const decision = decideWaOrderExpiry(order.created_at, store, now);
    if (decision === 'skip') continue;

    try {
      if (decision === 'confirm') {
        // Stock ya está deducido desde la creación (todos los canales lo hacen ahí);
        // auto-confirmar no lo toca, solo cuenta el cupón y cambia el status.
        await incrementCouponUse(order.id);
        const { error } = await admin
          .from('orders')
          .update({ status: 'confirmed', confirmed_at: nowIso })
          .eq('id', order.id)
          .eq('status', 'pending');
        if (error) throw error;
        confirmed += 1;
      } else {
        await replenishOrderStock(order.id);
        await revertCouponUse(order.id);
        const { error } = await admin
          .from('orders')
          .update({ status: 'cancelled', cancelled_at: nowIso, cancelled_by: 'system' })
          .eq('id', order.id)
          .eq('status', 'pending');
        if (error) throw error;
        cancelled += 1;
      }
    } catch (err) {
      failed += 1;
      console.error('[cron/expire-orders] Failed to expire WhatsApp order', { orderId: order.id, err });
    }
  }

  const summary = {
    mp_candidates: mpCandidates?.length ?? 0,
    wa_evaluated: waCandidates?.length ?? 0,
    cancelled,
    confirmed,
    failed,
    run_at: nowIso,
  };

  console.info('[cron/expire-orders] Run complete', summary);

  return NextResponse.json(summary);
}
