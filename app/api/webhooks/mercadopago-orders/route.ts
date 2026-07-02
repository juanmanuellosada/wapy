export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignatureWithSecret } from '@/lib/mercadopago';
import { getPayment, type MpPaymentResult } from '@/lib/store/checkout/mp-client';
import { createAdminClient } from '@/lib/supabase/server';
import {
  confirmOrderOnApproval,
  replenishOrderStock,
  revertOrderOnRefund,
  getOrderNetAmount,
  type OrderPaymentStatus,
} from '@/lib/store/orders/actions';
import { sendOrderApprovedOwnerEmail, sendOrderConfirmedBuyerEmail } from '@/lib/email';

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
// ---------------------------------------------------------------------------

/**
 * Maps a raw Mercado Pago payment status string to the local payment_status enum.
 * Unrecognized statuses fall back to 'in_process' (safer than silently treating
 * an in-flight/unknown state as untouched 'pending').
 */
function mapMpStatus(mpStatus: string): OrderPaymentStatus {
  switch (mpStatus) {
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'rejected';
    case 'cancelled':
      return 'cancelled';
    case 'refunded':
      return 'refunded';
    case 'charged_back':
      return 'charged_back';
    case 'in_mediation':
      return 'in_mediation';
    case 'in_process':
    case 'pending':
    case 'authorized':
      return 'in_process';
    default:
      console.warn('[webhook/mercadopago-orders] Unknown MP payment status', { mpStatus });
      return 'in_process';
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
  let mpPayment: MpPaymentResult;
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

  // --- 6. Load order; handle race condition + cross-store mismatch (task 6.7, #4) ---
  const admin = createAdminClient();

  const { data: order, error: orderFetchError } = await admin
    .from('orders')
    .select('id, status, payment_status')
    .eq('id', orderId)
    .eq('store_id', storeId)
    .maybeSingle();

  if (orderFetchError) {
    console.error('[webhook/mercadopago-orders] Error reading order', {
      orderId,
      orderFetchError,
    });
    return NextResponse.json({ error: 'DB read error' }, { status: 500 });
  }

  // Order not found for this store: either a transient race (D4 ensures the order
  // is created before the preference, but a delay is possible — MP will retry and
  // succeed once it lands) or the payment belongs to a different store than the
  // ?store= param claims. Either way, ack without effect instead of erroring so MP
  // doesn't retry forever on a mismatch it can never resolve.
  if (!order) {
    console.warn(
      '[webhook/mercadopago-orders] Order not found for this store (race or cross-store mismatch) — acking',
      { orderId, storeId, xRequestId }
    );
    return NextResponse.json({ ok: true });
  }

  // --- 7. Map status and idempotent update (task 6.6, #2) ---
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

  // --- 8. Apply side effects for this transition (#3) ---
  // Each helper re-checks the order's current state, so it's safe under webhook
  // retries. They must run BEFORE we write the new local status below, per their
  // own idempotence contract (see lib/store/orders/actions.ts).
  let statusOverride: { status: 'cancelled'; cancelled_at: string } | Record<string, never> = {};

  switch (newPaymentStatus) {
    case 'approved': {
      // Confirms the order + counts the coupon use (no-ops if already confirmed).
      const confirmResult = await confirmOrderOnApproval(orderId);

      // Best-effort email notifications — only on the actual pending→confirmed
      // transition, so webhook retries never resend them. Anything here must
      // never throw out of this block or affect the response below.
      if ('ok' in confirmResult && confirmResult.alreadyConfirmed === false) {
        try {
          const { data: orderDetails } = await admin
            .from('orders')
            .select('id, store_id, customer_email, customer_name, total_cents, discount_cents, coupon_code')
            .eq('id', orderId)
            .maybeSingle();

          if (orderDetails) {
            const [storeResult, itemsResult] = await Promise.all([
              admin.from('stores').select('name, owner_id').eq('id', orderDetails.store_id).maybeSingle(),
              admin
                .from('order_items')
                .select('product_name, quantity, unit_price_cents, variant_label')
                .eq('order_id', orderId),
            ]);

            const store = storeResult.data;
            const storeName = store?.name ?? '';
            const orderItems = (itemsResult.data ?? []).map((item) => ({
              productName: item.product_name,
              quantity: item.quantity,
              variantLabel: item.variant_label,
              unitPriceCents: item.unit_price_cents,
            }));

            let ownerEmail: string | null = null;
            if (store?.owner_id) {
              const { data: ownerData } = await admin.auth.admin.getUserById(store.owner_id);
              ownerEmail = ownerData?.user?.email ?? null;
            }

            const results = await Promise.allSettled([
              ownerEmail
                ? sendOrderApprovedOwnerEmail({
                    to: ownerEmail,
                    storeName,
                    orderRef: orderDetails.id,
                    items: orderItems,
                    totalCents: orderDetails.total_cents,
                  })
                : Promise.resolve(),
              orderDetails.customer_email
                ? sendOrderConfirmedBuyerEmail({
                    to: orderDetails.customer_email,
                    storeName,
                    orderRef: orderDetails.id,
                    items: orderItems,
                    totalCents: orderDetails.total_cents,
                  })
                : Promise.resolve(),
            ]);
            for (const result of results) {
              if (result.status === 'rejected') {
                console.error('[mercadopago-orders webhook] order-approved email send failed:', result.reason);
              }
            }
          }
        } catch (err) {
          console.error('[mercadopago-orders webhook] order-approved email notification failed:', err);
        }
      }
      break;
    }
    case 'rejected':
    case 'cancelled':
      // Coupon was never counted for an unapproved payment, so only stock needs
      // replenishing. replenishOrderStock no-ops once the order is 'cancelled',
      // so flip local status to 'cancelled' right after (idempotent overall).
      await replenishOrderStock(orderId);
      if (order.status !== 'cancelled') {
        statusOverride = { status: 'cancelled', cancelled_at: new Date().toISOString() };
      }
      break;
    case 'refunded':
    case 'charged_back':
      // Reverts the coupon use, replenishes stock, and sets status='cancelled' itself.
      await revertOrderOnRefund(orderId);
      break;
    case 'in_mediation':
    case 'in_process':
      // Payment is in flight or disputed — no stock/coupon effects yet.
      break;
  }

  const { error: updateError } = await admin
    .from('orders')
    .update({
      payment_status: newPaymentStatus,
      ...statusOverride,
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

  // --- 9. Amount reconciliation (#9) — audit only, never blocks the payment ---
  if (newPaymentStatus === 'approved') {
    const netAmount = await getOrderNetAmount(orderId);
    const charged = mpPayment.transaction_amount;
    if (netAmount !== null && charged !== null && Math.abs(charged - netAmount) > 0.01) {
      console.error('[webhook/mercadopago-orders] Amount mismatch on approved payment', {
        orderId,
        storeId,
        expected: netAmount,
        charged,
        xRequestId,
      });
    }
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
