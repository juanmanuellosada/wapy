import { notFound, redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { getStoreState } from '@/lib/onboarding/state';
import { STEP_NAMES, stepIndexFor, stepNameFor, visibleSteps } from '@/lib/onboarding/steps';
import type { StepName } from '@/lib/onboarding/steps';
import type { Metadata } from 'next';
import { Stepper } from '@/app/onboarding/components/Stepper';
import { StepBasics } from '@/app/onboarding/components/StepBasics';
import { StepLook } from '@/app/onboarding/components/StepLook';
import { StepSections } from '@/app/onboarding/components/StepSections';
import { StepProducts } from '@/app/onboarding/components/StepProducts';
import { StepWhatsapp } from '@/app/onboarding/components/StepWhatsapp';
import { StepPayment } from '@/app/onboarding/components/StepPayment';
import { StepReview } from '@/app/onboarding/components/StepReview';
import { getStoreMpConnectionStatus } from '@/lib/store/checkout/oauth';

export const dynamic = 'force-dynamic';

const STEP_TITLES: Record<StepName, string> = {
  basics: 'Datos básicos',
  look: 'Imagen de tu tienda',
  sections: 'Secciones',
  products: 'Productos',
  whatsapp: 'WhatsApp',
  payment: 'Cobros con Mercado Pago',
  review: 'Revisión y publicación',
};

type Props = {
  params: Promise<{ step: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { step } = await params;
  const title = STEP_TITLES[step as StepName] ?? 'Onboarding';
  return { title: `${title} — Wapy` };
}

export default async function OnboardingStepPage({ params, searchParams }: Props) {
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

  const checkoutMode = (store?.checkout_mode as string | null) ?? 'whatsapp';

  // Gate the payment step: only reachable for mercadopago stores
  if (requestedStep === 'payment' && checkoutMode !== 'mercadopago') {
    redirect('/onboarding/review');
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

  // Visible steps determine the step counter shown to the user
  const visible = visibleSteps(checkoutMode);
  const visibleStepNumber = visible.indexOf(requestedStep) + 1;
  const totalVisibleSteps = visible.length;

  // Resolve searchParams for the payment step callback result
  const sp = searchParams ? await searchParams : {};
  const rawConnect = sp['mp_connect'];
  const connectVal = Array.isArray(rawConnect) ? rawConnect[0] : rawConnect;
  const mpConnectResult: 'success' | 'error' | null =
    connectVal === 'success' || connectVal === 'error' ? connectVal : null;
  const rawMpError = sp['mp_error'];
  const mpErrorVal = (Array.isArray(rawMpError) ? rawMpError[0] : rawMpError) ?? null;

  const stepContent = await (async () => {
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
        return <StepWhatsapp store={store!} checkoutMode={checkoutMode} />;
      case 'payment': {
        const mpStatus = await getStoreMpConnectionStatus(store!.id);
        return <StepPayment mpStatus={mpStatus} mpConnect={mpConnectResult} mpError={mpErrorVal} />;
      }
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
            checkoutMode={checkoutMode}
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
              Paso {visibleStepNumber} de {totalVisibleSteps}
            </span>
          </div>
          <Stepper
            currentStep={requestedStep}
            completedSteps={completedSteps}
            layout="top"
            checkoutMode={checkoutMode}
          />
        </div>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-10">
          <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold text-[#FBF7EC] mb-1">
              {STEP_TITLES[requestedStep]}
            </h1>
            <p className="text-sm text-white/50 mb-8">
              Paso {visibleStepNumber} de {totalVisibleSteps}
            </p>
            {stepContent}
          </div>
        </main>
      </div>
    </div>
  );
}
