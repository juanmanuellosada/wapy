'use client';

import { useState } from 'react';
import { X, Loader2, ArrowRight } from 'lucide-react';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://wapy.com.ar';

type Props = {
  oldSlug: string;
  newSlug: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
};

export function RenameSlugModal({ oldSlug, newSlug, onConfirm, onClose }: Props) {
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async () => {
    setConfirming(true);
    await onConfirm();
    setConfirming(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Confirmar cambio de slug"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      <div className="relative z-10 w-full max-w-md bg-[#1A2634] rounded-2xl border border-white/10 shadow-2xl p-6 space-y-5">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-bold text-[#FBF7EC]">¿Cambiar el slug de tu tienda?</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-white/50 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer flex-shrink-0"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {/* URL preview */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-white/50 font-mono">{APP_URL}/{oldSlug}</span>
          </div>
          <div className="flex items-center gap-2">
            <ArrowRight size={14} className="text-[#F5C84B] flex-shrink-0" />
            <span className="text-sm font-mono font-semibold text-[#FBF7EC]">{APP_URL}/{newSlug}</span>
          </div>
        </div>

        <p className="text-sm text-white/60">
          Los links anteriores se redirigen automáticamente, así que la gente que tenga el link viejo igual llega a tu tienda.
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[44px] rounded-xl border border-white/20 text-white/70 font-semibold text-sm hover:border-white/40 hover:text-white transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirming}
            className="flex-1 min-h-[44px] rounded-xl bg-[#F5C84B] text-[#16222E] font-bold text-sm hover:bg-[#FAE08A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            {confirming && <Loader2 size={14} className="animate-spin" />}
            Sí, cambiar
          </button>
        </div>
      </div>
    </div>
  );
}
