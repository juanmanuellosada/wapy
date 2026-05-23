import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#16222E] flex flex-col items-center justify-center px-4 py-12">
      {/* Dot grid background — matches the Hero section */}
      <div
        aria-hidden
        className="fixed inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, #F5C84B 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Logo */}
      <Link
        href="/"
        className="relative z-10 mb-8 font-display text-4xl text-[#F5C84B] hover:opacity-80 transition-opacity"
        aria-label="Wapy — volver al inicio"
      >
        Wapy
      </Link>

      {/* Card */}
      <main
        role="main"
        className="relative z-10 w-full max-w-md bg-[#FBF7EC] rounded-2xl shadow-2xl px-8 py-10"
      >
        {children}
      </main>

      {/* Footer fine print */}
      <p className="relative z-10 mt-6 text-xs text-white/30">
        © {new Date().getFullYear()} Wapy
      </p>
    </div>
  );
}
