'use client';

// Editor de la oferta NxM ("llevás N, pagás M") de un producto. Vive junto al
// precio promocional y los tramos por cantidad en el form de producto. Ver
// openspec/changes/add-multibuy-offers/design.md, Decisión 9.

import { validateMultibuy } from '@/lib/store/product-validation';
import { multibuyLabel, type MultibuyOffer } from '@/lib/store/pricing';

export type MultibuyDraft = {
  /** 'none' = sin oferta, 'custom' = N y M libres, si no la etiqueta del preset ("2x1"). */
  preset: string;
  buy: string;
  pay: string;
};

const PRESETS: MultibuyOffer[] = [
  { buy: 2, pay: 1 },
  { buy: 3, pay: 2 },
  { buy: 3, pay: 1 },
  { buy: 4, pay: 3 },
];

/** Borrador a partir de las columnas guardadas del producto. */
export function multibuyToDraft(buy: number | null | undefined, pay: number | null | undefined): MultibuyDraft {
  if (buy == null || pay == null) return { preset: 'none', buy: '', pay: '' };
  const label = multibuyLabel({ buy, pay });
  const isPreset = PRESETS.some((p) => multibuyLabel(p) === label);
  return { preset: isPreset ? label : 'custom', buy: String(buy), pay: String(pay) };
}

/** Borrador → valores a persistir. Sin oferta devuelve ambos null. */
export function draftToMultibuy(draft: MultibuyDraft): { buy: number | null; pay: number | null } {
  if (draft.preset === 'none') return { buy: null, pay: null };
  return { buy: parseInt(draft.buy, 10) || 0, pay: parseInt(draft.pay, 10) || 0 };
}

/** Primer problema de validación de la oferta, o null si está bien. */
export function firstMultibuyIssue(draft: MultibuyDraft): string | null {
  const { buy, pay } = draftToMultibuy(draft);
  const issues = validateMultibuy(buy, pay);
  return issues.length > 0 ? issues[0].message : null;
}

const inputClass =
  'w-full rounded-lg bg-white/8 border border-white/15 text-[#FBF7EC] placeholder-white/30 px-2.5 py-2 text-sm focus:outline-none focus:border-[#F5C84B]/70 transition-colors';

export function MultibuyEditor({
  draft,
  onChange,
  priceCents,
}: {
  draft: MultibuyDraft;
  onChange: (next: MultibuyDraft) => void;
  priceCents: number;
}) {
  const issue = draft.preset === 'none' ? null : firstMultibuyIssue(draft);
  const { buy, pay } = draftToMultibuy(draft);

  const selectPreset = (preset: string) => {
    if (preset === 'none') return onChange({ preset, buy: '', pay: '' });
    if (preset === 'custom') return onChange({ preset, buy: draft.buy, pay: draft.pay });
    const [b, p] = preset.split('x');
    onChange({ preset, buy: b, pay: p });
  };

  const chips = [
    { value: 'none', label: 'Sin oferta' },
    ...PRESETS.map((p) => ({ value: multibuyLabel(p), label: multibuyLabel(p) })),
    { value: 'custom', label: 'Personalizada' },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div>
        <span className="block text-sm font-semibold text-[#FBF7EC]">
          Oferta 2x1, 3x2... <span className="text-white/30 font-normal">(opcional)</span>
        </span>
        <p className="text-xs text-white/40 mt-0.5">
          La compradora lleva N unidades y paga M. Cuenta todas las variantes del producto juntas, y
          si otro descuento le conviene más, se aplica ese en lugar de este (nunca se suman).
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Oferta NxM">
        {chips.map((c) => {
          const active = draft.preset === c.value;
          return (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => selectPreset(c.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                active
                  ? 'bg-[#F5C84B] text-black'
                  : 'bg-white/8 text-white/70 hover:bg-white/15 border border-white/15'
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {draft.preset === 'custom' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-white/40 mb-1">
              Se lleva
            </label>
            <input
              type="number"
              min="2"
              step="1"
              value={draft.buy}
              onChange={(e) => onChange({ ...draft, buy: e.target.value })}
              className={inputClass}
              aria-label="Unidades que se llevan"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-white/40 mb-1">
              Se paga
            </label>
            <input
              type="number"
              min="1"
              step="1"
              value={draft.pay}
              onChange={(e) => onChange({ ...draft, pay: e.target.value })}
              className={inputClass}
              aria-label="Unidades que se pagan"
            />
          </div>
        </div>
      )}

      {draft.preset !== 'none' && !issue && priceCents > 0 && (
        <p className="text-[11px] text-white/40">
          Llevando {buy} de ${(priceCents / 100).toLocaleString('es-AR')} pagan $
          {((priceCents * (pay ?? 0)) / 100).toLocaleString('es-AR')}.
        </p>
      )}

      {issue && (
        <p role="alert" className="text-xs text-red-400">
          {issue}
        </p>
      )}
    </div>
  );
}
