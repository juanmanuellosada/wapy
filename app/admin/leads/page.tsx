import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { AdminShell } from '../_components/AdminShell';
import { LeadsTable } from './LeadsTable';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin — Leads — Wapy',
};

async function getSessionUser() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/admin/leads');

  // Use admin client for role lookup — anon with RLS can fail in edge cases.
  const admin = createAdminClient();
  const { data: row } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (row?.role !== 'superadmin') redirect('/onboarding');

  return user;
}

export default async function AdminLeadsPage() {
  const user = await getSessionUser();
  const admin = createAdminClient();

  const { data: leads } = await admin
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false });

  const rows = leads ?? [];

  return (
    <AdminShell email={user.email ?? ''} currentTab="leads">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Leads</h1>
          <p className="text-sm text-white/50">
            {rows.length} {rows.length === 1 ? 'lead' : 'leads'} en total
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#16222E]/10">
            <h2 className="text-sm font-bold text-[#16222E]">Solicitudes de acceso</h2>
          </div>
          <div className="p-4">
            <LeadsTable rows={rows} />
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
