import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { AdminShell } from '../_components/AdminShell';
import { AddEmailForm } from '../AddEmailForm';
import { WhitelistTable } from '../WhitelistTable';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin — Whitelist — Wapy',
};

async function getSessionUser() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/admin/whitelist');

  const { data: row } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (row?.role !== 'superadmin') redirect('/onboarding');

  return user;
}

export default async function AdminWhitelistPage() {
  const user = await getSessionUser();
  const admin = createAdminClient();

  const { data: whitelist } = await admin
    .from('whitelist')
    .select('*')
    .order('invited_at', { ascending: false });

  const rows = whitelist ?? [];

  return (
    <AdminShell email={user.email ?? ''} currentTab="whitelist">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Whitelist de acceso</h1>
          <p className="text-sm text-white/50">
            {rows.length} {rows.length === 1 ? 'entrada' : 'entradas'} en total
          </p>
        </div>

        <AddEmailForm />

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#16222E]/10">
            <h2 className="text-sm font-bold text-[#16222E]">Emails invitados</h2>
          </div>
          <div className="p-4">
            <WhitelistTable rows={rows} />
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
