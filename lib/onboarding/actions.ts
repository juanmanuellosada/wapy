'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { basicsSchema } from './schemas';
import {
  saveStoreSections,
  deleteStoreSection,
  saveStoreProduct,
  deleteStoreProduct,
  saveStoreLook,
  saveStoreWhatsapp,
  saveLogoUrl,
} from '@/lib/store/actions';

// Re-export pure store actions under the original names so existing wizard components
// that import from here continue to work without changing their import paths.
export {
  saveStoreProduct as saveProduct,
  deleteStoreProduct as removeProduct,
  saveLogoUrl,
};

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

async function requireOwner() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/onboarding');
  return user;
}

async function requireOwnerStore() {
  const user = await requireOwner();
  const admin = createAdminClient();
  const { data: store } = await admin
    .from('stores')
    .select('*')
    .eq('owner_id', user.id)
    .maybeSingle();
  return { user, store };
}

// ---------------------------------------------------------------------------
// Slug availability check (public — no auth required)
// ---------------------------------------------------------------------------

export async function checkSlugAvailable(
  slug: string,
  excludeStoreId?: string
): Promise<{ available: boolean; reason?: 'invalid' | 'reserved' | 'taken' }> {
  const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;
  if (!SLUG_REGEX.test(slug)) {
    return { available: false, reason: 'invalid' };
  }

  const admin = createAdminClient();

  const { data: reserved } = await admin
    .from('reserved_slugs')
    .select('slug')
    .eq('slug', slug)
    .maybeSingle();
  if (reserved) return { available: false, reason: 'reserved' };

  let query = admin.from('stores').select('id').eq('slug', slug);
  if (excludeStoreId) {
    query = query.neq('id', excludeStoreId);
  }
  const { data: existing } = await query.maybeSingle();
  if (existing) return { available: false, reason: 'taken' };

  return { available: true };
}

// ---------------------------------------------------------------------------
// saveBasics — wizard version: INSERT or UPDATE + advances onboarding_step
// ---------------------------------------------------------------------------

type SaveResult = { ok: true; storeId: string } | { error: string };

export async function saveBasics(formData: {
  name: string;
  slug: string;
  description?: string;
}): Promise<SaveResult> {
  const user = await requireOwner();

  const parsed = basicsSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const { name, slug, description } = parsed.data;

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('stores')
    .select('id, slug, onboarding_step')
    .eq('owner_id', user.id)
    .maybeSingle();

  const slugCheck = await checkSlugAvailable(slug, existing?.id);
  if (!slugCheck.available) {
    const msgs = {
      invalid: 'El slug tiene caracteres inválidos.',
      reserved: 'Ese slug está reservado por el sistema.',
      taken: 'Ese slug ya está en uso por otra tienda.',
    };
    return { error: msgs[slugCheck.reason ?? 'invalid'] };
  }

  if (existing) {
    await admin
      .from('stores')
      .update({
        name,
        slug,
        description: description ?? null,
        onboarding_step: Math.max(existing.onboarding_step ?? 0, 1),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    revalidatePath('/onboarding', 'layout');
    return { ok: true, storeId: existing.id };
  }

  const { data: whitelistRow } = await admin
    .from('whitelist')
    .select('plan, trial_ends_at')
    .ilike('email', user.email!)
    .maybeSingle();

  // If the whitelist row already carries a trial_ends_at (manually set by admin),
  // respect it; otherwise default to 14 days from now for new stores post-billing.
  const trialEndsAt =
    whitelistRow?.trial_ends_at ??
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: newStore, error: insertError } = await admin
    .from('stores')
    .insert({
      owner_id: user.id,
      name,
      slug,
      description: description ?? null,
      status: 'draft',
      onboarding_step: 1,
      plan: whitelistRow?.plan ?? 'inicial',
      trial_ends_at: trialEndsAt,
    })
    .select('id')
    .single();

  if (insertError || !newStore) {
    return { error: 'No se pudo crear la tienda. Intentá de nuevo.' };
  }

  revalidatePath('/onboarding', 'layout');
  return { ok: true, storeId: newStore.id };
}

// ---------------------------------------------------------------------------
// saveLook — wizard version: delegates to saveStoreLook + advances onboarding_step
// ---------------------------------------------------------------------------

export async function saveLook(formData: {
  accent_color: string;
  logo_url?: string | null;
}): Promise<SaveResult> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  const result = await saveStoreLook(formData);
  if ('error' in result) return result;

  // Wizard-specific: advance onboarding_step
  const admin = createAdminClient();
  await admin
    .from('stores')
    .update({
      onboarding_step: Math.max(store.onboarding_step, 2),
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id);

  revalidatePath('/onboarding', 'layout');
  return result;
}

// ---------------------------------------------------------------------------
// saveSections — wizard version: delegates CRUD to store action + advances onboarding_step
// ---------------------------------------------------------------------------

type SectionInput = {
  id?: string;
  name: string;
  slug: string;
  position: number;
};

export async function saveSections(formData: {
  sections: SectionInput[];
}): Promise<SaveResult> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  const result = await saveStoreSections(formData);
  if ('error' in result) return result;

  // Wizard-specific: advance onboarding_step
  const admin = createAdminClient();
  await admin
    .from('stores')
    .update({
      onboarding_step: Math.max(store.onboarding_step, 3),
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id);

  revalidatePath('/onboarding', 'layout');
  return result;
}

// ---------------------------------------------------------------------------
// saveWhatsapp — wizard version: delegates to saveStoreWhatsapp + advances onboarding_step
// ---------------------------------------------------------------------------

export async function saveWhatsapp(formData: {
  whatsapp_number: string;
}): Promise<SaveResult> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  const result = await saveStoreWhatsapp(formData);
  if ('error' in result) return result;

  // Wizard-specific: advance onboarding_step
  const admin = createAdminClient();
  await admin
    .from('stores')
    .update({
      onboarding_step: Math.max(store.onboarding_step, 5),
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id);

  revalidatePath('/onboarding', 'layout');
  return result;
}

// ---------------------------------------------------------------------------
// removeSection — delegates to store action (keeps onboarding compat)
// ---------------------------------------------------------------------------

export async function removeSection(sectionId: string): Promise<{ ok: true } | { error: string }> {
  return deleteStoreSection(sectionId);
}

// ---------------------------------------------------------------------------
// advanceProductsStep — wizard-specific
// ---------------------------------------------------------------------------

export async function advanceProductsStep(): Promise<SaveResult> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  const admin = createAdminClient();

  const { data: products } = await admin
    .from('products')
    .select('id')
    .eq('store_id', store.id)
    .eq('is_active', true)
    .limit(1);

  if (!products || products.length === 0) {
    return { error: 'Agregá al menos un producto para continuar.' };
  }

  await admin
    .from('stores')
    .update({
      onboarding_step: Math.max(store.onboarding_step, 4),
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id);

  revalidatePath('/onboarding', 'layout');
  return { ok: true, storeId: store.id };
}

// ---------------------------------------------------------------------------
// Publish store
// ---------------------------------------------------------------------------

type PublishResult =
  | { ok: true }
  | { error: string; details?: string[] };

export async function publishStore(): Promise<PublishResult> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  if (store.status === 'published') {
    redirect('/dashboard');
  }

  const admin = createAdminClient();

  const { data: sections } = await admin
    .from('sections')
    .select('id')
    .eq('store_id', store.id)
    .eq('is_active', true);

  const { data: products } = await admin
    .from('products')
    .select('id')
    .eq('store_id', store.id)
    .eq('is_active', true);

  const details: string[] = [];
  if (!store.name) details.push('Falta el nombre de la tienda.');
  if (!store.slug) details.push('Falta el slug de la tienda.');
  if (!sections || sections.length === 0) details.push('Agregá al menos una sección antes de publicar.');
  if (!products || products.length === 0) details.push('Agregá al menos un producto antes de publicar.');
  if (!store.whatsapp_number) details.push('Agregá el número de WhatsApp antes de publicar.');

  if (details.length > 0) {
    return { error: 'Faltan requisitos para publicar.', details };
  }

  const { error } = await admin
    .from('stores')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
      onboarding_step: 7,
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id);

  if (error) return { error: 'No se pudo publicar la tienda. Intentá de nuevo.' };

  revalidatePath('/onboarding', 'layout');
  revalidatePath('/dashboard');
  return { ok: true };
}
