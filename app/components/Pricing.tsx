import { Check, ArrowRight } from "lucide-react";

const features = [
  "Subdominio propio",
  "Catálogo ilimitado",
  "Pedidos por WhatsApp",
  "Carrito de compras",
  "100% mobile",
];

export default function Pricing() {
  return (
    <section
      id="precios"
      className="py-20 md:py-28 px-4 sm:px-6 bg-[#16222E] relative overflow-hidden"
    >
      {/* Dot grid */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "radial-gradient(circle, #F5C84B 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      {/* Glow behind card */}
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-center"
      >
        <div
          className="w-[600px] h-[400px] rounded-full opacity-15"
          style={{
            background:
              "radial-gradient(circle, #F5C84B 0%, transparent 65%)",
          }}
        />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto text-center">
        {/* Header */}
        <span className="inline-block px-4 py-1.5 rounded-full bg-[#F5C84B]/15 text-[#F5C84B] text-sm font-bold mb-5">
          Precios
        </span>
        <h2
          className="text-3xl md:text-5xl font-bold text-white mb-4"
          style={{ fontFamily: "var(--font-agbalumo)" }}
        >
          Empezá gratis
        </h2>
        <p className="text-white/55 text-lg max-w-xl mx-auto mb-14">
          Sin tarjeta de crédito. Sin sorpresas. Tu tienda lista en minutos.
        </p>

        {/* Card */}
        <div className="inline-flex flex-col items-center p-10 md:p-14 rounded-[2rem] bg-white/5 border-2 border-[#F5C84B]/30 shadow-2xl max-w-sm w-full relative overflow-hidden">
          {/* Card inner glow */}
          <div
            aria-hidden
            className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#F5C84B] to-transparent opacity-60 rounded-t-[2rem]"
          />

          <span className="text-[#F5C84B] text-xs font-extrabold uppercase tracking-widest mb-4">
            Plan Inicial
          </span>

          <div className="flex items-baseline gap-1 mb-1">
            <span
              className="text-6xl font-bold text-white"
              style={{ fontFamily: "var(--font-agbalumo)" }}
            >
              $0
            </span>
            <span className="text-white/40 text-base">/mes</span>
          </div>
          <p className="text-white/40 text-sm mb-10 font-medium">
            Para siempre
          </p>

          <ul className="text-left w-full space-y-4 mb-10">
            {features.map((item) => (
              <li key={item} className="flex items-center gap-3 text-white/80 text-sm">
                <span className="w-5 h-5 rounded-full bg-[#F5C84B] flex items-center justify-center flex-shrink-0 shadow-sm">
                  <Check className="w-3 h-3 text-[#16222E]" strokeWidth={3} />
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <a
            href="#"
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-full bg-[#F5C84B] text-[#16222E] font-extrabold text-base hover:bg-[#D9A92A] hover:scale-105 transition-all duration-200 shadow-xl shadow-[#F5C84B]/25 cursor-pointer min-h-[52px]"
          >
            Crear mi tienda gratis
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
