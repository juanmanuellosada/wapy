import { createServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getStoreState } from '@/lib/onboarding/state';
import { getSubscriptionState } from '@/lib/subscription/state';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirect=/dashboard');
  }

  const { store } = await getStoreState(user.id);

  if (!store || store.status === 'draft') {
    redirect('/onboarding');
  }

  // Decision 6: blocked stores may only access the subscription section.
  const subState = getSubscriptionState(store, new Date());
  if (subState === 'blocked') {
    redirect('/dashboard/subscription');
  }

  // published or paused → send to info section
  redirect('/dashboard/info');
}
