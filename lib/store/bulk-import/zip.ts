// Constantes y predicados puros para el procesamiento del ZIP de alta masiva
// (design.md, Decisión 2). La descompresión en sí vive en el cliente (grupo 3).

export const MAX_ZIP_BYTES = 60 * 1024 * 1024; // 60 MB
export const MAX_PHOTOS_PER_ZIP = 100;

export const ACCEPTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const;

const IGNORED_FILENAMES = new Set(['.ds_store', 'thumbs.db']);

/**
 * True si una entrada del ZIP debe ignorarse silenciosamente: directorios,
 * tamaño cero, archivos ocultos, metadatos de macOS (`__MACOSX/`, `.DS_Store`)
 * o de Windows (`Thumbs.db`).
 */
export function isIgnorableZipEntry(path: string, size: number): boolean {
  if (path.endsWith('/')) return true;
  if (size <= 0) return true;

  const segments = path.replace(/\\/g, '/').split('/').filter(Boolean);
  if (segments.includes('__MACOSX')) return true;

  const filename = segments[segments.length - 1] ?? '';
  if (filename.startsWith('.')) return true;
  if (IGNORED_FILENAMES.has(filename.toLowerCase())) return true;

  return false;
}

/** True si el nombre de archivo tiene una extensión de imagen soportada. */
export function hasAcceptedImageExtension(path: string): boolean {
  const lower = path.toLowerCase();
  return ACCEPTED_IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
