'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CheckCircle, XCircle, Link2, ChevronLeft } from 'lucide-react';
import { connectMercadoPago } from '@/lib/store/checkout/actions';
import { advancePaymentStep } from '@/lib/onboarding/actions';

type MpConnectionStatus = {
  connected: boolean;
  revoked: boolean;
  mpUserId?: string;
};

type Props = {
  mpStatus: MpConnectionStatus;
  mpConnect?: 'success' | 'error' | null;
  mpError?: string | null;
};

export function StepPayment({ mpStatus, mpConnect, mpError }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const connected = mpStatus.connected && !mpStatus.revoked;
  const showSuccess = mpConnect === 'success' && !dismissed;
  const showError = mpConnect === 'error' && !dismissed;

  function handleConnect() {
    setError(null);
    startTransition(async () => {
      const result = await connectMercadoPago('onboarding');
      if ('error' in result) {
        setError(result.error);
        return;
      }
      window.location.href = result.authUrl;
    });
  }

  function handleContinue() {
    setError(null);
    startTransition(async () => {
      const result = await advancePaymentStep();
      if ('error' in result) {
        setError(result.error);
        return;
      }
      router.push('/onboarding/review');
    });
  }

  return (
    <div className="space-y-6">
      {/* OAuth callback banners */}
      {showSuccess && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 text-sm text-green-300"
        >
          <span className="flex items-center gap-2">
            <CheckCircle size={14} />
            Cuenta de Mercado Pago conectada correctamente.
          </span>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-green-300/60 hover:text-green-300 transition-colors cursor-pointer"
            aria-label="Cerrar aviso"
          >
            <XCircle size={14} />
          </button>
        </div>
      )}
      {showError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300"
        >
          <span className="flex items-center gap-2">
            <XCircle size={14} />
            No se pudo conectar Mercado Pago{mpError ? ` (${mpError})` : ''}. Intentá de nuevo.
          </span>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-red-300/60 hover:text-red-300 transition-colors cursor-pointer"
            aria-label="Cerrar aviso"
          >
            <XCircle size={14} />
          </button>
        </div>
      )}

      {/* Action error */}
      {error && (
        <div
          role="alert"
          className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      {/* Connection status card */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#FBF7EC]">
              {connected
                ? 'Cuenta conectada'
                : mpStatus.revoked
                  ? 'Conexión revocada'
                  : 'Sin conexión'}
            </p>
            <p className="text-xs text-white/50 mt-0.5">
              {connected
                ? mpStatus.mpUserId
                  ? `MP User: ${mpStatus.mpUserId}`
                  : 'Tu cuenta está lista para recibir pagos.'
                : mpStatus.revoked
                  ? 'Tu acceso fue revocado. Reconectá para continuar.'
                  : 'Conectá tu cuenta de Mercado Pago para cobrar online.'}
            </p>
          </div>
          <span
            className={`flex-shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
              connected
                ? 'bg-green-500/15 text-green-300 border-green-500/20'
                : mpStatus.revoked
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/20'
                  : 'bg-white/8 text-white/40 border-white/15'
            }`}
          >
            {connected ? 'Conectada' : mpStatus.revoked ? 'Revocada' : 'No conectada'}
          </span>
        </div>

        {!connected && (
          <button
            type="button"
            onClick={handleConnect}
            disabled={isPending}
            className="flex items-center gap-2 min-h-[36px] px-4 rounded-xl bg-[#009EE3]/20 text-[#009EE3] border border-[#009EE3]/30 hover:bg-[#009EE3]/30 text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
            {mpStatus.revoked ? 'Reconectar Mercado Pago' : 'Conectar Mercado Pago'}
          </button>
        )}
      </div>

      {/* Info card — only shown when not connected */}
      {!connected && (
        <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
          <p className="text-xs text-white/50">
            Este paso es obligatorio. Conectá tu cuenta de Mercado Pago para que tus clientes puedan
            pagar online directamente en tu tienda.
          </p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={() => router.push('/onboarding/whatsapp')}
          className="flex items-center gap-1 text-sm text-white/50 hover:text-white/80 transition-colors cursor-pointer"
        >
          <ChevronLeft size={16} />
          Atrás
        </button>

        {connected && (
          <button
            type="button"
            onClick={handleContinue}
            disabled={isPending}
            className="min-h-[44px] px-8 rounded-xl bg-[#F5C84B] text-[#16222E] font-bold text-sm hover:bg-[#FAE08A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2 cursor-pointer"
          >
            {isPending && <Loader2 size={14} className="animate-spin" />}
            Siguiente →
          </button>
        )}
      </div>
    </div>
  );
}
