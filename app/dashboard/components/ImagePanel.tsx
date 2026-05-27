'use client';

import { useState } from 'react';
import { Loader2, CheckCircle } from 'lucide-react';
import { saveStoreLook, saveBannerConfig } from '@/lib/store/actions';
import { ColorPicker } from '@/app/components/ColorPicker';
import { LogoColorPalette } from '@/app/dashboard/components/LogoColorPalette';
import { LogoUploader } from '@/app/components/store/LogoUploader';
import { BannerUploader } from '@/app/components/store/BannerUploader';
import type { Store } from '@/lib/onboarding/state';
import { parseBanner } from '@/lib/store/theme';

const DEFAULT_ACCENT_COLOR = '#F5C84B';
const DEFAULT_BANNER_COLOR = '#1E3A5F';

type BannerMode = 'none' | 'color' | 'image';

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

function getInitialBannerMode(store: Store): BannerMode {
  const banner = parseBanner(store.theme);
  if (!banner) return 'none';
  return banner.type === 'image' ? 'image' : 'color';
}

function getInitialBannerColor(store: Store): string {
  const banner = parseBanner(store.theme);
  if (banner?.type === 'color') return banner.value;
  return DEFAULT_BANNER_COLOR;
}

function getInitialBannerImageUrl(store: Store): string | null {
  const banner = parseBanner(store.theme);
  if (banner?.type === 'image') return banner.value;
  return null;
}

export function ImagePanel({ store }: Props) {
  const [accentColor, setAccentColor] = useState(getInitialAccentColor(store));
  const [logoUrl, setLogoUrl] = useState<string | null>(store.logo_url ?? null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const [bannerMode, setBannerMode] = useState<BannerMode>(getInitialBannerMode(store));
  const [bannerColor, setBannerColor] = useState(getInitialBannerColor(store));
  const [bannerImageUrl, setBannerImageUrl] = useState<string | null>(getInitialBannerImageUrl(store));

  const handleBannerModeChange = async (mode: BannerMode) => {
    setBannerMode(mode);
    if (mode === 'none') {
      await saveBannerConfig(null);
    } else if (mode === 'color') {
      await saveBannerConfig({ type: 'color', value: bannerColor });
    }
  };

  const handleBannerColorChange = (hex: string) => {
    setBannerColor(hex);
  };

  const handleBannerColorBlur = async () => {
    if (bannerMode === 'color') {
      await saveBannerConfig({ type: 'color', value: bannerColor });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    setServerError(null);

    const banner =
      bannerMode === 'color'
        ? { type: 'color' as const, value: bannerColor }
        : bannerMode === 'image' && bannerImageUrl
        ? { type: 'image' as const, value: bannerImageUrl }
        : null;

    const result = await saveStoreLook({ accent_color: accentColor, logo_url: logoUrl, banner });

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

        {/* Banner */}
        <div>
          <h2 className="text-sm font-semibold text-[#FBF7EC] mb-1">
            Banner de portada{' '}
            <span className="text-white/30 font-normal">(opcional)</span>
          </h2>
          <p className="text-xs text-white/40 mb-3">
            Aparece en la parte superior de tu tienda, como portada estilo red social.
          </p>

          <div className="flex gap-2 mb-4">
            {(['none', 'color', 'image'] as BannerMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => handleBannerModeChange(mode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  bannerMode === mode
                    ? 'bg-[#F5C84B] text-[#16222E]'
                    : 'bg-white/8 text-white/60 hover:bg-white/12'
                }`}
              >
                {mode === 'none' ? 'Sin banner' : mode === 'color' ? 'Color sólido' : 'Imagen'}
              </button>
            ))}
          </div>

          {bannerMode === 'color' && (
            <div className="flex items-start gap-6">
              <div onBlur={handleBannerColorBlur}>
                <ColorPicker
                  value={bannerColor}
                  onChange={handleBannerColorChange}
                  id="banner-color"
                  ariaLabel="Color del banner"
                />
              </div>
              {logoUrl && (
                <LogoColorPalette
                  logoUrl={logoUrl}
                  onSelectColor={async (hex) => {
                    setBannerColor(hex);
                    await saveBannerConfig({ type: 'color', value: hex });
                  }}
                />
              )}
            </div>
          )}

          {bannerMode === 'image' && (
            <BannerUploader
              storeId={store.id}
              initialUrl={bannerImageUrl}
              onUrlChange={(url) => setBannerImageUrl(url)}
            />
          )}
        </div>

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
            Se usa en botones y detalles de tu tienda. Elegí cualquier color.
          </p>

          <div className="flex items-start gap-6">
            <ColorPicker
              value={accentColor}
              onChange={setAccentColor}
              id="accent-color"
              ariaLabel="Color de acento"
            />
            {logoUrl && (
              <LogoColorPalette logoUrl={logoUrl} onSelectColor={setAccentColor} />
            )}
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
