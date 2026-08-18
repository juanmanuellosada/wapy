'use client';

// Editor de tramos de precio por cantidad ("si llevás 3, te sale más barato por unidad").
// Se usa en el form de producto (ProductModal) y, a través de él, desde la grilla de
// edición masiva. Ver openspec/changes/add-quantity-price-tiers/design.md.
//
// Cada fila tiene dos inputs sincronizados sobre el MISMO valor guardado:
//   · "Precio c/u"   → lo que se persiste (unit_price_cents, entero)
//   · "Total"        → precio c/u × cantidad, para que el dueño pueda pensar en "3 x $2800"
// Editar cualquiera de los dos recalcula el otro. Como lo que se guarda es el unitario
// entero, un "3 x $2800" queda en $933,33 c/u y el total real es $2.799,99: la fila
// muestra siempre el total resultante para que el centavo no sea una sorpresa.

import { Plus, Trash2 } from 'lucide-react';
import { validatePriceTiers } from '@/lib/store/product-validation';
import { tierSavingsPercent, type PriceTier } from '@/lib/store/pricing';

export type TierDraft = {
  /** Cantidad mínima como string, para que el input pueda quedar vacío mientras se tipea. */
  minQuantity: string;
  /** Precio por unidad como string en formato local ("933,33"). */
  unitDisplay: string;
};

function formatPriceDisplay(cents: number): string {
  return (cents / 100).toLocaleString('es-AR', { minimumFractionDigits: 0 });
}

function parsePriceDisplay(display: string): number {
  const cleaned = display.replace(/[^0-9,]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  if (isNaN(num) || num < 0) return 0;
  return Math.round(num * 100);
}

/** Convierte los tramos persistidos en borradores editables. */
export function tiersToDrafts(tiers: PriceTier[]): TierDraft[] {
  return [...tiers]
    .sort((a, b) => a.min_quantity - b.min_quantity)
    .map((t) => ({ minQuantity: String(t.min_quantity), unitDisplay: formatPriceDisplay(t.unit_price_cents) }));
}

/** Convierte los borradores en tramos persistibles, descartando filas vacías. */
export function draftsToTiers(drafts: TierDraft[]): PriceTier[] {
  return drafts
    .filter((d) => d.minQuantity.trim() !== '' && d.unitDisplay.trim() !== '')
    .map((d) => ({
      min_quantity: parseInt(d.minQuantity, 10) || 0,
      unit_price_cents: parsePriceDisplay(d.unitDisplay),
    }));
}

/** Primer problema de validación de los tramos, o null si están bien. */
export function firstTierIssue(drafts: TierDraft[], priceCents: number): string | null {
  const issues = validatePriceTiers(draftsToTiers(drafts), priceCents);
  return issues.length > 0 ? issues[0].message : null;
}

const inputClass =
  'w-full rounded-lg bg-white/8 border border-white/15 text-[#FBF7EC] placeholder-white/30 px-2.5 py-2 text-sm focus:outline-none focus:border-[#F5C84B]/70 transition-colors';

export function PriceTiersEditor({
  drafts,
  onChange,
  priceCents,
}: {
  drafts: TierDraft[];
  onChange: (next: TierDraft[]) => void;
  priceCents: number;
}) {
  const issue = firstTierIssue(drafts, priceCents);

  const patch = (index: number, next: Partial<TierDraft>) => {
    onChange(drafts.map((d, i) => (i === index ? { ...d, ...next } : d)));
  };

  const addRow = () => {
    // Sugerencia: la próxima cantidad razonable a partir del último tramo.
    const last = drafts[drafts.length - 1];
    const lastQty = last ? parseInt(last.minQuantity, 10) || 2 : 2;
    onChange([...drafts, { minQuantity: String(drafts.length === 0 ? 3 : lastQty * 2), unitDisplay: '' }]);
  };

  const removeRow = (index: number) => onChange(drafts.filter((_, i) => i !== index));

  return (
    <div className="flex flex-col gap-2">
      <div>
        <span className="block text-sm font-semibold text-[#FBF7EC]">
          Descuento por cantidad <span className="text-white/30 font-normal">(opcional)</span>
        </span>
        <p className="text-xs text-white/40 mt-0.5">
          A partir de la cantidad que pongas, todas las unidades pasan a costar el precio del tramo.
        </p>
      </div>

      {drafts.length > 0 && (
        <div className="flex flex-col gap-2">
          {drafts.map((draft, index) => {
            const qty = parseInt(draft.minQuantity, 10) || 0;
            const unitCents = parsePriceDisplay(draft.unitDisplay);
            const totalCents = qty > 0 ? unitCents * qty : 0;
            const savings = tierSavingsPercent(unitCents, priceCents);

            return (
              <div key={index} className="rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5 flex flex-col gap-2">
                <div className="grid grid-cols-[76px_1fr_1fr_32px] gap-2 items-end">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wide text-white/40 mb-1">
                      Desde
                    </label>
                    <input
                      type="number"
                      min="2"
                      step="1"
                      value={draft.minQuantity}
                      onChange={(e) => patch(index, { minQuantity: e.target.value })}
                      className={inputClass}
                      aria-label={`Cantidad mínima del tramo ${index + 1}`}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wide text-white/40 mb-1">
                      Precio c/u
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-white/40">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={draft.unitDisplay}
                        onChange={(e) => patch(index, { unitDisplay: e.target.value })}
                        className={`${inputClass} pl-6`}
                        aria-label={`Precio por unidad del tramo ${index + 1}`}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wide text-white/40 mb-1">
                      Total {qty > 0 ? `${qty} u` : ''}
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-white/40">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={totalCents > 0 ? formatPriceDisplay(totalCents) : ''}
                        onChange={(e) => {
                          if (qty <= 0) return;
                          const nextTotal = parsePriceDisplay(e.target.value);
                          patch(index, { unitDisplay: formatPriceDisplay(Math.round(nextTotal / qty)) });
                        }}
                        className={`${inputClass} pl-6`}
                        aria-label={`Precio total del tramo ${index + 1}`}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    className="h-9 w-8 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-colors cursor-pointer"
                    aria-label={`Quitar el tramo ${index + 1}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {qty > 0 && unitCents > 0 && (
                  <p className="text-[11px] text-white/40">
                    {qty} unidades = ${formatPriceDisplay(unitCents * qty)}
                    {savings > 0 ? ` · ${savings}% off por unidad` : ''}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={addRow}
        className="self-start flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-[#F5C84B] bg-[#F5C84B]/10 hover:bg-[#F5C84B]/20 transition-colors cursor-pointer"
      >
        <Plus size={14} />
        Agregar tramo
      </button>

      {issue && (
        <p role="alert" className="text-xs text-red-400">
          {issue}
        </p>
      )}
    </div>
  );
}
