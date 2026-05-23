'use client';

import { useState } from 'react';
import { Check, Star } from 'lucide-react';
import { LeadFormModal } from './LeadFormModal';

const inicialFeatures = [
  'Hasta 15 productos',
  'Hasta 3 secciones',
  'Tu link wapy.com.ar/tu-tienda',
  'Pedidos por WhatsApp',
  'Panel de control',
];

const proFeatures = [
  'Productos ilimitados',
  'Secciones ilimitadas',
  'Tu link wapy.com.ar/tu-tienda',
  'Pedidos por WhatsApp',
  'Panel de control',
  'Soporte prioritario',
];

export default function Pricing() {
  const [modal, setModal] = useState<'inicial' | 'pro' | null>(null);

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
          backgroundImage: 'radial-gradient(circle, #F5C84B 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />
      {/* Glow */}
      <div aria-hidden className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className="w-[800px] h-[500px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #F5C84B 0%, transparent 65%)' }}
        />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto text-center">
        {/* Header */}
        <span className="inline-block px-4 py-1.5 rounded-full bg-[#F5C84B]/15 text-[#F5C84B] text-sm font-bold mb-5">
          Precios
        </span>
        <h2
          className="text-3xl md:text-5xl font-bold text-white mb-4"
          style={{ fontFamily: 'var(--font-agbalumo)' }}
        >
          Simple y transparente
        </h2>
        <p className="text-white/55 text-lg max-w-xl mx-auto mb-14">
          14 días de prueba gratis. Sin tarjeta de crédito. Sin sorpresas.
        </p>

        {/* Cards — Pro first on mobile, side-by-side on desktop */}
        <div className="flex flex-col-reverse md:flex-row gap-6 justify-center items-stretch max-w-3xl mx-auto">
          {/* --- Inicial card --- */}
          <div className="flex-1 flex flex-col p-8 md:p-10 rounded-[2rem] bg-white/5 border border-[#F5C84B]/20 shadow-xl">
            <div className="mb-6 text-left">
              <span className="text-[#F5C84B] text-xs font-extrabold uppercase tracking-widest">
                Inicial
              </span>
              <div className="flex items-baseline gap-1 mt-2">
                <span
                  className="text-4xl md:text-5xl font-bold text-white"
                  style={{ fontFamily: 'var(--font-agbalumo)' }}
                >
                  $12.000
                </span>
                <span className="text-white/40 text-base">/mes</span>
              </div>
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-[#F5C84B] font-semibold bg-[#F5C84B]/10 px-3 py-1 rounded-full">
                14 días gratis · sin tarjeta
              </p>
            </div>

            <ul className="text-left space-y-3 mb-8 flex-1">
              {inicialFeatures.map((item) => (
                <li key={item} className="flex items-center gap-3 text-white/75 text-sm">
                  <span className="w-5 h-5 rounded-full bg-[#F5C84B]/20 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3 text-[#F5C84B]" strokeWidth={3} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => setModal('inicial')}
              className="w-full min-h-[52px] px-6 py-3 rounded-full border-2 border-[#F5C84B] text-[#F5C84B] font-extrabold text-sm hover:bg-[#F5C84B] hover:text-[#16222E] transition-all duration-200 cursor-pointer"
            >
              Quiero el Inicial
            </button>
          </div>

          {/* --- Pro card (highlighted) --- */}
          <div className="flex-1 flex flex-col p-8 md:p-10 rounded-[2rem] bg-[#F5C84B]/5 border-2 border-[#F5C84B] shadow-2xl shadow-[#F5C84B]/10 relative md:scale-[1.03]">
            {/* "Más popular" badge */}
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#F5C84B] text-[#16222E] text-xs font-extrabold uppercase tracking-wide shadow-lg whitespace-nowrap">
              <Star className="w-3 h-3" fill="currentColor" />
              Más popular
            </div>

            <div className="mb-6 text-left mt-2">
              <span className="text-[#F5C84B] text-xs font-extrabold uppercase tracking-widest">
                Pro
              </span>
              <div className="flex items-baseline gap-1 mt-2">
                <span
                  className="text-4xl md:text-5xl font-bold text-white"
                  style={{ fontFamily: 'var(--font-agbalumo)' }}
                >
                  $20.000
                </span>
                <span className="text-white/40 text-base">/mes</span>
              </div>
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-[#F5C84B] font-semibold bg-[#F5C84B]/10 px-3 py-1 rounded-full">
                14 días gratis · sin tarjeta
              </p>
            </div>

            <ul className="text-left space-y-3 mb-8 flex-1">
              {proFeatures.map((item) => (
                <li key={item} className="flex items-center gap-3 text-white/85 text-sm">
                  <span className="w-5 h-5 rounded-full bg-[#F5C84B] flex items-center justify-center flex-shrink-0 shadow-sm">
                    <Check className="w-3 h-3 text-[#16222E]" strokeWidth={3} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => setModal('pro')}
              className="w-full min-h-[52px] px-6 py-3 rounded-full bg-[#F5C84B] text-[#16222E] font-extrabold text-sm hover:bg-[#D9A92A] hover:scale-105 transition-all duration-200 shadow-xl shadow-[#F5C84B]/25 cursor-pointer"
            >
              Quiero el Pro
            </button>
          </div>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <LeadFormModal
          open={modal !== null}
          onClose={() => setModal(null)}
          plan={modal}
        />
      )}
    </section>
  );
}
