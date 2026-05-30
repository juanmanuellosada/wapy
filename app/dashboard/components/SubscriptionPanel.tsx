'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CheckCircle, CreditCard, AlertTriangle, XCircle, Shield } from 'lucide-react';
import { getMyCheckoutUrl, cancelSubscription, changePlan } from '@/lib/subscription/actions';
import { PLAN_PRICES, formatPlanPrice } from '@/lib/subscription/plans';
import { ConfirmModal } from '@/app/components/ConfirmModal';
import type { SubscriptionState } from '@/lib/subscription/state';
import type { PlanId } from '@/lib/plans/limits';

// We receive only the fields we need from the store row.
interface StoreProps {
  plan: string;
  payment_exempt: boolean;
  mp_preapproval_id: string | null;
}

interface Props {
  store: StoreProps;
  subState: SubscriptionState;
  daysLeft: number;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const STATE_LABELS: Record<SubscriptionState, string> = {
  exempt: 'Exenta de pago',
  trial: 'Período de prueba',
  active: 'Suscripción activa',
  grace: 'Pago pendiente',
  blocked: 'Suscripción suspendida',
};

const PLAN_LABELS: Record<string, string> = {
  inicial: 'Inicial',
  pro: 'Pro',
};

function stateBadge(state: SubscriptionState) {
  switch (state) {
    case 'exempt':
      return 'bg-blue-500/15 text-blue-300 border border-blue-500/30';
    case 'trial':
      return 'bg-[#F5C84B]/15 text-[#F5C84B] border border-[#F5C84B]/30';
    case 'active':
      return 'bg-green-500/15 text-green-400 border border-green-500/30';
    case 'grace':
      return 'bg-amber-500/15 text-amber-400 border border-amber-500/30';
    case 'blocked':
      return 'bg-red-500/15 text-red-400 border border-red-500/30';
  }
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function SubscriptionPanel({ store, subState, daysLeft }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [changePlanConfirmOpen, setChangePlanConfirmOpen] = useState(false);

  const currentPlan = (store.plan === 'pro' ? 'pro' : 'inicial') as PlanId;
  const otherPlan: PlanId = currentPlan === 'inicial' ? 'pro' : 'inicial';

  // ---- Actions ---------------------------------------------------------------

  function handleCheckout(plan?: PlanId) {
    setError(null);
    startTransition(async () => {
      const result = await getMyCheckoutUrl(plan);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      window.location.href = result.url;
    });
  }

  async function handleCancelConfirm() {
    setError(null);
    const result = await cancelSubscription();
    setCancelConfirmOpen(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleChangePlanConfirm() {
    setError(null);
    const result = await changePlan(otherPlan);
    setChangePlanConfirmOpen(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    window.location.href = result.url;
  }

  // ---- Render ----------------------------------------------------------------

  return (
    <div>
      <h1 className="text-xl font-bold text-[#FBF7EC] mb-6">Suscripción</h1>

      {error && (
        <div role="alert" className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Plan info */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-4 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs text-white/40 mb-0.5">Plan actual</p>
            <p className="text-lg font-bold text-[#FBF7EC]">
              {PLAN_LABELS[currentPlan] ?? currentPlan}{' '}
              <span className="text-sm font-normal text-white/50">{formatPlanPrice(currentPlan)}/mes</span>
            </p>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${stateBadge(subState)}`}>
            {subState === 'exempt' && <Shield size={12} aria-hidden />}
            {subState === 'active' && <CheckCircle size={12} aria-hidden />}
            {subState === 'blocked' && <XCircle size={12} aria-hidden />}
            {(subState === 'trial' || subState === 'grace') && <AlertTriangle size={12} aria-hidden />}
            {STATE_LABELS[subState]}
          </span>
        </div>

        {/* State-specific message */}
        {subState === 'trial' && (
          <p className="text-sm text-[#F5C84B]/80">
            {daysLeft > 0
              ? `Te quedan ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'} de prueba.`
              : 'Tu período de prueba ha vencido.'}
          </p>
        )}
        {subState === 'grace' && (
          <p className="text-sm text-amber-400/80">
            El pago está pendiente. Regularizá tu suscripción para no perder el servicio.
          </p>
        )}
        {subState === 'blocked' && (
          <p className="text-sm text-red-400/80">
            Tu suscripción fue suspendida por falta de pago. Reactivá para volver a usar el servicio.
          </p>
        )}
        {subState === 'exempt' && (
          <p className="text-sm text-blue-300/80">
            Tu cuenta está exenta de pago. Podés vincular un medio de pago real cuando quieras.
          </p>
        )}
      </div>

      {/* Primary action */}
      <div className="space-y-3">
        {subState === 'trial' && (
          <button
            type="button"
            onClick={() => handleCheckout(currentPlan)}
            disabled={isPending}
            className="w-full min-h-[44px] px-6 rounded-xl bg-[#F5C84B] text-[#16222E] font-bold text-sm hover:bg-[#FAE08A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            {isPending ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
            Suscribirme
          </button>
        )}

        {subState === 'active' && (
          <button
            type="button"
            onClick={() => setCancelConfirmOpen(true)}
            disabled={isPending}
            className="w-full min-h-[44px] px-6 rounded-xl bg-white/8 border border-white/15 text-red-400 font-semibold text-sm hover:bg-red-500/10 hover:border-red-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            {isPending ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />}
            Cancelar suscripción
          </button>
        )}

        {(subState === 'grace' || subState === 'blocked') && (
          <button
            type="button"
            onClick={() => handleCheckout(currentPlan)}
            disabled={isPending}
            className="w-full min-h-[44px] px-6 rounded-xl bg-[#F5C84B] text-[#16222E] font-bold text-sm hover:bg-[#FAE08A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            {isPending ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
            {subState === 'grace' ? 'Reintentar pago / Reactivar' : 'Reactivar suscripción'}
          </button>
        )}

        {subState === 'exempt' && (
          <button
            type="button"
            onClick={() => handleCheckout(currentPlan)}
            disabled={isPending}
            className="w-full min-h-[44px] px-6 rounded-xl bg-white/8 border border-white/15 text-[#FBF7EC] font-semibold text-sm hover:bg-white/12 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            {isPending ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
            Vincular medio de pago
          </button>
        )}
      </div>

      {/* Change plan */}
      <div className="mt-6 bg-white/5 border border-white/10 rounded-2xl p-5">
        <p className="text-sm font-semibold text-[#FBF7EC] mb-1">Cambiar de plan</p>
        <p className="text-xs text-white/50 mb-4">
          Cambiá a{' '}
          <span className="font-semibold text-white/70">{PLAN_LABELS[otherPlan] ?? otherPlan}</span>
          {' '}por{' '}
          <span className="font-semibold text-white/70">{formatPlanPrice(otherPlan)}/mes</span>.
          {otherPlan === 'pro'
            ? ' Accedés a productos y secciones ilimitadas.'
            : ' Volvés al límite de 50 productos y 3 secciones (los existentes no se eliminan).'}
        </p>
        <button
          type="button"
          onClick={() => setChangePlanConfirmOpen(true)}
          disabled={isPending}
          className="min-h-[40px] px-5 rounded-xl bg-white/8 border border-white/15 text-[#FBF7EC] font-semibold text-sm hover:bg-white/12 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          Cambiar a {PLAN_LABELS[otherPlan] ?? otherPlan}
        </button>
      </div>

      {/* Cancel confirmation */}
      <ConfirmModal
        open={cancelConfirmOpen}
        onClose={() => setCancelConfirmOpen(false)}
        onConfirm={handleCancelConfirm}
        title="Cancelar suscripción"
        message="¿Confirmás que querés cancelar tu suscripción? Tu tienda seguirá activa durante el período de gracia (7 días) y luego quedará suspendida."
        confirmLabel="Sí, cancelar"
        variant="destructive"
      />

      {/* Change plan confirmation */}
      <ConfirmModal
        open={changePlanConfirmOpen}
        onClose={() => setChangePlanConfirmOpen(false)}
        onConfirm={handleChangePlanConfirm}
        title={`Cambiar a plan ${PLAN_LABELS[otherPlan] ?? otherPlan}`}
        message={`Tu plan cambiará a ${PLAN_LABELS[otherPlan] ?? otherPlan} (${formatPlanPrice(otherPlan)}/mes). Se te redirigirá a MercadoPago para ajustar el cobro. Los límites del nuevo plan se aplicarán de inmediato.`}
        confirmLabel={`Cambiar a ${PLAN_LABELS[otherPlan] ?? otherPlan}`}
      />
    </div>
  );
}
