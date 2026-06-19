'use server';

import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { MAX_SIZE_BYTES, validateLogoFile, validateProductImageFile } from './storage';
import { optimizeImage } from '@/lib/images/optimize';

type LogoUploadResult =
  | { ok: true; url: string }
  | { ok: false; error: 'unauthorized' | 'not_owner' | 'invalid_file' | 'too_large' | 'upload_failed'; message?: string };

type ProductImageUploadResult =
  | { ok: true; url: string }
  | { ok: false; error: 'unauthorized' | 'not_owner' | 'invalid_file' | 'too_large' | 'upload_failed'; message?: string };

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
  const { buffer: optimized, ext, contentType } = await optimizeImage(file, { maxWidth: 512, quality: 90 });
  const path = `${storeId}/logo.${ext}`;
  const admin = createAdminClient();

  const { error: uploadError } = await admin.storage
    .from('store-logos')
    .upload(path, optimized, { upsert: true, contentType });

  if (uploadError) {
    return { ok: false, error: 'upload_failed', message: 'Error al subir el logo. Intentá de nuevo.' };
  }

  const { data } = admin.storage.from('store-logos').getPublicUrl(path);
  return { ok: true, url: `${data.publicUrl}?t=${Date.now()}` };
}

/**
 * Server Action: upload a store banner via the admin (service-role) client,
 * bypassing RLS on storage. Auth and ownership are verified server-side.
 */
export async function uploadStoreBannerAction(formData: FormData): Promise<LogoUploadResult> {
  const file = formData.get('file');
  const storeId = formData.get('storeId');

  if (!(file instanceof File) || !file.size) {
    return { ok: false, error: 'invalid_file', message: 'No se recibió ningún archivo.' };
  }
  if (typeof storeId !== 'string' || !storeId) {
    return { ok: false, error: 'invalid_file', message: 'storeId requerido.' };
  }

  if (file.size > MAX_SIZE_BYTES) {
    return { ok: false, error: 'too_large', message: 'Imagen muy pesada. Máximo 5MB.' };
  }
  const validationError = validateLogoFile(file);
  if (validationError) {
    return { ok: false, error: 'invalid_file', message: validationError.message };
  }

  const serverClient = await createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) {
    return { ok: false, error: 'unauthorized' };
  }

  const { data: store } = await serverClient
    .from('stores')
    .select('id')
    .eq('id', storeId)
    .eq('owner_id', user.id)
    .maybeSingle();
  if (!store) {
    return { ok: false, error: 'not_owner' };
  }

  const { buffer: optimized, ext, contentType } = await optimizeImage(file, { maxWidth: 2000, quality: 80 });
  const path = `${storeId}/banner.${ext}`;
  const admin = createAdminClient();

  const { error: uploadError } = await admin.storage
    .from('store-banners')
    .upload(path, optimized, { upsert: true, contentType });

  if (uploadError) {
    return { ok: false, error: 'upload_failed', message: 'Error al subir el banner. Intentá de nuevo.' };
  }

  const { data } = admin.storage.from('store-banners').getPublicUrl(path);
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
  const { buffer: optimized, ext, contentType } = await optimizeImage(file, { maxWidth: 1600, quality: 80 });
  const path = `${storeId}/${crypto.randomUUID()}.${ext}`;
  const admin = createAdminClient();

  const { error: uploadError } = await admin.storage
    .from('product-images')
    .upload(path, optimized, { contentType });

  if (uploadError) {
    return { ok: false, error: 'upload_failed', message: 'Error al subir la imagen. Intentá de nuevo.' };
  }

  const { data } = admin.storage.from('product-images').getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}
