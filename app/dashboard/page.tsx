import { createServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getStoreState } from '@/lib/onboarding/state';

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

  // published or paused → send to info section
  redirect('/dashboard/info');
}
