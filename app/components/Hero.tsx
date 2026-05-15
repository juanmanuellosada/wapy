import Image from "next/image";

const DEMO_URL =
  process.env.NEXT_PUBLIC_DEMO_URL ?? "http://demo.localhost:3000";

export default function Hero() {
  return (
    <section className="bg-[#F5C84B] px-4 py-16 md:py-24 overflow-hidden">
      <div className="max-w-6xl mx-auto flex flex-col-reverse md:flex-row items-center gap-10 md:gap-16">
        {/* Copy */}
        <div className="flex-1 text-center md:text-left">
          <h1
            className="text-4xl sm:text-5xl md:text-6xl font-bold text-[#16222E] leading-tight mb-4"
            style={{ fontFamily: "var(--font-agbalumo)" }}
          >
            Tu negocio,
            <br />
            más simple.
          </h1>
          <p className="text-[#16222E] text-lg md:text-xl max-w-md mx-auto md:mx-0 mb-8 opacity-80 leading-relaxed">
            Armá tu tienda online con subdominio propio y recibí los pedidos
            directo por WhatsApp. Menos vueltas, más pedidos.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
            <a
              href="#precios"
              className="inline-flex items-center justify-center px-7 py-3.5 rounded-full bg-[#16222E] text-[#F5C84B] font-bold text-base hover:bg-[#253545] transition-colors shadow-lg"
            >
              Crear mi tienda gratis
            </a>
            <a
              href={DEMO_URL}
              className="inline-flex items-center justify-center px-7 py-3.5 rounded-full border-2 border-[#16222E] text-[#16222E] font-bold text-base hover:bg-[#16222E]/10 transition-colors"
            >
              Ver tienda de ejemplo
            </a>
          </div>
        </div>

        {/* Mascot */}
        <div className="flex-shrink-0 flex justify-center">
          <Image
            src="/brand/mascot.png"
            alt="Mascota Wapy — W con cara y brazos dando un pulgar arriba"
            width={340}
            height={340}
            className="w-56 sm:w-72 md:w-80 h-auto drop-shadow-xl"
            priority
          />
        </div>
      </div>
    </section>
  );
}
