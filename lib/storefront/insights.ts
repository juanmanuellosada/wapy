"use server";

import { createClient } from "@supabase/supabase-js";

// We use an untyped client here because the generated Database types don't
// include the new RPCs until `supabase gen types` is re-run after the migration.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnonClient = ReturnType<typeof createClient<any>>;

function createAnonClient(): AnonClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new Error("Missing env var: NEXT_PUBLIC_SUPABASE_URL");
  if (!key) throw new Error("Missing env var: NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Returns product IDs ordered by units sold (most sold first) for the given
 * store in the last `days` days. Callable from Server Components (no "use server"
 * needed at the call site because this file is already server-only via the
 * "use server" directive).
 *
 * Returns [] on any error — callers should treat empty as "no data".
 */
export async function getTopSellers(
  storeId: string,
  days = 30,
  limit = 10
): Promise<string[]> {
  try {
    const anon = createAnonClient();
    const { data, error } = await anon.rpc("storefront_top_sellers", {
      p_store_id: storeId,
      p_days: days,
      p_limit: limit,
    });

    if (error) {
      console.warn("[getTopSellers] RPC error:", error.message);
      return [];
    }

    return (data ?? []).map(
      (row: { product_id: string; units_sold: number }) => row.product_id
    );
  } catch (err) {
    console.warn("[getTopSellers] unexpected error:", err);
    return [];
  }
}

/**
 * Returns IDs of products co-purchased with `productId` in confirmed/delivered
 * orders for the given store. Ordered by co-occurrence count descending.
 *
 * Marked "use server" so it can be called from client components as a
 * Server Action (task 6.3).
 *
 * Returns [] on any error.
 */
export async function getRelatedProductIds(
  productId: string,
  storeId: string,
  limit = 6
): Promise<string[]> {
  try {
    const anon = createAnonClient();
    const { data, error } = await anon.rpc("storefront_co_purchased", {
      p_product_id: productId,
      p_store_id: storeId,
      p_limit: limit,
    });

    if (error) {
      console.warn("[getRelatedProductIds] RPC error:", error.message);
      return [];
    }

    return (data ?? []).map(
      (row: { product_id: string; co_orders: number }) => row.product_id
    );
  } catch (err) {
    console.warn("[getRelatedProductIds] unexpected error:", err);
    return [];
  }
}
