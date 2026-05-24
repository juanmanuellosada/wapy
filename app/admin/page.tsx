import { redirect } from 'next/navigation';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login?redirect=/admin');

  // Use admin client (bypass RLS) for role lookup. user.id from validated
  // session is safe. Anon-with-RLS reads of public.users can fail in edge
  // cases and would incorrectly redirect superadmins to /onboarding.
  const admin = createAdminClient();
  const { data: row } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (row?.role !== 'superadmin') redirect('/onboarding');

  redirect('/admin/leads');
}
