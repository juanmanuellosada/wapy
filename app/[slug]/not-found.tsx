import WapyFooter from "@/app/components/WapyFooter";

export default function SlugNotFound() {
  return (
    <div
      className="store-scope min-h-screen flex flex-col"
      style={{ background: "#fafaf8", color: "#1a1714" }}
    >
      <main className="flex-1 flex flex-col items-center justify-center gap-6 px-4 py-20 text-center">
        {/* Wapy logo / mascot */}
        <div
          className="flex h-20 w-20 items-center justify-center rounded-2xl text-3xl"
          style={{ background: "#F5C84B20", border: "2px solid #F5C84B40" }}
          aria-hidden="true"
        >
          🛍️
        </div>

        {/* Headline */}
        <div className="flex flex-col gap-2 max-w-sm">
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: "#1a1714", fontFamily: "var(--font-rubik, Rubik)" }}
          >
            Esta tienda no existe (todavía)
          </h1>
          <p className="text-sm" style={{ color: "#5c5651" }}>
            El link que visitaste no corresponde a ninguna tienda activa en Wapy.
          </p>
        </div>

        {/* CTA */}
        <a
          href="/signup"
          className="mt-2 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-85 cursor-pointer"
          style={{ background: "#1a1714", color: "#fafaf8" }}
        >
          Armá tu tienda gratis en Wapy
        </a>
      </main>

      <WapyFooter />
    </div>
  );
}
