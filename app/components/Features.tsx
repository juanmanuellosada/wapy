import {
  Globe,
  ShoppingCart,
  MessageCircle,
  LayoutGrid,
  Smartphone,
  Zap,
  CreditCard,
  Tag,
  Layers,
  Paintbrush,
  BarChart2,
  Share2,
} from "lucide-react";

const coreFeatures = [
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

const extraFeatures = [
  {
    Icon: CreditCard,
    title: "Cobrá con Mercado Pago",
    description:
      "Tus clientes pagan online con tarjeta o efectivo directo en la tienda — disponible en todos los planes.",
    highlight: true,
  },
  {
    Icon: Tag,
    title: "Cupones de descuento",
    description:
      "Creá códigos de descuento con porcentaje o monto fijo, fecha de expiración y límite de usos.",
    highlight: false,
  },
  {
    Icon: Layers,
    title: "Variantes de producto",
    description:
      "Talles, colores, tamaños — cada opción con su propio precio y stock.",
    highlight: false,
  },
  {
    Icon: Paintbrush,
    title: "Personalizá tu marca",
    description:
      "Logo, color de marca y banner propios. Tu tienda con identidad visual, no una plantilla genérica.",
    highlight: false,
  },
  {
    Icon: BarChart2,
    title: "Reportes y estadísticas",
    description:
      "Gráficos de ingresos y órdenes por período, más export CSV para llevar tus números donde quieras.",
    highlight: false,
  },
  {
    Icon: Share2,
    title: "Compartí y conectá redes",
    description:
      "Compartí el carrito pre-armado por WhatsApp y sumá tus links de Instagram, TikTok y otras redes.",
    highlight: false,
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

        {/* Bento grid — two groups */}
        <div className="space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {coreFeatures.map(({ Icon, title, description, highlight }) => (
              <div
                key={title}
                className={[
                  "group relative flex flex-col p-7 rounded-[1.5rem] border transition-all duration-250 cursor-default overflow-hidden",
                  highlight
                    ? "bg-[#F5C84B]/10 border-[#F5C84B]/30 hover:bg-[#F5C84B]/20 hover:border-[#F5C84B]/60"
                    : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-[#F5C84B]/30",
                ].join(" ")}
              >
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

          <div>
            <p className="text-white/25 text-xs font-bold uppercase tracking-widest text-center mb-6">
              También incluye
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {extraFeatures.map(({ Icon, title, description, highlight }) => (
                <div
                  key={title}
                  className={[
                    "group relative flex flex-col p-7 rounded-[1.5rem] border transition-all duration-250 cursor-default overflow-hidden",
                    highlight
                      ? "bg-[#F5C84B]/10 border-[#F5C84B]/30 hover:bg-[#F5C84B]/20 hover:border-[#F5C84B]/60"
                      : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-[#F5C84B]/30",
                  ].join(" ")}
                >
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
        </div>
      </div>
    </section>
  );
}
