import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { AddEmailForm } from './AddEmailForm';
import { WhitelistTable } from './WhitelistTable';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin — Wapy',
};

async function getSessionUser() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/admin');

  // Defense in depth: verify role even though middleware already checked
  const { data: row } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (row?.role !== 'superadmin') redirect('/onboarding');

  return user;
}

export default async function AdminPage() {
  const user = await getSessionUser();

  const admin = createAdminClient();
  const { data: whitelist } = await admin
    .from('whitelist')
    .select('*')
    .order('invited_at', { ascending: false });

  const rows = whitelist ?? [];

  return (
    <div className="min-h-dvh bg-[#16222E]">
      {/* Dot grid background */}
      <div
        aria-hidden
        className="fixed inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, #F5C84B 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative z-10 flex flex-col min-h-dvh">
        {/* Header */}
        <header className="border-b border-white/10 bg-[#16222E]/95 backdrop-blur-sm sticky top-0 z-20">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="font-display text-2xl text-white leading-none">Wapy</span>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-[#F5C84B]/20 text-[#F5C84B] border border-[#F5C84B]/30 uppercase">
                Admin
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="hidden sm:block text-xs text-white/50 truncate max-w-[200px]">
                {user.email}
              </span>
              <form action="/api/auth/logout" method="POST">
                <button
                  type="submit"
                  className="min-h-[36px] px-4 py-1.5 rounded-lg border border-white/20 text-white/80 text-xs font-semibold hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5C84B] transition-colors duration-150 cursor-pointer"
                >
                  Cerrar sesión
                </button>
              </form>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
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
        </main>
      </div>
    </div>
  );
}
