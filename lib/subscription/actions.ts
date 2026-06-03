'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { preApproval, createSubscriptionPreapproval } from '@/lib/mercadopago';
import type { PlanId } from '@/lib/plans/limits';

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
// subscribeWithCard
//
// Server action that creates a hosted-checkout preapproval (status: "pending")
// via the MP API (without an associated plan). Returns an init_point URL that
// the client uses to redirect the user to the MP-hosted card form.
//
// The free_trial is derived dynamically from the store's trial_ends_at.
//
// Persistence: mp_preapproval_id and mp_subscription_status are NOT written here.
// The webhook handler sets them once the user completes the checkout and MP
// transitions the preapproval to "authorized". The webhook locates the store by
// external_reference (= store.id), so no pre-loaded mp_preapproval_id is needed.
// ---------------------------------------------------------------------------

export async function subscribeWithCard(): Promise<{ ok: true; initPoint: string } | { error: string }> {
  const { user, store } = await requireOwnerStore().catch(() => ({ user: null, store: null }));
  if (!user || !store) return { error: 'No se encontró la tienda.' };

  const planId: PlanId =
    store.plan === 'pro' || store.plan === 'medio' || store.plan === 'inicial'
      ? (store.plan as PlanId)
      : 'inicial';

  const result = await createSubscriptionPreapproval({
    store: {
      id: store.id,
      plan: planId,
      trial_ends_at: store.trial_ends_at,
    },
    payerEmail: user.email ?? '',
  });

  if (!result.ok) {
    return { error: result.error };
  }

  return { ok: true, initPoint: result.initPoint };
}

// ---------------------------------------------------------------------------
// cancelSubscription
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
// setStorePaymentExempt
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
// changePlan
//
// Applies a plan change (upgrade/downgrade) for the store owner.
//
// (a) Updates stores.plan immediately → limits in lib/plans/limits.ts apply at once.
// (b) Creates a new hosted-checkout preapproval (status: "pending") for the
//     destination plan. Returns an init_point URL for the client to redirect.
// (c) The old preapproval will be cancelled by the webhook handler when the new one
//     arrives as "authorized" with a different ID (same external_reference = store_id).
//
// Persistence: mp_preapproval_id is NOT written here — the webhook sets it when
// the user completes the checkout.
// ---------------------------------------------------------------------------

export async function changePlan(
  targetPlan: PlanId
): Promise<{ ok: true; initPoint: string } | { error: string }> {
  const { user, store } = await requireOwnerStore();

  if (store.plan === targetPlan) {
    return { error: `La tienda ya está en el plan ${targetPlan}.` };
  }

  const admin = createAdminClient();

  // (a) Apply new plan limits immediately
  const { error: updatePlanError } = await admin
    .from('stores')
    .update({
      plan: targetPlan,
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id);

  if (updatePlanError) {
    console.error('[subscription/changePlan] DB error updating plan', { updatePlanError });
    return { error: 'No se pudo cambiar el plan. Intentá de nuevo.' };
  }

  revalidatePath('/dashboard');

  // (b) Create new preapproval for the target plan.
  // trial_ends_at is already in the past for a store with billing history,
  // so díasRestantes will be <= 0 → no free_trial → immediate charge.
  const result = await createSubscriptionPreapproval({
    store: {
      id: store.id,
      plan: targetPlan,
      trial_ends_at: store.trial_ends_at,
    },
    payerEmail: user.email ?? '',
  });

  if (!result.ok) {
    // Roll back the plan change to avoid an inconsistent state
    await admin
      .from('stores')
      .update({ plan: store.plan, updated_at: new Date().toISOString() })
      .eq('id', store.id);
    revalidatePath('/dashboard');
    return { error: result.error };
  }

  revalidatePath('/dashboard');
  return { ok: true, initPoint: result.initPoint };
}
