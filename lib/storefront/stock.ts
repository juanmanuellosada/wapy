import type { ProductVariantData } from './resolve';

/**
 * ¿Hay stock para vender este producto?
 *
 * - Producto simple: `stock === null` significa "no llevo control de stock", o
 *   sea disponible; `0` es agotado.
 * - Producto con variantes: alcanza con que una variante esté disponible.
 *
 * Definición única: la usan el filtro "Solo con stock" del catálogo y la
 * partición de "sin stock al final". Si se duplicara, las dos se separarían.
 */
export function isInStock(
  product: { stock: number | null },
  variantData: ProductVariantData | undefined
): boolean {
  if (!variantData || variantData.variants.length === 0) {
    return product.stock === null || product.stock > 0;
  }
  return variantData.variants.some((v) => v.stock === null || v.stock > 0);
}
