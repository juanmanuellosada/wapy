import Image from "next/image";
import { ArrowRight, ExternalLink } from "lucide-react";

const DEMO_URL =
  process.env.NEXT_PUBLIC_DEMO_URL ?? "http://demo.localhost:3000";

export default function Hero() {
  return (
    <section
      className="relative overflow-hidden bg-[#16222E] min-h-[90vh] flex items-center"
      style={{ marginTop: "-4rem", paddingTop: "4rem" }}
    >
      {/* Background: dot grid */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "radial-gradient(circle, #F5C84B 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Background: soft radial glow centre */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(245,200,75,0.10) 0%, transparent 70%)",
        }}
      />

      {/* Geometric accent blob — top-left */}
      <div
        aria-hidden
        className="absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-15"
        style={{
          background:
            "radial-gradient(circle, #F5C84B 0%, transparent 70%)",
        }}
      />

      {/* Geometric accent blob — bottom-right */}
      <div
        aria-hidden
        className="absolute -bottom-32 -right-32 w-[500px] h-[500px] rounded-full opacity-10"
        style={{
          background:
            "radial-gradient(circle, #F5C84B 0%, transparent 60%)",
        }}
      />

      {/* Yellow geometric diamond — top right */}
      <div
        aria-hidden
        className="absolute top-16 right-[5%] w-16 h-16 bg-[#F5C84B]/20 rotate-45 rounded-lg hidden md:block"
      />
      {/* Smaller diamond */}
      <div
        aria-hidden
        className="absolute top-32 right-[12%] w-8 h-8 bg-[#F5C84B]/30 rotate-45 rounded-md hidden md:block"
      />
      {/* Bottom-left shape */}
      <div
        aria-hidden
        className="absolute bottom-24 left-[8%] w-12 h-12 bg-[#FAE08A]/15 rotate-12 rounded-xl hidden lg:block"
      />

      {/* Content */}
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-28 w-full">
        <div className="flex flex-col-reverse md:flex-row items-center gap-12 md:gap-10 lg:gap-16">

          {/* Copy */}
          <div className="flex-1 text-center md:text-left">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#F5C84B]/15 border border-[#F5C84B]/30 text-[#F5C84B] text-sm font-bold mb-6">
              <span className="w-2 h-2 rounded-full bg-[#F5C84B] inline-block" />
              Tu tienda en WhatsApp, ya
            </div>

            <h1
              className="font-bold text-white leading-tight mb-5"
              style={{
                fontFamily: "var(--font-agbalumo)",
                fontSize: "clamp(2.5rem, 7vw, 4.5rem)",
                lineHeight: 1.08,
              }}
            >
              Tu negocio,
              <br />
              <span className="text-[#F5C84B]">más simple.</span>
            </h1>

            <p className="text-white/70 text-lg md:text-xl max-w-md mx-auto md:mx-0 mb-8 leading-relaxed">
              Armá tu tienda online con subdominio propio y recibí los pedidos
              directo por WhatsApp. Menos vueltas, más pedidos.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
              <a
                href="#precios"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full bg-[#F5C84B] text-[#16222E] font-extrabold text-base hover:bg-[#D9A92A] hover:scale-105 transition-all duration-200 shadow-xl shadow-[#F5C84B]/25 cursor-pointer min-h-[52px]"
              >
                Crear mi tienda gratis
                <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href={DEMO_URL}
                className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full border-2 border-white/30 text-white font-bold text-base hover:border-[#F5C84B] hover:text-[#F5C84B] transition-all duration-200 cursor-pointer min-h-[52px]"
              >
                Ver tienda de ejemplo
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>

            {/* Social proof hint */}
            <p className="mt-6 text-white/35 text-sm">
              Sin tarjeta de crédito · Sin código · Listo en minutos
            </p>
          </div>

          {/* Mascot — placed inside a white card so the non-transparent PNG background reads as intentional */}
          <div className="flex-shrink-0 flex justify-center">
            <div
              className="animate-float rounded-[2rem] bg-white shadow-2xl shadow-[#F5C84B]/20 p-6 sm:p-8"
              style={{ boxShadow: "0 24px 60px rgba(245,200,75,0.22), 0 4px 20px rgba(0,0,0,0.18)" }}
            >
              <Image
                src="/brand/mascot.png"
                alt="Mascota Wapy — W con cara y brazos dando un pulgar arriba"
                width={380}
                height={380}
                className="w-44 sm:w-60 md:w-72 lg:w-[320px] h-auto block"
                priority
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
