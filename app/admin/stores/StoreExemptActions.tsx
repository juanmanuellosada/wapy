'use client';

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { setStorePaymentExempt } from '@/lib/subscription/actions';
import { ConfirmModal } from '@/app/components/ConfirmModal';

interface Props {
  storeId: string;
  storeName: string;
  isExempt: boolean;
  currentReason: string | null;
}

export function StoreExemptActions({ storeId, storeName, isExempt, currentReason }: Props) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'error'; message: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState('');

  function handleToggleClick() {
    setFeedback(null);
    setReason(isExempt ? '' : (currentReason ?? ''));
    setConfirmOpen(true);
  }

  async function handleConfirm() {
    setConfirmOpen(false);
    startTransition(async () => {
      const result = await setStorePaymentExempt(storeId, !isExempt, reason.trim() || (isExempt ? '' : 'Exención manual por superadmin'));
      if ('error' in result) {
        setFeedback({ type: 'error', message: result.error });
      } else {
        setFeedback({ type: 'ok', message: isExempt ? 'Exención removida.' : 'Tienda marcada como exenta.' });
        setTimeout(() => setFeedback(null), 5000);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleToggleClick}
        disabled={isPending}
        aria-label={isExempt ? `Quitar exención de ${storeName}` : `Marcar ${storeName} como exenta`}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5C84B] ${
          isExempt
            ? 'text-red-600 border border-red-200 bg-red-50 hover:bg-red-100'
            : 'text-blue-700 border border-blue-200 bg-blue-50 hover:bg-blue-100'
        }`}
      >
        {isPending && <Loader2 size={12} className="animate-spin" aria-hidden />}
        {isExempt ? 'Quitar exención' : 'Marcar exenta'}
      </button>

      {feedback && (
        <p
          role="status"
          aria-live="polite"
          className={`text-xs ${feedback.type === 'ok' ? 'text-green-700' : 'text-red-600'}`}
        >
          {feedback.message}
        </p>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setConfirmOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-default"
            tabIndex={-1}
          />
          <div className="relative w-full max-w-sm bg-[#FBF7EC] rounded-2xl shadow-2xl p-6 space-y-4">
            <h2 className="text-base font-bold text-[#16222E]">
              {isExempt ? `Quitar exención de ${storeName}` : `Marcar ${storeName} como exenta`}
            </h2>
            {!isExempt && (
              <div>
                <label htmlFor="exempt-reason" className="block text-sm font-semibold text-[#16222E] mb-1.5">
                  Motivo
                </label>
                <input
                  id="exempt-reason"
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ej: Tienda de prueba, acuerdo comercial…"
                  className="w-full rounded-xl bg-[#16222E]/5 border border-[#16222E]/15 text-[#16222E] placeholder-[#16222E]/30 px-4 py-2.5 text-sm focus:outline-none focus:border-[#F5C84B]/70 transition-colors"
                />
              </div>
            )}
            {isExempt && (
              <p className="text-sm text-[#16222E]/70">
                La tienda volverá a regirse por su trial/suscripción. Si está fuera de trial y sin suscripción activa, el cron la bloqueará en la próxima ejecución.
              </p>
            )}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="px-4 min-h-[40px] rounded-lg text-sm font-semibold text-[#16222E]/70 hover:bg-[#16222E]/5 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className={`px-5 min-h-[40px] rounded-lg text-sm font-bold transition-colors cursor-pointer ${
                  isExempt
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-[#F5C84B] hover:bg-[#D9A92A] text-[#16222E]'
                }`}
              >
                {isExempt ? 'Quitar exención' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
