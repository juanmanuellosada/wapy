const steps = [
  {
    number: "01",
    title: "Creá tu tienda",
    description:
      "Registrate, elegí el nombre y listo: tu tienda queda con subdominio propio en segundos.",
    accent: "bg-[#F5C84B]",
    accentText: "text-[#16222E]",
  },
  {
    number: "02",
    title: "Cargá tus productos",
    description:
      "Organizá tu catálogo en secciones, agregá fotos, precios y descripciones desde el panel.",
    accent: "bg-[#16222E]",
    accentText: "text-[#F5C84B]",
  },
  {
    number: "03",
    title: "Recibí los pedidos",
    description:
      "Tus clientes agregan al carrito y te mandan el pedido por WhatsApp directo — sin intermediarios.",
    accent: "bg-[#F5C84B]",
    accentText: "text-[#16222E]",
  },
];

export default function HowItWorks() {
  return (
    <section id="como-funciona" className="py-20 md:py-28 px-4 sm:px-6 bg-[#FBF7EC]">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-14">
          <span className="inline-block px-4 py-1.5 rounded-full bg-[#F5C84B]/20 text-[#16222E] text-sm font-bold mb-4">
            Simple y rápido
          </span>
          <h2
            className="text-3xl md:text-5xl font-bold text-[#16222E] mb-4"
            style={{ fontFamily: "var(--font-agbalumo)" }}
          >
            Cómo funciona
          </h2>
          <p className="text-[#16222E]/55 text-lg max-w-xl mx-auto">
            Tres pasos y tu tienda ya está vendiendo.
          </p>
        </div>

        {/* Steps grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((step) => (
            <div
              key={step.number}
              className="relative group flex flex-col p-8 rounded-[1.5rem] bg-white border-2 border-[#F5C84B]/20 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden"
            >
              {/* Step badge */}
              <div
                className={`w-16 h-16 rounded-2xl ${step.accent} flex items-center justify-center mb-6 shadow-md`}
              >
                <span
                  className={`text-2xl font-extrabold ${step.accentText}`}
                  style={{ fontFamily: "var(--font-agbalumo)" }}
                >
                  {step.number}
                </span>
              </div>

              <h3 className="text-xl font-extrabold text-[#16222E] mb-3 relative z-10">
                {step.title}
              </h3>
              <p className="text-[#16222E]/60 leading-relaxed relative z-10">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
