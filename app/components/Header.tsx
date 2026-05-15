"use client";

import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const navLinks = [
    { href: "#como-funciona", label: "Cómo funciona" },
    { href: "#features", label: "Funcionalidades" },
    { href: "#precios", label: "Precios" },
  ];

  const headerBase =
    "sticky top-0 z-50 transition-all duration-300";
  const headerBg = scrolled
    ? "bg-[#16222E]/97 backdrop-blur-md shadow-lg"
    : "bg-transparent";

  // Logo text color: always white — readable over the navy hero (transparent state)
  // and over the solid navy background (scrolled state).
  const logoTextColor = "text-white";

  return (
    <header className={`${headerBase} ${headerBg}`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Wordmark — text-based so it is always crisp regardless of header state */}
        <a href="/" className="flex-shrink-0 cursor-pointer" aria-label="Wapy inicio">
          <span
            className={`text-2xl font-bold leading-none ${logoTextColor}`}
            style={{ fontFamily: "var(--font-agbalumo)" }}
          >
            wapy
          </span>
        </a>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-bold">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-white/80 hover:text-[#F5C84B] transition-colors duration-200 cursor-pointer"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Desktop CTA */}
        <div className="flex items-center gap-3">
          <a
            href="#precios"
            className="hidden md:inline-flex items-center px-5 py-2.5 rounded-full bg-[#F5C84B] text-[#16222E] font-extrabold text-sm hover:bg-[#D9A92A] transition-all duration-200 shadow-md hover:shadow-lg cursor-pointer"
          >
            Crear mi tienda
          </a>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden p-2 rounded-xl text-white hover:bg-white/10 transition-colors duration-200 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-[#16222E] border-t border-white/10 px-4 py-4 flex flex-col gap-1">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="text-white/80 font-bold py-3 px-2 rounded-xl hover:bg-white/10 hover:text-[#F5C84B] transition-colors duration-200 cursor-pointer min-h-[44px] flex items-center"
            >
              {link.label}
            </a>
          ))}
          <a
            href="#precios"
            onClick={() => setMenuOpen(false)}
            className="mt-2 inline-flex items-center justify-center px-5 py-3.5 rounded-full bg-[#F5C84B] text-[#16222E] font-extrabold text-sm hover:bg-[#D9A92A] transition-colors duration-200 cursor-pointer min-h-[44px]"
          >
            Crear mi tienda
          </a>
        </div>
      )}
    </header>
  );
}
