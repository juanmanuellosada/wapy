import Link from 'next/link';
import { publishStore } from '@/lib/onboarding/actions';
import type { Store, Section, Product } from '@/lib/onboarding/state';
import { PublishButton } from './PublishButton';

type Props = {
  store: Store;
  sections: Section[];
  products: Product[];
};

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

function getThemeField(store: Store, key: string): string | null {
  if (store.theme && typeof store.theme === 'object' && !Array.isArray(store.theme)) {
    const t = store.theme as Record<string, unknown>;
    const v = t[key];
    return typeof v === 'string' ? v : null;
  }
  return null;
}

function getAccentColor(store: Store): string {
  return getThemeField(store, 'accent_color') ?? '#22c55e';
}

export function StepReview({ store, sections, products }: Props) {
  const accentColor = getAccentColor(store);
  const activeProducts = products.filter((p) => p.is_active);

  const missingPrereqs: string[] = [];
  if (sections.length === 0) missingPrereqs.push('Agregá al menos una sección');
  if (activeProducts.length === 0) missingPrereqs.push('Agregá al menos un producto');
  if (!store.whatsapp_number) missingPrereqs.push('Agregá tu número de WhatsApp');

  const canPublish = missingPrereqs.length === 0;

  return (
    <div className="space-y-5">
      {/* Basics card */}
      <ReviewCard title="Datos de la tienda" editHref="/onboarding/basics">
        <p className="text-sm font-bold text-[#FBF7EC]">{store.name}</p>
        <p className="text-xs text-white/50 font-mono">wapy.com.ar/{store.slug}</p>
        {getThemeField(store, 'description') && (
          <p className="text-xs text-white/40 mt-1 line-clamp-2">{getThemeField(store, 'description')}</p>
        )}
      </ReviewCard>

      {/* Look card */}
      <ReviewCard title="Imagen" editHref="/onboarding/look">
        <div className="flex items-center gap-3">
          {store.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={store.logo_url}
              alt="Logo"
              className="w-10 h-10 rounded-lg object-contain bg-white/10"
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-white/30 text-xs">
              Sin logo
            </div>
          )}
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded-full border border-white/20"
              style={{ backgroundColor: accentColor }}
              aria-label={`Color de acento: ${accentColor}`}
            />
            <span className="text-xs text-white/50">{accentColor}</span>
          </div>
        </div>
      </ReviewCard>

      {/* Sections card */}
      <ReviewCard
        title={`Secciones (${sections.length})`}
        editHref="/onboarding/sections"
        warning={sections.length === 0 ? 'Necesitás al menos una sección' : undefined}
      >
        {sections.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {sections.map((s) => (
              <li key={s.id} className="text-xs bg-white/10 text-white/70 rounded-lg px-2 py-1">
                {s.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-red-400">Sin secciones</p>
        )}
      </ReviewCard>

      {/* Products card */}
      <ReviewCard
        title={`Productos (${activeProducts.length})`}
        editHref="/onboarding/products"
        warning={activeProducts.length === 0 ? 'Necesitás al menos un producto' : undefined}
      >
        {activeProducts.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {activeProducts.slice(0, 6).map((p) => (
              <div key={p.id} className="flex items-center gap-2 bg-white/8 rounded-lg px-2 py-1">
                {p.image_urls[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.image_urls[0]}
                    alt=""
                    className="w-6 h-6 rounded object-cover"
                  />
                )}
                <div>
                  <p className="text-xs text-white/80 font-semibold leading-tight">{p.name}</p>
                  <p className="text-xs text-[#F5C84B]/80">{formatPrice(p.price_cents)}</p>
                </div>
              </div>
            ))}
            {activeProducts.length > 6 && (
              <span className="text-xs text-white/40 self-center">+{activeProducts.length - 6} más</span>
            )}
          </div>
        ) : (
          <p className="text-xs text-red-400">Sin productos</p>
        )}
      </ReviewCard>

      {/* WhatsApp card */}
      <ReviewCard
        title="WhatsApp"
        editHref="/onboarding/whatsapp"
        warning={!store.whatsapp_number ? 'Falta el número de WhatsApp' : undefined}
      >
        {store.whatsapp_number ? (
          <p className="text-sm font-mono text-[#FBF7EC]">{store.whatsapp_number}</p>
        ) : (
          <p className="text-xs text-red-400">Sin número</p>
        )}
      </ReviewCard>

      {/* Missing prereqs warning */}
      {missingPrereqs.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-amber-300 mb-2">Antes de publicar:</p>
          <ul className="space-y-1">
            {missingPrereqs.map((msg) => (
              <li key={msg} className="text-xs text-amber-300/80 flex items-center gap-1.5">
                <span aria-hidden>•</span> {msg}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Publish */}
      <div className="pt-2 space-y-3">
        <PublishButton disabled={!canPublish} publishAction={publishStore} />
        <p className="text-center text-xs text-white/30">
          Tu tienda quedará en{' '}
          <span className="font-mono text-white/50">
            https://wapy.com.ar/{store.slug}
          </span>
        </p>
        <p className="text-center text-xs text-white/20">
          Preview real disponible próximamente.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReviewCard helper
// ---------------------------------------------------------------------------

type ReviewCardProps = {
  title: string;
  editHref: string;
  warning?: string;
  children: React.ReactNode;
};

function ReviewCard({ title, editHref, warning, children }: ReviewCardProps) {
  return (
    <div className={`bg-white/5 border rounded-xl px-4 py-4 ${warning ? 'border-amber-500/30' : 'border-white/10'}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="text-sm font-bold text-[#FBF7EC]">{title}</h3>
        <Link
          href={editHref}
          className="text-xs text-[#F5C84B] hover:text-[#FAE08A] font-semibold flex-shrink-0 transition-colors"
        >
          Editar
        </Link>
      </div>
      {children}
    </div>
  );
}
