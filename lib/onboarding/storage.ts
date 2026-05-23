/**
 * Client-side storage helpers for image uploads.
 * These use the browser supabase client (with user session for RLS).
 */

import { createBrowserClient } from '@/lib/supabase/client';

const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

export type UploadError = {
  type: 'size' | 'format' | 'upload';
  message: string;
};

function getExtension(file: File): string {
  const parts = file.name.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'jpg';
}

function validateLogoFile(file: File): UploadError | null {
  if (file.size > MAX_SIZE_BYTES) {
    return { type: 'size', message: 'Imagen muy pesada. Máximo 2MB.' };
  }
  const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
  if (!allowed.includes(file.type)) {
    return { type: 'format', message: 'Formato no permitido. Usá PNG, JPG, WEBP, o SVG.' };
  }
  return null;
}

function validateProductImageFile(file: File): UploadError | null {
  if (file.size > MAX_SIZE_BYTES) {
    return { type: 'size', message: 'Imagen muy pesada. Máximo 2MB.' };
  }
  // No SVG for product images
  const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  if (!allowed.includes(file.type)) {
    return { type: 'format', message: 'Formato no permitido. Usá PNG, JPG, o WEBP.' };
  }
  return null;
}

/**
 * Uploads the store logo to `store-logos/{storeId}/logo.{ext}`.
 * Replaces existing logo (same path).
 * Returns the public URL.
 */
export async function uploadLogo(file: File, storeId: string): Promise<string> {
  const validationError = validateLogoFile(file);
  if (validationError) throw new Error(validationError.message);

  const ext = getExtension(file);
  const path = `${storeId}/logo.${ext}`;

  const supabase = createBrowserClient();
  const { error } = await supabase.storage
    .from('store-logos')
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw new Error('Error al subir el logo. Intentá de nuevo.');

  const { data } = supabase.storage.from('store-logos').getPublicUrl(path);
  // Cache bust with timestamp
  return `${data.publicUrl}?t=${Date.now()}`;
}

/**
 * Uploads a product image to `product-images/{storeId}/{uuid}.{ext}`.
 * Returns the public URL.
 */
export async function uploadProductImage(file: File, storeId: string): Promise<string> {
  const validationError = validateProductImageFile(file);
  if (validationError) throw new Error(validationError.message);

  const ext = getExtension(file);
  const path = `${storeId}/${crypto.randomUUID()}.${ext}`;

  const supabase = createBrowserClient();
  const { error } = await supabase.storage
    .from('product-images')
    .upload(path, file, { contentType: file.type });

  if (error) throw new Error('Error al subir la imagen. Intentá de nuevo.');

  const { data } = supabase.storage.from('product-images').getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Deletes an image from storage by its public URL.
 * Extracts the path from the URL for the given bucket.
 */
export async function deleteImage(url: string, bucket: 'store-logos' | 'product-images'): Promise<void> {
  try {
    const u = new URL(url);
    // URL pattern: .../storage/v1/object/public/{bucket}/{path}
    const marker = `/object/public/${bucket}/`;
    const idx = u.pathname.indexOf(marker);
    if (idx === -1) return;
    const path = u.pathname.slice(idx + marker.length);

    const supabase = createBrowserClient();
    await supabase.storage.from(bucket).remove([path]);
  } catch (e) {
    console.warn('[deleteImage] failed:', e);
  }
}

// Re-export validation helpers so components can validate before calling
export { validateLogoFile, validateProductImageFile };
