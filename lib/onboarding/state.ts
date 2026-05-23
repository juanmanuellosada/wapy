import { createAdminClient } from '@/lib/supabase/server';
import type { Tables } from '@/lib/supabase/types';
import { stepNameFor, stepIndexFor } from './steps';

export type Store = Tables<'stores'>;
export type Section = Tables<'sections'>;
export type Product = Tables<'products'>;

// Re-export for convenience (server-only consumers that import state.ts)
export { STEP_NAMES, stepNameFor, stepIndexFor, canNavigateTo } from './steps';
export type { StepName } from './steps';

export type StoreState = {
  store: Store | null;
  sections: Section[];
  products: Product[];
  currentStep: import('./steps').StepName;
  canPublish: boolean;
};

/**
 * Server-side: reads the owner's store (and sections/products) using admin client.
 * Returns current step and publish eligibility.
 */
export async function getStoreState(userId: string): Promise<StoreState> {
  const admin = createAdminClient();

  const { data: store } = await admin
    .from('stores')
    .select('*')
    .eq('owner_id', userId)
    .maybeSingle();

  if (!store) {
    return { store: null, sections: [], products: [], currentStep: 'basics', canPublish: false };
  }

  if (store.status === 'published' || store.status === 'paused') {
    return { store, sections: [], products: [], currentStep: 'review', canPublish: true };
  }

  const { data: sections } = await admin
    .from('sections')
    .select('*')
    .eq('store_id', store.id)
    .eq('is_active', true)
    .order('position');

  const { data: products } = await admin
    .from('products')
    .select('*')
    .eq('store_id', store.id)
    .eq('is_active', true)
    .order('position');

  const sectionsArr = sections ?? [];
  const productsArr = products ?? [];

  const canPublish = validateForPublish(store, sectionsArr, productsArr);
  const currentStep = stepNameFor(store.onboarding_step);

  return { store, sections: sectionsArr, products: productsArr, currentStep, canPublish };
}

function validateForPublish(store: Store, sections: Section[], products: Product[]): boolean {
  if (!store.slug || !store.name) return false;
  if (sections.length < 1) return false;
  if (products.filter((p) => p.is_active).length < 1) return false;
  if (!store.whatsapp_number) return false;
  return true;
}
