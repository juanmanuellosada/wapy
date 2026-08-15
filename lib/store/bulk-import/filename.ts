// Helpers puros para derivar el nombre de un producto a partir del nombre de
// archivo de su foto en un ZIP de alta masiva (design.md, Decisión 4).

const MAX_NAME_LENGTH = 120;
const FALLBACK_NAME = 'Producto';

/**
 * Deriva el nombre de un producto desde la ruta/nombre de archivo de su foto:
 * ignora la carpeta, quita la extensión, reemplaza `-`/`_` por espacios,
 * colapsa espacios, capitaliza solo la primera letra y trunca a 120 caracteres.
 * Si el resultado queda vacío, devuelve "Producto".
 */
export function deriveProductName(filename: string): string {
  const base = filename.split('/').pop() ?? filename;
  const withoutExtension = base.replace(/\.[^./]+$/, '');
  const spaced = withoutExtension.replace(/[-_]+/g, ' ');
  const collapsed = spaced.replace(/\s+/g, ' ').trim();
  if (!collapsed) return FALLBACK_NAME;
  const capitalized = collapsed.charAt(0).toUpperCase() + collapsed.slice(1);
  return capitalized.slice(0, MAX_NAME_LENGTH);
}

/**
 * Sufija con ` 2`, ` 3`, etc. los nombres repetidos dentro del mismo lote
 * (comparación case-insensitive). Los duplicados toman como base la
 * capitalización del primer nombre visto para ese grupo.
 */
export function dedupeNames(names: string[]): string[] {
  const firstSeen = new Map<string, string>();
  const counts = new Map<string, number>();

  return names.map((name) => {
    const key = name.toLowerCase();
    if (!firstSeen.has(key)) {
      firstSeen.set(key, name);
      counts.set(key, 1);
      return name;
    }
    const count = (counts.get(key) ?? 1) + 1;
    counts.set(key, count);
    return `${firstSeen.get(key)} ${count}`;
  });
}
