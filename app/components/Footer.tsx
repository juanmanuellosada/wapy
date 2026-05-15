import Image from "next/image";

const navLinks = [
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#features", label: "Funcionalidades" },
  { href: "#precios", label: "Precios" },
];

const legalLinks = [
  { href: "#", label: "Términos" },
  { href: "#", label: "Privacidad" },
  { href: "#", label: "Contacto" },
];

export default function Footer() {
  return (
    <footer className="bg-[#0E1820] border-t border-white/10 py-12 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        {/* Top row: wordmark + nav */}
        <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-8 mb-10">
          {/* Brand */}
          <div className="flex flex-col items-center md:items-start gap-3">
            <Image
              src="/brand/wordmark.png"
              alt="Wapy"
              width={90}
              height={36}
              className="h-9 w-auto brightness-0 invert"
            />
            <p className="text-white/35 text-sm text-center md:text-left max-w-xs">
              Menos vueltas, más pedidos.
            </p>
          </div>

          {/* Nav */}
          <nav className="flex flex-wrap justify-center md:justify-end gap-x-8 gap-y-2">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-white/50 text-sm font-medium hover:text-[#F5C84B] transition-colors duration-200 cursor-pointer"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>

        {/* Divider */}
        <div className="border-t border-white/8 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-white/30 text-sm text-center sm:text-left">
            © {new Date().getFullYear()} Wapy. Todos los derechos reservados.
          </p>
          <nav className="flex gap-6">
            {legalLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-white/35 text-sm hover:text-white/70 transition-colors duration-200 cursor-pointer"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
