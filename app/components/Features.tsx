import {
  Globe,
  ShoppingCart,
  MessageCircle,
  LayoutGrid,
  Smartphone,
  Zap,
} from "lucide-react";

const features = [
  {
    Icon: Globe,
    title: "Subdominio propio",
    description:
      "Tu tienda en tulocal.wapy.app — una dirección propia que podés compartir con todos tus clientes.",
    highlight: true,
  },
  {
    Icon: ShoppingCart,
    title: "Carrito de compras",
    description:
      "Tus clientes agregan productos al carrito y arman su pedido con total comodidad.",
    highlight: false,
  },
  {
    Icon: MessageCircle,
    title: "Pedidos por WhatsApp",
    description:
      "El pedido llega directo a tu WhatsApp listo para confirmar — sin app extra ni comisiones.",
    highlight: true,
  },
  {
    Icon: LayoutGrid,
    title: "Secciones y productos",
    description:
      "Organizá tu catálogo en secciones con fotos, descripciones y precios claros.",
    highlight: false,
  },
  {
    Icon: Smartphone,
    title: "100% mobile",
    description:
      "Diseñado para el celular — tus clientes compran desde donde estén, sin fricción.",
    highlight: false,
  },
  {
    Icon: Zap,
    title: "Sin complicaciones",
    description:
      "Sin código, sin técnicos. En minutos tu tienda está lista para recibir pedidos.",
    highlight: true,
  },
];

export default function Features() {
  return (
    <section id="features" className="py-20 md:py-28 px-4 sm:px-6 bg-[#16222E] relative overflow-hidden">
      {/* Subtle grid decoration */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(#F5C84B 1px, transparent 1px), linear-gradient(90deg, #F5C84B 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Top-right accent blob */}
      <div
        aria-hidden
        className="absolute top-0 right-0 w-80 h-80 rounded-full opacity-10"
        style={{
          background: "radial-gradient(circle, #F5C84B 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-14">
          <span className="inline-block px-4 py-1.5 rounded-full bg-[#F5C84B]/15 text-[#F5C84B] text-sm font-bold mb-4">
            Funcionalidades
          </span>
          <h2
            className="text-3xl md:text-5xl font-bold text-[#F5C84B] mb-4"
            style={{ fontFamily: "var(--font-agbalumo)" }}
          >
            Todo lo que necesitás
          </h2>
          <p className="text-white/55 text-lg max-w-xl mx-auto">
            Simple, completo y pensado para negocios reales.
          </p>
        </div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map(({ Icon, title, description, highlight }) => (
            <div
              key={title}
              className={[
                "group relative flex flex-col p-7 rounded-[1.5rem] border transition-all duration-250 cursor-default overflow-hidden",
                highlight
                  ? "bg-[#F5C84B]/10 border-[#F5C84B]/30 hover:bg-[#F5C84B]/20 hover:border-[#F5C84B]/60"
                  : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-[#F5C84B]/30",
              ].join(" ")}
            >
              {/* Icon container */}
              <div
                className={[
                  "w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-colors duration-250",
                  highlight
                    ? "bg-[#F5C84B] group-hover:bg-[#D9A92A]"
                    : "bg-white/10 group-hover:bg-[#F5C84B] group-hover:text-[#16222E]",
                ].join(" ")}
              >
                <Icon
                  className={[
                    "w-5 h-5 transition-colors duration-250",
                    highlight
                      ? "text-[#16222E]"
                      : "text-white group-hover:text-[#16222E]",
                  ].join(" ")}
                  strokeWidth={2}
                />
              </div>

              <h3
                className={[
                  "text-lg font-extrabold mb-2 transition-colors duration-250",
                  highlight
                    ? "text-white"
                    : "text-white group-hover:text-[#F5C84B]",
                ].join(" ")}
              >
                {title}
              </h3>
              <p className="text-white/55 text-sm leading-relaxed">
                {description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
