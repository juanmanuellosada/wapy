import { cache } from 'react';
import { createClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/types';
import type { Tables } from '@/lib/supabase/types';
import { isPubliclyAvailable } from '@/lib/subscription/state';

export type StoreRow = Tables<'stores'>;
export type SectionRow = Tables<'sections'>;
export type ProductRow = Tables<'products'>;

/** A serialized option value (leaf node in the selector). */
export interface StorefrontOptionValue {
  id: string;
  value: string;
  position: number;
}

/** A serialized option type with its values (one selector per type). */
export interface StorefrontOptionType {
  id: string;
  name: string;
  position: number;
  values: StorefrontOptionValue[];
}

/** A serialized product variant ready for the client-side selector. */
export interface StorefrontVariant {
  id: string;
  stock: number | null; // null = no tracking (infinite stock)
  price_override: number | null;
  promo_price_override: number | null;
  image_url: string | null;
  position: number;
  /** Map from optionTypeId → optionValueId for this variant's combination. */
  optionValues: Record<string, string>;
}

/** Variants payload per product — only present when the product has option types. */
export interface ProductVariantData {
  optionTypes: StorefrontOptionType[];
  variants: StorefrontVariant[];
}

export type Resolution =
  | { kind: 'render'; store: StoreRow; sections: SectionRow[]; products: ProductRow[]; variantsByProduct: Record<string, ProductVariantData> }
  | { kind: 'redirect'; toSlug: string }
  | { kind: 'maintenance'; store: Pick<StoreRow, 'name' | 'logo_url' | 'theme'> }
  | { kind: 'not_found' };

function createAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new Error('Missing env var: NEXT_PUBLIC_SUPABASE_URL');
  if (!key) throw new Error('Missing env var: NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function _resolveStoreSlug(slug: string): Promise<Resolution> {
  const anon = createAnonClient();

  // Step 1: try direct match on published stores (anon RLS filters non-published)
  const { data: pub } = await anon
    .from('stores')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (pub) {
    // Decision 6: blocked stores show maintenance even when status='published'.
    if (!isPubliclyAvailable(pub, new Date())) {
      return { kind: 'maintenance', store: pub };
    }

    const [sectionsResult, productsResult] = await Promise.all([
      anon
        .from('sections')
        .select('*')
        .eq('store_id', pub.id)
        .eq('is_active', true)
        .order('position'),
      anon
        .from('products')
        .select('*')
        .eq('store_id', pub.id)
        .eq('is_active', true)
        .order('position'),
    ]);

    const products = productsResult.data ?? [];

    // Fetch variants for all active products in one query set.
    // RLS on the new tables ensures anon can only read public store data.
    const variantsByProduct: Record<string, ProductVariantData> = {};

    if (products.length > 0) {
      const productIds = products.map((p) => p.id);

      // Fetch option types + values
      const { data: optionTypeRows } = await anon
        .from('product_option_types')
        .select('id, name, position, product_id, product_option_values(id, value, position)')
        .in('product_id', productIds)
        .order('position');

      // Fetch variants + their option value associations
      const { data: variantRows } = await anon
        .from('product_variants')
        .select('id, product_id, stock, price_override, promo_price_override, image_url, position, product_variant_option_values(option_value_id, product_option_values(id, option_type_id))')
        .in('product_id', productIds)
        .is('deleted_at', null)
        .order('position');

      // Build a lookup: optionValueId → optionTypeId
      const valueToType = new Map<string, string>();
      for (const ot of optionTypeRows ?? []) {
        for (const ov of (ot.product_option_values ?? []) as Array<{ id: string; value: string; position: number }>) {
          valueToType.set(ov.id, ot.id);
        }
      }

      // Group option types by product
      const optionTypesByProduct = new Map<string, StorefrontOptionType[]>();
      for (const ot of optionTypeRows ?? []) {
        const otTyped = ot as {
          id: string; name: string; position: number; product_id: string;
          product_option_values: Array<{ id: string; value: string; position: number }>;
        };
        if (!optionTypesByProduct.has(otTyped.product_id)) {
          optionTypesByProduct.set(otTyped.product_id, []);
        }
        optionTypesByProduct.get(otTyped.product_id)!.push({
          id: otTyped.id,
          name: otTyped.name,
          position: otTyped.position,
          values: (otTyped.product_option_values ?? [])
            .map((ov) => ({ id: ov.id, value: ov.value, position: ov.position }))
            .sort((a, b) => a.position - b.position),
        });
      }

      // Group variants by product
      const variantsByProductId = new Map<string, StorefrontVariant[]>();
      for (const v of variantRows ?? []) {
        const vTyped = v as {
          id: string; product_id: string; stock: number | null; price_override: number | null;
          promo_price_override: number | null;
          image_url: string | null; position: number;
          product_variant_option_values: Array<{
            option_value_id: string;
            product_option_values: { id: string; option_type_id: string } | null;
          }>;
        };
        if (!variantsByProductId.has(vTyped.product_id)) {
          variantsByProductId.set(vTyped.product_id, []);
        }
        // Build optionValues map: optionTypeId → optionValueId
        const optionValues: Record<string, string> = {};
        for (const ov of vTyped.product_variant_option_values ?? []) {
          const typeId = ov.product_option_values?.option_type_id ?? valueToType.get(ov.option_value_id);
          if (typeId) {
            optionValues[typeId] = ov.option_value_id;
          }
        }
        variantsByProductId.get(vTyped.product_id)!.push({
          id: vTyped.id,
          stock: vTyped.stock,
          price_override: vTyped.price_override,
          promo_price_override: vTyped.promo_price_override,
          image_url: vTyped.image_url,
          position: vTyped.position,
          optionValues,
        });
      }

      // Assemble final map — only include products that actually have option types
      for (const productId of productIds) {
        const optionTypes = optionTypesByProduct.get(productId);
        if (optionTypes && optionTypes.length > 0) {
          variantsByProduct[productId] = {
            optionTypes,
            variants: variantsByProductId.get(productId) ?? [],
          };
        }
      }
    }

    return {
      kind: 'render',
      store: pub,
      sections: sectionsResult.data ?? [],
      products,
      variantsByProduct,
    };
  }

  // Step 2: try slug_history for 301 redirect
  const { data: hist } = await anon
    .from('slug_history')
    .select('store_id')
    .eq('old_slug', slug)
    .maybeSingle();

  if (hist) {
    const { data: current } = await anon
      .from('stores')
      .select('slug, status')
      .eq('id', hist.store_id)
      .maybeSingle();

    if (current && current.status === 'published') {
      return { kind: 'redirect', toSlug: current.slug };
    }
    // Store is paused/deleted — fall through to admin check
  }

  // Step 3: admin client to differentiate paused vs not-found
  const admin = createAdminClient();

  const { data: anyStore } = await admin
    .from('stores')
    .select('name, logo_url, theme, status')
    .eq('slug', slug)
    .maybeSingle();

  if (anyStore && anyStore.status === 'paused') {
    return { kind: 'maintenance', store: anyStore };
  }

  // Also check via slug_history → admin → paused
  if (hist) {
    const { data: histStore } = await admin
      .from('stores')
      .select('name, logo_url, theme, status')
      .eq('id', hist.store_id)
      .maybeSingle();

    if (histStore?.status === 'paused') {
      return { kind: 'maintenance', store: histStore };
    }
  }

  return { kind: 'not_found' };
}

// Memoized with React cache() so generateMetadata and page() share one request's result
export const resolveStoreSlug = cache(_resolveStoreSlug);
