'use client';

import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
}

/**
 * Reusable confirmation dialog. Replaces native window.confirm() across
 * the app for consistent UX, on-brand styling, and proper a11y.
 *
 * Behavior:
 * - ESC closes
 * - Backdrop click closes
 * - Confirm button shows a spinner while the async handler is in flight
 * - Cancel + Confirm disabled while pending
 */
export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
}: ConfirmModalProps) {
  const [pending, setPending] = useState(false);

  // ESC closes
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, pending, onClose]);

  // Reset pending when modal opens
  useEffect(() => {
    if (open) setPending(false);
  }, [open]);

  if (!open) return null;

  const handleConfirm = async () => {
    setPending(true);
    try {
      await onConfirm();
      // Caller is responsible for calling onClose on success if desired.
      // We don't auto-close so the caller can show transient state.
    } finally {
      setPending(false);
    }
  };

  const isDestructive = variant === 'destructive';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-message"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Cerrar"
        onClick={() => !pending && onClose()}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-default"
        tabIndex={-1}
      />

      {/* Card */}
      <div className="relative w-full max-w-md bg-[#FBF7EC] rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-6">
          <div className="flex items-start gap-4">
            {isDestructive && (
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-600" aria-hidden />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2
                id="confirm-modal-title"
                className="text-lg font-bold text-[#16222E] mb-1"
              >
                {title}
              </h2>
              <p
                id="confirm-modal-message"
                className="text-sm text-[#16222E]/70 leading-relaxed"
              >
                {message}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 bg-[#16222E]/[0.03] border-t border-[#16222E]/10">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="min-h-[40px] px-4 rounded-lg text-sm font-semibold text-[#16222E]/70 hover:text-[#16222E] hover:bg-[#16222E]/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending}
            className={[
              'min-h-[40px] px-5 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-70',
              isDestructive
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-[#F5C84B] hover:bg-[#D9A92A] text-[#16222E]',
            ].join(' ')}
          >
            {pending && <Loader2 size={16} strokeWidth={2.5} className="animate-spin" aria-hidden />}
            {pending ? 'Procesando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
