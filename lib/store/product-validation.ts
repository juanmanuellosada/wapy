import type { PriceTier } from './pricing';

// Reglas de validación de producto compartidas entre el formulario individual
// (ProductModal), la grilla de edición masiva y las acciones de servidor.
// Espejan las reglas de `productFormSchema` en app/components/store/ProductModal.tsx.

export interface ProductValidationInput {
  name: string;
  description?: string | null;
  price_cents: number;
  promo_price_cents?: number | null;
  stock?: number | null;
  /** undefined = este caller no toca los tramos; [] = sin tramos. */
  price_tiers?: PriceTier[] | null;
}

export type ProductValidationField =
  | 'name'
  | 'description'
  | 'price_cents'
  | 'promo_price_cents'
  | 'stock'
  | 'price_tiers';

/** Tope defensivo de tramos por producto: no hay un caso real que necesite más. */
export const MAX_PRICE_TIERS = 20;

export interface ProductValidationIssue {
  field: ProductValidationField;
  message: string;
}

/** Valida un producto y devuelve la lista de problemas encontrados (vacía si es válido). */
export function validateProductFields(input: ProductValidationInput): ProductValidationIssue[] {
  const issues: ProductValidationIssue[] = [];

  const name = input.name?.trim() ?? '';
  if (!name) {
    issues.push({ field: 'name', message: 'El nombre es requerido.' });
  } else if (name.length > 120) {
    issues.push({ field: 'name', message: 'Máximo 120 caracteres.' });
  }

  if (input.description != null && input.description.length > 500) {
    issues.push({ field: 'description', message: 'Máximo 500 caracteres.' });
  }

  if (!Number.isInteger(input.price_cents) || input.price_cents < 0) {
    issues.push({ field: 'price_cents', message: 'El precio debe ser un número entero mayor o igual a 0.' });
  }

  if (input.stock != null && (!Number.isInteger(input.stock) || input.stock < 0)) {
    issues.push({
      field: 'stock',
      message: 'El stock debe ser un número entero mayor o igual a 0, o vacío para stock ilimitado.',
    });
  }

  if (input.promo_price_cents != null) {
    if (!Number.isInteger(input.promo_price_cents) || input.promo_price_cents < 0) {
      issues.push({
        field: 'promo_price_cents',
        message: 'El precio promocional debe ser un número entero mayor o igual a 0.',
      });
    } else if (input.promo_price_cents >= input.price_cents) {
      issues.push({
        field: 'promo_price_cents',
        message: 'El precio promocional debe ser menor al precio regular.',
      });
    }
  }

  if (input.price_tiers != null) {
    issues.push(...validatePriceTiers(input.price_tiers, input.price_cents));
  }

  return issues;
}

/**
 * Valida los tramos de precio por cantidad de un producto contra su precio regular.
 * Reglas: cantidad mínima entera >= 2 y sin repetir, precio unitario entero >= 0 y
 * menor al precio regular, y a mayor cantidad, precio unitario estrictamente menor
 * (un tramo que no abarata no tiene sentido y confunde al comprador).
 */
export function validatePriceTiers(
  tiers: readonly PriceTier[],
  priceCents: number
): ProductValidationIssue[] {
  if (tiers.length === 0) return [];

  const issues: ProductValidationIssue[] = [];
  const push = (message: string) => issues.push({ field: 'price_tiers', message });

  if (tiers.length > MAX_PRICE_TIERS) {
    push(`No podés cargar más de ${MAX_PRICE_TIERS} tramos por producto.`);
    return issues;
  }

  for (const tier of tiers) {
    if (!Number.isInteger(tier.min_quantity) || tier.min_quantity < 2) {
      push('La cantidad mínima de un tramo debe ser un número entero de 2 o más.');
      return issues;
    }
    if (!Number.isInteger(tier.unit_price_cents) || tier.unit_price_cents < 0) {
      push('El precio por unidad de un tramo debe ser un número entero mayor o igual a 0.');
      return issues;
    }
    if (tier.unit_price_cents >= priceCents) {
      push('El precio por unidad de cada tramo debe ser menor al precio regular.');
      return issues;
    }
  }

  const sorted = [...tiers].sort((a, b) => a.min_quantity - b.min_quantity);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].min_quantity === sorted[i - 1].min_quantity) {
      push('No puede haber dos tramos con la misma cantidad mínima.');
      return issues;
    }
    if (sorted[i].unit_price_cents >= sorted[i - 1].unit_price_cents) {
      push('Cada tramo tiene que ser más barato por unidad que el tramo anterior.');
      return issues;
    }
  }

  return issues;
}

export function isValidProductFields(input: ProductValidationInput): boolean {
  return validateProductFields(input).length === 0;
}

/**
 * Verifica si un lote de `batchSize` productos nuevos entra dentro del límite
 * de productos del plan, dado el total actual (design.md, Decisión 8).
 */
export function checkBatchFits(
  currentCount: number,
  batchSize: number,
  maxProducts: number
): { ok: true } | { ok: false; message: string } {
  if (currentCount + batchSize <= maxProducts) return { ok: true };
  const remaining = Math.max(0, maxProducts - currentCount);
  return {
    ok: false,
    message: `Tu plan permite hasta ${maxProducts} productos y solo te quedan ${remaining} lugar${remaining === 1 ? '' : 'es'} disponible${remaining === 1 ? '' : 's'}. Achicá el lote o pasate a un plan superior.`,
  };
}
