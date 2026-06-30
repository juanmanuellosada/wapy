'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CheckCircle, XCircle, Link2, Unlink } from 'lucide-react';
import { connectMercadoPago, disconnectMercadoPago } from '@/lib/store/checkout/actions';
import { setCheckoutMode } from '@/lib/store/actions';
import { MpFeesSimulator } from './MpFeesSimulator';

type MpConnectionStatus = {
  connected: boolean;
  revoked: boolean;
  mpUserId?: string;
};

type Props = {
  mpStatus: MpConnectionStatus;
  checkoutMode: 'whatsapp' | 'mercadopago';
  mpConnectResult?: 'success' | 'error' | null;
  mpError?: string | null;
};

export function MercadoPagoPanel({ mpStatus, checkoutMode, mpConnectResult, mpError }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [currentMode, setCurrentMode] = useState(checkoutMode);
  const [dismissed, setDismissed] = useState(false);

  const showConnectSuccess = mpConnectResult === 'success' && !dismissed;
  const showConnectError = mpConnectResult === 'error' && !dismissed;
  const canUseMercadoPago = mpStatus.connected && !mpStatus.revoked;

  function handleConnect() {
    setError(null);
    startTransition(async () => {
      const result = await connectMercadoPago();
      if ('error' in result) {
        setError(result.error);
        return;
      }
      window.location.href = result.authUrl;
    });
  }

  function handleDisconnect() {
    setError(null);
    startTransition(async () => {
      const disconnectResult = await disconnectMercadoPago();
      if ('error' in disconnectResult) {
        setError(disconnectResult.error);
        return;
      }
      // Reset checkout mode to whatsapp when disconnecting
      if (currentMode === 'mercadopago') {
        const modeResult = await setCheckoutMode('whatsapp');
        if ('error' in modeResult) {
          // Connection was revoked so setCheckoutMode won't gate us, but just warn
          console.warn('[MercadoPagoPanel] resetMode failed after disconnect:', modeResult.error);
        } else {
          setCurrentMode('whatsapp');
        }
      }
      router.refresh();
    });
  }

  function handleSetMode(mode: 'whatsapp' | 'mercadopago') {
    if (mode === currentMode) return;
    if (mode === 'mercadopago' && !canUseMercadoPago) {
      setError('Conectá tu cuenta de Mercado Pago antes de activar este modo.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await setCheckoutMode(mode);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setCurrentMode(mode);
    });
  }

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-[#FBF7EC]">Pagos con Mercado Pago</h2>

      {/* OAuth callback result banners */}
      {showConnectSuccess && (
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
      {showConnectError && (
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
        <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Connection status card */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#FBF7EC]">
              {canUseMercadoPago
                ? 'Cuenta conectada'
                : mpStatus.revoked
                  ? 'Conexión revocada'
                  : 'Sin conexión'}
            </p>
            <p className="text-xs text-white/50 mt-0.5">
              {canUseMercadoPago
                ? mpStatus.mpUserId
                  ? `MP User: ${mpStatus.mpUserId}`
                  : 'Tu cuenta está lista para recibir pagos.'
                : mpStatus.revoked
                  ? 'Tu acceso fue revocado. Reconectá para cobrar online.'
                  : 'Conectá tu cuenta para recibir pagos online.'}
            </p>
          </div>
          <span
            className={`flex-shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
              canUseMercadoPago
                ? 'bg-green-500/15 text-green-300 border-green-500/20'
                : mpStatus.revoked
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/20'
                  : 'bg-white/8 text-white/40 border-white/15'
            }`}
          >
            {canUseMercadoPago ? 'Conectada' : mpStatus.revoked ? 'Revocada' : 'No conectada'}
          </span>
        </div>

        {/* Connect / Reconnect / Disconnect */}
        {canUseMercadoPago ? (
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={isPending}
            className="flex items-center gap-2 min-h-[36px] px-4 rounded-xl border border-white/20 text-white/60 hover:text-white hover:border-white/40 text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Unlink size={14} />}
            Desconectar
          </button>
        ) : (
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

      {/* Checkout mode selector */}
      <div>
        <p className="text-sm font-semibold text-[#FBF7EC] mb-1">Modo de checkout</p>
        <p className="text-xs text-white/50 mb-3">
          Elegí cómo reciben pedidos los clientes de tu tienda.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {/* WhatsApp */}
          <button
            type="button"
            onClick={() => handleSetMode('whatsapp')}
            disabled={isPending}
            className={`relative flex flex-col gap-1 p-4 rounded-xl border text-left transition-colors disabled:opacity-50 cursor-pointer ${
              currentMode === 'whatsapp'
                ? 'bg-white/10 border-[#25D366]/50 ring-1 ring-[#25D366]/30'
                : 'bg-white/5 border-white/10 hover:border-white/25'
            }`}
          >
            {currentMode === 'whatsapp' && (
              <CheckCircle size={14} className="absolute top-3 right-3 text-[#25D366]" />
            )}
            <span className="text-sm font-semibold text-[#FBF7EC]">WhatsApp</span>
            <span className="text-xs text-white/50">Los pedidos llegan a tu WhatsApp</span>
          </button>

          {/* Mercado Pago */}
          <button
            type="button"
            onClick={() => handleSetMode('mercadopago')}
            disabled={isPending || !canUseMercadoPago}
            title={!canUseMercadoPago ? 'Conectá tu cuenta primero' : undefined}
            className={`relative flex flex-col gap-1 p-4 rounded-xl border text-left transition-colors ${
              !canUseMercadoPago
                ? 'opacity-40 cursor-not-allowed bg-white/5 border-white/10'
                : currentMode === 'mercadopago'
                  ? 'bg-white/10 border-[#009EE3]/50 ring-1 ring-[#009EE3]/30 cursor-pointer'
                  : 'bg-white/5 border-white/10 hover:border-white/25 cursor-pointer'
            }`}
          >
            {currentMode === 'mercadopago' && canUseMercadoPago && (
              <CheckCircle size={14} className="absolute top-3 right-3 text-[#009EE3]" />
            )}
            <span className="text-sm font-semibold text-[#FBF7EC]">Mercado Pago</span>
            <span className="text-xs text-white/50">
              {!canUseMercadoPago ? 'Conectá tu cuenta primero' : 'Cobros online a tu cuenta'}
            </span>
          </button>
        </div>
      </div>

      <MpFeesSimulator />
    </section>
  );
}
