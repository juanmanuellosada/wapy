import { notFound, redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { getStoreState } from '@/lib/onboarding/state';
import { STEP_NAMES, stepIndexFor, stepNameFor } from '@/lib/onboarding/steps';
import type { StepName } from '@/lib/onboarding/steps';
import type { Metadata } from 'next';
import { Stepper } from '@/app/onboarding/components/Stepper';
import { StepBasics } from '@/app/onboarding/components/StepBasics';
import { StepLook } from '@/app/onboarding/components/StepLook';
import { StepSections } from '@/app/onboarding/components/StepSections';
import { StepProducts } from '@/app/onboarding/components/StepProducts';
import { StepWhatsapp } from '@/app/onboarding/components/StepWhatsapp';
import { StepReview } from '@/app/onboarding/components/StepReview';

export const dynamic = 'force-dynamic';

const STEP_TITLES: Record<StepName, string> = {
  basics: 'Datos básicos',
  look: 'Imagen de tu tienda',
  sections: 'Secciones',
  products: 'Productos',
  whatsapp: 'WhatsApp',
  review: 'Revisión y publicación',
};

type Props = {
  params: Promise<{ step: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { step } = await params;
  const title = STEP_TITLES[step as StepName] ?? 'Onboarding';
  return { title: `${title} — Wapy` };
}

export default async function OnboardingStepPage({ params }: Props) {
  const { step } = await params;

  // Validate step param
  if (!STEP_NAMES.includes(step as StepName)) {
    notFound();
  }
  const requestedStep = step as StepName;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/onboarding/${step}`);
  }

  const storeState = await getStoreState(user.id);
  const { store, sections, products } = storeState;

  // Published stores go to dashboard
  if (store && (store.status === 'published' || store.status === 'paused')) {
    redirect('/dashboard');
  }

  // Determine the current allowed step
  const currentStepName = storeState.currentStep;
  const currentStepIndex = stepIndexFor(currentStepName);
  const requestedStepIndex = stepIndexFor(requestedStep);

  // Block forward jumps — redirect to current step
  if (requestedStepIndex > currentStepIndex) {
    redirect(`/onboarding/${currentStepName}`);
  }

  // Completed steps = all steps with index < current
  const completedSteps = STEP_NAMES.filter(
    (_, i) => i < currentStepIndex
  );

  const stepContent = (() => {
    switch (requestedStep) {
      case 'basics':
        return <StepBasics store={store} />;
      case 'look':
        return <StepLook store={store!} />;
      case 'sections':
        return <StepSections store={store!} initialSections={sections} />;
      case 'products':
        return <StepProducts store={store!} initialProducts={products} sections={sections} />;
      case 'whatsapp':
        return <StepWhatsapp store={store!} />;
      case 'review':
        return <StepReview store={store!} sections={sections} products={products} />;
      default:
        return null;
    }
  })();

  return (
    <div className="min-h-dvh bg-[#16222E] flex">
      {/* Dot grid background */}
      <div
        aria-hidden
        className="fixed inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, #F5C84B 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Sidebar stepper — desktop */}
      <aside className="hidden lg:flex lg:w-72 xl:w-80 flex-col border-r border-white/10 relative z-10">
        <div className="p-6 border-b border-white/10">
          <p className="font-display text-2xl text-[#F5C84B]">Wapy</p>
          <p className="text-xs text-white/40 mt-1">Configurá tu tienda</p>
        </div>
        <div className="flex-1 p-4 overflow-y-auto">
          <Stepper
            currentStep={requestedStep}
            completedSteps={completedSteps}
            layout="sidebar"
          />
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col relative z-10">
        {/* Mobile top stepper */}
        <div className="lg:hidden border-b border-white/10 bg-[#16222E]/80 backdrop-blur-sm px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="font-display text-xl text-[#F5C84B]">Wapy</p>
            <span className="text-xs text-white/50">
              Paso {requestedStepIndex + 1} de {STEP_NAMES.length}
            </span>
          </div>
          <Stepper
            currentStep={requestedStep}
            completedSteps={completedSteps}
            layout="top"
          />
        </div>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-10">
          <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold text-[#FBF7EC] mb-1">
              {STEP_TITLES[requestedStep]}
            </h1>
            <p className="text-sm text-white/50 mb-8">
              Paso {requestedStepIndex + 1} de {STEP_NAMES.length}
            </p>
            {stepContent}
          </div>
        </main>
      </div>
    </div>
  );
}
