import Image from "next/image";

export default function Footer() {
  return (
    <footer className="bg-[#16222E] py-10 px-4">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <Image
          src="/brand/wordmark.png"
          alt="Wapy"
          width={80}
          height={32}
          className="h-8 w-auto brightness-0 invert"
        />
        <p className="text-white/40 text-sm text-center md:text-left">
          © {new Date().getFullYear()} Wapy. Menos vueltas, más pedidos.
        </p>
        <nav className="flex gap-6 text-white/50 text-sm">
          <a href="#" className="hover:text-white transition-colors">
            Términos
          </a>
          <a href="#" className="hover:text-white transition-colors">
            Privacidad
          </a>
          <a href="#" className="hover:text-white transition-colors">
            Contacto
          </a>
        </nav>
      </div>
    </footer>
  );
}
