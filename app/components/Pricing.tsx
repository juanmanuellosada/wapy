export default function Pricing() {
  return (
    <section id="precios" className="py-16 md:py-24 px-4 bg-white">
      <div className="max-w-4xl mx-auto text-center">
        <h2
          className="text-3xl md:text-4xl font-bold text-[#16222E] mb-3"
          style={{ fontFamily: "var(--font-agbalumo)" }}
        >
          Empezá gratis
        </h2>
        <p className="text-[#16222E]/60 text-lg max-w-xl mx-auto mb-12">
          Sin tarjeta de crédito. Sin sorpresas. Tu tienda lista en minutos.
        </p>

        <div className="inline-flex flex-col items-center p-10 rounded-[2rem] bg-[#16222E] shadow-2xl max-w-sm w-full">
          <span className="text-[#F5C84B] text-sm font-bold uppercase tracking-widest mb-3">
            Plan Inicial
          </span>
          <div className="flex items-baseline gap-1 mb-2">
            <span className="text-5xl font-bold text-white" style={{ fontFamily: "var(--font-agbalumo)" }}>
              $0
            </span>
            <span className="text-white/40 text-base">/mes</span>
          </div>
          <p className="text-white/50 text-sm mb-8">Para siempre</p>

          <ul className="text-left w-full space-y-3 mb-10">
            {[
              "Subdominio propio",
              "Catálogo ilimitado",
              "Pedidos por WhatsApp",
              "Carrito de compras",
              "100% mobile",
            ].map((item) => (
              <li key={item} className="flex items-center gap-3 text-white/80 text-sm">
                <span className="w-5 h-5 rounded-full bg-[#F5C84B] flex items-center justify-center flex-shrink-0">
                  <svg className="w-3 h-3 text-[#16222E]" fill="none" viewBox="0 0 12 12">
                    <path
                      d="M2 6l3 3 5-5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                {item}
              </li>
            ))}
          </ul>

          <a
            href="#"
            className="w-full text-center px-6 py-4 rounded-full bg-[#F5C84B] text-[#16222E] font-bold text-base hover:bg-[#D9A92A] transition-colors"
          >
            Crear mi tienda gratis
          </a>
        </div>
      </div>
    </section>
  );
}
