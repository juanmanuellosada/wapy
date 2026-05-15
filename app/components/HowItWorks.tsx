const steps = [
  {
    number: "1",
    title: "Creá tu tienda",
    description:
      "Registrate, elegí el nombre y listo: tu tienda queda con subdominio propio en segundos.",
  },
  {
    number: "2",
    title: "Cargá secciones y productos con fotos",
    description:
      "Organizá tu catálogo en secciones, agregá fotos, precios y descripciones desde el panel.",
  },
  {
    number: "3",
    title: "Recibí los pedidos por WhatsApp",
    description:
      "Tus clientes agregan al carrito y te mandan el pedido por WhatsApp directo — sin intermediarios.",
  },
];

export default function HowItWorks() {
  return (
    <section id="como-funciona" className="py-16 md:py-24 px-4 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2
            className="text-3xl md:text-4xl font-bold text-[#16222E] mb-3"
            style={{ fontFamily: "var(--font-agbalumo)" }}
          >
            Cómo funciona
          </h2>
          <p className="text-[#16222E]/60 text-lg max-w-xl mx-auto">
            Tres pasos y tu tienda ya está vendiendo.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((step) => (
            <div
              key={step.number}
              className="flex flex-col items-center text-center p-8 rounded-[1.5rem] bg-[#F5C84B]/10 border border-[#F5C84B]/30"
            >
              <div className="w-14 h-14 rounded-full bg-[#F5C84B] flex items-center justify-center mb-5 shadow-md">
                <span
                  className="text-2xl font-bold text-[#16222E]"
                  style={{ fontFamily: "var(--font-agbalumo)" }}
                >
                  {step.number}
                </span>
              </div>
              <h3 className="text-xl font-bold text-[#16222E] mb-3">
                {step.title}
              </h3>
              <p className="text-[#16222E]/65 leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
