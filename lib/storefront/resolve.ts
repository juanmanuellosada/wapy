import { cache } from 'react';
import { createClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/types';
import type { Tables } from '@/lib/supabase/types';

export type StoreRow = Tables<'stores'>;
export type SectionRow = Tables<'sections'>;
export type ProductRow = Tables<'products'>;

export type Resolution =
  | { kind: 'render'; store: StoreRow; sections: SectionRow[]; products: ProductRow[] }
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
    return {
      kind: 'render',
      store: pub,
      sections: sectionsResult.data ?? [],
      products: productsResult.data ?? [],
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
