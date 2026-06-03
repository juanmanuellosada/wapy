'use client';

import { useState, useTransition, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CheckCircle, CreditCard, AlertTriangle, XCircle, Shield, ArrowLeft } from 'lucide-react';
import { subscribeWithCard, cancelSubscription, changePlan } from '@/lib/subscription/actions';
import { PLAN_PRICES, formatPlanPrice } from '@/lib/subscription/plans';
import { ConfirmModal } from '@/app/components/ConfirmModal';
import type { SubscriptionState } from '@/lib/subscription/state';
import type { PlanId } from '@/lib/plans/limits';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// Minimal typing for the MercadoPago global injected by sdk-js
interface MpInstance {
  bricks: () => {
    create: (
      type: string,
      containerId: string,
      settings: Record<string, unknown>
    ) => Promise<{ unmount: () => void }>;
  };
}

declare global {
  interface Window {
    MercadoPago?: new (publicKey: string, options?: Record<string, unknown>) => MpInstance;
  }
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
  medio: 'Medio',
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
// CardPaymentBrick — mounts the MP Card Payment Brick in a container div
// ---------------------------------------------------------------------------

const BRICK_CONTAINER_ID = 'mp-card-payment-brick-container';

interface CardBrickProps {
  amount: number;
  onToken: (cardTokenId: string) => void;
  onError: (msg: string) => void;
  disabled: boolean;
}

function CardPaymentBrick({ amount, onToken, onError, disabled }: CardBrickProps) {
  const brickRef = useRef<{ unmount: () => void } | null>(null);
  const mountedRef = useRef(false);

  const mountBrick = useCallback(async () => {
    if (mountedRef.current) return;
    const publicKey = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY;
    if (!publicKey) {
      onError('Clave pública de MercadoPago no configurada.');
      return;
    }
    if (!window.MercadoPago) {
      onError('El SDK de MercadoPago no está disponible. Recargá la página.');
      return;
    }
    try {
      const mp = new window.MercadoPago(publicKey, { locale: 'es-AR' });
      const bricks = mp.bricks();
      const brick = await bricks.create('cardPayment', BRICK_CONTAINER_ID, {
        initialization: {
          amount,
          payer: {},
        },
        customization: {
          visual: {
            style: {
              theme: 'dark',
            },
          },
          paymentMethods: {
            minInstallments: 1,
            maxInstallments: 1,
          },
        },
        callbacks: {
          onReady: () => {},
          onSubmit: (formData: { token?: string; [key: string]: unknown }) => {
            const token = formData?.token;
            if (!token) {
              onError('No se pudo tokenizar la tarjeta. Intentá de nuevo.');
              return Promise.resolve();
            }
            onToken(token);
            return Promise.resolve();
          },
          onError: (err: unknown) => {
            console.error('[CardPaymentBrick] error', err);
            onError('Error en el formulario de tarjeta. Intentá de nuevo.');
          },
        },
      });
      brickRef.current = brick;
      mountedRef.current = true;
    } catch (err) {
      console.error('[CardPaymentBrick] mount error', err);
      onError('No se pudo cargar el formulario de tarjeta. Recargá la página.');
    }
  }, [amount, onToken, onError]);

  useEffect(() => {
    // Load the MP SDK script, then mount the brick
    let cancelled = false;
    import('@mercadopago/sdk-js')
      .then(({ loadMercadoPago }) => loadMercadoPago())
      .then(() => {
        if (!cancelled) mountBrick();
      })
      .catch(() => {
        if (!cancelled) onError('No se pudo cargar el SDK de MercadoPago.');
      });

    return () => {
      cancelled = true;
      if (brickRef.current) {
        brickRef.current.unmount();
        brickRef.current = null;
        mountedRef.current = false;
      }
    };
  }, [mountBrick, onError]);

  return (
    <div
      id={BRICK_CONTAINER_ID}
      className={disabled ? 'opacity-50 pointer-events-none' : ''}
    />
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

type PanelView = 'summary' | 'subscribe' | 'change-plan';

export function SubscriptionPanel({ store, subState, daysLeft }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<PanelView>('summary');
  const [pendingTargetPlan, setPendingTargetPlan] = useState<PlanId | null>(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  const planId: PlanId = (store.plan === 'pro' ? 'pro' : store.plan === 'medio' ? 'medio' : 'inicial');
  const otherPlans: PlanId[] = (['inicial', 'medio', 'pro'] as PlanId[]).filter((p) => p !== planId);

  // States where the user needs to enter card data
  const canSubscribe = subState === 'trial' || subState === 'grace' || subState === 'blocked' || subState === 'exempt';

  // ---- Subscribe action -------------------------------------------------------

  function handleToken(cardTokenId: string) {
    setError(null);
    startTransition(async () => {
      if (view === 'subscribe' || view === 'summary') {
        const result = await subscribeWithCard(cardTokenId);
        if ('error' in result) {
          setError(result.error);
          return;
        }
        setView('summary');
        router.refresh();
      } else if (view === 'change-plan' && pendingTargetPlan) {
        const result = await changePlan(pendingTargetPlan, cardTokenId);
        if ('error' in result) {
          setError(result.error);
          return;
        }
        setPendingTargetPlan(null);
        setView('summary');
        router.refresh();
      }
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

  function openChangePlan(plan: PlanId) {
    setPendingTargetPlan(plan);
    setView('change-plan');
    setError(null);
  }

  function goBack() {
    setView('summary');
    setPendingTargetPlan(null);
    setError(null);
  }

  // ---- Card form view ---------------------------------------------------------

  if (view === 'subscribe' || view === 'change-plan') {
    const title = view === 'subscribe'
      ? subState === 'blocked' ? 'Reactivar suscripción' : 'Suscribirme'
      : `Cambiar a plan ${PLAN_LABELS[pendingTargetPlan!] ?? pendingTargetPlan}`;

    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={goBack}
            className="text-white/40 hover:text-white/70 transition-colors"
            aria-label="Volver"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-xl font-bold text-[#FBF7EC]">{title}</h1>
        </div>

        {error && (
          <div role="alert" className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">
            {error}
            <button
              type="button"
              className="ml-2 underline text-red-300 hover:text-red-200"
              onClick={() => setError(null)}
            >
              Reintentar
            </button>
          </div>
        )}

        {view === 'change-plan' && pendingTargetPlan && (
          <div className="mb-4 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/70">
            Plan destino: <span className="font-semibold text-[#FBF7EC]">{PLAN_LABELS[pendingTargetPlan]}</span>{' '}
            ({formatPlanPrice(pendingTargetPlan)}/mes). Los límites se aplicarán de inmediato.
          </div>
        )}

        {isPending ? (
          <div className="flex items-center justify-center gap-2 py-10 text-white/40">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Procesando suscripción…</span>
          </div>
        ) : (
          <CardPaymentBrick
            amount={view === 'change-plan' && pendingTargetPlan ? PLAN_PRICES[pendingTargetPlan] : PLAN_PRICES[planId]}
            onToken={handleToken}
            onError={(msg) => setError(msg)}
            disabled={isPending}
          />
        )}
      </div>
    );
  }

  // ---- Summary view -----------------------------------------------------------

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
              {PLAN_LABELS[planId] ?? planId}{' '}
              <span className="text-sm font-normal text-white/50">{formatPlanPrice(planId)}/mes</span>
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
            onClick={() => { setError(null); setView('subscribe'); }}
            disabled={isPending}
            className="w-full min-h-[44px] px-6 rounded-xl bg-[#F5C84B] text-[#16222E] font-bold text-sm hover:bg-[#FAE08A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <CreditCard size={15} />
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
            onClick={() => { setError(null); setView('subscribe'); }}
            disabled={isPending}
            className="w-full min-h-[44px] px-6 rounded-xl bg-[#F5C84B] text-[#16222E] font-bold text-sm hover:bg-[#FAE08A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <CreditCard size={15} />
            {subState === 'grace' ? 'Reintentar pago / Reactivar' : 'Reactivar suscripción'}
          </button>
        )}

        {subState === 'exempt' && (
          <button
            type="button"
            onClick={() => { setError(null); setView('subscribe'); }}
            disabled={isPending}
            className="w-full min-h-[44px] px-6 rounded-xl bg-white/8 border border-white/15 text-[#FBF7EC] font-semibold text-sm hover:bg-white/12 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <CreditCard size={15} />
            Vincular medio de pago
          </button>
        )}
      </div>

      {/* Change plan */}
      <div className="mt-6 bg-white/5 border border-white/10 rounded-2xl p-5">
        <p className="text-sm font-semibold text-[#FBF7EC] mb-4">Cambiar de plan</p>
        <div className="space-y-3">
          {otherPlans.map((plan) => (
            <div key={plan} className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-white/80">
                  {PLAN_LABELS[plan]}{' '}
                  <span className="text-xs font-normal text-white/40">{formatPlanPrice(plan)}/mes</span>
                </p>
                <p className="text-xs text-white/40">
                  {plan === 'pro'
                    ? 'Productos, secciones e imágenes ilimitadas + variantes'
                    : plan === 'medio'
                    ? 'Hasta 50 productos, 3 secciones, imágenes ilimitadas + variantes'
                    : 'Hasta 20 productos, 1 sección, 1 imagen por producto'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => openChangePlan(plan)}
                disabled={isPending}
                className="flex-shrink-0 min-h-[36px] px-4 rounded-xl bg-white/8 border border-white/15 text-[#FBF7EC] font-semibold text-sm hover:bg-white/12 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Cambiar a {PLAN_LABELS[plan]}
              </button>
            </div>
          ))}
        </div>
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
    </div>
  );
}
