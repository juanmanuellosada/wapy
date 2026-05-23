'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import {
  basicsSchema,
  lookSchema,
  sectionsSchema,
  productsSchema,
  whatsappSchema,
} from './schemas';

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

  // Check reserved_slugs
  const { data: reserved } = await admin
    .from('reserved_slugs')
    .select('slug')
    .eq('slug', slug)
    .maybeSingle();
  if (reserved) return { available: false, reason: 'reserved' };

  // Check existing stores
  let query = admin.from('stores').select('id').eq('slug', slug);
  if (excludeStoreId) {
    query = query.neq('id', excludeStoreId);
  }
  const { data: existing } = await query.maybeSingle();
  if (existing) return { available: false, reason: 'taken' };

  return { available: true };
}

// ---------------------------------------------------------------------------
// Save basics (INSERT or UPDATE)
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

  // Check if store already exists for this owner
  const { data: existing } = await admin
    .from('stores')
    .select('id, slug, onboarding_step')
    .eq('owner_id', user.id)
    .maybeSingle();

  // Check slug availability (exclude own store if updating)
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
    // Read existing theme to merge description in
    const { data: existingStore } = await admin
      .from('stores')
      .select('theme')
      .eq('id', existing.id)
      .maybeSingle();

    const existingTheme =
      existingStore?.theme && typeof existingStore.theme === 'object' && !Array.isArray(existingStore.theme)
        ? (existingStore.theme as Record<string, unknown>)
        : {};

    await admin
      .from('stores')
      .update({
        name,
        slug,
        theme: { ...existingTheme, description: description ?? null },
        onboarding_step: Math.max(existing.onboarding_step ?? 0, 1),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    revalidatePath('/onboarding', 'layout');
    return { ok: true, storeId: existing.id };
  }

  // INSERT new store
  const { data: newStore, error: insertError } = await admin
    .from('stores')
    .insert({
      owner_id: user.id,
      name,
      slug,
      status: 'draft',
      onboarding_step: 1,
      theme: { description: description ?? null },
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
// Save look
// ---------------------------------------------------------------------------

export async function saveLook(formData: {
  accent_color: string;
  logo_url?: string | null;
}): Promise<SaveResult> {
  const { user, store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  const parsed = lookSchema.safeParse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { accent_color, logo_url } = parsed.data;

  const admin = createAdminClient();
  const { error } = await admin
    .from('stores')
    .update({
      theme: { accent_color },
      logo_url: logo_url ?? null,
      onboarding_step: Math.max(store.onboarding_step, 2),
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id);

  if (error) return { error: 'No se pudo guardar el look.' };

  revalidatePath('/onboarding', 'layout');
  return { ok: true, storeId: store.id };
}

// ---------------------------------------------------------------------------
// Save logo URL (called from client after upload, updates just logo_url)
// ---------------------------------------------------------------------------

export async function saveLogoUrl(logoUrl: string | null): Promise<{ ok: true } | { error: string }> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('stores')
    .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
    .eq('id', store.id);

  if (error) return { error: 'No se pudo guardar el logo.' };
  revalidatePath('/onboarding', 'layout');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Save sections
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
  const { user, store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  const parsed = sectionsSchema.safeParse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { sections } = parsed.data;

  const admin = createAdminClient();

  // Get existing section IDs for this store
  const { data: existingSections } = await admin
    .from('sections')
    .select('id')
    .eq('store_id', store.id);

  const existingIds = new Set((existingSections ?? []).map((s) => s.id));
  const incomingIds = new Set(sections.filter((s) => s.id).map((s) => s.id!));

  // Delete removed sections
  const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
  if (toDelete.length > 0) {
    await admin.from('sections').delete().in('id', toDelete);
  }

  // Upsert all sections
  for (const section of sections) {
    if (section.id) {
      await admin
        .from('sections')
        .update({
          name: section.name,
          slug: section.slug,
          position: section.position,
          updated_at: new Date().toISOString(),
        })
        .eq('id', section.id)
        .eq('store_id', store.id); // extra safety
    } else {
      await admin.from('sections').insert({
        store_id: store.id,
        name: section.name,
        slug: section.slug,
        position: section.position,
        is_active: true,
      });
    }
  }

  await admin
    .from('stores')
    .update({
      onboarding_step: Math.max(store.onboarding_step, 3),
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id);

  revalidatePath('/onboarding', 'layout');
  return { ok: true, storeId: store.id };
}

// ---------------------------------------------------------------------------
// Remove section
// ---------------------------------------------------------------------------

export async function removeSection(sectionId: string): Promise<{ ok: true } | { error: string }> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  const admin = createAdminClient();
  // FK ON DELETE SET NULL handles products with this section_id
  const { error } = await admin
    .from('sections')
    .delete()
    .eq('id', sectionId)
    .eq('store_id', store.id);

  if (error) return { error: 'No se pudo borrar la sección.' };
  revalidatePath('/onboarding', 'layout');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Save product (upsert single product immediately)
// ---------------------------------------------------------------------------

type ProductInput = {
  id?: string;
  name: string;
  description?: string | null;
  price_cents: number;
  stock?: number | null;
  section_id?: string | null;
  image_urls: string[];
  position: number;
  is_active?: boolean;
};

export async function saveProduct(
  product: ProductInput
): Promise<{ ok: true; productId: string } | { error: string }> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  const admin = createAdminClient();

  if (product.id) {
    const { error } = await admin
      .from('products')
      .update({
        name: product.name,
        description: product.description ?? null,
        price_cents: product.price_cents,
        stock: product.stock ?? null,
        section_id: product.section_id ?? null,
        image_urls: product.image_urls,
        position: product.position,
        is_active: product.is_active ?? true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', product.id)
      .eq('store_id', store.id);

    if (error) return { error: 'No se pudo actualizar el producto.' };
    revalidatePath('/onboarding', 'layout');
    return { ok: true, productId: product.id };
  }

  // INSERT
  const { data: newProduct, error: insertError } = await admin
    .from('products')
    .insert({
      store_id: store.id,
      name: product.name,
      description: product.description ?? null,
      price_cents: product.price_cents,
      stock: product.stock ?? null,
      section_id: product.section_id ?? null,
      image_urls: product.image_urls,
      position: product.position,
      is_active: true,
      currency: 'ARS',
    })
    .select('id')
    .single();

  if (insertError || !newProduct) {
    return { error: 'No se pudo crear el producto.' };
  }

  revalidatePath('/onboarding', 'layout');
  return { ok: true, productId: newProduct.id };
}

// ---------------------------------------------------------------------------
// Advance products step (after user clicks Siguiente on products step)
// ---------------------------------------------------------------------------

export async function advanceProductsStep(): Promise<SaveResult> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  const admin = createAdminClient();

  // Verify at least 1 active product
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
// Remove product
// ---------------------------------------------------------------------------

export async function removeProduct(
  productId: string
): Promise<{ ok: true } | { error: string }> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  const admin = createAdminClient();

  // Get image URLs before deleting
  const { data: product } = await admin
    .from('products')
    .select('image_urls')
    .eq('id', productId)
    .eq('store_id', store.id)
    .maybeSingle();

  if (product?.image_urls && product.image_urls.length > 0) {
    // Extract paths from URLs and delete from storage
    const paths = product.image_urls.map((url) => {
      try {
        const u = new URL(url);
        // URL format: .../storage/v1/object/public/product-images/{path}
        const match = u.pathname.match(/\/product-images\/(.+)$/);
        return match ? match[1] : null;
      } catch {
        return null;
      }
    }).filter((p): p is string => p !== null);

    if (paths.length > 0) {
      // Best-effort: log failures but don't block delete
      try {
        await admin.storage.from('product-images').remove(paths);
      } catch (e) {
        console.warn('[removeProduct] storage remove failed:', e);
      }
    }
  }

  const { error } = await admin
    .from('products')
    .delete()
    .eq('id', productId)
    .eq('store_id', store.id);

  if (error) return { error: 'No se pudo borrar el producto.' };

  revalidatePath('/onboarding', 'layout');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Save WhatsApp
// ---------------------------------------------------------------------------

export async function saveWhatsapp(formData: {
  whatsapp_number: string;
}): Promise<SaveResult> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  const parsed = whatsappSchema.safeParse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Normalize: strip spaces
  const normalized = parsed.data.whatsapp_number.replace(/\s/g, '');

  const admin = createAdminClient();
  const { error } = await admin
    .from('stores')
    .update({
      whatsapp_number: normalized,
      onboarding_step: Math.max(store.onboarding_step, 5),
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id);

  if (error) return { error: 'No se pudo guardar el número.' };

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

  // Already published — no-op
  if (store.status === 'published') {
    redirect('/dashboard');
  }

  const admin = createAdminClient();

  // Re-validate from DB
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
  redirect('/dashboard');
}
