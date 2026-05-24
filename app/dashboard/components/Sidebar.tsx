'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Info,
  Image,
  Layout,
  Package,
  MessageCircle,
  Settings,
  ExternalLink,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import type { Store } from '@/lib/onboarding/state';
import { logoutAction } from '@/lib/auth/logout-action';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://wapy.com.ar';

const NAV_ITEMS = [
  { id: 'info', label: 'Información', icon: Info },
  { id: 'image', label: 'Imagen', icon: Image },
  { id: 'sections', label: 'Secciones', icon: Layout },
  { id: 'products', label: 'Productos', icon: Package },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { id: 'settings', label: 'Configuración', icon: Settings },
] as const;

type Props = {
  store: Store;
  currentSection: string;
};

function SidebarContent({ store, currentSection, onClose }: Props & { onClose?: () => void }) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-white/10">
        <Link href="/" className="font-display text-xl text-[#F5C84B]">
          Wapy
        </Link>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-white/50 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer lg:hidden"
            aria-label="Cerrar menú"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Store name */}
      <div className="px-5 py-3 border-b border-white/5">
        <p className="text-xs text-white/40 truncate">Tu tienda</p>
        <p className="text-sm font-semibold text-[#FBF7EC] truncate">{store.name}</p>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-3 space-y-0.5" aria-label="Secciones del panel">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = currentSection === id;
          return (
            <Link
              key={id}
              href={`/dashboard/${id}`}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[#F5C84B]/15 text-[#F5C84B]'
                  : 'text-white/60 hover:text-white hover:bg-white/8'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={16} className={isActive ? 'text-[#F5C84B]' : 'text-white/40'} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-white/10 space-y-1">
        <a
          href={`${APP_URL}/${store.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-white/8 transition-colors"
        >
          <ExternalLink size={16} className="text-white/40" />
          Ver tienda
        </a>
        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-white/8 transition-colors cursor-pointer"
          >
            <LogOut size={16} className="text-white/40" />
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}

export function Sidebar({ store, currentSection }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      {/* Mobile: hamburger button at top */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-30 w-10 h-10 rounded-xl bg-[#1A2634] border border-white/15 flex items-center justify-center text-white/70 hover:text-white hover:border-white/30 transition-colors cursor-pointer"
        aria-label="Abrir menú"
        aria-expanded={drawerOpen}
      >
        <Menu size={18} />
      </button>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <div className="relative z-50 w-64 bg-[#16222E] border-r border-white/10 flex flex-col">
            <SidebarContent
              store={store}
              currentSection={currentSection}
              onClose={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Desktop: fixed sidebar */}
      <aside className="hidden lg:flex flex-col fixed top-0 left-0 h-screen w-60 bg-[#16222E] border-r border-white/10 z-20">
        <SidebarContent store={store} currentSection={currentSection} />
      </aside>
    </>
  );
}
