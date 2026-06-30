'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { z } from 'zod';
import {
  basicsSchema,
  lookSchema,
  whatsappSchema,
  socialLinksSchema,
} from '@/lib/onboarding/schemas';
import type { SocialLinks } from '@/lib/store/social-links';
import { getPlanLimits, isUnlimited } from '@/lib/plans/limits';
import type { PlanId } from '@/lib/plans/limits';
import { getStoreMpConnectionStatus } from '@/lib/store/checkout/oauth';
import { getSubscriptionState } from '@/lib/subscription/state';

// Section item schema (without the min-1 array constraint — dashboard can have 0)
const sectionItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'El nombre de la sección es requerido').max(40, 'Máximo 40 caracteres'),
  slug: z.string().min(1),
  position: z.number().int().min(0),
  parent_id: z.string().nullable().optional(),
});

// ---------------------------------------------------------------------------
// Auth guard (shared)
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
  const { data: store } = await admin
    .from('stores')
    .select('*')
    .eq('owner_id', user.id)
    .maybeSingle();
  return { user, store };
}

// ---------------------------------------------------------------------------
// Shared result types
// ---------------------------------------------------------------------------

type SaveResult = { ok: true; storeId: string } | { error: string };

// ---------------------------------------------------------------------------
// saveStoreBasics — UPDATE name + description only. Does NOT touch slug or onboarding_step.
// ---------------------------------------------------------------------------

export async function saveStoreBasics(formData: {
  name: string;
  description?: string;
  social_links?: SocialLinks;
}): Promise<SaveResult> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  // Validate only name + description (no slug here)
  const parsed = basicsSchema
    .pick({ name: true, description: true })
    .safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const { name, description } = parsed.data;

  // Validate social links if provided; normalize empty strings to absent keys
  let social_links: Record<string, string> = {};
  if (formData.social_links) {
    const parsedLinks = socialLinksSchema.safeParse(formData.social_links);
    if (!parsedLinks.success) {
      return { error: parsedLinks.error.issues[0].message };
    }
    for (const [key, val] of Object.entries(parsedLinks.data)) {
      if (val && val !== '') social_links[key] = val;
    }
  }

  const admin = createAdminClient();
  // social_links column not yet in the generated types — cast via `as any` until
  // the user reruns `supabase gen types` after applying migration 020.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin.from('stores') as any)
    .update({
      name,
      description: description ?? null,
      social_links,
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id);

  if (error) return { error: 'No se pudo guardar la información.' };

  revalidatePath('/dashboard', 'layout');
  revalidatePath('/[slug]', 'page');
  return { ok: true, storeId: store.id };
}

// ---------------------------------------------------------------------------
// saveStoreLook — UPDATE theme + logo_url. Does NOT touch onboarding_step.
// ---------------------------------------------------------------------------

export async function saveStoreLook(formData: {
  accent_color: string;
  logo_url?: string | null;
  banner?: { type: 'color' | 'image'; value: string } | null;
}): Promise<SaveResult> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  const parsed = lookSchema.safeParse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { accent_color, logo_url } = parsed.data;

  const existingTheme =
    store.theme && typeof store.theme === 'object' && !Array.isArray(store.theme)
      ? (store.theme as Record<string, unknown>)
      : {};

  const newTheme: Record<string, unknown> = { ...existingTheme, accent_color };
  if (formData.banner !== undefined) {
    if (formData.banner) {
      newTheme.banner = formData.banner;
    } else {
      delete newTheme.banner;
    }
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('stores')
    .update({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      theme: newTheme as any,
      logo_url: logo_url ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id);

  if (error) return { error: 'No se pudo guardar el look.' };

  revalidatePath('/dashboard', 'layout');
  return { ok: true, storeId: store.id };
}

// ---------------------------------------------------------------------------
// saveBannerConfig — UPDATE only theme.banner (called from client after upload/change).
// ---------------------------------------------------------------------------

export async function saveBannerConfig(
  banner: { type: 'color' | 'image'; value: string } | null
): Promise<{ ok: true } | { error: string }> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  const existingTheme =
    store.theme && typeof store.theme === 'object' && !Array.isArray(store.theme)
      ? (store.theme as Record<string, unknown>)
      : {};

  const newTheme: Record<string, unknown> = { ...existingTheme };
  if (banner) {
    newTheme.banner = banner;
  } else {
    delete newTheme.banner;
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('stores')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ theme: newTheme as any, updated_at: new Date().toISOString() })
    .eq('id', store.id);

  if (error) return { error: 'No se pudo guardar el banner.' };

  revalidatePath('/dashboard', 'layout');
  revalidatePath('/[slug]', 'page');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// saveLogoUrl — UPDATE just logo_url (called from client after upload).
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

  revalidatePath('/dashboard', 'layout');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// saveStoreSections — batch UPSERT/delete. Does NOT touch onboarding_step.
// ---------------------------------------------------------------------------

type SectionInput = {
  id?: string;
  name: string;
  slug: string;
  position: number;
  parent_id?: string | null;
};

export async function saveStoreSections(formData: {
  sections: SectionInput[];
}): Promise<SaveResult> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  // Validate each section item individually (no min-1 constraint — dashboard allows 0)
  const sectionsSchema = z.array(sectionItemSchema);
  const parsed = sectionsSchema.safeParse(formData.sections);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const sections = parsed.data;

  // Plan limit: only top-level sections (parent_id == null) count against the limit.
  // Subsections are free — they don't consume slots.
  const storePlan = (store as unknown as { plan: PlanId | null }).plan;
  const sectionLimit = getPlanLimits(storePlan).maxSections;
  const topLevelCount = sections.filter((s) => !s.parent_id).length;
  if (!isUnlimited(sectionLimit) && topLevelCount > sectionLimit) {
    return { error: `Llegaste al límite de tu plan (${sectionLimit} secciones). Pasate a Pro para sumar secciones ilimitadas.` };
  }

  const admin = createAdminClient();

  const { data: existingSections } = await admin
    .from('sections')
    .select('id')
    .eq('store_id', store.id);

  const existingIds = new Set((existingSections ?? []).map((s) => s.id));
  const incomingIds = new Set(sections.filter((s) => s.id).map((s) => s.id!));

  const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
  if (toDelete.length > 0) {
    await admin.from('sections').delete().in('id', toDelete);
  }

  for (const section of sections) {
    if (section.id) {
      await admin
        .from('sections')
        .update({
          name: section.name,
          slug: section.slug,
          position: section.position,
          parent_id: section.parent_id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', section.id)
        .eq('store_id', store.id);
    } else {
      await admin.from('sections').insert({
        store_id: store.id,
        name: section.name,
        slug: section.slug,
        position: section.position,
        parent_id: section.parent_id ?? null,
        is_active: true,
      });
    }
  }

  await admin
    .from('stores')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', store.id);

  revalidatePath('/dashboard', 'layout');
  return { ok: true, storeId: store.id };
}

// ---------------------------------------------------------------------------
// deleteStoreSection — DELETE a single section (FK cascade sets products' section_id to NULL).
// ---------------------------------------------------------------------------

export async function deleteStoreSection(sectionId: string): Promise<{ ok: true } | { error: string }> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('sections')
    .delete()
    .eq('id', sectionId)
    .eq('store_id', store.id);

  if (error) return { error: 'No se pudo borrar la sección.' };

  revalidatePath('/dashboard', 'layout');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// saveStoreProduct — UPSERT single product. Does NOT touch onboarding_step.
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
  min_quantity?: number;
  qty_step?: number;
};

export async function saveStoreProduct(
  product: ProductInput
): Promise<{ ok: true; productId: string } | { error: string }> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  const admin = createAdminClient();

  // Validate image count against plan limit (applies to both create and edit).
  const storePlan = (store as unknown as { plan: PlanId | null }).plan;
  const { maxImagesPerProduct } = getPlanLimits(storePlan);
  if (!isUnlimited(maxImagesPerProduct) && product.image_urls.length > maxImagesPerProduct) {
    return {
      error: `Tu plan permite hasta ${maxImagesPerProduct} imagen${maxImagesPerProduct === 1 ? '' : 'es'} por producto. Pasate a un plan superior para subir más.`,
    };
  }

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
        min_quantity: product.min_quantity ?? 1,
        qty_step: product.qty_step ?? 1,
      })
      .eq('id', product.id)
      .eq('store_id', store.id);

    if (error) return { error: 'No se pudo actualizar el producto.' };

    revalidatePath('/dashboard', 'layout');
    return { ok: true, productId: product.id };
  }

  // Plan limit: only enforce on INSERT (no product.id means new product).
  const productLimit = getPlanLimits(storePlan).maxProducts;
  if (!isUnlimited(productLimit)) {
    const { count } = await admin
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', store.id);
    if ((count ?? 0) >= productLimit) {
      return { error: `Llegaste al límite de tu plan (${productLimit} productos). Pasate a Pro para sumar productos ilimitados.` };
    }
  }

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
      min_quantity: product.min_quantity ?? 1,
      qty_step: product.qty_step ?? 1,
    })
    .select('id')
    .single();

  if (insertError || !newProduct) {
    return { error: 'No se pudo crear el producto.' };
  }

  revalidatePath('/dashboard', 'layout');
  return { ok: true, productId: newProduct.id };
}

// ---------------------------------------------------------------------------
// deleteStoreProduct — DELETE row + remove image files from storage.
// ---------------------------------------------------------------------------

export async function deleteStoreProduct(
  productId: string
): Promise<{ ok: true } | { error: string }> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  const admin = createAdminClient();

  const { data: product } = await admin
    .from('products')
    .select('image_urls')
    .eq('id', productId)
    .eq('store_id', store.id)
    .maybeSingle();

  if (product?.image_urls && product.image_urls.length > 0) {
    const paths = product.image_urls.map((url) => {
      try {
        const u = new URL(url);
        const match = u.pathname.match(/\/product-images\/(.+)$/);
        return match ? match[1] : null;
      } catch {
        return null;
      }
    }).filter((p): p is string => p !== null);

    if (paths.length > 0) {
      try {
        await admin.storage.from('product-images').remove(paths);
      } catch (e) {
        console.warn('[deleteStoreProduct] storage remove failed:', e);
      }
    }
  }

  const { error } = await admin
    .from('products')
    .delete()
    .eq('id', productId)
    .eq('store_id', store.id);

  if (error) return { error: 'No se pudo borrar el producto.' };

  revalidatePath('/dashboard', 'layout');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// duplicateProduct — INSERT a copy of an existing product with "(copia N)" suffix.
// ---------------------------------------------------------------------------

export async function duplicateProduct(
  productId: string
): Promise<{ ok: true; product: { id: string; name: string; section_id: string | null; position: number; is_active: boolean; image_urls: string[]; price_cents: number; stock: number | null; description: string | null; store_id: string; currency: string | null; created_at: string; updated_at: string } } | { error: string }> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  const admin = createAdminClient();

  // Fetch original product (must belong to owner's store)
  const { data: original } = await admin
    .from('products')
    .select('*')
    .eq('id', productId)
    .eq('store_id', store.id)
    .maybeSingle();

  if (!original) return { error: 'Producto no encontrado.' };

  // Plan limit: count existing products before inserting the duplicate.
  const storePlan = (store as unknown as { plan: PlanId | null }).plan;
  const productLimit = getPlanLimits(storePlan).maxProducts;
  if (!isUnlimited(productLimit)) {
    const { count } = await admin
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', store.id);
    if ((count ?? 0) >= productLimit) {
      return { error: `Llegaste al límite de tu plan (${productLimit} productos). Pasate a Pro para sumar productos ilimitados.` };
    }
  }

  // Determine the base name (strip existing "(copia N)" suffix if present)
  const baseName = original.name.replace(/ \(copia(?: \d+)?\)$/, '');

  // Find existing copies to compute next suffix number
  const { data: siblings } = await admin
    .from('products')
    .select('name')
    .eq('store_id', store.id)
    .like('name', `${baseName} (copia%`);

  let copyNumber = 1;
  if (siblings && siblings.length > 0) {
    const numbers = siblings.map((s) => {
      const m = s.name.match(/ \(copia(?: (\d+))?\)$/);
      if (!m) return 0;
      return m[1] ? parseInt(m[1], 10) : 1;
    });
    copyNumber = Math.max(...numbers) + 1;
  }

  const newName = copyNumber === 1 ? `${baseName} (copia)` : `${baseName} (copia ${copyNumber})`;

  // Compute position: MAX(position) in same section + 1
  const { data: maxRow } = await admin
    .from('products')
    .select('position')
    .eq('store_id', store.id)
    .eq('section_id', original.section_id ?? '')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  // If section_id is null, query differently
  let newPosition: number;
  if (original.section_id === null) {
    const { data: maxRowNull } = await admin
      .from('products')
      .select('position')
      .eq('store_id', store.id)
      .is('section_id', null)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    newPosition = (maxRowNull?.position ?? -1) + 1;
  } else {
    newPosition = (maxRow?.position ?? -1) + 1;
  }

  const { data: newProduct, error: insertError } = await admin
    .from('products')
    .insert({
      store_id: store.id,
      name: newName,
      description: original.description,
      price_cents: original.price_cents,
      stock: original.stock,
      section_id: original.section_id,
      image_urls: original.image_urls,
      position: newPosition,
      is_active: false,
      currency: original.currency ?? 'ARS',
      min_quantity: original.min_quantity ?? 1,
      qty_step: original.qty_step ?? 1,
    })
    .select('*')
    .single();

  if (insertError || !newProduct) {
    return { error: 'No se pudo duplicar el producto.' };
  }

  // 3.5 Clone option types, values, variants and join rows atomically.
  // Images are referenced (same URL), not copied in Storage — see D8.
  const { data: originalTypes } = await admin
    .from('product_option_types')
    .select('id, name, position')
    .eq('product_id', productId)
    .order('position', { ascending: true });

  if (originalTypes && originalTypes.length > 0) {
    // Map originalTypeId → newTypeId
    const typeIdMap = new Map<string, string>();

    for (const ot of originalTypes) {
      const { data: newType, error: typeError } = await admin
        .from('product_option_types')
        .insert({ product_id: newProduct.id, name: ot.name, position: ot.position })
        .select('id')
        .single();

      if (typeError || !newType) {
        // Best effort — product was created; return it even if variant clone fails
        console.warn('[duplicateProduct] failed to clone option type:', typeError);
        revalidatePath('/dashboard', 'layout');
        return { ok: true, product: newProduct };
      }

      typeIdMap.set(ot.id, newType.id);
    }

    // Fetch values for all original types
    const { data: originalValues } = await admin
      .from('product_option_values')
      .select('id, option_type_id, value, position')
      .in('option_type_id', originalTypes.map((t) => t.id))
      .order('position', { ascending: true });

    // Map originalValueId → newValueId
    const valueIdMap = new Map<string, string>();

    for (const ov of originalValues ?? []) {
      const newTypeId = typeIdMap.get(ov.option_type_id);
      if (!newTypeId) continue;

      const { data: newValue, error: valueError } = await admin
        .from('product_option_values')
        .insert({ option_type_id: newTypeId, value: ov.value, position: ov.position })
        .select('id')
        .single();

      if (valueError || !newValue) {
        console.warn('[duplicateProduct] failed to clone option value:', valueError);
        continue;
      }

      valueIdMap.set(ov.id, newValue.id);
    }

    // Fetch original variants with their option value joins (exclude soft-deleted)
    const { data: originalVariants } = await admin
      .from('product_variants')
      .select('id, stock, price_override, image_url, position, product_variant_option_values(option_value_id)')
      .eq('product_id', productId)
      .is('deleted_at', null)
      .order('position', { ascending: true });

    for (const ov of originalVariants ?? []) {
      const { data: newVariant, error: variantError } = await admin
        .from('product_variants')
        .insert({
          product_id: newProduct.id,
          stock: ov.stock,
          price_override: ov.price_override,
          image_url: ov.image_url, // same URL — no physical copy per D8
          position: ov.position,
        })
        .select('id')
        .single();

      if (variantError || !newVariant) {
        console.warn('[duplicateProduct] failed to clone variant:', variantError);
        continue;
      }

      // Clone join rows, mapping old value ids to new value ids
      const joinRows = (ov.product_variant_option_values ?? [])
        .map((j: { option_value_id: string }) => {
          const newValueId = valueIdMap.get(j.option_value_id);
          if (!newValueId) return null;
          return { variant_id: newVariant.id, option_value_id: newValueId };
        })
        .filter((r): r is { variant_id: string; option_value_id: string } => r !== null);

      if (joinRows.length > 0) {
        await admin.from('product_variant_option_values').insert(joinRows);
      }
    }
  }

  revalidatePath('/dashboard', 'layout');
  return { ok: true, product: newProduct };
}

// ---------------------------------------------------------------------------
// saveStoreWhatsapp — UPDATE whatsapp_number. Does NOT touch onboarding_step.
// ---------------------------------------------------------------------------

export async function saveStoreWhatsapp(formData: {
  whatsapp_number: string;
}): Promise<SaveResult> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  const parsed = whatsappSchema.safeParse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const admin = createAdminClient();
  const { error } = await admin
    .from('stores')
    .update({
      whatsapp_number: parsed.data.whatsapp_number,
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id);

  if (error) return { error: 'No se pudo guardar el número.' };

  revalidatePath('/dashboard', 'layout');
  return { ok: true, storeId: store.id };
}

// ---------------------------------------------------------------------------
// setCheckoutMode — UPDATE stores.checkout_mode (gated by MP connection).
// ---------------------------------------------------------------------------

export async function setCheckoutMode(
  mode: 'whatsapp' | 'mercadopago'
): Promise<{ ok: true } | { error: string }> {
  if (mode !== 'whatsapp' && mode !== 'mercadopago') {
    return { error: 'Modo de checkout inválido.' };
  }

  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  // Guard: blocked stores cannot change checkout mode
  if (getSubscriptionState(store, new Date()) === 'blocked') {
    return { error: 'Tu suscripción está pausada. Reactivala para cambiar el modo de cobro.' };
  }

  // Gate: the mercadopago mode requires a valid (non-revoked) connection.
  if (mode === 'mercadopago') {
    let status: { connected: boolean; revoked: boolean };
    try {
      status = await getStoreMpConnectionStatus(store.id);
    } catch {
      return { error: 'No se pudo verificar la conexión con Mercado Pago.' };
    }
    if (!status.connected || status.revoked) {
      return { error: 'Conectá tu cuenta de Mercado Pago antes de activar este modo.' };
    }
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('stores')
    .update({ checkout_mode: mode, updated_at: new Date().toISOString() })
    .eq('id', store.id);

  if (error) return { error: 'No se pudo cambiar el modo de checkout.' };

  revalidatePath('/dashboard', 'layout');
  revalidatePath('/[slug]', 'page');
  return { ok: true };
}
