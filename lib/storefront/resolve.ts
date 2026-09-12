import { cache } from 'react';
import { createClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import type { Database, Json } from '@/lib/supabase/types';
import type { Tables } from '@/lib/supabase/types';
import { isPubliclyAvailable } from '@/lib/subscription/state';
import type { PriceTier } from '@/lib/store/pricing';

export type StoreRow = Tables<'stores'>;
export type SectionRow = Tables<'sections'>;
// El costo de mercadería (add-product-cost-tracking, Decisión D7) es un dato
// interno del dueño: el camino público NUNCA debe poder leerlo, así que el
// tipo lo excluye a propósito — cualquier código que intente leer
// `product.cost_cents` acá adentro no compila. Ver el `select` explícito más
// abajo, que es lo que hace cumplir esto en runtime.
export type ProductRow = Omit<Tables<'products'>, 'cost_cents'>;

/**
 * Lo único de `stores` que puede cruzar al cliente. `StoreRow` trae también
 * columnas comerciales (plan, order_seq, estado de suscripción/MP, owner_id,
 * config interna de WhatsApp) que jamás deben viajar en el HTML público — ver
 * fix-store-public-payload. La garantía vive acá, en el tipo: una columna
 * nueva en `stores` queda afuera de este objeto por omisión, no adentro por
 * descuido de un `select('*')`.
 */
export interface PublicStoreRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  theme: Json;
  social_links: Json;
  whatsapp_number: string | null;
  checkout_mode: string;
  default_product_sort: string;
  out_of_stock_last: boolean;
}

/** Lo mínimo que necesita la pantalla de mantenimiento. */
export type PublicMaintenanceStore = Pick<PublicStoreRow, 'name' | 'logo_url' | 'theme'>;

function toPublicStore(row: StoreRow): PublicStoreRow {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    logo_url: row.logo_url,
    theme: row.theme,
    social_links: row.social_links,
    whatsapp_number: row.whatsapp_number,
    checkout_mode: row.checkout_mode,
    default_product_sort: row.default_product_sort,
    out_of_stock_last: row.out_of_stock_last,
  };
}

function toPublicMaintenanceStore(
  row: Pick<StoreRow, 'name' | 'logo_url' | 'theme'>
): PublicMaintenanceStore {
  return { name: row.name, logo_url: row.logo_url, theme: row.theme };
}

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
  | {
      kind: 'render';
      store: PublicStoreRow;
      sections: SectionRow[];
      products: ProductRow[];
      variantsByProduct: Record<string, ProductVariantData>;
      /** Tramos de precio por cantidad por producto. Los productos sin tramos no aparecen. */
      priceTiersByProduct: Record<string, PriceTier[]>;
    }
  | { kind: 'redirect'; toSlug: string }
  | { kind: 'maintenance'; store: PublicMaintenanceStore }
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
    // isPubliclyAvailable lee los campos de facturación de `pub` (la fila
    // completa) acá mismo, en el servidor — lo que cambia es que el objeto
    // que sigue de acá en adelante hacia el cliente es la proyección pública.
    if (!isPubliclyAvailable(pub, new Date())) {
      return { kind: 'maintenance', store: toPublicMaintenanceStore(pub) };
    }

    const [sectionsResult, productsResult] = await Promise.all([
      anon
        .from('sections')
        .select('*')
        .eq('store_id', pub.id)
        .eq('is_active', true)
        .order('position'),
      // D7: columnas explícitas, SIN cost_cents — este resultado viaja tal
      // cual como prop a un client component (StoreClient) y termina en el
      // HTML/JSON que ve cualquier visitante. Un `select('*')` acá filtraría
      // el costo de mercadería a la tienda pública, competencia incluida.
      anon
        .from('products')
        .select(
          'id, store_id, section_id, name, description, price_cents, promo_price_cents, currency, image_urls, stock, is_active, position, min_quantity, qty_step, created_at, updated_at'
        )
        .eq('store_id', pub.id)
        .eq('is_active', true)
        .order('position'),
    ]);

    const products = productsResult.data ?? [];

    // Fetch variants for all active products in one query set.
    // RLS on the new tables ensures anon can only read public store data.
    const variantsByProduct: Record<string, ProductVariantData> = {};
    const priceTiersByProduct: Record<string, PriceTier[]> = {};

    if (products.length > 0) {
      const productIds = products.map((p) => p.id);

      // Tramos de precio por cantidad (RLS anon: solo productos activos de tiendas publicadas)
      const { data: tierRows } = await anon
        .from('product_price_tiers')
        .select('product_id, min_quantity, unit_price_cents')
        .in('product_id', productIds)
        .order('min_quantity');

      for (const t of tierRows ?? []) {
        (priceTiersByProduct[t.product_id] ??= []).push({
          min_quantity: t.min_quantity,
          unit_price_cents: t.unit_price_cents,
        });
      }

      // Fetch option types + values
      const { data: optionTypeRows } = await anon
        .from('product_option_types')
        .select('id, name, position, product_id, product_option_values(id, value, position)')
        .in('product_id', productIds)
        .order('position');

      // Fetch variants + their option value associations. Ya explícito y sin
      // cost_override (D7); además el objeto público (StorefrontVariant, más
      // abajo) se arma campo a campo, así que ni un select más amplio lo
      // filtraría — doble resguardo.
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
      store: toPublicStore(pub),
      sections: sectionsResult.data ?? [],
      products,
      variantsByProduct,
      priceTiersByProduct,
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
    return { kind: 'maintenance', store: toPublicMaintenanceStore(anyStore) };
  }

  // Also check via slug_history → admin → paused
  if (hist) {
    const { data: histStore } = await admin
      .from('stores')
      .select('name, logo_url, theme, status')
      .eq('id', hist.store_id)
      .maybeSingle();

    if (histStore?.status === 'paused') {
      return { kind: 'maintenance', store: toPublicMaintenanceStore(histStore) };
    }
  }

  return { kind: 'not_found' };
}

// Memoized with React cache() so generateMetadata and page() share one request's result
export const resolveStoreSlug = cache(_resolveStoreSlug);
