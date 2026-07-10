import { MercadoPagoConfig, PreApproval, WebhookSignatureValidator } from 'mercadopago';
import type { AutoRecurringWithFreeTrial } from 'mercadopago/dist/clients/preApproval/commonTypes';
import type { PlanId } from '@/lib/plans/limits';
import { PLAN_PRICES } from '@/lib/subscription/plans';

// ---------------------------------------------------------------------------
// Singleton client (server-only, never imported from client components)
// ---------------------------------------------------------------------------

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN!,
});

export const preApproval = new PreApproval(mpClient);

// ---------------------------------------------------------------------------
// Webhook signature verification
// ---------------------------------------------------------------------------

/**
 * Validates the MercadoPago webhook signature.
 * Throws `InvalidWebhookSignatureError` if the signature is invalid.
 *
 * @param xSignature   Value of the `x-signature` header
 * @param xRequestId   Value of the `x-request-id` header
 * @param dataId       Value of the `data.id` query param from the webhook URL
 */
export function verifyWebhookSignature(
  xSignature: string | null,
  xRequestId: string | null,
  dataId: string | null
): void {
  WebhookSignatureValidator.validate({
    xSignature: xSignature ?? undefined,
    xRequestId: xRequestId ?? undefined,
    dataId: dataId ?? undefined,
    secret: process.env.MP_WEBHOOK_SECRET!,
  });
}

/**
 * Validates a MercadoPago webhook signature using a caller-supplied secret.
 * Use this variant when the webhook secret differs from the global MP_WEBHOOK_SECRET
 * (e.g. the orders webhook uses MP_ORDERS_WEBHOOK_SECRET).
 * Throws `InvalidWebhookSignatureError` if the signature is invalid.
 *
 * @param xSignature   Value of the `x-signature` header
 * @param xRequestId   Value of the `x-request-id` header
 * @param dataId       Value of the `data.id` query param from the webhook URL
 * @param secret       Webhook secret to validate against
 */
export function verifyWebhookSignatureWithSecret(
  xSignature: string | null,
  xRequestId: string | null,
  dataId: string | null,
  secret: string
): void {
  WebhookSignatureValidator.validate({
    xSignature: xSignature ?? undefined,
    xRequestId: xRequestId ?? undefined,
    dataId: dataId ?? undefined,
    secret,
  });
}

// ---------------------------------------------------------------------------
// Subscription creation (API without plan, free_trial dinámico)
// ---------------------------------------------------------------------------

export interface CreateSubscriptionPreapprovalParams {
  store: {
    id: string;
    plan: PlanId;
    trial_ends_at: string | null;
  };
  payerEmail: string;
}

export type CreateSubscriptionResult =
  | { ok: true; initPoint: string }
  | { ok: false; error: string };

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

/**
 * Creates a MercadoPago preapproval by API (without an associated plan).
 * The free_trial period is derived dynamically from the store's trial_ends_at.
 *
 * - If díasRestantes >= 1: includes free_trial so the first charge is deferred to the end of trial.
 * - If díasRestantes <= 0: omits free_trial → immediate charge (reactivation after block).
 */
export async function createSubscriptionPreapproval(
  params: CreateSubscriptionPreapprovalParams
): Promise<CreateSubscriptionResult> {
  const { store, payerEmail } = params;

  // Calculate days remaining in the trial (UTC, ceil to favor the subscriber)
  let diasRestantes = 0;
  if (store.trial_ends_at) {
    const trialEnd = new Date(store.trial_ends_at);
    const now = new Date();
    const diffMs = trialEnd.getTime() - now.getTime();
    diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  const autoRecurring: AutoRecurringWithFreeTrial = {
    frequency: 1,
    frequency_type: 'months',
    transaction_amount: PLAN_PRICES[store.plan],
    currency_id: 'ARS',
    ...(diasRestantes >= 1
      ? { free_trial: { frequency: diasRestantes, frequency_type: 'days' } }
      : {}),
  };

  try {
    // notification_url is accepted by the MP API but missing from the SDK's
    // PreApprovalRequest type; extend it here the same way auto_recurring is cast below.
    const body: Parameters<typeof preApproval.create>[0]['body'] & { notification_url: string } = {
      status: 'pending',
      payer_email: payerEmail,
      external_reference: store.id,
      reason: `Wapy — Plan ${store.plan.charAt(0).toUpperCase() + store.plan.slice(1)}`,
      back_url: `${APP_URL}/dashboard`,
      notification_url: `${APP_URL}/api/webhooks/mercadopago`,
      // AutoRecurringWithFreeTrial is a superset of AutoRecurringRequest; cast is safe
      auto_recurring: autoRecurring as Parameters<typeof preApproval.create>[0]['body']['auto_recurring'],
    };

    const response = await preApproval.create({ body });

    // Prefer sandbox_init_point in non-production environments.
    // Cast via unknown because PreApprovalResponse lacks an index signature.
    const r = response as unknown as Record<string, unknown>;
    const initPoint =
      (r.sandbox_init_point as string | undefined) ??
      (r.init_point as string | undefined);

    if (!initPoint) {
      return { ok: false, error: 'MP no devolvió un init_point para el checkout.' };
    }

    return { ok: true, initPoint };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Error al crear la suscripción en MercadoPago.';
    console.error('[mercadopago/createSubscriptionPreapproval] error', { err });
    return { ok: false, error: message };
  }
}
