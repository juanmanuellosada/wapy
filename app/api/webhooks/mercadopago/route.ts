export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { preApproval, verifyWebhookSignature } from '@/lib/mercadopago';
import { createAdminClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// POST /api/webhooks/mercadopago
//
// Receives Mercado Pago subscription notifications.
// Decision 4: The webhook never BLOCKS (never sets blocked_at to a timestamp),
// but it DOES unblock: when the re-read preapproval is 'authorized', it clears
// blocked_at to NULL (fix-subscription-auto-unblock).
// Decision 5: Always re-reads the preapproval from MP (never trust the body).
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  // --- 1. Validate webhook signature ---
  const xSignature = req.headers.get('x-signature');
  const xRequestId = req.headers.get('x-request-id');

  // data.id can come as a query param (standard) or in the body (compatibility)
  const url = new URL(req.url);
  const dataIdFromQuery = url.searchParams.get('data.id');

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // Body may not be JSON — treat as empty
  }

  const dataIdFromBody =
    typeof body?.data === 'object' && body.data !== null
      ? String((body.data as Record<string, unknown>).id ?? '')
      : typeof body?.id === 'string' || typeof body?.id === 'number'
        ? String(body.id)
        : null;

  const dataId = dataIdFromQuery ?? dataIdFromBody;

  try {
    verifyWebhookSignature(xSignature, xRequestId, dataId);
  } catch {
    console.error('[webhook/mercadopago] Invalid signature', { xRequestId });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // --- 2. Identify the notification type ---
  // MP sends:
  //   type = "subscription_preapproval" → data.id IS the preapproval ID
  //   type = "subscription_authorized_payment" → data.id IS a payment ID, not a preapproval
  // For authorized_payment we don't have a direct preapproval id in the webhook,
  // so we skip writing (ack 200) — the preapproval state was already updated by
  // the subscription_preapproval notification. See Decision 4.
  const notificationType =
    typeof body?.type === 'string' ? body.type : null;
  const notificationAction =
    typeof body?.action === 'string' ? body.action : null;

  if (
    notificationType !== null &&
    notificationType !== 'subscription_preapproval'
  ) {
    // Not a preapproval notification (could be payment, test, etc.) — ack without writing
    console.info('[webhook/mercadopago] Ignored notification type', {
      type: notificationType,
      action: notificationAction,
      xRequestId,
    });
    return NextResponse.json({ ok: true });
  }

  if (!dataId) {
    // No preapproval id resolvable — ack without writing
    console.warn('[webhook/mercadopago] Missing data.id — acking without write', {
      type: notificationType,
      xRequestId,
    });
    return NextResponse.json({ ok: true });
  }

  // --- 3. Re-read the preapproval from MP (Decision 5: never trust the body) ---
  let preapprovalData: {
    id?: string | null;
    status?: string | null;
    external_reference?: string | null;
  };
  try {
    preapprovalData = await preApproval.get({ id: dataId });
  } catch (err) {
    console.error('[webhook/mercadopago] Failed to fetch preapproval from MP', {
      dataId,
      err,
    });
    return NextResponse.json({ error: 'Failed to fetch preapproval' }, { status: 502 });
  }

  const preapprovalId = preapprovalData?.id ?? null;
  const mpStatus = preapprovalData?.status ?? null;
  const externalReference = preapprovalData?.external_reference ?? null;

  if (!externalReference) {
    // No external_reference means we can't identify which store this belongs to — ack
    console.warn('[webhook/mercadopago] No external_reference on preapproval', {
      preapprovalId,
      mpStatus,
      xRequestId,
    });
    return NextResponse.json({ ok: true });
  }

  // external_reference = store_id
  const storeId = externalReference;

  // --- 4. Idempotent upsert (Decision 5) ---
  // Read the current status to decide whether subscription_status_changed_at should advance
  const admin = createAdminClient();

  const { data: currentStore, error: fetchError } = await admin
    .from('stores')
    .select('mp_subscription_status, mp_preapproval_id')
    .eq('id', storeId)
    .maybeSingle();

  if (fetchError) {
    console.error('[webhook/mercadopago] Error reading current store status', {
      storeId,
      fetchError,
    });
    return NextResponse.json({ error: 'DB read error' }, { status: 500 });
  }

  if (!currentStore) {
    // Store not found — possibly stale external_reference — ack without writing
    console.warn('[webhook/mercadopago] Store not found for external_reference', {
      storeId,
      preapprovalId,
    });
    return NextResponse.json({ ok: true });
  }

  // --- 4b. Cancel superseded preapproval (v2) ---
  // When a new preapproval is authorized and it differs from the stored one,
  // cancel the old one to avoid double-billing (e.g. after a plan change or reactivation).
  // Non-fatal: if cancellation fails (e.g. already cancelled) we log and continue.
  if (
    mpStatus === 'authorized' &&
    currentStore.mp_preapproval_id &&
    currentStore.mp_preapproval_id !== preapprovalId
  ) {
    try {
      await preApproval.update({ id: currentStore.mp_preapproval_id, body: { status: 'cancelled' } });
      console.info('[webhook/mp] Cancelled superseded preapproval', {
        old: currentStore.mp_preapproval_id,
        new: preapprovalId,
        storeId,
      });
    } catch (err) {
      console.error('[webhook/mp] failed to cancel superseded preapproval', {
        old: currentStore.mp_preapproval_id,
        err,
      });
      // non-fatal: continue with DB update
    }
  }

  // Only advance subscription_status_changed_at when the status actually changes
  const statusChanged = currentStore.mp_subscription_status !== mpStatus;
  const now = new Date().toISOString();

  // NEVER block from the webhook (Decision 4). But DO unblock when the
  // re-read preapproval is authorized — a confirmed payment is safe to trust.
  const { error: updateError } = await admin
    .from('stores')
    .update({
      mp_preapproval_id: preapprovalId,
      mp_subscription_status: mpStatus,
      updated_at: now,
      ...(statusChanged ? { subscription_status_changed_at: now } : {}),
      ...(mpStatus === 'authorized' ? { blocked_at: null } : {}),
    })
    .eq('id', storeId);

  if (updateError) {
    console.error('[webhook/mercadopago] Error updating store', {
      storeId,
      updateError,
    });
    return NextResponse.json({ error: 'DB update error' }, { status: 500 });
  }

  console.info('[webhook/mercadopago] Store updated', {
    storeId,
    preapprovalId,
    mpStatus,
    statusChanged,
    xRequestId,
  });

  return NextResponse.json({ ok: true });
}
