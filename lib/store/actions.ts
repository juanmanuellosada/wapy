'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { z } from 'zod';
import {
  basicsSchema,
  lookSchema,
  whatsappSchema,
} from '@/lib/onboarding/schemas';

// Section item schema (without the min-1 array constraint — dashboard can have 0)
const sectionItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'El nombre de la sección es requerido').max(40, 'Máximo 40 caracteres'),
  slug: z.string().min(1),
  position: z.number().int().min(0),
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

  const admin = createAdminClient();
  const { error } = await admin
    .from('stores')
    .update({
      name,
      description: description ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id);

  if (error) return { error: 'No se pudo guardar la información.' };

  revalidatePath('/dashboard', 'layout');
  return { ok: true, storeId: store.id };
}

// ---------------------------------------------------------------------------
// saveStoreLook — UPDATE theme + logo_url. Does NOT touch onboarding_step.
// ---------------------------------------------------------------------------

export async function saveStoreLook(formData: {
  accent_color: string;
  logo_url?: string | null;
}): Promise<SaveResult> {
  const { store } = await requireOwnerStore();
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
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id);

  if (error) return { error: 'No se pudo guardar el look.' };

  revalidatePath('/dashboard', 'layout');
  return { ok: true, storeId: store.id };
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
};

export async function saveStoreProduct(
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

    revalidatePath('/dashboard', 'layout');
    return { ok: true, productId: product.id };
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
// saveStoreWhatsapp — UPDATE whatsapp_number. Does NOT touch onboarding_step.
// ---------------------------------------------------------------------------

export async function saveStoreWhatsapp(formData: {
  whatsapp_number: string;
}): Promise<SaveResult> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  const parsed = whatsappSchema.safeParse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const normalized = parsed.data.whatsapp_number.replace(/\s/g, '');

  const admin = createAdminClient();
  const { error } = await admin
    .from('stores')
    .update({
      whatsapp_number: normalized,
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id);

  if (error) return { error: 'No se pudo guardar el número.' };

  revalidatePath('/dashboard', 'layout');
  return { ok: true, storeId: store.id };
}
