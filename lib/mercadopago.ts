import { MercadoPagoConfig, PreApproval, WebhookSignatureValidator } from 'mercadopago';
import type { PlanId } from '@/lib/plans/limits';

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

// ---------------------------------------------------------------------------
// Plan ID selection
// ---------------------------------------------------------------------------

/**
 * Returns the correct Mercado Pago Preapproval Plan ID based on:
 * - the app plan ('inicial' | 'medio' | 'pro')
 * - whether the store already had a subscription (isReturning)
 *
 * isReturning = true  → plan WITHOUT free trial (mp_preapproval_id is NOT NULL)
 * isReturning = false → plan WITH free trial    (mp_preapproval_id IS NULL)
 */
export function pickPlanId(appPlan: PlanId, isReturning: boolean): string {
  if (appPlan === 'pro') {
    return isReturning
      ? process.env.MP_PREAPPROVAL_PLAN_ID_PRO_RETURNING!
      : process.env.MP_PREAPPROVAL_PLAN_ID_PRO!;
  }
  if (appPlan === 'medio') {
    return isReturning
      ? process.env.MP_PREAPPROVAL_PLAN_ID_MEDIO_RETURNING!
      : process.env.MP_PREAPPROVAL_PLAN_ID_MEDIO!;
  }
  return isReturning
    ? process.env.MP_PREAPPROVAL_PLAN_ID_INICIAL_RETURNING!
    : process.env.MP_PREAPPROVAL_PLAN_ID_INICIAL!;
}
