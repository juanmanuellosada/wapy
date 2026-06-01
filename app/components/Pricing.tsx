'use client';

import { useState } from 'react';
import { Check, X, Star } from 'lucide-react';
import { LeadFormModal } from './LeadFormModal';
import { formatPlanPrice } from '@/lib/subscription/plans';
import { getPlanLimits, isUnlimited } from '@/lib/plans/limits';
import type { PlanId } from '@/lib/plans/limits';

// ---------------------------------------------------------------------------
// Feature lists per card
// ---------------------------------------------------------------------------

type Feature = { label: string; highlight?: true };

const inicialFeatures: Feature[] = [
  { label: 'Hasta 20 productos' },
  { label: 'Hasta 1 sección' },
  { label: '1 imagen por producto' },
  { label: 'Checkout por WhatsApp' },
  { label: 'Dashboard' },
];

const medioFeatures: Feature[] = [
  { label: 'Hasta 50 productos' },
  { label: 'Hasta 3 secciones' },
  { label: 'Imágenes ilimitadas por producto' },
  { label: 'Variantes incluidas', highlight: true },
  { label: 'Checkout por WhatsApp' },
  { label: 'Dashboard' },
];

const proFeatures: Feature[] = [
  { label: 'Productos ilimitados' },
  { label: 'Secciones ilimitadas' },
  { label: 'Imágenes ilimitadas por producto' },
  { label: 'Variantes incluidas', highlight: true },
  { label: 'Checkout por WhatsApp' },
  { label: 'Dashboard' },
  { label: 'Soporte prioritario' },
];

// ---------------------------------------------------------------------------
// Comparison table helpers
// ---------------------------------------------------------------------------

function formatLimit(value: number): string {
  return isUnlimited(value) ? 'Ilimitado' : String(value);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Pricing() {
  const [modal, setModal] = useState<PlanId | null>(null);

  const inicialLimits = getPlanLimits('inicial');
  const medioLimits  = getPlanLimits('medio');
  const proLimits    = getPlanLimits('pro');

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

        {/* Cards — inicial → medio → pro */}
        <div className="flex flex-col md:flex-row gap-6 justify-center items-stretch max-w-5xl mx-auto">

          {/* --- Inicial card --- */}
          <div className="flex-1 flex flex-col p-8 md:p-10 rounded-[2rem] bg-white/5 border border-[#F5C84B]/20 shadow-xl">
            <div className="mb-6 text-left">
              <span className="text-[#F5C84B] text-xs font-extrabold uppercase tracking-widest">
                Inicial
              </span>
              <span className="ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#F5C84B] text-[#16222E] text-[10px] font-extrabold uppercase tracking-wide">
                Probá 14 días gratis
              </span>
              <div className="flex items-baseline gap-1 mt-2">
                <span
                  className="text-4xl md:text-5xl font-bold text-white"
                  style={{ fontFamily: 'var(--font-agbalumo)' }}
                >
                  {formatPlanPrice('inicial')}
                </span>
                <span className="text-white/40 text-base">/mes</span>
              </div>
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-white/45 font-medium">
                Sin tarjeta · Cancelás cuando quieras
              </p>
            </div>

            <ul className="text-left space-y-3 mb-8 flex-1">
              {inicialFeatures.map(({ label, highlight }) => (
                <li key={label} className="flex items-center gap-3 text-white/75 text-sm">
                  <span className="w-5 h-5 rounded-full bg-[#F5C84B]/20 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3 text-[#F5C84B]" strokeWidth={3} />
                  </span>
                  {highlight ? <strong className="text-white font-bold">{label}</strong> : label}
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

          {/* --- Medio card (highlighted / más popular) --- */}
          <div className="flex-1 flex flex-col p-8 md:p-10 rounded-[2rem] bg-[#F5C84B]/5 border-2 border-[#F5C84B] shadow-2xl shadow-[#F5C84B]/10 relative md:scale-[1.03]">
            {/* "Más popular" badge */}
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#F5C84B] text-[#16222E] text-xs font-extrabold uppercase tracking-wide shadow-lg whitespace-nowrap">
              <Star className="w-3 h-3" fill="currentColor" />
              Más popular
            </div>

            <div className="mb-6 text-left mt-2">
              <span className="text-[#F5C84B] text-xs font-extrabold uppercase tracking-widest">
                Medio
              </span>
              <span className="ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#F5C84B] text-[#16222E] text-[10px] font-extrabold uppercase tracking-wide">
                Probá 14 días gratis
              </span>
              <div className="flex items-baseline gap-1 mt-2">
                <span
                  className="text-4xl md:text-5xl font-bold text-white"
                  style={{ fontFamily: 'var(--font-agbalumo)' }}
                >
                  {formatPlanPrice('medio')}
                </span>
                <span className="text-white/40 text-base">/mes</span>
              </div>
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-white/45 font-medium">
                Sin tarjeta · Cancelás cuando quieras
              </p>
            </div>

            <ul className="text-left space-y-3 mb-8 flex-1">
              {medioFeatures.map(({ label, highlight }) => (
                <li key={label} className="flex items-center gap-3 text-white/85 text-sm">
                  <span className="w-5 h-5 rounded-full bg-[#F5C84B] flex items-center justify-center flex-shrink-0 shadow-sm">
                    <Check className="w-3 h-3 text-[#16222E]" strokeWidth={3} />
                  </span>
                  {highlight ? <strong className="text-white font-bold">{label}</strong> : label}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => setModal('medio')}
              className="w-full min-h-[52px] px-6 py-3 rounded-full bg-[#F5C84B] text-[#16222E] font-extrabold text-sm hover:bg-[#D9A92A] hover:scale-105 transition-all duration-200 shadow-xl shadow-[#F5C84B]/25 cursor-pointer"
            >
              Quiero el Medio
            </button>
          </div>

          {/* --- Pro card --- */}
          <div className="flex-1 flex flex-col p-8 md:p-10 rounded-[2rem] bg-white/5 border border-[#F5C84B]/20 shadow-xl">
            <div className="mb-6 text-left">
              <span className="text-[#F5C84B] text-xs font-extrabold uppercase tracking-widest">
                Pro
              </span>
              <span className="ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#F5C84B] text-[#16222E] text-[10px] font-extrabold uppercase tracking-wide">
                Probá 14 días gratis
              </span>
              <div className="flex items-baseline gap-1 mt-2">
                <span
                  className="text-4xl md:text-5xl font-bold text-white"
                  style={{ fontFamily: 'var(--font-agbalumo)' }}
                >
                  {formatPlanPrice('pro')}
                </span>
                <span className="text-white/40 text-base">/mes</span>
              </div>
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-white/45 font-medium">
                Sin tarjeta · Cancelás cuando quieras
              </p>
            </div>

            <ul className="text-left space-y-3 mb-8 flex-1">
              {proFeatures.map(({ label, highlight }) => (
                <li key={label} className="flex items-center gap-3 text-white/75 text-sm">
                  <span className="w-5 h-5 rounded-full bg-[#F5C84B]/20 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3 text-[#F5C84B]" strokeWidth={3} />
                  </span>
                  {highlight ? <strong className="text-white font-bold">{label}</strong> : label}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => setModal('pro')}
              className="w-full min-h-[52px] px-6 py-3 rounded-full border-2 border-[#F5C84B] text-[#F5C84B] font-extrabold text-sm hover:bg-[#F5C84B] hover:text-[#16222E] transition-all duration-200 cursor-pointer"
            >
              Quiero el Pro
            </button>
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Comparison table                                                    */}
        {/* ------------------------------------------------------------------ */}
        <div className="mt-16 max-w-3xl mx-auto">
          <h3 className="text-white/60 text-sm font-bold uppercase tracking-widest mb-6">
            Comparar planes
          </h3>

          <div className="overflow-x-auto rounded-2xl border border-[#F5C84B]/15 bg-white/[0.03]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#F5C84B]/10">
                  <th className="text-left px-5 py-4 text-white/40 font-medium w-2/5" />
                  <th className="px-5 py-4 text-[#F5C84B] font-extrabold text-center">Inicial</th>
                  <th className="px-5 py-4 text-[#F5C84B] font-extrabold text-center bg-[#F5C84B]/5">Medio</th>
                  <th className="px-5 py-4 text-[#F5C84B] font-extrabold text-center">Pro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5C84B]/8">
                <tr>
                  <td className="px-5 py-4 text-white/65 font-medium">Productos</td>
                  <td className="px-5 py-4 text-center text-white/80">{formatLimit(inicialLimits.maxProducts)}</td>
                  <td className="px-5 py-4 text-center text-white/80 bg-[#F5C84B]/5">{formatLimit(medioLimits.maxProducts)}</td>
                  <td className="px-5 py-4 text-center text-white/80">{formatLimit(proLimits.maxProducts)}</td>
                </tr>
                <tr>
                  <td className="px-5 py-4 text-white/65 font-medium">Secciones</td>
                  <td className="px-5 py-4 text-center text-white/80">{formatLimit(inicialLimits.maxSections)}</td>
                  <td className="px-5 py-4 text-center text-white/80 bg-[#F5C84B]/5">{formatLimit(medioLimits.maxSections)}</td>
                  <td className="px-5 py-4 text-center text-white/80">{formatLimit(proLimits.maxSections)}</td>
                </tr>
                <tr>
                  <td className="px-5 py-4 text-white/65 font-medium">Imágenes por producto</td>
                  <td className="px-5 py-4 text-center text-white/80">{formatLimit(inicialLimits.maxImagesPerProduct)}</td>
                  <td className="px-5 py-4 text-center text-white/80 bg-[#F5C84B]/5">{formatLimit(medioLimits.maxImagesPerProduct)}</td>
                  <td className="px-5 py-4 text-center text-white/80">{formatLimit(proLimits.maxImagesPerProduct)}</td>
                </tr>
                <tr>
                  <td className="px-5 py-4 text-white/65 font-medium">Variantes</td>
                  <td className="px-5 py-4 text-center">
                    <X className="w-4 h-4 text-white/30 mx-auto" strokeWidth={2.5} />
                  </td>
                  <td className="px-5 py-4 text-center bg-[#F5C84B]/5">
                    <Check className="w-4 h-4 text-[#F5C84B] mx-auto" strokeWidth={2.5} />
                  </td>
                  <td className="px-5 py-4 text-center">
                    <Check className="w-4 h-4 text-[#F5C84B] mx-auto" strokeWidth={2.5} />
                  </td>
                </tr>
                <tr>
                  <td className="px-5 py-4 text-white/65 font-medium">Prueba gratis 14 días</td>
                  <td className="px-5 py-4 text-center">
                    <Check className="w-4 h-4 text-[#F5C84B] mx-auto" strokeWidth={2.5} />
                  </td>
                  <td className="px-5 py-4 text-center bg-[#F5C84B]/5">
                    <Check className="w-4 h-4 text-[#F5C84B] mx-auto" strokeWidth={2.5} />
                  </td>
                  <td className="px-5 py-4 text-center">
                    <Check className="w-4 h-4 text-[#F5C84B] mx-auto" strokeWidth={2.5} />
                  </td>
                </tr>
              </tbody>
            </table>
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
