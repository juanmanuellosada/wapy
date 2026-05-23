'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import type { StepName } from '@/lib/onboarding/steps';
import { STEP_NAMES } from '@/lib/onboarding/steps';

const STEP_LABELS: Record<StepName, string> = {
  basics: 'Datos básicos',
  look: 'Imagen',
  sections: 'Secciones',
  products: 'Productos',
  whatsapp: 'WhatsApp',
  review: 'Publicar',
};

type Props = {
  currentStep: StepName;
  completedSteps: StepName[];
  layout: 'sidebar' | 'top';
};

export function Stepper({ currentStep, completedSteps, layout }: Props) {
  if (layout === 'top') {
    return (
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STEP_NAMES.map((step, index) => {
          const isCompleted = completedSteps.includes(step);
          const isCurrent = step === currentStep;

          return (
            <div key={step} className="flex items-center gap-1 flex-shrink-0">
              {isCompleted ? (
                <Link
                  href={`/onboarding/${step}`}
                  className="flex items-center justify-center w-6 h-6 rounded-full bg-[#F5C84B] text-[#16222E] hover:scale-110 transition-transform"
                  aria-label={STEP_LABELS[step]}
                >
                  <Check size={12} strokeWidth={3} />
                </Link>
              ) : (
                <span
                  className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                    isCurrent
                      ? 'bg-[#F5C84B] text-[#16222E]'
                      : 'bg-white/10 text-white/30'
                  }`}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {index + 1}
                </span>
              )}
              {index < STEP_NAMES.length - 1 && (
                <div
                  className={`w-4 h-px ${isCompleted ? 'bg-[#F5C84B]/50' : 'bg-white/10'}`}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Sidebar layout
  return (
    <nav aria-label="Progreso del wizard">
      <ol className="flex flex-col gap-1">
        {STEP_NAMES.map((step, index) => {
          const isCompleted = completedSteps.includes(step);
          const isCurrent = step === currentStep;
          const isLocked = !isCompleted && !isCurrent;

          const inner = (
            <div
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                isCurrent
                  ? 'bg-[#F5C84B]/10 text-[#F5C84B]'
                  : isCompleted
                  ? 'text-white/80 hover:bg-white/5'
                  : 'text-white/25'
              }`}
            >
              <span
                className={`flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                  isCurrent
                    ? 'bg-[#F5C84B] text-[#16222E]'
                    : isCompleted
                    ? 'bg-[#F5C84B]/20 text-[#F5C84B]'
                    : 'bg-white/10 text-white/25'
                }`}
              >
                {isCompleted ? <Check size={13} strokeWidth={3} /> : index + 1}
              </span>
              <span className="text-sm font-semibold">{STEP_LABELS[step]}</span>
            </div>
          );

          return (
            <li key={step}>
              {isCompleted ? (
                <Link
                  href={`/onboarding/${step}`}
                  aria-label={`Volver a ${STEP_LABELS[step]}`}
                >
                  {inner}
                </Link>
              ) : (
                <div
                  aria-current={isCurrent ? 'step' : undefined}
                  aria-disabled={isLocked}
                >
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
