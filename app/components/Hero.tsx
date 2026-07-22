import { ArrowRight, ArrowDown } from "lucide-react";

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

      {/* Background: soft radial glow */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(245,200,75,0.10) 0%, transparent 70%)",
        }}
      />

      {/* Accent blobs */}
      <div
        aria-hidden
        className="absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-15"
        style={{ background: "radial-gradient(circle, #F5C84B 0%, transparent 70%)" }}
      />
      <div
        aria-hidden
        className="absolute -bottom-32 -right-32 w-[500px] h-[500px] rounded-full opacity-10"
        style={{ background: "radial-gradient(circle, #F5C84B 0%, transparent 60%)" }}
      />

      {/* Content */}
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-28 w-full">
        <div className="flex flex-col-reverse md:flex-row items-center gap-12 md:gap-10 lg:gap-16">

          {/* Copy */}
          <div className="flex-1 text-center md:text-left">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#F5C84B]/15 border border-[#F5C84B]/30 text-[#F5C84B] text-sm font-bold mb-6">
              <span className="w-2 h-2 rounded-full bg-[#F5C84B] inline-block" />
              Tu tienda online, ahora
            </div>

            <h1
              className="font-bold text-white leading-tight mb-5"
              style={{
                fontFamily: "var(--font-agbalumo)",
                fontSize: "clamp(2.4rem, 6.5vw, 4.2rem)",
                lineHeight: 1.08,
              }}
            >
              Tu tienda online
              <br />
              <span className="text-[#F5C84B]">+ WhatsApp</span>
              <br />
              en 5 minutos.
            </h1>

            <p className="text-white/70 text-lg md:text-xl max-w-md mx-auto md:mx-0 mb-8 leading-relaxed">
              Sin programar. Sin integraciones complicadas. Tus clientes pagan online con Mercado Pago
              o te mandan el pedido directo a tu WhatsApp.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
              <a
                href="#precios"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full bg-[#F5C84B] text-[#16222E] font-extrabold text-base hover:bg-[#D9A92A] hover:scale-105 transition-all duration-200 shadow-xl shadow-[#F5C84B]/25 cursor-pointer min-h-[52px]"
              >
                Quiero mi tienda
                <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href="#como-funciona"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full border border-white/20 text-white/80 font-bold text-base hover:bg-white/10 transition-all duration-200 cursor-pointer min-h-[52px]"
              >
                Ver cómo funciona
                <ArrowDown className="w-4 h-4" />
              </a>
            </div>

            {/* Trust line */}
            <p className="mt-6 text-white/35 text-sm">
              7 días gratis · Sin tarjeta · Sin código
            </p>
          </div>

          {/* CSS-only phone mockup with WhatsApp bubble */}
          <div className="flex-shrink-0 flex justify-center">
            <div className="relative">
              {/* Phone frame */}
              <div
                className="w-48 sm:w-56 md:w-60 rounded-[2.5rem] bg-[#1A2C3D] border-4 border-white/15 shadow-2xl shadow-black/40 overflow-hidden"
                aria-hidden="true"
              >
                {/* Status bar */}
                <div className="px-4 pt-3 pb-2 flex justify-between items-center">
                  <span className="text-white/50 text-[10px] font-medium">9:41</span>
                  <div className="w-20 h-5 bg-[#0E1820] rounded-full mx-auto" />
                  <div className="flex gap-1 items-center">
                    <div className="w-3 h-2 border border-white/40 rounded-[2px] relative">
                      <div className="absolute inset-[1px] right-[3px] bg-white/60 rounded-[1px]" />
                      <div className="absolute right-[-3px] top-[3px] w-[2px] h-[6px] bg-white/40 rounded-r-sm" />
                    </div>
                  </div>
                </div>

                {/* App header bar */}
                <div className="bg-[#16222E] px-3 py-2 flex items-center gap-2 border-b border-white/10">
                  <div className="w-7 h-7 rounded-full bg-[#F5C84B] flex items-center justify-center text-[#16222E] text-[10px] font-bold flex-shrink-0">
                    W
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-[11px] font-bold truncate">Mi Tienda</div>
                    <div className="text-white/40 text-[9px]">wapy.com.ar/mi-tienda</div>
                  </div>
                </div>

                {/* Store content */}
                <div className="bg-[#FBF7EC] px-3 py-3 space-y-2">
                  {/* Product cards */}
                  {[
                    { name: 'Remera básica', price: '$8.500' },
                    { name: 'Jean slim', price: '$15.200' },
                    { name: 'Buzo oversize', price: '$12.000' },
                  ].map((p) => (
                    <div key={p.name} className="flex items-center gap-2 bg-white rounded-xl p-2 shadow-sm">
                      <div className="w-10 h-10 rounded-lg bg-[#16222E]/10 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[#16222E] text-[10px] font-bold truncate">{p.name}</div>
                        <div className="text-[#16222E]/60 text-[9px]">{p.price}</div>
                      </div>
                      <div className="w-5 h-5 rounded-full bg-[#25D366] flex items-center justify-center flex-shrink-0">
                        <svg viewBox="0 0 24 24" className="w-3 h-3 fill-white" xmlns="http://www.w3.org/2000/svg">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                        </svg>
                      </div>
                    </div>
                  ))}

                  {/* WhatsApp CTA button */}
                  <div className="mt-1 bg-[#25D366] rounded-xl py-2.5 text-white text-[10px] font-bold text-center shadow-md">
                    Hacer pedido por WhatsApp
                  </div>
                </div>

                {/* Home bar */}
                <div className="bg-[#FBF7EC] pb-3 flex justify-center pt-1">
                  <div className="w-24 h-1 rounded-full bg-[#16222E]/20" />
                </div>
              </div>

              {/* WhatsApp notification bubble — floating top-right */}
              <div
                className="absolute -top-4 -right-4 sm:-right-8 bg-white rounded-2xl rounded-tr-sm shadow-xl px-3 py-2 w-44 sm:w-52 border border-[#e5e7eb]"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-full bg-[#25D366] flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white" xmlns="http://www.w3.org/2000/svg">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    </svg>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-[#16222E]">WhatsApp</div>
                    <div className="text-[9px] text-[#16222E]/40">hace un momento</div>
                  </div>
                </div>
                <p className="text-[10px] text-[#16222E]/80 leading-snug">
                  Hola! Quiero pedir:<br />
                  <span className="font-semibold">- 1x Remera básica ($8.500)<br />
                  - 1x Jean slim ($15.200)</span><br />
                  Total: $23.700 ✅
                </p>
              </div>

              {/* Floating glow behind phone */}
              <div
                aria-hidden
                className="absolute inset-0 -z-10 rounded-[3rem] opacity-30"
                style={{ background: "radial-gradient(circle at 50% 50%, #F5C84B 0%, transparent 70%)", filter: "blur(40px)" }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
