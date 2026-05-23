import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login?redirect=/admin');

  const { data: row } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (row?.role !== 'superadmin') redirect('/onboarding');

  redirect('/admin/leads');
}
