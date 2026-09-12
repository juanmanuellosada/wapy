'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Search, Trash2, Plus } from 'lucide-react';
import { createManualSale, searchManualSaleCatalog } from '@/lib/store/orders/actions';
import type { ManualSaleCatalogOption, ManualSaleLineInput } from '@/lib/store/orders/actions';
import { DatePicker } from '@/app/components/DatePicker';
import { toast } from '@/lib/toast';
import { formatPriceDisplay, parsePriceDisplay } from '@/lib/store/orders/priceInput';

type Props = {
  onClose: () => void;
  onCreated: () => void;
};

type LineState = {
  key: string;
  // Catálogo: product_id (y variant_id si corresponde) fijos, nombre de solo lectura.
  // Suelta: product_id null, nombre editable.
  product_id: string | null;
  variant_id: string | null;
  name: string;
  quantity: string;
  price_display: string;
  cost_display: string;
};

function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: 'No tenés permisos para esta acción.',
  not_pro: 'La carga manual de ventas es exclusiva del plan Pro.',
  no_valid_items: 'Agregá al menos una línea.',
  invalid_line: 'Revisá las líneas cargadas: cantidad y precio son obligatorios.',
  invalid_date: 'La fecha no es válida.',
  future_date: 'La fecha de venta no puede ser futura.',
  product_not_found: 'Alguno de los productos ya no está disponible.',
  insert_failed: 'No se pudo registrar la venta. Probá de nuevo.',
  stock_insufficient: 'No hay stock suficiente para alguna de las líneas.',
};

export function ManualSaleModal({ onClose, onCreated }: Props) {
  const [soldAt, setSoldAt] = useState(todayISO());
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [discountStock, setDiscountStock] = useState(true);
  const [lines, setLines] = useState<LineState[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ManualSaleCatalogOption[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextKey = useRef(0);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  // Buscador de catálogo con debounce (mismo patrón que la búsqueda del listado).
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      const result = await searchManualSaleCatalog(searchQuery);
      if ('options' in result) setSearchResults(result.options);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  // Cerrar el desplegable al hacer clic afuera (mismo patrón que Select,
  // app/components/Select.tsx): un listener de pointerdown en window mientras
  // está abierto, que se saca solo si el clic cayó fuera del buscador.
  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e: PointerEvent) => {
      if (!searchBoxRef.current?.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    window.addEventListener('pointerdown', handler);
    return () => window.removeEventListener('pointerdown', handler);
  }, [searchOpen]);

  const addCatalogLine = (option: ManualSaleCatalogOption) => {
    setLines((prev) => [
      ...prev,
      {
        key: `c${nextKey.current++}`,
        product_id: option.product_id,
        variant_id: option.variant_id,
        name: option.label,
        quantity: '1',
        price_display: formatPriceDisplay(option.unit_price_cents),
        cost_display: option.cost_cents != null ? formatPriceDisplay(option.cost_cents) : '',
      },
    ]);
    setSearchQuery('');
    setSearchResults([]);
    setSearchOpen(false);
  };

  const addLooseLine = () => {
    setLines((prev) => [
      ...prev,
      { key: `l${nextKey.current++}`, product_id: null, variant_id: null, name: '', quantity: '1', price_display: '', cost_display: '' },
    ]);
  };

  const updateLine = (key: string, patch: Partial<LineState>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  };

  const total = lines.reduce((sum, l) => {
    const qty = parseInt(l.quantity, 10) || 0;
    return sum + qty * parsePriceDisplay(l.price_display);
  }, 0);

  const handleSubmit = async () => {
    setError(null);

    if (lines.length === 0) {
      setError('Agregá al menos una línea.');
      return;
    }

    const lineInputs: ManualSaleLineInput[] = [];
    for (const l of lines) {
      const quantity = parseInt(l.quantity, 10);
      if (!Number.isInteger(quantity) || quantity < 1) {
        setError('Revisá las cantidades: tienen que ser números enteros mayores a cero.');
        return;
      }
      const unit_price_cents = parsePriceDisplay(l.price_display);
      if (l.product_id) {
        lineInputs.push({ product_id: l.product_id, variant_id: l.variant_id, quantity, unit_price_cents });
      } else {
        if (!l.name.trim()) {
          setError('Las líneas sueltas necesitan un nombre.');
          return;
        }
        lineInputs.push({
          name: l.name.trim(),
          quantity,
          unit_price_cents,
          cost_cents: l.cost_display.trim() ? parsePriceDisplay(l.cost_display) : null,
        });
      }
    }

    setSubmitting(true);
    const result = await createManualSale({
      sold_at: soldAt,
      customer_name: customerName.trim() || null,
      notes: notes.trim() || null,
      discount_stock: discountStock,
      lines: lineInputs,
    });
    setSubmitting(false);

    if ('error' in result) {
      setError(ERROR_MESSAGES[result.error] ?? 'No se pudo registrar la venta.');
      return;
    }

    toast.success('Venta registrada');
    onCreated();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative z-10 w-full max-w-lg bg-[#16222E] border border-white/15 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/10">
          <p className="text-sm font-semibold text-[#FBF7EC]">Registrar venta</p>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-white/40 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Fecha de venta: hoy por default, nunca futura */}
          <div>
            <label className="block text-xs text-white/50 mb-1">Fecha de venta</label>
            <DatePicker value={soldAt} onChange={setSoldAt} max={todayISO()} ariaLabel="Fecha de venta" fullWidth />
          </div>

          <div>
            <label className="block text-xs text-white/50 mb-1">Cliente (opcional)</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white/6 border border-white/10 text-sm text-[#FBF7EC] placeholder-white/30 focus:outline-none focus:border-white/30"
              placeholder="Nombre del cliente"
            />
          </div>

          {/* Buscador de catálogo */}
          <div className="relative" ref={searchBoxRef}>
            <label className="block text-xs text-white/50 mb-1">Agregar producto del catálogo</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                placeholder="Buscar producto..."
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-white/6 border border-white/10 text-sm text-[#FBF7EC] placeholder-white/30 focus:outline-none focus:border-white/30"
              />
            </div>
            {searchOpen && searchResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border border-white/15 bg-[#0E1820] shadow-xl">
                {searchResults.map((opt) => (
                  <button
                    key={`${opt.product_id}-${opt.variant_id ?? ''}`}
                    type="button"
                    onClick={() => addCatalogLine(opt)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm text-[#FBF7EC] hover:bg-white/8 transition-colors cursor-pointer"
                  >
                    <span className="truncate">{opt.label}</span>
                    <span className="flex-shrink-0 text-xs text-white/40">{formatPrice(opt.unit_price_cents)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={addLooseLine}
            className="flex items-center gap-1.5 text-xs font-medium text-white/60 hover:text-white cursor-pointer"
          >
            <Plus size={12} />
            Línea suelta (sin catálogo)
          </button>

          {/* Líneas cargadas */}
          {lines.length > 0 && (
            <div className="space-y-2">
              {lines.map((line) => (
                <div key={line.key} className="flex items-start gap-2 bg-white/6 border border-white/10 rounded-xl px-3 py-2.5">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    {line.product_id ? (
                      <p className="text-sm text-[#FBF7EC] truncate">{line.name}</p>
                    ) : (
                      <input
                        type="text"
                        value={line.name}
                        onChange={(e) => updateLine(line.key, { name: e.target.value })}
                        placeholder="Nombre del producto"
                        className="w-full px-2 py-1 rounded-lg bg-white/6 border border-white/10 text-sm text-[#FBF7EC] placeholder-white/30 focus:outline-none focus:border-white/30"
                      />
                    )}
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                        className="w-16 px-2 py-1 rounded-lg bg-white/6 border border-white/10 text-xs text-[#FBF7EC] focus:outline-none focus:border-white/30"
                        aria-label="Cantidad"
                      />
                      <input
                        type="text"
                        value={line.price_display}
                        onChange={(e) => updateLine(line.key, { price_display: e.target.value })}
                        placeholder="Precio"
                        className="w-24 px-2 py-1 rounded-lg bg-white/6 border border-white/10 text-xs text-[#FBF7EC] placeholder-white/30 focus:outline-none focus:border-white/30"
                        aria-label="Precio unitario"
                      />
                      <input
                        type="text"
                        value={line.cost_display}
                        onChange={(e) => updateLine(line.key, { cost_display: e.target.value })}
                        placeholder="Costo (opc.)"
                        className="w-24 px-2 py-1 rounded-lg bg-white/6 border border-white/10 text-xs text-[#FBF7EC] placeholder-white/30 focus:outline-none focus:border-white/30"
                        aria-label="Costo unitario"
                      />
                      <span className="text-xs text-white/40 ml-auto whitespace-nowrap">
                        {formatPrice((parseInt(line.quantity, 10) || 0) * parsePriceDisplay(line.price_display))}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(line.key)}
                    className="flex-shrink-0 text-white/30 hover:text-red-300 transition-colors cursor-pointer mt-1"
                    aria-label="Quitar línea"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Total en vivo */}
          <div className="flex items-center justify-between pt-2 border-t border-white/10">
            <p className="text-sm font-semibold text-white/70">Total</p>
            <p className="text-base font-bold text-[#F5C84B]">{formatPrice(total)}</p>
          </div>

          {/* Stock */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={discountStock}
              onChange={(e) => setDiscountStock(e.target.checked)}
              className="w-4 h-4 cursor-pointer accent-[#F5C84B]"
            />
            <span className="text-sm text-white/70">Descontar del stock</span>
          </label>

          <div>
            <label className="block text-xs text-white/50 mb-1">Notas (opcional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-xl bg-white/6 border border-white/10 text-sm text-[#FBF7EC] placeholder-white/30 focus:outline-none focus:border-white/30 resize-none"
              placeholder="Notas internas"
            />
          </div>

          {error && <p className="text-xs text-red-300">{error}</p>}
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 pt-3 border-t border-white/10">
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="w-full py-2 rounded-xl text-sm font-semibold bg-[#F5C84B]/20 text-[#F5C84B] border border-[#F5C84B]/30 hover:bg-[#F5C84B]/30 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {submitting ? 'Registrando...' : 'Registrar venta'}
          </button>
        </div>
      </div>
    </div>
  );
}
