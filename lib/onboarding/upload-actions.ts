'use server';

import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { MAX_SIZE_BYTES, validateLogoFile, validateProductImageFile } from './storage';

type LogoUploadResult =
  | { ok: true; url: string }
  | { ok: false; error: 'unauthorized' | 'not_owner' | 'invalid_file' | 'too_large' | 'upload_failed'; message?: string };

type ProductImageUploadResult =
  | { ok: true; url: string }
  | { ok: false; error: 'unauthorized' | 'not_owner' | 'invalid_file' | 'too_large' | 'upload_failed'; message?: string };

function getExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'jpg';
}

/**
 * Server Action: upload a store logo via the admin (service-role) client,
 * bypassing RLS on storage. Auth and ownership are verified server-side.
 */
export async function uploadStoreLogoAction(formData: FormData): Promise<LogoUploadResult> {
  const file = formData.get('file');
  const storeId = formData.get('storeId');

  if (!(file instanceof File) || !file.size) {
    return { ok: false, error: 'invalid_file', message: 'No se recibió ningún archivo.' };
  }
  if (typeof storeId !== 'string' || !storeId) {
    return { ok: false, error: 'invalid_file', message: 'storeId requerido.' };
  }

  // Validate file
  if (file.size > MAX_SIZE_BYTES) {
    return { ok: false, error: 'too_large', message: 'Imagen muy pesada. Máximo 5MB.' };
  }
  const validationError = validateLogoFile(file);
  if (validationError) {
    return { ok: false, error: 'invalid_file', message: validationError.message };
  }

  // Verify authenticated user
  const serverClient = await createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) {
    return { ok: false, error: 'unauthorized' };
  }

  // Verify ownership (authed client — RLS gates this correctly)
  const { data: store } = await serverClient
    .from('stores')
    .select('id')
    .eq('id', storeId)
    .eq('owner_id', user.id)
    .maybeSingle();
  if (!store) {
    return { ok: false, error: 'not_owner' };
  }

  // Upload via admin client — bypasses RLS on storage
  const ext = getExtension(file.name);
  const path = `${storeId}/logo.${ext}`;
  const admin = createAdminClient();

  const { error: uploadError } = await admin.storage
    .from('store-logos')
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) {
    return { ok: false, error: 'upload_failed', message: 'Error al subir el logo. Intentá de nuevo.' };
  }

  const { data } = admin.storage.from('store-logos').getPublicUrl(path);
  return { ok: true, url: `${data.publicUrl}?t=${Date.now()}` };
}

/**
 * Server Action: upload a product image via the admin (service-role) client,
 * bypassing RLS on storage. Auth and ownership are verified server-side.
 */
export async function uploadProductImageAction(formData: FormData): Promise<ProductImageUploadResult> {
  const file = formData.get('file');
  const storeId = formData.get('storeId');

  if (!(file instanceof File) || !file.size) {
    return { ok: false, error: 'invalid_file', message: 'No se recibió ningún archivo.' };
  }
  if (typeof storeId !== 'string' || !storeId) {
    return { ok: false, error: 'invalid_file', message: 'storeId requerido.' };
  }

  // Validate file
  if (file.size > MAX_SIZE_BYTES) {
    return { ok: false, error: 'too_large', message: 'Imagen muy pesada. Máximo 5MB.' };
  }
  const validationError = validateProductImageFile(file);
  if (validationError) {
    return { ok: false, error: 'invalid_file', message: validationError.message };
  }

  // Verify authenticated user
  const serverClient = await createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) {
    return { ok: false, error: 'unauthorized' };
  }

  // Verify ownership via stores table (authed client — RLS gates this correctly)
  const { data: store } = await serverClient
    .from('stores')
    .select('id')
    .eq('id', storeId)
    .eq('owner_id', user.id)
    .maybeSingle();
  if (!store) {
    return { ok: false, error: 'not_owner' };
  }

  // Upload via admin client — bypasses RLS on storage
  const ext = getExtension(file.name);
  const path = `${storeId}/${crypto.randomUUID()}.${ext}`;
  const admin = createAdminClient();

  const { error: uploadError } = await admin.storage
    .from('product-images')
    .upload(path, file, { contentType: file.type });

  if (uploadError) {
    return { ok: false, error: 'upload_failed', message: 'Error al subir la imagen. Intentá de nuevo.' };
  }

  const { data } = admin.storage.from('product-images').getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}
