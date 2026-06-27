'use client';

import { useState, useTransition } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { adminDeleteStore } from '@/lib/admin/actions';

interface Props {
  storeId: string;
  storeSlug: string;
}

export function AdminDeleteStoreButton({ storeId, storeSlug }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'error'; message: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typedSlug, setTypedSlug] = useState('');

  function handleDeleteClick() {
    setFeedback(null);
    setTypedSlug('');
    setConfirmOpen(true);
  }

  function handleConfirm() {
    setConfirmOpen(false);
    startTransition(async () => {
      const result = await adminDeleteStore({ storeId, confirmSlug: typedSlug });
      if ('error' in result) {
        setFeedback({ type: 'error', message: result.error });
      } else {
        router.refresh();
      }
    });
  }

  const canDelete = typedSlug === storeSlug;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleDeleteClick}
        disabled={isPending}
        aria-label={`Eliminar tienda ${storeSlug}`}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5C84B] text-red-600 border border-red-200 bg-red-50 hover:bg-red-100"
      >
        {isPending && <Loader2 size={12} className="animate-spin" aria-hidden />}
        Eliminar
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
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-red-600 flex-shrink-0" aria-hidden />
              <h2 className="text-base font-bold text-[#16222E]">Eliminar tienda permanentemente</h2>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
              <p>
                Esto eliminará de forma permanente la tienda{' '}
                <span className="font-mono font-semibold">/{storeSlug}</span> y todos sus datos:
                secciones, productos, imágenes e historial de slugs. La suscripción de Mercado Pago
                se cancelará automáticamente.
              </p>
            </div>

            <div>
              <label htmlFor={`confirm-slug-${storeId}`} className="block text-sm font-semibold text-[#16222E] mb-1.5">
                Escribí el slug para confirmar:{' '}
                <span className="font-mono text-red-600">{storeSlug}</span>
              </label>
              <input
                id={`confirm-slug-${storeId}`}
                type="text"
                value={typedSlug}
                onChange={(e) => setTypedSlug(e.target.value)}
                placeholder={storeSlug}
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-xl bg-[#16222E]/5 border border-[#16222E]/15 text-[#16222E] placeholder-[#16222E]/30 px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-red-500/70 transition-colors"
              />
            </div>

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
                disabled={!canDelete}
                className="px-5 min-h-[40px] rounded-lg text-sm font-bold transition-colors cursor-pointer bg-red-600 hover:bg-red-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Eliminar tienda
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
