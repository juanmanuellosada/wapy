'use server';

import * as Sentry from '@sentry/nextjs';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Auth guard (mirrors pattern in lib/store/actions.ts)
// ---------------------------------------------------------------------------

async function requireOwnerStore() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const admin = createAdminClient();
  const { data: store } = await admin
    .from('stores')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();
  return { user, store };
}

// ---------------------------------------------------------------------------
// Validation schemas (D10)
// ---------------------------------------------------------------------------

const MAX_LABEL_LEN = 32;
const MAX_VARIANTS = 25;

const optionTypeSchema = z.object({
  name: z.string().trim().min(1, 'El nombre del tipo es requerido').max(MAX_LABEL_LEN, `Máximo ${MAX_LABEL_LEN} caracteres`),
  values: z
    .array(z.string().trim().min(1, 'El valor no puede estar vacío').max(MAX_LABEL_LEN, `Máximo ${MAX_LABEL_LEN} caracteres por valor`))
    .min(1, 'Cada tipo debe tener al menos un valor'),
});

const upsertProductOptionsSchema = z.object({
  productId: z.string().uuid(),
  optionTypes: z.array(optionTypeSchema).min(1, 'Debe haber al menos un tipo de opción'),
});

// ---------------------------------------------------------------------------
// Helper: compute cartesian product of value arrays
// ---------------------------------------------------------------------------

function cartesian<T>(arrays: T[][]): T[][] {
  return arrays.reduce<T[][]>(
    (acc, arr) => acc.flatMap((existing) => arr.map((val) => [...existing, val])),
    [[]]
  );
}

// ---------------------------------------------------------------------------
// Helper: verify the product belongs to the current owner's store
// ---------------------------------------------------------------------------

async function requireProductOwnership(productId: string, storeId: string) {
  const admin = createAdminClient();
  const { data: product } = await admin
    .from('products')
    .select('id, store_id')
    .eq('id', productId)
    .eq('store_id', storeId)
    .maybeSingle();
  return product;
}

// ---------------------------------------------------------------------------
// 2.2 upsertProductOptions
//
// Creates / updates option types + values for a product and generates the
// full cartesian matrix of product_variants. Call this on first setup only
// (no variants exist yet) or when adding/removing VALUES (not adding new types
// to an existing matrix — that's blocked per D5).
//
// Flow for fresh setup:
//   1. Validate input
//   2. Block if product already has variants AND new option types are being added
//   3. Upsert option types (by name, trim)
//   4. Upsert option values (by value, trim) per type
//   5. Compute cartesian product of value id arrays
//   6. Check cap (max 25 variants)
//   7. Insert new variant rows + join rows (don't touch existing variants)
// ---------------------------------------------------------------------------

export type UpsertProductOptionsInput = {
  productId: string;
  optionTypes: Array<{
    name: string;
    values: string[];
  }>;
};

export type UpsertProductOptionsResult =
  | { ok: true; variantCount: number }
  | { error: string };

export async function upsertProductOptions(
  input: UpsertProductOptionsInput
): Promise<UpsertProductOptionsResult> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  const parsed = upsertProductOptionsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { productId, optionTypes: rawTypes } = parsed.data;

  const product = await requireProductOwnership(productId, store.id);
  if (!product) return { error: 'Producto no encontrado.' };

  try {
  const admin = createAdminClient();

  // Check for unique type names within this call
  const typeNames = rawTypes.map((t) => t.name);
  if (new Set(typeNames).size !== typeNames.length) {
    return { error: 'Los tipos de opción deben tener nombres únicos.' };
  }

  // D5: If product already has variants, block adding NEW types
  const { data: existingTypes } = await admin
    .from('product_option_types')
    .select('id, name')
    .eq('product_id', productId);

  const { data: existingVariants } = await admin
    .from('product_variants')
    .select('id')
    .eq('product_id', productId)
    .is('deleted_at', null)
    .limit(1);

  const hasVariants = (existingVariants ?? []).length > 0;
  const existingTypeNames = new Set((existingTypes ?? []).map((t) => t.name));

  if (hasVariants) {
    const newTypeNames = typeNames.filter((n) => !existingTypeNames.has(n));
    if (newTypeNames.length > 0) {
      return {
        error: `No se puede agregar el tipo "${newTypeNames[0]}" porque el producto ya tiene variedades. Borrá las variedades existentes antes de cambiar la dimensionalidad.`,
      };
    }
  }

  // Upsert option types (by name — DB has UNIQUE(product_id, name))
  const typeIdMap: Record<string, string> = {};

  for (let i = 0; i < rawTypes.length; i++) {
    const { name } = rawTypes[i];

    // Check if type already exists
    const existing = (existingTypes ?? []).find((t) => t.name === name);
    if (existing) {
      typeIdMap[name] = existing.id;
      // Update position
      await admin
        .from('product_option_types')
        .update({ position: i })
        .eq('id', existing.id);
    } else {
      const { data: inserted, error } = await admin
        .from('product_option_types')
        .insert({ product_id: productId, name, position: i })
        .select('id')
        .single();
      if (error || !inserted) {
        return { error: `No se pudo crear el tipo de opción "${name}".` };
      }
      typeIdMap[name] = inserted.id;
    }
  }

  // Upsert option values per type and collect value id arrays for cartesian product
  const valueIdsByType: string[][] = [];

  for (const { name, values } of rawTypes) {
    // Check unique values within type
    const trimmedValues = values.map((v) => v.trim());
    if (new Set(trimmedValues).size !== trimmedValues.length) {
      return { error: `Los valores del tipo "${name}" deben ser únicos.` };
    }

    const typeId = typeIdMap[name];

    // Fetch existing values for this type
    const { data: existingValues } = await admin
      .from('product_option_values')
      .select('id, value')
      .eq('option_type_id', typeId);

    const existingValueMap = new Map((existingValues ?? []).map((v) => [v.value, v.id]));

    const valueIds: string[] = [];

    for (let j = 0; j < trimmedValues.length; j++) {
      const val = trimmedValues[j];
      if (existingValueMap.has(val)) {
        const existingId = existingValueMap.get(val)!;
        valueIds.push(existingId);
        // Update position
        await admin
          .from('product_option_values')
          .update({ position: j })
          .eq('id', existingId);
      } else {
        const { data: inserted, error } = await admin
          .from('product_option_values')
          .insert({ option_type_id: typeId, value: val, position: j })
          .select('id')
          .single();
        if (error || !inserted) {
          return { error: `No se pudo crear el valor "${val}" para el tipo "${name}".` };
        }
        valueIds.push(inserted.id);
      }
    }

    valueIdsByType.push(valueIds);
  }

  // Compute cartesian product of all value id arrays
  const combinations = cartesian(valueIdsByType);

  // Check cap
  if (combinations.length > MAX_VARIANTS) {
    return {
      error: `La combinación genera ${combinations.length} variedades, lo que supera el límite de ${MAX_VARIANTS}. Reducí la cantidad de valores.`,
    };
  }

  // Find existing variant combinations to avoid duplicates
  const { data: existingVariantRows } = await admin
    .from('product_variants')
    .select('id, product_variant_option_values(option_value_id)')
    .eq('product_id', productId)
    .is('deleted_at', null);

  // Build a set of existing combination signatures (sorted value ids joined)
  const existingSignatures = new Set(
    (existingVariantRows ?? []).map((v) => {
      const ids = (v.product_variant_option_values ?? [])
        .map((ov: { option_value_id: string }) => ov.option_value_id)
        .sort()
        .join(',');
      return ids;
    })
  );

  // Insert only new combinations
  let newCount = 0;
  for (let pos = 0; pos < combinations.length; pos++) {
    const combo = combinations[pos];
    const sig = [...combo].sort().join(',');
    if (existingSignatures.has(sig)) continue;

    // Insert variant row — stock: null means "no tracking" (infinite), matches products.stock = null
    const { data: variant, error: variantError } = await admin
      .from('product_variants')
      .insert({
        product_id: productId,
        stock: null,
        price_override: null,
        image_url: null,
        position: pos,
      })
      .select('id')
      .single();

    if (variantError || !variant) {
      return { error: 'No se pudo crear la variedad.' };
    }

    // Insert join rows
    const joinRows = combo.map((valueId) => ({
      variant_id: variant.id,
      option_value_id: valueId,
    }));

    const { error: joinError } = await admin
      .from('product_variant_option_values')
      .insert(joinRows);

    if (joinError) {
      return { error: 'No se pudo asociar los valores a la variedad.' };
    }

    newCount++;
  }

  revalidatePath('/dashboard', 'layout');
  return { ok: true, variantCount: combinations.length };
  } catch (err) {
    Sentry.captureException(err, { tags: { action: 'upsertProductOptions' }, extra: { productId: input.productId } });
    return { error: 'Error inesperado al guardar las opciones.' };
  }
}

// ---------------------------------------------------------------------------
// 2.3 updateVariant
// ---------------------------------------------------------------------------

const updateVariantSchema = z.object({
  variantId: z.string().uuid(),
  stock: z.number().int().min(0, 'El stock debe ser ≥ 0').nullable(),
  priceOverride: z.number().int().min(0, 'El precio debe ser ≥ 0').nullable(),
  imageUrl: z.string().nullable().optional(),
});

export type UpdateVariantInput = {
  variantId: string;
  stock: number | null;
  priceOverride: number | null;
  imageUrl?: string | null;
};

export type UpdateVariantResult = { ok: true } | { error: string };

export async function updateVariant(
  input: UpdateVariantInput
): Promise<UpdateVariantResult> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  const parsed = updateVariantSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { variantId, stock, priceOverride, imageUrl } = parsed.data;

  try {
  const admin = createAdminClient();

  // Verify ownership via product → store chain
  const { data: variant } = await admin
    .from('product_variants')
    .select('id, product_id, products(store_id)')
    .eq('id', variantId)
    .maybeSingle();

  const variantWithProduct = variant as typeof variant & {
    products: { store_id: string } | null;
  };

  if (!variantWithProduct || variantWithProduct.products?.store_id !== store.id) {
    return { error: 'Variedad no encontrada.' };
  }

  const { error } = await admin
    .from('product_variants')
    .update({
      stock,
      price_override: priceOverride,
      ...(imageUrl !== undefined ? { image_url: imageUrl } : {}),
    })
    .eq('id', variantId);

  if (error) {
    Sentry.captureException(error, { tags: { action: 'updateVariant' }, extra: { variantId } });
    return { error: 'No se pudo actualizar la variedad.' };
  }

  revalidatePath('/dashboard', 'layout');
  return { ok: true };
  } catch (err) {
    Sentry.captureException(err, { tags: { action: 'updateVariant' }, extra: { variantId } });
    return { error: 'Error inesperado al actualizar la variedad.' };
  }
}

// ---------------------------------------------------------------------------
// 2.4 addOptionValue
//
// Adds a new value to an existing option type and creates the new variant rows
// for all combinations the new value produces (without touching existing ones).
// ---------------------------------------------------------------------------

const addOptionValueSchema = z.object({
  optionTypeId: z.string().uuid(),
  value: z.string().trim().min(1, 'El valor no puede estar vacío').max(MAX_LABEL_LEN, `Máximo ${MAX_LABEL_LEN} caracteres`),
});

export type AddOptionValueInput = { optionTypeId: string; value: string };
export type AddOptionValueResult =
  | { ok: true; newVariantCount: number }
  | { error: string };

export async function addOptionValue(
  input: AddOptionValueInput
): Promise<AddOptionValueResult> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  const parsed = addOptionValueSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { optionTypeId, value } = parsed.data;

  try {
  const admin = createAdminClient();

  // Verify the option type belongs to a product owned by this store
  const { data: optionType } = await admin
    .from('product_option_types')
    .select('id, product_id, products(store_id)')
    .eq('id', optionTypeId)
    .maybeSingle();

  const optionTypeWithProduct = optionType as typeof optionType & {
    products: { store_id: string } | null;
  };

  if (!optionTypeWithProduct || optionTypeWithProduct.products?.store_id !== store.id) {
    return { error: 'Tipo de opción no encontrado.' };
  }

  const productId = optionTypeWithProduct.product_id;

  // Check value uniqueness within type (DB also enforces this but return friendly error)
  const { data: existingValues } = await admin
    .from('product_option_values')
    .select('id, value')
    .eq('option_type_id', optionTypeId);

  if ((existingValues ?? []).some((v) => v.value === value)) {
    return { error: `El valor "${value}" ya existe en este tipo de opción.` };
  }

  // D5: Block adding a new TYPE — this function adds a value to an existing type,
  // which is allowed. But let's check total variant count after the new value would
  // generate new combinations.

  // Fetch all other types for this product with their value ids
  const { data: allTypes } = await admin
    .from('product_option_types')
    .select('id, product_option_values(id)')
    .eq('product_id', productId);

  // Build value id arrays per type (using existing values + new value for the target type)
  const valueIdsByType: string[][] = [];
  for (const type of allTypes ?? []) {
    const ids = (type.product_option_values ?? []).map((v: { id: string }) => v.id);
    if (type.id === optionTypeId) {
      // We'll add the new value, but its id isn't known yet — use placeholder
      // We just need the COUNT for the cap check
      ids.push('__new__');
    }
    if (ids.length > 0) valueIdsByType.push(ids);
  }

  const totalCombinations = valueIdsByType.reduce((acc, ids) => acc * ids.length, 1);
  if (totalCombinations > MAX_VARIANTS) {
    return {
      error: `Agregar este valor generaría ${totalCombinations} variedades, superando el límite de ${MAX_VARIANTS}.`,
    };
  }

  // Insert the new option value
  const { data: newValue, error: insertValueError } = await admin
    .from('product_option_values')
    .insert({ option_type_id: optionTypeId, value, position: (existingValues ?? []).length })
    .select('id')
    .single();

  if (insertValueError || !newValue) {
    return { error: `No se pudo agregar el valor "${value}".` };
  }

  const newValueId = newValue.id;

  // For each existing variant (active, not deleted), create a new variant that is
  // the existing variant's values + the new value.
  // This produces one new variant per existing variant (for the other types' current combinations).
  const { data: existingVariants } = await admin
    .from('product_variants')
    .select('id, position, product_variant_option_values(option_value_id)')
    .eq('product_id', productId)
    .is('deleted_at', null);

  // If there are no existing variants yet (product had no variants), the cartesian product
  // for this type × other types needs to be done from scratch.
  // But addOptionValue is only called when at least one type already exists.
  // If there are 0 existing variants but types exist, the initial setup wasn't done — treat as fresh.
  if ((existingVariants ?? []).length === 0) {
    // Just inserted the value; let upsertProductOptions handle building the full matrix.
    revalidatePath('/dashboard', 'layout');
    return { ok: true, newVariantCount: 0 };
  }

  // Get all value ids for the OTHER types (not the one we just added to)
  // For each existing variant, we know which value it has for each other type.
  // A new variant = existing variant's other-type values + new value for this type.
  let newVariantCount = 0;
  const maxPosition = Math.max(...(existingVariants ?? []).map((v) => v.position ?? 0));

  for (const existingVariant of existingVariants ?? []) {
    const existingValueIds = (existingVariant.product_variant_option_values ?? []).map(
      (ov: { option_value_id: string }) => ov.option_value_id
    );

    // Check if this existing variant already includes the new value (shouldn't happen)
    if (existingValueIds.includes(newValueId)) continue;

    // New variant = existing other-type values + new value
    const newVariantValueIds = [...existingValueIds, newValueId];

    const { data: newVariant, error: variantError } = await admin
      .from('product_variants')
      .insert({
        product_id: productId,
        stock: null,
        price_override: null,
        image_url: null,
        position: maxPosition + newVariantCount + 1,
      })
      .select('id')
      .single();

    if (variantError || !newVariant) {
      return { error: 'No se pudo crear la variedad nueva.' };
    }

    const joinRows = newVariantValueIds.map((valueId) => ({
      variant_id: newVariant.id,
      option_value_id: valueId,
    }));

    const { error: joinError } = await admin
      .from('product_variant_option_values')
      .insert(joinRows);

    if (joinError) {
      return { error: 'No se pudo asociar los valores a la variedad nueva.' };
    }

    newVariantCount++;
  }

  revalidatePath('/dashboard', 'layout');
  return { ok: true, newVariantCount };
  } catch (err) {
    Sentry.captureException(err, { tags: { action: 'addOptionValue' }, extra: { optionTypeId: input.optionTypeId, value: input.value } });
    return { error: 'Error inesperado al agregar el valor.' };
  }
}

// ---------------------------------------------------------------------------
// 2.5 removeOptionValue
//
// Conditional logic per D5:
// - If any variants containing this value appear in order_items → soft-delete
//   those variants (deleted_at = now()) and delete the option_value row
//   (cascade cleans product_variant_option_values).
// - If no variant is in order_items → delete the option_value row
//   (cascade cleans variants and joins).
//
// HARDENING: Rejects if this is the last value of its type. Use removeOptionType
// to delete the type entirely.
// ---------------------------------------------------------------------------

export type RemoveOptionValueInput = { optionValueId: string };
export type RemoveOptionValueResult = { ok: true; softDeleted: boolean } | { error: string };

export async function removeOptionValue(
  input: RemoveOptionValueInput
): Promise<RemoveOptionValueResult> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  try {
  const admin = createAdminClient();

  // Resolve ownership + related variants
  const { data: optionValue } = await admin
    .from('product_option_values')
    .select('id, option_type_id, product_option_types(id, name, product_id, products(store_id))')
    .eq('id', input.optionValueId)
    .maybeSingle();

  type OptionValueWithRelations = {
    id: string;
    option_type_id: string;
    product_option_types: {
      id: string;
      name: string;
      product_id: string;
      products: { store_id: string } | null;
    } | null;
  };

  const ov = optionValue as OptionValueWithRelations | null;
  if (!ov || ov.product_option_types?.products?.store_id !== store.id) {
    return { error: 'Valor de opción no encontrado.' };
  }

  const typeName = ov.product_option_types!.name;

  // HARDENING: Reject if this is the last value of the type
  const { count: valueCount } = await admin
    .from('product_option_values')
    .select('id', { count: 'exact', head: true })
    .eq('option_type_id', ov.option_type_id);

  if ((valueCount ?? 0) <= 1) {
    return {
      error: `No se puede borrar el último valor de "${typeName}". Si querés eliminar el tipo, usá "Quitar tipo" en su lugar.`,
    };
  }

  // Find all active variants that include this option value
  const { data: variantJoins } = await admin
    .from('product_variant_option_values')
    .select('variant_id')
    .eq('option_value_id', input.optionValueId);

  const variantIds = (variantJoins ?? []).map((j) => j.variant_id);

  // Check if any of those variants appear in order_items
  let hasOrderItems = false;
  if (variantIds.length > 0) {
    const { data: orderItems } = await admin
      .from('order_items')
      .select('id')
      .in('variant_id', variantIds)
      .limit(1);

    hasOrderItems = (orderItems ?? []).length > 0;
  }

  if (hasOrderItems) {
    // Soft-delete variants that include this value
    const now = new Date().toISOString();
    const { error: softDeleteError } = await admin
      .from('product_variants')
      .update({ deleted_at: now })
      .in('id', variantIds);

    if (softDeleteError) {
      return { error: 'No se pudo archivar las variedades.' };
    }

    // Delete the option value row (cascade removes product_variant_option_values)
    const { error: deleteError } = await admin
      .from('product_option_values')
      .delete()
      .eq('id', input.optionValueId);

    if (deleteError) {
      return { error: 'No se pudo eliminar el valor de opción.' };
    }

    revalidatePath('/dashboard', 'layout');
    return { ok: true, softDeleted: true };
  } else {
    // Hard delete the option value; cascade cleans variants and joins
    const { error: deleteError } = await admin
      .from('product_option_values')
      .delete()
      .eq('id', input.optionValueId);

    if (deleteError) {
      return { error: 'No se pudo eliminar el valor de opción.' };
    }

    revalidatePath('/dashboard', 'layout');
    return { ok: true, softDeleted: false };
  }
  } catch (err) {
    Sentry.captureException(err, { tags: { action: 'removeOptionValue' }, extra: { optionValueId: input.optionValueId } });
    return { error: 'Error inesperado al eliminar el valor.' };
  }
}

// ---------------------------------------------------------------------------
// 2.8 removeOptionType
//
// Deletes an entire option type and all its values.
// Cascade in DB removes product_option_values and product_variant_option_values.
// Variants that included values of this type are soft-deleted if they appear in
// order_items; otherwise they are hard-deleted via cascade.
// ---------------------------------------------------------------------------

export type RemoveOptionTypeInput = { optionTypeId: string };
export type RemoveOptionTypeResult = { ok: true; softDeleted: boolean } | { error: string };

export async function removeOptionType(
  input: RemoveOptionTypeInput
): Promise<RemoveOptionTypeResult> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  try {
  const admin = createAdminClient();

  // Resolve ownership
  const { data: optionType } = await admin
    .from('product_option_types')
    .select('id, name, product_id, products(store_id)')
    .eq('id', input.optionTypeId)
    .maybeSingle();

  type OptionTypeWithRelations = {
    id: string;
    name: string;
    product_id: string;
    products: { store_id: string } | null;
  };

  const ot = optionType as OptionTypeWithRelations | null;
  if (!ot || ot.products?.store_id !== store.id) {
    return { error: 'Tipo de opción no encontrado.' };
  }

  // Find all values of this type
  const { data: typeValues } = await admin
    .from('product_option_values')
    .select('id')
    .eq('option_type_id', input.optionTypeId);

  const valueIds = (typeValues ?? []).map((v) => v.id);

  // Find all active variants that include any of these values
  let variantIds: string[] = [];
  if (valueIds.length > 0) {
    const { data: variantJoins } = await admin
      .from('product_variant_option_values')
      .select('variant_id')
      .in('option_value_id', valueIds);

    variantIds = [...new Set((variantJoins ?? []).map((j) => j.variant_id))];
  }

  // Check if any of those variants appear in order_items
  let hasOrderItems = false;
  if (variantIds.length > 0) {
    const { data: orderItems } = await admin
      .from('order_items')
      .select('id')
      .in('variant_id', variantIds)
      .limit(1);

    hasOrderItems = (orderItems ?? []).length > 0;
  }

  if (hasOrderItems) {
    // Soft-delete variants before removing the type
    const now = new Date().toISOString();
    const { error: softDeleteError } = await admin
      .from('product_variants')
      .update({ deleted_at: now })
      .in('id', variantIds);

    if (softDeleteError) {
      Sentry.captureException(softDeleteError, { tags: { action: 'removeOptionType' }, extra: { optionTypeId: input.optionTypeId } });
      return { error: 'No se pudo archivar las variedades.' };
    }
  } else if (variantIds.length > 0) {
    // Hard-delete variant rows (product_variant_option_values will be cleaned by
    // the cascade on the option type delete, but product_variants itself needs explicit removal)
    const { error: hardDeleteError } = await admin
      .from('product_variants')
      .delete()
      .in('id', variantIds);

    if (hardDeleteError) {
      Sentry.captureException(hardDeleteError, { tags: { action: 'removeOptionType' }, extra: { optionTypeId: input.optionTypeId } });
      return { error: 'No se pudo eliminar las variedades.' };
    }
  }

  // Delete the option type row (cascade removes option_values and variant_option_values)
  const { error: deleteError } = await admin
    .from('product_option_types')
    .delete()
    .eq('id', input.optionTypeId);

  if (deleteError) {
    Sentry.captureException(deleteError, { tags: { action: 'removeOptionType' }, extra: { optionTypeId: input.optionTypeId } });
    return { error: 'No se pudo eliminar el tipo de opción.' };
  }

  revalidatePath('/dashboard', 'layout');
  return { ok: true, softDeleted: hasOrderItems };
  } catch (err) {
    Sentry.captureException(err, { tags: { action: 'removeOptionType' }, extra: { optionTypeId: input.optionTypeId } });
    return { error: 'Error inesperado al eliminar el tipo de opción.' };
  }
}

// ---------------------------------------------------------------------------
// 2.6 Guard: block adding a new option TYPE when product already has variants.
// This logic is embedded in upsertProductOptions (D5 block above), but we also
// expose a standalone function for explicit UI checks.
// ---------------------------------------------------------------------------

export type CanAddOptionTypeResult =
  | { canAdd: true }
  | { canAdd: false; reason: string };

export async function canAddOptionType(productId: string): Promise<CanAddOptionTypeResult> {
  const { store } = await requireOwnerStore();
  if (!store) return { canAdd: false, reason: 'No se encontró la tienda.' };

  const admin = createAdminClient();

  const { data: product } = await admin
    .from('products')
    .select('id')
    .eq('id', productId)
    .eq('store_id', store.id)
    .maybeSingle();

  if (!product) return { canAdd: false, reason: 'Producto no encontrado.' };

  const { data: existingVariants } = await admin
    .from('product_variants')
    .select('id')
    .eq('product_id', productId)
    .is('deleted_at', null)
    .limit(1);

  if ((existingVariants ?? []).length > 0) {
    return {
      canAdd: false,
      reason: 'El producto ya tiene variedades. Borrá las variedades existentes antes de cambiar la dimensionalidad.',
    };
  }

  return { canAdd: true };
}

// ---------------------------------------------------------------------------
// 2.7 uploadVariantImage
//
// Uses admin client for Storage (ES256 gotcha — same pattern as uploadProductImageAction).
// Path: product-images/<store_id>/<product_id>/<variant_id>/<uuid>.<ext>
// Uses the same bucket as product images ("product-images").
// ---------------------------------------------------------------------------

function getExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'jpg';
}

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export type UploadVariantImageResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function uploadVariantImage(
  formData: FormData
): Promise<UploadVariantImageResult> {
  const file = formData.get('file');
  const variantId = formData.get('variantId');

  if (!(file instanceof File) || !file.size) {
    return { ok: false, error: 'No se recibió ningún archivo.' };
  }
  if (typeof variantId !== 'string' || !variantId) {
    return { ok: false, error: 'variantId requerido.' };
  }

  if (file.size > MAX_SIZE_BYTES) {
    return { ok: false, error: 'Imagen muy pesada. Máximo 5MB.' };
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedTypes.includes(file.type)) {
    return { ok: false, error: 'Tipo de archivo no permitido. Usá JPG, PNG, WebP o GIF.' };
  }

  // Verify authenticated user owns the variant via store chain
  const serverClient = await createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return { ok: false, error: 'No autenticado.' };

  try {
  const admin = createAdminClient();

  const { data: variant } = await admin
    .from('product_variants')
    .select('id, product_id, products(store_id)')
    .eq('id', variantId)
    .maybeSingle();

  type VariantWithRelations = {
    id: string;
    product_id: string;
    products: { store_id: string } | null;
  };

  const v = variant as VariantWithRelations | null;
  if (!v) return { ok: false, error: 'Variedad no encontrada.' };

  // Verify ownership
  const { data: store } = await admin
    .from('stores')
    .select('id')
    .eq('id', v.products?.store_id ?? '')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (!store) return { ok: false, error: 'Sin permisos para esta variedad.' };

  const ext = getExtension(file.name);
  const path = `${store.id}/${v.product_id}/${variantId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await admin.storage
    .from('product-images')
    .upload(path, file, { contentType: file.type });

  if (uploadError) {
    Sentry.captureException(uploadError, { tags: { action: 'uploadVariantImage' }, extra: { variantId } });
    return { ok: false, error: 'Error al subir la imagen. Intentá de nuevo.' };
  }

  const { data } = admin.storage.from('product-images').getPublicUrl(path);

  // Persist the URL to the variant row
  await admin
    .from('product_variants')
    .update({ image_url: data.publicUrl })
    .eq('id', variantId);

  revalidatePath('/dashboard', 'layout');
  return { ok: true, url: data.publicUrl };
  } catch (err) {
    Sentry.captureException(err, { tags: { action: 'uploadVariantImage' }, extra: { variantId } });
    return { ok: false, error: 'Error inesperado al subir la imagen.' };
  }
}

// ---------------------------------------------------------------------------
// getProductVariantsData
//
// Loads all option types, values and variants for a product. Used by
// <VariantsSection> on mount (edit mode). Returns null if product not found
// or not owned by the current user.
// ---------------------------------------------------------------------------

export type OptionValueData = {
  id: string;
  value: string;
  position: number;
};

export type OptionTypeData = {
  id: string;
  name: string;
  position: number;
  values: OptionValueData[];
};

export type VariantData = {
  id: string;
  stock: number | null; // null = no tracking (infinite stock)
  price_override: number | null;
  image_url: string | null;
  position: number;
  // value ids that compose this variant (option_value_id for each type)
  option_value_ids: string[];
};

export type ProductVariantsData = {
  optionTypes: OptionTypeData[];
  variants: VariantData[];
};

export async function getProductVariantsData(
  productId: string
): Promise<ProductVariantsData | { error: string }> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  const admin = createAdminClient();

  // Verify ownership
  const product = await requireProductOwnership(productId, store.id);
  if (!product) return { error: 'Producto no encontrado.' };

  // Fetch option types with their values
  const { data: rawTypes } = await admin
    .from('product_option_types')
    .select('id, name, position, product_option_values(id, value, position)')
    .eq('product_id', productId)
    .order('position');

  const optionTypes: OptionTypeData[] = (rawTypes ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    position: t.position,
    values: ((t.product_option_values as OptionValueData[] | null) ?? [])
      .slice()
      .sort((a, b) => a.position - b.position),
  }));

  // Fetch active variants with their option value links
  const { data: rawVariants } = await admin
    .from('product_variants')
    .select('id, stock, price_override, image_url, position, product_variant_option_values(option_value_id)')
    .eq('product_id', productId)
    .is('deleted_at', null)
    .order('position');

  const variants: VariantData[] = (rawVariants ?? []).map((v) => ({
    id: v.id,
    stock: v.stock,
    price_override: v.price_override,
    image_url: v.image_url,
    position: v.position,
    option_value_ids: (
      v.product_variant_option_values as Array<{ option_value_id: string }> | null ?? []
    ).map((ov) => ov.option_value_id),
  }));

  return { optionTypes, variants };
}
