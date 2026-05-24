/**
 * Client-side storage helpers — validation and deletion only.
 * Uploads are handled by Server Actions in upload-actions.ts.
 */

import { createBrowserClient } from '@/lib/supabase/client';

export const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export type UploadError = {
  type: 'size' | 'format' | 'upload';
  message: string;
};

export function validateLogoFile(file: File): UploadError | null {
  if (file.size > MAX_SIZE_BYTES) {
    return { type: 'size', message: 'Imagen muy pesada. Máximo 5MB.' };
  }
  const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
  if (!allowed.includes(file.type)) {
    return { type: 'format', message: 'Formato no permitido. Usá PNG, JPG, WEBP, o SVG.' };
  }
  return null;
}

export function validateProductImageFile(file: File): UploadError | null {
  if (file.size > MAX_SIZE_BYTES) {
    return { type: 'size', message: 'Imagen muy pesada. Máximo 5MB.' };
  }
  // No SVG for product images
  const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  if (!allowed.includes(file.type)) {
    return { type: 'format', message: 'Formato no permitido. Usá PNG, JPG, o WEBP.' };
  }
  return null;
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
