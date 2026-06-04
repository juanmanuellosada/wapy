'use client';

import imageCompression from 'browser-image-compression';

/** Archivo original: rechazar si supera este peso (comprimir uno tan grande puede colgar el navegador). */
export const MAX_ORIGINAL_BYTES = 25 * 1024 * 1024; // 25 MB

/** Resultado tras comprimir: rechazar si sigue superando este peso. */
export const MAX_FINAL_BYTES = 5 * 1024 * 1024; // 5 MB

/** Tipos que se devuelven sin modificar (vectores / animaciones). */
const SKIP_TYPES = new Set(['image/svg+xml', 'image/gif']);

/**
 * Comprime una imagen en el cliente antes de subirla.
 * - SVG y GIF se devuelven sin modificar.
 * - Si la compresión falla, devuelve el archivo original (la validación posterior decide).
 * - El tipo MIME y el nombre del archivo original se conservan.
 */
export async function compressImage(file: File): Promise<File> {
  if (SKIP_TYPES.has(file.type)) return file;

  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: 1,
      maxWidthOrHeight: 1600,
      useWebWorker: true,
      // Preservar el tipo MIME original (importante para PNG con transparencia)
      fileType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
    });

    // browser-image-compression devuelve un Blob; lo convertimos a File para preservar el nombre.
    return new File([compressed], file.name, { type: file.type });
  } catch {
    // Si la compresión falla por cualquier motivo, devolvemos el original.
    return file;
  }
}
