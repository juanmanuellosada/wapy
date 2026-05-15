"use client";

import Image from "next/image";
import { useState } from "react";

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-sm border-b border-gray-100 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Wordmark */}
        <a href="/" className="flex-shrink-0">
          <Image
            src="/brand/wordmark.png"
            alt="Wapy"
            width={90}
            height={36}
            className="h-9 w-auto"
            priority
          />
        </a>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-[#16222E]">
          <a href="#como-funciona" className="hover:text-[#F5C84B] transition-colors">
            Cómo funciona
          </a>
          <a href="#features" className="hover:text-[#F5C84B] transition-colors">
            Funcionalidades
          </a>
          <a href="#precios" className="hover:text-[#F5C84B] transition-colors">
            Precios
          </a>
        </nav>

        {/* CTA */}
        <div className="flex items-center gap-3">
          <a
            href="#precios"
            className="hidden md:inline-flex items-center px-5 py-2 rounded-full bg-[#F5C84B] text-[#16222E] font-bold text-sm hover:bg-[#D9A92A] transition-colors shadow-sm"
          >
            Crear mi tienda
          </a>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Abrir menú"
          >
            <span className="block w-5 h-0.5 bg-[#16222E] mb-1.5" />
            <span className="block w-5 h-0.5 bg-[#16222E] mb-1.5" />
            <span className="block w-5 h-0.5 bg-[#16222E]" />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 px-4 py-4 flex flex-col gap-4">
          <a href="#como-funciona" onClick={() => setMenuOpen(false)} className="text-[#16222E] font-semibold">
            Cómo funciona
          </a>
          <a href="#features" onClick={() => setMenuOpen(false)} className="text-[#16222E] font-semibold">
            Funcionalidades
          </a>
          <a href="#precios" onClick={() => setMenuOpen(false)} className="text-[#16222E] font-semibold">
            Precios
          </a>
          <a
            href="#precios"
            onClick={() => setMenuOpen(false)}
            className="inline-flex items-center justify-center px-5 py-3 rounded-full bg-[#F5C84B] text-[#16222E] font-bold text-sm"
          >
            Crear mi tienda
          </a>
        </div>
      )}
    </header>
  );
}
