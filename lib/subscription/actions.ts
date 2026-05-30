'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { preApproval, pickPlanId } from '@/lib/mercadopago';
import type { PlanId } from '@/lib/plans/limits';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Internal auth helpers (same pattern as lib/onboarding/actions.ts)
// ---------------------------------------------------------------------------

async function requireOwner() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return user;
}

async function requireOwnerStore() {
  const user = await requireOwner();
  const admin = createAdminClient();
  const { data: store, error } = await admin
    .from('stores')
    .select('*')
    .eq('owner_id', user.id)
    .maybeSingle();
  if (error || !store) throw new Error('Store not found');
  return { user, store };
}

async function requireSuperadmin() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('UNAUTHORIZED');
  const admin = createAdminClient();
  const { data: row } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (row?.role !== 'superadmin') throw new Error('FORBIDDEN');
  return { user };
}

// ---------------------------------------------------------------------------
// 6.1 getMyCheckoutUrl
//
// Generates a MercadoPago hosted checkout URL for the owner's store.
// Decision 10: Works even when the store is exempt (lets owner link real payment
// without losing the exemption — payment_exempt is only changed by superadmin).
// Decision 2: Uses trial plan if no prior subscription, returning plan otherwise.
// ---------------------------------------------------------------------------

export async function getMyCheckoutUrl(plan?: PlanId): Promise<{ url: string } | { error: string }> {
  const { store } = await requireOwnerStore().catch(() => ({ store: null }));
  if (!store) return { error: 'No se encontró la tienda.' };

  const appPlan: PlanId =
    plan ?? (store.plan === 'pro' || store.plan === 'inicial' ? (store.plan as PlanId) : 'inicial');

  // isReturning = has had a subscription before (Decision 2)
  const isReturning = store.mp_preapproval_id !== null;

  const planId = pickPlanId(appPlan, isReturning);

  const params = new URLSearchParams({
    preapproval_plan_id: planId,
    external_reference: store.id,
    back_url: `${APP_URL}/dashboard/subscription`,
  });

  const url = `https://www.mercadopago.com.ar/subscriptions/checkout?${params.toString()}`;

  return { url };
}

// ---------------------------------------------------------------------------
// 6.2 cancelSubscription
//
// Cancels the store owner's MercadoPago preapproval.
// The actual state change is reflected once the webhook arrives — we do NOT
// set blocked_at or mp_subscription_status here. (Decision 4)
// ---------------------------------------------------------------------------

export async function cancelSubscription(): Promise<{ ok: true } | { error: string }> {
  const { store } = await requireOwnerStore();

  if (!store.mp_preapproval_id) {
    return { error: 'No hay suscripción activa para cancelar.' };
  }

  try {
    await preApproval.update({
      id: store.mp_preapproval_id,
      body: { status: 'cancelled' },
    });
  } catch (err) {
    console.error('[subscription/cancelSubscription] MP error', { err });
    return { error: 'No se pudo cancelar la suscripción. Intentá de nuevo.' };
  }

  // State will be updated by the incoming webhook — no local write needed here.
  revalidatePath('/dashboard/subscription');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 6.3 setStorePaymentExempt
//
// Superadmin-only: sets or clears payment exemption on any store.
// Decision 10: Setting exempt = true does NOT change blocked_at (still owned by cron).
// Setting exempt = false leaves blocked_at as-is; cron will evaluate on next run.
// ---------------------------------------------------------------------------

export async function setStorePaymentExempt(
  storeId: string,
  exempt: boolean,
  reason: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireSuperadmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'FORBIDDEN';
    return { error: msg };
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from('stores')
    .update({
      payment_exempt: exempt,
      payment_exempt_reason: exempt ? reason : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', storeId);

  if (error) {
    console.error('[subscription/setStorePaymentExempt] DB error', { error });
    return { error: 'No se pudo actualizar la exención.' };
  }

  revalidatePath('/admin');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 6.4 changePlan
//
// Applies a plan change (upgrade/downgrade) for the store owner.
//
// Decision 9:
//   (a) Updates stores.plan immediately → limits in lib/plans/limits.ts apply at once.
//   (b) Returns the checkout URL for the destination MP plan (always "returning",
//       no trial, since the store already has a subscription history).
//
// When the new subscription is authorized, the webhook will update mp_preapproval_id
// to the new one. The old preapproval is automatically cancelled by the webhook handler
// (v2): when a new preapproval with the same external_reference (= store_id) arrives as
// "authorized" and its ID differs from the stored mp_preapproval_id, the webhook cancels
// the old one before writing the new ID to the DB. See app/api/webhooks/mercadopago/route.ts.
// ---------------------------------------------------------------------------

export async function changePlan(targetPlan: PlanId): Promise<{ url: string } | { error: string }> {
  const { store } = await requireOwnerStore();

  if (store.plan === targetPlan) {
    return { error: `La tienda ya está en el plan ${targetPlan}.` };
  }

  const admin = createAdminClient();

  // (a) Apply new plan limits immediately
  const { error: updateError } = await admin
    .from('stores')
    .update({
      plan: targetPlan,
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id);

  if (updateError) {
    console.error('[subscription/changePlan] DB error', { updateError });
    return { error: 'No se pudo cambiar el plan. Intentá de nuevo.' };
  }

  revalidatePath('/dashboard');

  // (b) Return checkout URL for the target plan
  // Always "returning" (no trial) because the store already has billing history.
  const planId = pickPlanId(targetPlan, true);

  const params = new URLSearchParams({
    preapproval_plan_id: planId,
    external_reference: store.id,
    back_url: `${APP_URL}/dashboard/subscription`,
  });

  const url = `https://www.mercadopago.com.ar/subscriptions/checkout?${params.toString()}`;

  return { url };
}
