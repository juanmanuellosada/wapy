import Link from 'next/link';
import { Sidebar } from './Sidebar';
import type { Store } from '@/lib/onboarding/state';
import type { SubscriptionState } from '@/lib/subscription/state';

type Props = {
  store: Store;
  currentSection: string;
  children: React.ReactNode;
  subState?: SubscriptionState;
  daysLeftInTrial?: number;
};

function SubscriptionBanner({ subState, daysLeft }: { subState: SubscriptionState; daysLeft: number }) {
  if (subState === 'trial' && daysLeft <= 3) {
    return (
      <div className="bg-[#F5C84B]/15 border-b border-[#F5C84B]/30 px-4 py-2.5 text-sm text-[#F5C84B] flex items-center justify-between gap-3">
        <span>
          Tu período de prueba vence en {daysLeft === 1 ? '1 día' : `${daysLeft} días`}. Suscribite para no perder el acceso.
        </span>
        <Link href="/dashboard/subscription" className="font-bold underline underline-offset-2 whitespace-nowrap hover:opacity-80 transition-opacity">
          Suscribirme
        </Link>
      </div>
    );
  }
  if (subState === 'grace') {
    return (
      <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 text-sm text-amber-400 flex items-center justify-between gap-3">
        <span>Pago pendiente — regularizá para no perder el servicio.</span>
        <Link href="/dashboard/subscription" className="font-bold underline underline-offset-2 whitespace-nowrap hover:opacity-80 transition-opacity">
          Resolver
        </Link>
      </div>
    );
  }
  if (subState === 'blocked') {
    return (
      <div className="bg-red-500/15 border-b border-red-500/30 px-4 py-2.5 text-sm text-red-400 flex items-center justify-between gap-3">
        <span>Suscripción suspendida — accedé solo a la sección de Suscripción.</span>
        <Link href="/dashboard/subscription" className="font-bold underline underline-offset-2 whitespace-nowrap hover:opacity-80 transition-opacity">
          Reactivar
        </Link>
      </div>
    );
  }
  return null;
}

export function DashboardShell({ store, currentSection, children, subState, daysLeftInTrial = 0 }: Props) {
  return (
    <div className="min-h-dvh bg-[#16222E] flex">
      {/* Background grid */}
      <div
        aria-hidden
        className="fixed inset-0 opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, #F5C84B 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Sidebar — desktop: fixed left */}
      <Sidebar store={store} currentSection={currentSection} />

      {/* Main content */}
      <main className="flex-1 lg:ml-60 min-w-0">
        {/* Subscription banner — shown when trial expiring soon, grace, or blocked */}
        {subState && <SubscriptionBanner subState={subState} daysLeft={daysLeftInTrial} />}
        <div className="max-w-2xl mx-auto px-4 py-8 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
