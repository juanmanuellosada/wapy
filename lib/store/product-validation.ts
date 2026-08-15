// Reglas de validación de producto compartidas entre el formulario individual
// (ProductModal), la grilla de edición masiva y las acciones de servidor.
// Espejan las reglas de `productFormSchema` en app/components/store/ProductModal.tsx.

export interface ProductValidationInput {
  name: string;
  description?: string | null;
  price_cents: number;
  promo_price_cents?: number | null;
  stock?: number | null;
}

export type ProductValidationField = 'name' | 'description' | 'price_cents' | 'promo_price_cents' | 'stock';

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
