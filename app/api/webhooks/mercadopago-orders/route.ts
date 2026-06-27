export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignatureWithSecret } from '@/lib/mercadopago';
import { getPayment } from '@/lib/store/checkout/mp-client';
import { createAdminClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// POST /api/webhooks/mercadopago-orders
//
// Receives Mercado Pago payment notifications for store orders.
//
// Design D5: separate from the billing webhook, this is the sole source of
// truth for order payment state. Always re-reads the payment from MP (never
// trusts the notification body or the buyer's redirect).
//
// Store resolution: to call getPayment with the per-store owner token, the
// notification_url must include ?store=<storeId>.
//
// ⚠ DEPENDENCY (Group 4 — createCheckoutPreference in lib/store/checkout/mp-client.ts):
//   The notification_url is currently set to:
//     `${APP_URL}/api/webhooks/mercadopago-orders`
//   It MUST be updated to:
//     `${APP_URL}/api/webhooks/mercadopago-orders?store=${storeId}`
//   Until that change is made, this webhook will log a warning and return 200
//   without effect (MP will retry, which is safe).
// ---------------------------------------------------------------------------

type MpPaymentStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

/**
 * Maps a raw Mercado Pago payment status string to the DB payment_status enum.
 * MP statuses not explicitly handled fall back to 'pending'.
 */
function mapMpStatus(mpStatus: string): MpPaymentStatus {
  switch (mpStatus) {
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'rejected';
    case 'cancelled':
      return 'cancelled';
    default:
      // pending, in_process, authorized, charged_back, refunded → pending
      return 'pending';
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // --- 1. Parse headers and body ---
  const xSignature = req.headers.get('x-signature');
  const xRequestId = req.headers.get('x-request-id');

  // MP sends data.id as a query param on the notification_url; also accept it from body.
  const url = req.nextUrl;
  const dataIdFromQuery = url.searchParams.get('data.id');

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // Body may not be JSON — treat as empty.
  }

  const dataIdFromBody =
    typeof body?.data === 'object' && body.data !== null
      ? String((body.data as Record<string, unknown>).id ?? '')
      : typeof body?.id === 'string' || typeof body?.id === 'number'
        ? String(body.id)
        : null;

  const dataId = dataIdFromQuery ?? dataIdFromBody;

  // --- 2. Verify signature (task 6.3) ---
  // Uses MP_ORDERS_WEBHOOK_SECRET, distinct from MP_WEBHOOK_SECRET (billing).
  const ordersSecret = process.env.MP_ORDERS_WEBHOOK_SECRET;
  if (!ordersSecret) {
    // Misconfiguration — log and fail closed so we don't accept unsigned requests.
    console.error('[webhook/mercadopago-orders] MP_ORDERS_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  try {
    verifyWebhookSignatureWithSecret(xSignature, xRequestId, dataId, ordersSecret);
  } catch {
    console.error('[webhook/mercadopago-orders] Invalid signature', { xRequestId });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // --- 3. Filter by type (task 6.4) ---
  const notificationType = typeof body?.type === 'string' ? body.type : null;
  const notificationAction = typeof body?.action === 'string' ? body.action : null;

  if (notificationType !== 'payment') {
    console.info('[webhook/mercadopago-orders] Ignored notification type', {
      type: notificationType,
      action: notificationAction,
      xRequestId,
    });
    return NextResponse.json({ ok: true });
  }

  // --- 4. Resolve store_id from the notification_url query param (task 6.5) ---
  //
  // We need the store's owner access token to call getPayment. The storeId is
  // passed via ?store=<storeId> in the notification_url set by createCheckoutPreference.
  //
  // See the DEPENDENCY note at the top of this file.
  const storeId = url.searchParams.get('store');
  if (!storeId) {
    console.warn(
      '[webhook/mercadopago-orders] Missing ?store= query param. ' +
        'createCheckoutPreference (lib/store/checkout/mp-client.ts) must set ' +
        'notification_url to include ?store=${storeId}. Acking without effect.',
      { xRequestId }
    );
    return NextResponse.json({ ok: true });
  }

  if (!dataId) {
    console.warn('[webhook/mercadopago-orders] Missing payment id (data.id)', { xRequestId });
    return NextResponse.json({ ok: true });
  }

  // --- 5. Re-read payment from MP (task 6.5 — never trust the body) ---
  let mpPayment: { id: number | null; status: string | null; external_reference: string | null };
  try {
    mpPayment = await getPayment({ storeId, paymentId: dataId });
  } catch (err) {
    console.error('[webhook/mercadopago-orders] Failed to fetch payment from MP', {
      dataId,
      storeId,
      err,
    });
    // Return 200 so MP does not penalize transient failures (e.g. token refresh).
    // MP will retry on its own schedule.
    return NextResponse.json({ ok: true });
  }

  const orderId = mpPayment.external_reference; // external_reference = order.id (set in D4)
  const mpStatus = mpPayment.status;
  // getPayment returns id as number; store as string in the DB (mp_payment_id text).
  const mpPaymentId = mpPayment.id !== null ? mpPayment.id.toString() : null;

  if (!orderId) {
    console.warn('[webhook/mercadopago-orders] Payment has no external_reference', {
      paymentId: dataId,
      storeId,
      xRequestId,
    });
    return NextResponse.json({ ok: true });
  }

  // --- 6. Load order; handle race condition (task 6.7) ---
  const admin = createAdminClient();

  const { data: order, error: orderFetchError } = await admin
    .from('orders')
    .select('id, payment_status')
    .eq('id', orderId)
    .maybeSingle();

  if (orderFetchError) {
    console.error('[webhook/mercadopago-orders] Error reading order', {
      orderId,
      orderFetchError,
    });
    return NextResponse.json({ error: 'DB read error' }, { status: 500 });
  }

  // Race condition: order not yet persisted (D4 ensures the order is created before
  // the preference, but a transient delay is possible). Return 200 → MP retries.
  if (!order) {
    console.warn('[webhook/mercadopago-orders] Order not found (possible race) — will retry', {
      orderId,
      xRequestId,
    });
    return NextResponse.json({ ok: true });
  }

  // --- 7. Map status and idempotent update (task 6.6) ---
  if (!mpStatus) {
    console.warn('[webhook/mercadopago-orders] Payment has no status', {
      paymentId: dataId,
      xRequestId,
    });
    return NextResponse.json({ ok: true });
  }

  const newPaymentStatus = mapMpStatus(mpStatus);

  // Idempotence: only write if the payment_status actually changed.
  if (order.payment_status === newPaymentStatus) {
    console.info('[webhook/mercadopago-orders] No status change — skipping write', {
      orderId,
      paymentStatus: newPaymentStatus,
      xRequestId,
    });
    return NextResponse.json({ ok: true });
  }

  const { error: updateError } = await admin
    .from('orders')
    .update({
      payment_status: newPaymentStatus,
      ...(mpPaymentId ? { mp_payment_id: mpPaymentId } : {}),
    })
    .eq('id', orderId);

  if (updateError) {
    console.error('[webhook/mercadopago-orders] Error updating order', {
      orderId,
      updateError,
    });
    return NextResponse.json({ error: 'DB update error' }, { status: 500 });
  }

  console.info('[webhook/mercadopago-orders] Order updated', {
    orderId,
    storeId,
    paymentId: dataId,
    mpStatus,
    newPaymentStatus,
    xRequestId,
  });

  return NextResponse.json({ ok: true });
}
