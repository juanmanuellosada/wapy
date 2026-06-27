// server-only — never import this module from client components or the browser.
// Per-store Mercado Pago client helpers for Checkout Pro:
//   - getMpClientForStore: instantiates an SDK client with the owner's access token
//   - createCheckoutPreference: creates a Checkout Pro preference for an order
//   - getPayment: re-reads a payment from MP (used by the orders webhook, Group 6)
import 'server-only';

import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import { getValidMpAccessToken } from './oauth';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Per-store client factory (task 4.1)
// ---------------------------------------------------------------------------

/**
 * Creates a MercadoPagoConfig instance scoped to the given store's owner account.
 * Each call resolves the current (refreshed if needed) access token before
 * building the config. Never reuse a cached instance across requests — token
 * validity is managed by getValidMpAccessToken.
 *
 * Intentionally separate from the global billing client in lib/mercadopago.ts
 * which uses MP_ACCESS_TOKEN (Wapy's own account).
 */
async function getMpClientForStore(storeId: string): Promise<MercadoPagoConfig> {
  const accessToken = await getValidMpAccessToken(storeId);
  return new MercadoPagoConfig({ accessToken });
}

// ---------------------------------------------------------------------------
// Types (task 4.2 input / output)
// ---------------------------------------------------------------------------

/** A single line item as calculated server-side by the caller (Group 5). */
export interface CheckoutItem {
  title: string;
  quantity: number;
  unit_price: number;
  currency_id: string;
}

/** Input for createCheckoutPreference. */
export interface CreateCheckoutPreferenceInput {
  /** Store whose owner's MP account will receive the payment. */
  storeId: string;
  /** Order id — becomes the `external_reference` for webhook correlation. */
  orderId: string;
  /**
   * Store slug used to build back_urls:
   *   {APP_URL}/{slug}/checkout/success|failure|pending
   */
  slug: string;
  /** Pre-calculated items (prices come from the DB, never from the client). */
  items: CheckoutItem[];
}

/** Result returned by createCheckoutPreference. */
export interface CheckoutPreferenceResult {
  /** Unique MP preference identifier. */
  preferenceId: string;
  /** Production Checkout Pro URL — redirect the buyer here. */
  initPoint: string;
  /** Sandbox Checkout Pro URL — available in test environments. */
  sandboxInitPoint?: string;
}

// ---------------------------------------------------------------------------
// createCheckoutPreference (task 4.2)
// ---------------------------------------------------------------------------

/**
 * Creates a Mercado Pago Checkout Pro preference on behalf of the store owner.
 *
 * - Uses the owner's access token (per-store, not the global billing token).
 * - Sets `external_reference = orderId` for webhook correlation.
 * - Sets `back_urls` pointing to `{APP_URL}/{slug}/checkout/success|failure|pending`.
 * - Sets `notification_url` to the orders webhook endpoint.
 * - Sets `auto_return = 'approved'` so MP redirects automatically on success.
 *
 * Items must be pre-calculated server-side by the caller (Group 5); this
 * function does NOT recompute prices from the DB.
 */
export async function createCheckoutPreference(
  input: CreateCheckoutPreferenceInput
): Promise<CheckoutPreferenceResult> {
  const { storeId, orderId, slug, items } = input;

  const client = await getMpClientForStore(storeId);
  const preference = new Preference(client);

  const baseUrl = `${APP_URL}/${slug}/checkout`;

  const response = await preference.create({
    body: {
      external_reference: orderId,
      items: items.map((item, i) => ({
        id: `item-${i + 1}`,
        title: item.title,
        quantity: item.quantity,
        unit_price: item.unit_price,
        currency_id: item.currency_id,
      })),
      back_urls: {
        success: `${baseUrl}/success`,
        failure: `${baseUrl}/failure`,
        pending: `${baseUrl}/pending`,
      },
      auto_return: 'approved',
      notification_url: `${APP_URL}/api/webhooks/mercadopago-orders?store=${storeId}`,
    },
  });

  if (!response.id || !response.init_point) {
    throw new Error(
      `[mp-client] MP did not return a preference id or init_point for order ${orderId}.`
    );
  }

  return {
    preferenceId: response.id,
    initPoint: response.init_point,
    ...(response.sandbox_init_point
      ? { sandboxInitPoint: response.sandbox_init_point }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Types (task 4.3 input / output)
// ---------------------------------------------------------------------------

/** Input for getPayment. */
export interface GetPaymentInput {
  /** Store whose owner's MP token is used to read the payment. */
  storeId: string;
  /** MP payment identifier (from the webhook notification body). */
  paymentId: string | number;
}

/** Subset of the MP payment resource needed by the orders webhook (Group 6). */
export interface MpPaymentResult {
  /** Numeric MP payment id. Convert to string when storing in the DB. */
  id: number | null;
  status: string | null;
  external_reference: string | null;
}

// ---------------------------------------------------------------------------
// getPayment (task 4.3)
// ---------------------------------------------------------------------------

/**
 * Re-reads a payment from Mercado Pago using the store owner's access token.
 *
 * Used by the orders webhook (Group 6) to get the authoritative payment status.
 * Never trusts the webhook body directly — always re-reads from MP.
 *
 * Returns at minimum: id, status, external_reference (sufficient for the
 * webhook to correlate and update the order).
 */
export async function getPayment(input: GetPaymentInput): Promise<MpPaymentResult> {
  const { storeId, paymentId } = input;

  const client = await getMpClientForStore(storeId);
  const paymentClient = new Payment(client);

  const response = await paymentClient.get({ id: paymentId });

  return {
    id: response.id !== undefined ? response.id : null,
    status: response.status ?? null,
    external_reference: response.external_reference ?? null,
  };
}
