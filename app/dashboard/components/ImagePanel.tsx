'use client';

import { useState } from 'react';
import { Loader2, CheckCircle } from 'lucide-react';
import { ACCENT_COLORS, DEFAULT_ACCENT_COLOR } from '@/lib/onboarding/palette';
import { saveStoreLook } from '@/lib/store/actions';
import { LogoUploader } from '@/app/components/store/LogoUploader';
import type { Store } from '@/lib/onboarding/state';

type Props = {
  store: Store;
};

function getInitialAccentColor(store: Store): string {
  if (store.theme && typeof store.theme === 'object' && !Array.isArray(store.theme)) {
    const theme = store.theme as Record<string, unknown>;
    if (typeof theme.accent_color === 'string') return theme.accent_color;
  }
  return DEFAULT_ACCENT_COLOR;
}

export function ImagePanel({ store }: Props) {
  const [accentColor, setAccentColor] = useState(getInitialAccentColor(store));
  const [logoUrl, setLogoUrl] = useState<string | null>(store.logo_url ?? null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    setServerError(null);

    const result = await saveStoreLook({ accent_color: accentColor, logo_url: logoUrl });

    setSaving(false);

    if ('error' in result) {
      setServerError(result.error);
      return;
    }

    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  return (
    <div>
      <h1 className="text-xl font-bold text-[#FBF7EC] mb-6">Imagen</h1>

      <form onSubmit={handleSubmit} className="space-y-8">
        {serverError && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">
            {serverError}
          </div>
        )}

        {/* Logo */}
        <div>
          <h2 className="text-sm font-semibold text-[#FBF7EC] mb-1">
            Logo de tu tienda{' '}
            <span className="text-white/30 font-normal">(opcional)</span>
          </h2>
          <p className="text-xs text-white/40 mb-3">
            Aparece en el encabezado de tu tienda. Recomendamos fondo transparente.
          </p>
          <LogoUploader
            storeId={store.id}
            initialUrl={store.logo_url ?? null}
            onUrlChange={setLogoUrl}
          />
        </div>

        {/* Accent color */}
        <div>
          <h2 className="text-sm font-semibold text-[#FBF7EC] mb-1">
            Color de acento <span aria-hidden className="text-red-400">*</span>
          </h2>
          <p className="text-xs text-white/40 mb-4">
            Se usa en botones y detalles de tu tienda.
          </p>

          <div className="flex items-center gap-3 flex-wrap" role="radiogroup" aria-label="Color de acento">
            {ACCENT_COLORS.map((color) => {
              const isSelected = accentColor === color.value;
              return (
                <label key={color.value} className="cursor-pointer" title={color.label}>
                  <input
                    type="radio"
                    name="accent_color"
                    value={color.value}
                    checked={isSelected}
                    onChange={() => setAccentColor(color.value)}
                    className="sr-only"
                  />
                  <span
                    className={`block w-10 h-10 rounded-full transition-all ${
                      isSelected
                        ? 'ring-2 ring-white ring-offset-2 ring-offset-[#16222E] scale-110'
                        : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: color.value }}
                    aria-label={color.label}
                  />
                </label>
              );
            })}
          </div>

          {/* Preview */}
          <div className="mt-5 p-4 rounded-xl border border-white/10 bg-white/3">
            <p className="text-xs text-white/40 mb-3">Vista previa</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-white text-sm font-semibold"
                style={{ backgroundColor: accentColor }}
              >
                Agregar al pedido
              </button>
              <span className="text-sm font-semibold" style={{ color: accentColor }}>
                Ver secciones
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          {success && (
            <span className="flex items-center gap-1.5 text-sm text-green-400">
              <CheckCircle size={14} />
              Guardado
            </span>
          )}
          <button
            type="submit"
            disabled={saving}
            className="min-h-[44px] px-6 rounded-xl bg-[#F5C84B] text-[#16222E] font-bold text-sm hover:bg-[#FAE08A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2 cursor-pointer"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
}
