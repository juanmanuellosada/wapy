import { createServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getStoreState } from '@/lib/onboarding/state';
import type { Metadata } from 'next';
import { CopyLinkButton } from './CopyLinkButton';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mi tienda — Wapy',
};

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://wapy.com.ar';

export default async function DashboardPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirect=/dashboard');
  }

  const { store } = await getStoreState(user.id);

  if (!store || store.status !== 'published') {
    redirect('/onboarding');
  }

  const storeUrl = `${APP_URL}/${store.slug}`;

  return (
    <div className="min-h-dvh bg-[#16222E] flex items-center justify-center px-4 py-10">
      {/* Dot grid background */}
      <div
        aria-hidden
        className="fixed inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, #F5C84B 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative z-10 w-full max-w-md space-y-4">
        {/* Logo */}
        <p className="font-display text-2xl text-[#F5C84B] text-center mb-6">Wapy</p>

        {/* Celebration card */}
        <div className="bg-[#FBF7EC] rounded-2xl shadow-2xl px-6 py-8 text-center">
          <div
            aria-hidden
            className="w-16 h-16 bg-[#F5C84B] rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl"
          >
            🎉
          </div>
          <h1 className="text-xl font-bold text-[#16222E] mb-2">
            ¡Tu tienda está publicada!
          </h1>
          <p className="text-sm text-[#16222E]/60 mb-6">
            <span className="font-semibold text-[#16222E]">{store.name}</span> ya está en línea.
          </p>

          {/* Store URL */}
          <div className="bg-[#16222E]/5 rounded-xl px-4 py-3 mb-4">
            <p className="text-xs text-[#16222E]/40 mb-1">URL de tu tienda</p>
            <a
              href={storeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-mono font-semibold text-[#16222E] hover:text-[#D9A92A] transition-colors break-all"
            >
              {storeUrl}
            </a>
          </div>

          <CopyLinkButton url={storeUrl} />
        </div>

        {/* Edit placeholder */}
        <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#F5C84B]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span aria-hidden className="text-sm">⚙️</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#FBF7EC]">Editar tienda</p>
              <p className="text-xs text-white/40 mt-0.5">
                Podés editar tu tienda, productos y secciones próximamente en Fase 5.
              </p>
            </div>
            <span className="ml-auto flex-shrink-0 text-xs font-semibold bg-white/10 text-white/40 px-2 py-0.5 rounded-full">
              Próximamente
            </span>
          </div>
        </div>

        {/* Logout */}
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="w-full min-h-[44px] rounded-xl border border-white/20 text-white/60 font-semibold text-sm hover:border-white/40 hover:text-white/80 transition-colors cursor-pointer"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
