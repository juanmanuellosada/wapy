import { createServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getStoreState } from '@/lib/onboarding/state';
import { stepNameFor } from '@/lib/onboarding/steps';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Configurá tu tienda — Wapy',
};

export default async function OnboardingPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirect=/onboarding');
  }

  const { store } = await getStoreState(user.id);

  if (!store) {
    redirect('/onboarding/basics');
  }

  if (store.status === 'published' || store.status === 'paused') {
    redirect('/dashboard');
  }

  // Draft: redirect to the step they're on
  const stepName = stepNameFor(store.onboarding_step);
  redirect(`/onboarding/${stepName}`);
}
