'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { checkSlugAvailable } from '@/lib/onboarding/actions';

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

async function requireOwner() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/dashboard');
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
// renameSlug — UPDATE stores.slug. DB trigger archives old slug automatically.
// ---------------------------------------------------------------------------

type RenameSlugResult =
  | { ok: true; oldSlug: string; newSlug: string }
  | { error: string };

export async function renameSlug({ newSlug }: { newSlug: string }): Promise<RenameSlugResult> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  const oldSlug = store.slug;
  if (oldSlug === newSlug) return { error: 'El slug nuevo es igual al actual.' };

  // Re-check availability (defense in depth)
  const check = await checkSlugAvailable(newSlug, store.id);
  if (!check.available) {
    const msgs = {
      invalid: 'El slug tiene caracteres inválidos.',
      reserved: 'Ese slug está reservado por el sistema.',
      taken: 'Ese slug ya está en uso por otra tienda.',
    };
    return { error: msgs[check.reason ?? 'invalid'] };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('stores')
    .update({ slug: newSlug, updated_at: new Date().toISOString() })
    .eq('id', store.id);

  if (error) return { error: 'No se pudo cambiar el slug. Intentá de nuevo.' };

  revalidatePath('/dashboard', 'layout');
  return { ok: true, oldSlug: oldSlug ?? '', newSlug };
}

// ---------------------------------------------------------------------------
// toggleStoreStatus — toggle between 'published' and 'paused' only.
// ---------------------------------------------------------------------------

type ToggleResult = { ok: true; status: 'published' | 'paused' } | { error: string };

export async function toggleStoreStatus(): Promise<ToggleResult> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  if (store.status === 'draft') {
    return { error: 'La tienda está en borrador. Completá el wizard primero.' };
  }

  const newStatus = store.status === 'published' ? 'paused' : 'published';

  const admin = createAdminClient();
  const { error } = await admin
    .from('stores')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', store.id);

  if (error) return { error: 'No se pudo actualizar el estado de la tienda.' };

  revalidatePath('/dashboard', 'layout');
  return { ok: true, status: newStatus };
}

// ---------------------------------------------------------------------------
// deleteStore — delete all storage files + DELETE the store row (cascades).
// ---------------------------------------------------------------------------

type DeleteResult = { ok: true } | { error: string };

export async function deleteStore({ confirmSlug }: { confirmSlug: string }): Promise<DeleteResult> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  if (confirmSlug !== store.slug) {
    return { error: 'El slug de confirmación no coincide. Verificá que lo escribiste exactamente.' };
  }

  const admin = createAdminClient();

  // Remove storage files — best effort, don't block on failure
  try {
    const [productFilesResult, logoFilesResult] = await Promise.all([
      admin.storage.from('product-images').list(store.id),
      admin.storage.from('store-logos').list(store.id),
    ]);

    const productPaths = (productFilesResult.data ?? []).map((f) => `${store.id}/${f.name}`);
    const logoPaths = (logoFilesResult.data ?? []).map((f) => `${store.id}/${f.name}`);

    await Promise.all([
      productPaths.length > 0
        ? admin.storage.from('product-images').remove(productPaths)
        : Promise.resolve(),
      logoPaths.length > 0
        ? admin.storage.from('store-logos').remove(logoPaths)
        : Promise.resolve(),
    ]);
  } catch (e) {
    console.warn('[deleteStore] storage cleanup failed (continuing with DB delete):', e);
  }

  // Delete the store row — FK cascades to sections, products, slug_history
  const { error } = await admin
    .from('stores')
    .delete()
    .eq('id', store.id);

  if (error) return { error: 'No se pudo eliminar la tienda. Intentá de nuevo.' };

  revalidatePath('/dashboard', 'layout');
  // After delete, redirect to onboarding (caller handles this on ok)
  return { ok: true };
}
