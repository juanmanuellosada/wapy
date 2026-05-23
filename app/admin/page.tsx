import { createServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin — Wapy',
};

export default async function AdminPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirect=/admin');
  }

  return (
    <div className="min-h-dvh bg-[#16222E] flex items-center justify-center px-4">
      {/* Dot grid background */}
      <div
        aria-hidden
        className="fixed inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, #F5C84B 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative z-10 w-full max-w-md bg-[#FBF7EC] rounded-2xl shadow-2xl px-8 py-10 text-center">
        {/* Logo */}
        <p className="font-display text-3xl text-[#16222E] mb-6">Wapy</p>

        <div
          aria-hidden
          className="w-16 h-16 bg-[#F5C84B] rounded-2xl flex items-center justify-center mx-auto mb-5 text-2xl"
        >
          ⚙️
        </div>

        <h1 className="text-xl font-bold text-[#16222E] mb-2">Panel de administración</h1>
        <p className="text-sm text-[#16222E]/60 mb-1">
          Logueado como <span className="font-semibold text-[#16222E]">{user.email}</span>
        </p>
        <p className="text-sm text-[#16222E]/50 mb-8">
          Pronto: gestión de whitelist, invites y stats de la plataforma. Llegamos en Fase 3.
        </p>

        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="w-full min-h-[44px] rounded-xl border-2 border-[#16222E] text-[#16222E] font-bold text-sm hover:bg-[#16222E] hover:text-[#FBF7EC] transition-colors duration-150 cursor-pointer"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
