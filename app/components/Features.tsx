const features = [
  {
    icon: "🌐",
    title: "Subdominio propio",
    description:
      "Tu tienda en tulocal.wapy.app — una dirección propia que podés compartir con todos tus clientes.",
  },
  {
    icon: "🛒",
    title: "Carrito de compras",
    description:
      "Tus clientes agregan productos al carrito y arman su pedido con total comodidad.",
  },
  {
    icon: "💬",
    title: "Pedidos por WhatsApp",
    description:
      "El pedido llega directo a tu WhatsApp listo para confirmar — sin app extra ni comisiones.",
  },
  {
    icon: "📂",
    title: "Secciones y productos",
    description:
      "Organizá tu catálogo en secciones con fotos, descripciones y precios claros.",
  },
  {
    icon: "📱",
    title: "100% mobile",
    description:
      "Diseñado para el celular — tus clientes compran desde donde estén, sin fricción.",
  },
  {
    icon: "⚡",
    title: "Sin complicaciones",
    description:
      "Sin código, sin técnicos. En minutos tu tienda está lista para recibir pedidos.",
  },
];

export default function Features() {
  return (
    <section id="features" className="py-16 md:py-24 px-4 bg-[#16222E]">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2
            className="text-3xl md:text-4xl font-bold text-[#F5C84B] mb-3"
            style={{ fontFamily: "var(--font-agbalumo)" }}
          >
            Todo lo que necesitás
          </h2>
          <p className="text-white/60 text-lg max-w-xl mx-auto">
            Simple, completo y pensado para negocios reales.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="p-6 rounded-[1.5rem] bg-white/5 border border-white/10 hover:border-[#F5C84B]/40 hover:bg-white/10 transition-colors"
            >
              <div className="text-3xl mb-4">{f.icon}</div>
              <h3 className="text-lg font-bold text-white mb-2">{f.title}</h3>
              <p className="text-white/60 text-sm leading-relaxed">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
