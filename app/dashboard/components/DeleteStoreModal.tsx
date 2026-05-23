'use client';

import { useState } from 'react';
import { X, Loader2, AlertTriangle } from 'lucide-react';

type Props = {
  slug: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
};

export function DeleteStoreModal({ slug, onConfirm, onClose }: Props) {
  const [typedSlug, setTypedSlug] = useState('');
  const [deleting, setDeleting] = useState(false);

  const canDelete = typedSlug === slug;

  const handleDelete = async () => {
    if (!canDelete) return;
    setDeleting(true);
    await onConfirm();
    // onConfirm will redirect so we don't need to clean up state
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Eliminar tienda"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      <div className="relative z-10 w-full max-w-md bg-[#1A2634] rounded-2xl border border-red-500/30 shadow-2xl p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-red-400 flex-shrink-0" />
            <h2 className="text-lg font-bold text-[#FBF7EC]">Esto es permanente</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-white/50 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer flex-shrink-0"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm text-red-300 space-y-1">
          <p>Al eliminar tu tienda se borrará permanentemente:</p>
          <ul className="list-disc list-inside mt-2 space-y-0.5 text-red-400/80">
            <li>La tienda y toda su configuración</li>
            <li>Todas las secciones</li>
            <li>Todos los productos e imágenes</li>
            <li>El historial de slugs</li>
          </ul>
          <p className="mt-2 font-semibold">El slug quedará libre para que otro lo use.</p>
        </div>

        <div>
          <label htmlFor="confirm-slug" className="block text-sm font-semibold text-[#FBF7EC] mb-2">
            Para confirmar, escribí el slug exacto:{' '}
            <span className="font-mono text-[#F5C84B]">{slug}</span>
          </label>
          <input
            id="confirm-slug"
            type="text"
            value={typedSlug}
            onChange={(e) => setTypedSlug(e.target.value)}
            placeholder={slug}
            className="w-full rounded-xl bg-white/8 border border-white/15 text-[#FBF7EC] placeholder-white/20 px-4 py-3 text-sm font-mono focus:outline-none focus:border-red-500/70 transition-colors"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

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
            onClick={handleDelete}
            disabled={!canDelete || deleting}
            className="flex-1 min-h-[44px] rounded-xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            {deleting && <Loader2 size={14} className="animate-spin" />}
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}
