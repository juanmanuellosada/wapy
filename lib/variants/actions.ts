'use server';

import * as Sentry from '@sentry/nextjs';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { getPlanLimits } from '@/lib/plans/limits';
import type { PlanId } from '@/lib/plans/limits';
import { optimizeImage } from '@/lib/images/optimize';

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
    .select('id, plan')
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
// Internal: reconcileVariants
//
// Core reconciliation algorithm. Receives the desired full state (ordered
// types + values, already upserted to DB with their IDs), along with the
// current active variants from DB, and performs:
//   1. Cartesian product of desired value-id arrays (types ordered by position).
//   2. Cap check (MAX_VARIANTS).
//   3. Matching with inheritance:
//      - Exact match  → keep variant untouched (same stock/price/image).
//      - Partial match (shared types only) → inherit stock/price/image from
//        first unused match; subsequent combos of same partial key get 0.
//      - No match → stock=null if DB was empty before, stock=0 otherwise.
//   4. Insert new variants, soft-delete or hard-delete stale ones.
//
// Ordering convention for cartesian product:
//   Preexisting/shared types are the MOST significant digits; the newly-added
//   type (if any) is the LEAST significant. This ensures that, for a combo like
//   S+Rojo, S is the shared type (more significant) and Rojo is the new value.
//   The first combo for each shared-type key (e.g. S/Rojo before S/Azul)
//   inherits the real stock so that S/Rojo=10, S/Azul=0.
// ---------------------------------------------------------------------------

type ActiveVariant = {
  id: string;
  stock: number | null;
  price_override: number | null;
  image_url: string | null;
  position: number;
  valueIds: Set<string>; // all option_value_ids for this variant
};

type ReconcileInput = {
  productId: string;
  /** Desired types with their DB ids and value DB ids, ordered by position (index = position). */
  desiredTypes: Array<{
    id: string;
    valueIds: string[]; // ordered by position
  }>;
  /** The types that existed BEFORE this call (used to determine sharedTypeIds). */
  previousTypeIds: Set<string>;
  /** Current active variants already loaded from DB. */
  currentVariants: ActiveVariant[];
  admin: ReturnType<typeof createAdminClient>;
};

type ReconcileResult =
  | { ok: true; variantCount: number }
  | { error: string };

async function reconcileVariants(input: ReconcileInput): Promise<ReconcileResult> {
  const { productId, desiredTypes, previousTypeIds, currentVariants, admin } = input;

  // Was there a matrix before this call?
  const hadMatrixBefore = currentVariants.length > 0;

  // Build value-id arrays per type for cartesian.
  // Shared/preexisting types first (most significant), new types last.
  const sharedTypes = desiredTypes.filter((t) => previousTypeIds.has(t.id));
  const newTypes = desiredTypes.filter((t) => !previousTypeIds.has(t.id));
  // Ordered: shared first, new last — within each group, preserve position order.
  const orderedTypes = [...sharedTypes, ...newTypes];

  const valueIdArrays = orderedTypes.map((t) => t.valueIds);

  // Compute cartesian product
  const combinations = cartesian(valueIdArrays);

  if (combinations.length > MAX_VARIANTS) {
    // Build a human-friendly explanation of the multiplication
    const breakdown = orderedTypes
      .map((t, i) => `${valueIdArrays[i].length}`)
      .join(' × ');
    return {
      error: `La combinación genera ${combinations.length} variedades (${breakdown} = ${combinations.length}), superando el límite de ${MAX_VARIANTS}. Reducí la cantidad de tipos o valores.`,
    };
  }

  // sharedTypeIds: types present in both desired AND previous
  const sharedTypeIds = new Set(sharedTypes.map((t) => t.id));

  // Build a map: valueId → typeId (for every desired value)
  const valueToTypeId = new Map<string, string>();
  for (const t of desiredTypes) {
    for (const vid of t.valueIds) {
      valueToTypeId.set(vid, t.id);
    }
  }

  // For each existing variant, build its "shared projection" (only values
  // belonging to shared types).
  function sharedKey(valueIds: Set<string>): string {
    const sharedVids: string[] = [];
    for (const vid of valueIds) {
      const tid = valueToTypeId.get(vid);
      if (tid && sharedTypeIds.has(tid)) sharedVids.push(vid);
    }
    return sharedVids.sort().join(',');
  }

  // Build "used" tracking set (variant id → consumed)
  const unusedVariants = new Map<string, ActiveVariant>(
    currentVariants.map((v) => [v.id, v])
  );

  // For partial matching, group unused variants by their shared projection.
  // We'll build this lazily: partialMap[sharedKey] = [variantId, ...]
  const partialMap = new Map<string, string[]>();
  for (const v of currentVariants) {
    const key = sharedKey(v.valueIds);
    if (!partialMap.has(key)) partialMap.set(key, []);
    partialMap.get(key)!.push(v.id);
  }

  // For each desired combo, determine what to do.
  type ComboAction =
    | { kind: 'keep'; variantId: string }
    | { kind: 'insert'; stock: number | null; price_override: number | null; image_url: string | null }
    | { kind: 'insert-inherit'; stock: number | null; price_override: number | null; image_url: string | null };

  const actions: ComboAction[] = [];

  // First pass: exact matches
  const comboSetKeys = combinations.map((combo) => [...combo].sort().join(','));

  for (let i = 0; i < combinations.length; i++) {
    const sigKey = comboSetKeys[i];
    let matched: ActiveVariant | undefined;
    for (const v of unusedVariants.values()) {
      const vSig = [...v.valueIds].sort().join(',');
      if (vSig === sigKey) {
        matched = v;
        break;
      }
    }
    if (matched) {
      actions.push({ kind: 'keep', variantId: matched.id });
      unusedVariants.delete(matched.id);
    } else {
      // Placeholder — will be resolved in second pass
      actions.push({ kind: 'insert', stock: null, price_override: null, image_url: null });
    }
  }

  // Second pass: partial inheritance for unmatched combos
  // Track which partial keys have already been "inherited" (first of group gets real stock)
  const inheritedPartialKeys = new Set<string>();

  for (let i = 0; i < combinations.length; i++) {
    if (actions[i].kind !== 'insert') continue;

    const combo = combinations[i];
    const comboValueSet = new Set(combo);
    const pKey = sharedKey(comboValueSet);

    // Find first unused variant whose shared projection matches
    let inherited: ActiveVariant | undefined;
    const candidates = partialMap.get(pKey) ?? [];
    for (const vid of candidates) {
      if (unusedVariants.has(vid)) {
        inherited = unusedVariants.get(vid)!;
        break;
      }
    }

    if (inherited && !inheritedPartialKeys.has(pKey)) {
      // First combo for this shared key inherits real values
      inheritedPartialKeys.add(pKey);
      unusedVariants.delete(inherited.id);
      actions[i] = {
        kind: 'insert-inherit',
        stock: inherited.stock,
        price_override: inherited.price_override,
        image_url: inherited.image_url,
      };
    } else if (hadMatrixBefore) {
      // Matrix existed before but no partial match → stock=0
      actions[i] = { kind: 'insert', stock: 0, price_override: null, image_url: null };
    } else {
      // No previous matrix → stock=null (no tracking)
      actions[i] = { kind: 'insert', stock: null, price_override: null, image_url: null };
    }
  }

  // Determine stale variants (not matched by exact match)
  const staleVariantIds = [...unusedVariants.keys()];

  // Soft-delete stale variants that appear in order_items; hard-delete the rest
  if (staleVariantIds.length > 0) {
    const { data: orderItems } = await admin
      .from('order_items')
      .select('variant_id')
      .in('variant_id', staleVariantIds);

    const inOrderIds = new Set(
      (orderItems ?? [])
        .map((oi: { variant_id: string | null }) => oi.variant_id)
        .filter((id): id is string => id !== null)
    );
    const toSoftDelete = staleVariantIds.filter((id) => inOrderIds.has(id));
    const toHardDelete = staleVariantIds.filter((id) => !inOrderIds.has(id));

    if (toSoftDelete.length > 0) {
      const { error } = await admin
        .from('product_variants')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', toSoftDelete);
      if (error) return { error: 'No se pudieron archivar las variedades obsoletas.' };
    }

    if (toHardDelete.length > 0) {
      const { error } = await admin
        .from('product_variants')
        .delete()
        .in('id', toHardDelete);
      if (error) return { error: 'No se pudieron eliminar las variedades obsoletas.' };
    }
  }

  // Insert new variants (combos with kind !== 'keep')
  // Reorder combinations back to original desired order (not the orderedTypes order).
  // Build a mapping from orderedTypes index to desiredTypes index for the combo arrays.
  // Since we reordered types as [...sharedTypes, ...newTypes], we need to reconstruct
  // the join rows with the correct value ids from the combo.
  // The combo array is indexed by orderedTypes position. Join rows need only the valueIds,
  // so we can use the combo directly.

  for (let i = 0; i < combinations.length; i++) {
    const action = actions[i];
    if (action.kind === 'keep') continue;

    const combo = combinations[i];

    const { data: variant, error: variantError } = await admin
      .from('product_variants')
      .insert({
        product_id: productId,
        stock: action.stock,
        price_override: action.price_override,
        image_url: action.image_url,
        position: i,
      })
      .select('id')
      .single();

    if (variantError || !variant) {
      return { error: 'No se pudo crear la variedad.' };
    }

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
  }

  return { ok: true, variantCount: combinations.length };
}

// ---------------------------------------------------------------------------
// 2.2 upsertProductOptions
//
// Full reconciliation: receives the complete desired state (ordered types +
// values), upserts types/values in the DB, then calls reconcileVariants to
// diff and update the variant matrix while preserving stock where possible.
//
// This replaces the old "first setup only" semantics — it can be called at
// any time, including when adding a new type to an existing matrix.
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

  const { allowVariants } = getPlanLimits((store as unknown as { plan: PlanId | null }).plan);
  if (!allowVariants) {
    return { error: 'Tu plan no incluye variedades. Pasate a un plan superior para habilitarlas.' };
  }

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

    // Load current DB state: existing types and active variants
    const { data: existingTypes } = await admin
      .from('product_option_types')
      .select('id, name, position')
      .eq('product_id', productId);

    const { data: existingVariantRows } = await admin
      .from('product_variants')
      .select('id, stock, price_override, image_url, position, product_variant_option_values(option_value_id)')
      .eq('product_id', productId)
      .is('deleted_at', null);

    const previousTypeIds = new Set((existingTypes ?? []).map((t) => t.id));

    const currentVariants: ActiveVariant[] = (existingVariantRows ?? []).map((v) => ({
      id: v.id,
      stock: v.stock,
      price_override: v.price_override,
      image_url: v.image_url,
      position: v.position,
      valueIds: new Set(
        (v.product_variant_option_values as Array<{ option_value_id: string }> | null ?? [])
          .map((ov) => ov.option_value_id)
      ),
    }));

    // Upsert option types (by name — DB has UNIQUE(product_id, name))
    const typeIdMap: Record<string, string> = {};

    for (let i = 0; i < rawTypes.length; i++) {
      const { name } = rawTypes[i];
      const existing = (existingTypes ?? []).find((t) => t.name === name);
      if (existing) {
        typeIdMap[name] = existing.id;
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

    // Upsert option values per type and collect ordered value id arrays
    const desiredTypes: Array<{ id: string; valueIds: string[] }> = [];

    for (const { name, values } of rawTypes) {
      const trimmedValues = values.map((v) => v.trim());
      if (new Set(trimmedValues).size !== trimmedValues.length) {
        return { error: `Los valores del tipo "${name}" deben ser únicos.` };
      }

      const typeId = typeIdMap[name];

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

      desiredTypes.push({ id: typeId, valueIds });
    }

    // Reconcile variants (cap check + matching + persistence)
    const result = await reconcileVariants({
      productId,
      desiredTypes,
      previousTypeIds,
      currentVariants,
      admin,
    });

    if ('error' in result) return result;

    revalidatePath('/dashboard', 'layout');
    return result;
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
// Thin wrapper: loads current state from DB, appends the new value to the
// target type, then delegates to upsertProductOptions so stock inheritance
// follows the same reconciliation path.
// ---------------------------------------------------------------------------

export type AddOptionValueInput = { optionTypeId: string; value: string };
export type AddOptionValueResult =
  | { ok: true; newVariantCount: number }
  | { error: string };

export async function addOptionValue(
  input: AddOptionValueInput
): Promise<AddOptionValueResult> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  const { allowVariants } = getPlanLimits((store as unknown as { plan: PlanId | null }).plan);
  if (!allowVariants) {
    return { error: 'Tu plan no incluye variedades. Pasate a un plan superior para habilitarlas.' };
  }

  const value = input.value?.trim();
  if (!value) return { error: 'El valor no puede estar vacío.' };
  if (value.length > MAX_LABEL_LEN) return { error: `Máximo ${MAX_LABEL_LEN} caracteres.` };

  try {
    const admin = createAdminClient();

    // Verify the option type belongs to a product owned by this store
    const { data: optionType } = await admin
      .from('product_option_types')
      .select('id, product_id, products(store_id)')
      .eq('id', input.optionTypeId)
      .maybeSingle();

    const optionTypeWithProduct = optionType as typeof optionType & {
      products: { store_id: string } | null;
    };

    if (!optionTypeWithProduct || optionTypeWithProduct.products?.store_id !== store.id) {
      return { error: 'Tipo de opción no encontrado.' };
    }

    const productId = optionTypeWithProduct.product_id;

    // Load all current types + values for this product
    const { data: allTypes } = await admin
      .from('product_option_types')
      .select('id, name, position, product_option_values(id, value, position)')
      .eq('product_id', productId)
      .order('position');

    if (!allTypes) return { error: 'No se pudo cargar los tipos de opción.' };

    // Build the desired state: same types/values, but append the new value to the target type
    const optionTypes = allTypes.map((t) => {
      const sortedValues = ((t.product_option_values as Array<{ id: string; value: string; position: number }> | null) ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((v) => v.value);

      if (t.id === input.optionTypeId) {
        // Check uniqueness before appending
        if (sortedValues.includes(value)) {
          return { name: t.name, values: sortedValues }; // will be caught below
        }
        return { name: t.name, values: [...sortedValues, value] };
      }
      return { name: t.name, values: sortedValues };
    });

    // Check if value already exists (would cause duplicate error in upsert)
    const targetType = allTypes.find((t) => t.id === input.optionTypeId);
    const existing = (targetType?.product_option_values as Array<{ value: string }> | null ?? []);
    if (existing.some((v) => v.value === value)) {
      return { error: `El valor "${value}" ya existe en este tipo de opción.` };
    }

    const result = await upsertProductOptions({ productId, optionTypes });
    if ('error' in result) return result;

    return { ok: true, newVariantCount: result.variantCount };
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
// 2.7 uploadVariantImage
//
// Uses admin client for Storage (ES256 gotcha — same pattern as uploadProductImageAction).
// Path: product-images/<store_id>/<product_id>/<variant_id>/<uuid>.<ext>
// Uses the same bucket as product images ("product-images").
// ---------------------------------------------------------------------------

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

  const { buffer: optimized, ext, contentType } = await optimizeImage(file, { maxWidth: 1600, quality: 80 });
  const path = `${store.id}/${v.product_id}/${variantId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await admin.storage
    .from('product-images')
    .upload(path, optimized, { contentType });

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
