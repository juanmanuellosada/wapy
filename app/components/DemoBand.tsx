import { ArrowRight } from "lucide-react";

const DEMO_URL =
  process.env.NEXT_PUBLIC_DEMO_URL ?? "http://demo.localhost:3000";

export default function DemoBand() {
  return (
    <section className="py-20 md:py-24 px-4 sm:px-6 bg-[#FBF7EC] relative overflow-hidden">
      {/* Decorative shapes */}
      <div
        aria-hidden
        className="absolute top-0 left-0 w-64 h-64 rounded-full opacity-30"
        style={{
          background: "radial-gradient(circle, #F5C84B 0%, transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="absolute bottom-0 right-0 w-48 h-48 rounded-full opacity-20"
        style={{
          background: "radial-gradient(circle, #D9A92A 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 max-w-5xl mx-auto">
        <div className="bg-[#16222E] rounded-[2rem] px-8 py-14 md:px-16 md:py-16 flex flex-col md:flex-row items-center gap-8 text-center md:text-left shadow-2xl overflow-hidden">
          {/* Inner glow */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                "radial-gradient(circle, #F5C84B 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          />

          {/* Big yellow accent shape */}
          <div
            aria-hidden
            className="absolute -top-12 -right-12 w-48 h-48 bg-[#F5C84B]/10 rounded-full"
          />

          <div className="relative z-10 flex-1">
            <span className="inline-block px-3 py-1 rounded-full bg-[#F5C84B]/15 text-[#F5C84B] text-xs font-bold uppercase tracking-widest mb-4">
              Demo en vivo
            </span>
            <h2
              className="text-2xl md:text-4xl font-bold text-white mb-3"
              style={{ fontFamily: "var(--font-agbalumo)" }}
            >
              Mirá cómo se ve una tienda real
            </h2>
            <p className="text-white/60 text-base md:text-lg">
              Entrá a nuestra tienda de demo y viví la experiencia desde adentro.
            </p>
          </div>

          <div className="relative z-10 flex-shrink-0">
            <a
              href={DEMO_URL}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-[#F5C84B] text-[#16222E] font-extrabold text-base hover:bg-[#D9A92A] hover:scale-105 transition-all duration-200 shadow-xl shadow-[#F5C84B]/20 cursor-pointer min-h-[52px]"
            >
              Ver tienda de ejemplo
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
