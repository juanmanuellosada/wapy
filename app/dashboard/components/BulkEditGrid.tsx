'use client';

// Grilla de edición masiva del catálogo (design.md, Decisión 6; specs/bulk-product-editing).
// Modo pantalla completa dentro de la sección de productos del dashboard. Opera sobre
// TODO el catálogo (no solo el último import), con filtro de borradores + búsqueda,
// selección múltiple + acciones en lote, guardado explícito vía bulkUpdateProducts,
// y validación en línea con las mismas reglas que ProductModal (lib/store/product-validation.ts).

import { useState, useRef, useMemo, useCallback, useEffect, memo } from 'react';
import { Search, X, Loader2, Eye, EyeOff, Pencil, AlertCircle, Trash2 } from 'lucide-react';
import { Select, type SelectOption } from '@/app/components/Select';
import { ConfirmModal } from '@/app/components/ConfirmModal';
import { ProductModal } from '@/app/components/store/ProductModal';
import { bulkUpdateProducts, bulkDeleteProducts } from '@/lib/store/actions';
import { validateProductFields, type ProductValidationIssue } from '@/lib/store/product-validation';
import type { Product, Section } from '@/lib/onboarding/state';
import { toast } from '@/lib/toast';

// ---------------------------------------------------------------------------
// Parseo/formateo de precios — mismo comportamiento que app/components/store/ProductModal.tsx
// (no se importa porque son funciones privadas de ese módulo).
// ---------------------------------------------------------------------------

function formatPriceDisplay(cents: number): string {
  return (cents / 100).toLocaleString('es-AR', { minimumFractionDigits: 0 });
}

function parsePriceDisplay(display: string): number {
  const cleaned = display.replace(/[^0-9,]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  if (isNaN(num) || num < 0) return 0;
  return Math.round(num * 100);
}

// ---------------------------------------------------------------------------
// Estado editable por fila
// ---------------------------------------------------------------------------

type EditableFields = {
  name: string;
  description: string; // '' = sin descripción
  price_display: string;
  promo_price_display: string; // '' = sin promo
  section_id: string; // '' = sin sección
  stock_display: string; // '' = ilimitado
  is_active: boolean;
};

type RowState = EditableFields & {
  id: string;
  imageUrl: string | null;
  dirty: boolean;
  errors: ProductValidationIssue[];
};

function buildEditableFields(p: Product): EditableFields {
  return {
    name: p.name,
    description: p.description ?? '',
    price_display: formatPriceDisplay(p.price_cents),
    promo_price_display: p.promo_price_cents != null ? formatPriceDisplay(p.promo_price_cents) : '',
    section_id: p.section_id ?? '',
    stock_display: p.stock != null ? String(p.stock) : '',
    is_active: p.is_active,
  };
}

/** Valores semánticos normalizados de una fila, usados para detectar cambios y validar. */
function normalizeFields(f: EditableFields) {
  const stockTrim = f.stock_display.trim();
  return {
    name: f.name.trim(),
    description: f.description.trim(),
    price_cents: parsePriceDisplay(f.price_display),
    promo_price_cents: f.promo_price_display.trim() === '' ? null : parsePriceDisplay(f.promo_price_display),
    section_id: f.section_id || null,
    stock: stockTrim === '' ? null : Number(stockTrim),
    is_active: f.is_active,
  };
}

function isRowDirty(current: EditableFields, baseline: EditableFields): boolean {
  const a = normalizeFields(current);
  const b = normalizeFields(baseline);
  return (
    a.name !== b.name ||
    a.description !== b.description ||
    a.price_cents !== b.price_cents ||
    a.promo_price_cents !== b.promo_price_cents ||
    a.section_id !== b.section_id ||
    a.stock !== b.stock ||
    a.is_active !== b.is_active
  );
}

function computeRowValidation(fields: EditableFields): ProductValidationIssue[] {
  const n = normalizeFields(fields);
  const issues: ProductValidationIssue[] = [];
  const stockIsGarbage = n.stock !== null && Number.isNaN(n.stock);
  if (stockIsGarbage) {
    issues.push({
      field: 'stock',
      message: 'El stock debe ser un número entero mayor o igual a 0, o vacío para stock ilimitado.',
    });
  }
  issues.push(
    ...validateProductFields({
      name: n.name,
      description: n.description || null,
      price_cents: n.price_cents,
      promo_price_cents: n.promo_price_cents,
      stock: stockIsGarbage ? null : n.stock,
    })
  );
  return issues;
}

function toBulkUpdateRow(row: RowState) {
  const n = normalizeFields(row);
  return {
    id: row.id,
    name: n.name,
    description: n.description === '' ? null : n.description,
    price_cents: n.price_cents,
    promo_price_cents: n.promo_price_cents,
    section_id: n.section_id,
    stock: n.stock !== null && Number.isNaN(n.stock) ? null : n.stock,
    is_active: n.is_active,
  };
}

function buildSectionOptions(sections: Section[]): SelectOption[] {
  const options: SelectOption[] = [{ value: '', label: 'Sin sección' }];
  const level1 = sections.filter((s) => s.parent_id == null);
  for (const parent of level1) {
    options.push({ value: parent.id, label: parent.name });
    for (const child of sections.filter((s) => s.parent_id === parent.id)) {
      options.push({ value: child.id, label: `— ${child.name}` });
    }
  }
  return options;
}

// ---------------------------------------------------------------------------
// Fila (memoizada) — mismo markup para desktop (grilla `md:grid`) y mobile
// (tarjeta apilada por defecto, cada campo con su label visible).
// ---------------------------------------------------------------------------

const GRID_COLS =
  'md:grid-cols-[minmax(200px,1.8fr)_minmax(140px,1.2fr)_100px_100px_150px_90px_100px_44px]';

const inputClass =
  'w-full min-w-0 rounded-lg bg-white/8 border border-white/15 text-[#FBF7EC] placeholder-white/30 px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#F5C84B]/70 transition-colors';

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2 md:mb-0">
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-white/40 mb-1 md:sr-only">
        {label}
      </span>
      {children}
    </div>
  );
}

type RowProps = {
  row: RowState;
  sectionOptions: SelectOption[];
  selected: boolean;
  onFieldChange: (id: string, patch: Partial<EditableFields>) => void;
  onToggleSelect: (id: string) => void;
  onOpenModal: (id: string) => void;
};

const ProductGridRow = memo(function ProductGridRow({
  row,
  sectionOptions,
  selected,
  onFieldChange,
  onToggleSelect,
  onOpenModal,
}: RowProps) {
  const errorFields = new Set(row.errors.map((e) => e.field));

  return (
    <div
      className={`rounded-xl border p-3 mb-3 md:mb-0 md:rounded-none md:border-0 md:border-b md:p-0 md:py-2.5 md:px-3 md:grid ${GRID_COLS} md:items-center md:gap-3 transition-colors ${
        row.errors.length > 0
          ? 'border-red-500/40 bg-red-500/5'
          : selected
            ? 'border-[#F5C84B]/30 bg-[#F5C84B]/5 md:border-white/5'
            : 'border-white/10 bg-white/[0.03] md:border-white/5 md:bg-transparent'
      }`}
    >
      {/* Producto: checkbox + miniatura + nombre */}
      <div className="flex items-center gap-2 mb-2 md:mb-0">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(row.id)}
          aria-label={`Seleccionar ${row.name || 'producto'}`}
          className="w-4 h-4 rounded border-white/30 accent-[#F5C84B] cursor-pointer flex-shrink-0"
        />
        <div className="w-9 h-9 rounded-lg overflow-hidden bg-white/10 flex-shrink-0">
          {row.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.imageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">📦</div>
          )}
        </div>
        <input
          type="text"
          value={row.name}
          maxLength={120}
          onChange={(e) => onFieldChange(row.id, { name: e.target.value })}
          placeholder="Nombre del producto"
          aria-label="Nombre"
          aria-invalid={errorFields.has('name') || undefined}
          className={`${inputClass} font-semibold flex-1`}
        />
      </div>

      <Field label="Descripción">
        <input
          type="text"
          value={row.description}
          maxLength={500}
          onChange={(e) => onFieldChange(row.id, { description: e.target.value })}
          placeholder="Sin descripción"
          aria-invalid={errorFields.has('description') || undefined}
          className={inputClass}
        />
      </Field>

      <Field label="Precio">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-white/40">$</span>
          <input
            type="text"
            inputMode="numeric"
            value={row.price_display}
            onChange={(e) => onFieldChange(row.id, { price_display: e.target.value })}
            aria-invalid={errorFields.has('price_cents') || undefined}
            className={`${inputClass} pl-6`}
          />
        </div>
      </Field>

      <Field label="Promo">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-white/40">$</span>
          <input
            type="text"
            inputMode="numeric"
            placeholder="Sin promo"
            value={row.promo_price_display}
            onChange={(e) => onFieldChange(row.id, { promo_price_display: e.target.value })}
            aria-invalid={errorFields.has('promo_price_cents') || undefined}
            className={`${inputClass} pl-6`}
          />
        </div>
      </Field>

      <Field label="Sección">
        <Select
          value={row.section_id || null}
          onChange={(v) => onFieldChange(row.id, { section_id: v })}
          options={sectionOptions}
          placeholder="Sin sección"
          ariaLabel="Sección"
        />
      </Field>

      <Field label="Stock">
        <input
          type="text"
          inputMode="numeric"
          placeholder="Ilimitado"
          value={row.stock_display}
          onChange={(e) => onFieldChange(row.id, { stock_display: e.target.value })}
          aria-invalid={errorFields.has('stock') || undefined}
          className={inputClass}
        />
      </Field>

      <Field label="Activo">
        <button
          type="button"
          onClick={() => onFieldChange(row.id, { is_active: !row.is_active })}
          className={`w-full md:w-10 h-9 rounded-lg flex items-center justify-center gap-1.5 text-xs font-medium transition-colors cursor-pointer ${
            row.is_active
              ? 'text-green-400 bg-green-500/10 hover:bg-green-500/20'
              : 'text-white/40 bg-white/5 hover:bg-white/10'
          }`}
          aria-label={row.is_active ? `Marcar ${row.name || 'producto'} como inactivo` : `Marcar ${row.name || 'producto'} como activo`}
        >
          {row.is_active ? <Eye size={14} /> : <EyeOff size={14} />}
          <span className="md:hidden">{row.is_active ? 'Activo' : 'Borrador'}</span>
        </button>
      </Field>

      <Field label="Más">
        <button
          type="button"
          onClick={() => onOpenModal(row.id)}
          className="w-full md:w-10 h-9 rounded-lg flex items-center justify-center gap-1.5 text-xs font-medium text-white/50 bg-white/5 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          aria-label={`Editar imágenes, variedades y cantidad de ${row.name || 'este producto'}`}
        >
          <Pencil size={14} />
          <span className="md:hidden">Imágenes, variedades y cantidad</span>
        </button>
      </Field>

      {row.errors.length > 0 && (
        <p className="md:col-span-full flex items-center gap-1.5 text-xs text-red-400 mt-2 md:mt-1">
          <AlertCircle size={12} className="flex-shrink-0" />
          {row.errors.map((e) => e.message).join(' ')}
        </p>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

type Props = {
  storeId: string;
  products: Product[];
  sections: Section[];
  maxImagesPerProduct: number;
  allowVariants: boolean;
  onClose: () => void;
};

export function BulkEditGrid({ storeId, products, sections, maxImagesPerProduct, allowVariants, onClose }: Props) {
  const productIds = useMemo(() => products.map((p) => p.id), [products]);
  const sectionOptions = useMemo(() => buildSectionOptions(sections), [sections]);

  const baselineRef = useRef<Record<string, EditableFields>>(
    Object.fromEntries(products.map((p) => [p.id, buildEditableFields(p)]))
  );
  const originalProductsRef = useRef<Record<string, Product>>(
    Object.fromEntries(products.map((p) => [p.id, p]))
  );

  const [rowsById, setRowsById] = useState<Record<string, RowState>>(() => {
    const map: Record<string, RowState> = {};
    for (const p of products) {
      const fields = buildEditableFields(p);
      map[p.id] = {
        ...fields,
        id: p.id,
        imageUrl: p.image_urls?.[0] ?? null,
        dirty: false,
        errors: computeRowValidation(fields),
      };
    }
    return map;
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [onlyDrafts, setOnlyDrafts] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [modalProductId, setModalProductId] = useState<string | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkStock, setBulkStock] = useState('');
  const [bulkSectionId, setBulkSectionId] = useState('');

  const remainingCount = useMemo(
    () => productIds.reduce((n, id) => n + (rowsById[id] ? 1 : 0), 0),
    [productIds, rowsById]
  );
  const dirtyCount = useMemo(
    () => productIds.reduce((n, id) => n + (rowsById[id]?.dirty ? 1 : 0), 0),
    [productIds, rowsById]
  );
  const blockingErrorCount = useMemo(
    () => productIds.reduce((n, id) => n + (rowsById[id]?.dirty && rowsById[id].errors.length > 0 ? 1 : 0), 0),
    [productIds, rowsById]
  );

  const visibleIds = useMemo(() => {
    const query = search.trim().toLowerCase();
    return productIds.filter((id) => {
      const row = rowsById[id];
      if (!row) return false;
      if (onlyDrafts && row.is_active) return false;
      if (query && !row.name.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [productIds, rowsById, onlyDrafts, search]);

  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
  }, [someVisibleSelected, allVisibleSelected]);

  // Aviso de "no cierres la pestaña" mientras hay cambios sin guardar.
  useEffect(() => {
    if (dirtyCount === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirtyCount]);

  const onFieldChange = useCallback((id: string, patch: Partial<EditableFields>) => {
    setRowsById((prev) => {
      const current = prev[id];
      if (!current) return prev;
      const nextFields: EditableFields = { ...current, ...patch };
      const baseline = baselineRef.current[id];
      return {
        ...prev,
        [id]: {
          ...nextFields,
          id,
          imageUrl: current.imageUrl,
          dirty: baseline ? isRowDirty(nextFields, baseline) : true,
          errors: computeRowValidation(nextFields),
        },
      };
    });
  }, []);

  const applyToSelected = useCallback(
    (patch: Partial<EditableFields>) => {
      if (selectedIds.size === 0) return;
      setRowsById((prev) => {
        const next = { ...prev };
        for (const id of selectedIds) {
          const current = next[id];
          if (!current) continue;
          const nextFields: EditableFields = { ...current, ...patch };
          const baseline = baselineRef.current[id];
          next[id] = {
            ...nextFields,
            id,
            imageUrl: current.imageUrl,
            dirty: baseline ? isRowDirty(nextFields, baseline) : true,
            errors: computeRowValidation(nextFields),
          };
        }
        return next;
      });
    },
    [selectedIds]
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  };

  const openModalFor = useCallback((id: string) => setModalProductId(id), []);

  const handleSave = async () => {
    const dirtyRows = productIds.map((id) => rowsById[id]).filter((r) => r.dirty);
    if (dirtyRows.length === 0 || dirtyRows.some((r) => r.errors.length > 0)) return;

    setSaving(true);
    setServerError(null);
    const payload = dirtyRows.map((r) => toBulkUpdateRow(r));
    const result = await bulkUpdateProducts(payload);

    if ('error' in result) {
      setServerError(result.error);
      toast.error(result.error);
      setSaving(false);
      return;
    }

    setRowsById((prev) => {
      const next = { ...prev };
      for (const r of dirtyRows) {
        const savedFields: EditableFields = {
          name: r.name,
          description: r.description,
          price_display: r.price_display,
          promo_price_display: r.promo_price_display,
          section_id: r.section_id,
          stock_display: r.stock_display,
          is_active: r.is_active,
        };
        baselineRef.current[r.id] = savedFields;
        next[r.id] = { ...next[r.id], dirty: false };
      }
      return next;
    });
    toast.success(`Se guardaron ${result.updated} producto${result.updated === 1 ? '' : 's'}.`);
    setSaving(false);
  };

  const handleDiscardConfirmed = () => {
    setRowsById((prev) => {
      const next = { ...prev };
      for (const id of productIds) {
        const base = baselineRef.current[id];
        if (!base) continue;
        next[id] = {
          ...base,
          id,
          imageUrl: prev[id]?.imageUrl ?? null,
          dirty: false,
          errors: computeRowValidation(base),
        };
      }
      return next;
    });
    setServerError(null);
    setShowDiscardConfirm(false);
    toast.info('Se descartaron los cambios pendientes.');
  };

  const handleBulkDeleteConfirmed = async () => {
    const ids = Array.from(selectedIds);
    const result = await bulkDeleteProducts(ids);
    setShowBulkDeleteConfirm(false);

    if ('error' in result) {
      toast.error(result.error);
      return;
    }

    setRowsById((prev) => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });
    setSelectedIds(new Set());
    toast.success(`Se eliminaron ${result.deleted} producto${result.deleted === 1 ? '' : 's'}.`);
  };

  const requestClose = () => {
    if (dirtyCount > 0) setShowExitConfirm(true);
    else onClose();
  };

  const modalRow = modalProductId ? rowsById[modalProductId] : null;
  const modalOriginal = modalProductId ? originalProductsRef.current[modalProductId] : null;
  const modalProduct: Product | null =
    modalRow && modalOriginal
      ? {
          ...modalOriginal,
          name: modalRow.name,
          description: modalRow.description || null,
          price_cents: normalizeFields(modalRow).price_cents,
          promo_price_cents: normalizeFields(modalRow).promo_price_cents,
          section_id: modalRow.section_id || null,
          stock: (() => {
            const s = normalizeFields(modalRow).stock;
            return s !== null && Number.isNaN(s) ? modalOriginal.stock : s;
          })(),
          is_active: modalRow.is_active,
        }
      : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#16222E]" role="dialog" aria-modal="true" aria-label="Edición masiva de productos">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-white/10 px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-bold text-[#FBF7EC]">Edición masiva</h1>
          <p className="text-xs text-white/40">
            {visibleIds.length} de {remainingCount} producto{remainingCount === 1 ? '' : 's'}
          </p>
        </div>
        <button
          type="button"
          onClick={requestClose}
          className="w-8 h-8 rounded-lg text-white/50 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer flex-shrink-0"
          aria-label="Cerrar edición masiva"
        >
          <X size={16} />
        </button>
      </div>

      {serverError && (
        <div role="alert" className="mx-4 mt-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">
          {serverError}
        </div>
      )}

      {/* Filtros */}
      <div className="flex-shrink-0 px-4 py-3 flex flex-wrap items-center gap-2 border-b border-white/10">
        <div className="relative flex-1 min-w-[160px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre…"
            aria-label="Buscar productos por nombre"
            className="w-full rounded-xl bg-white/8 border border-white/15 text-[#FBF7EC] placeholder-white/30 pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-[#F5C84B]/70 transition-colors"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyDrafts}
            onChange={(e) => setOnlyDrafts(e.target.checked)}
            className="w-4 h-4 rounded border-white/30 accent-[#F5C84B] cursor-pointer"
          />
          Solo borradores
        </label>
        <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer select-none ml-auto">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleSelectAllVisible}
            disabled={visibleIds.length === 0}
            className="w-4 h-4 rounded border-white/30 accent-[#F5C84B] cursor-pointer disabled:opacity-40"
          />
          Seleccionar visibles
        </label>
      </div>

      {/* Barra de acciones en lote */}
      {selectedIds.size > 0 && (
        <div className="flex-shrink-0 px-4 py-3 bg-[#F5C84B]/5 border-b border-[#F5C84B]/20 flex flex-wrap items-end gap-3">
          <span className="text-sm font-semibold text-[#F5C84B] mb-1.5">
            {selectedIds.size} seleccionado{selectedIds.size === 1 ? '' : 's'}
          </span>

          <div className="flex items-end gap-1.5">
            <div>
              <label htmlFor="bulk-price" className="block text-[10px] font-semibold uppercase tracking-wide text-white/40 mb-1">
                Precio
              </label>
              <input
                id="bulk-price"
                type="text"
                inputMode="numeric"
                placeholder="$"
                value={bulkPrice}
                onChange={(e) => setBulkPrice(e.target.value)}
                className={`${inputClass} w-24`}
              />
            </div>
            <button
              type="button"
              onClick={() => applyToSelected({ price_display: bulkPrice })}
              disabled={bulkPrice.trim() === ''}
              className="h-9 px-3 rounded-lg text-xs font-semibold text-[#16222E] bg-[#F5C84B] hover:bg-[#FAE08A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Aplicar precio
            </button>
          </div>

          <div className="flex items-end gap-1.5">
            <div>
              <label htmlFor="bulk-stock" className="block text-[10px] font-semibold uppercase tracking-wide text-white/40 mb-1">
                Stock
              </label>
              <input
                id="bulk-stock"
                type="text"
                inputMode="numeric"
                placeholder="Ilimitado"
                value={bulkStock}
                onChange={(e) => setBulkStock(e.target.value)}
                className={`${inputClass} w-24`}
              />
            </div>
            <button
              type="button"
              onClick={() => applyToSelected({ stock_display: bulkStock })}
              className="h-9 px-3 rounded-lg text-xs font-semibold text-[#16222E] bg-[#F5C84B] hover:bg-[#FAE08A] transition-colors cursor-pointer"
            >
              Aplicar stock
            </button>
          </div>

          <div className="flex items-end gap-1.5">
            <div className="w-40">
              <label htmlFor="bulk-section" className="block text-[10px] font-semibold uppercase tracking-wide text-white/40 mb-1">
                Sección
              </label>
              <Select id="bulk-section" value={bulkSectionId || null} onChange={(v) => setBulkSectionId(v)} options={sectionOptions} placeholder="Sin sección" ariaLabel="Sección para aplicar en lote" />
            </div>
            <button
              type="button"
              onClick={() => applyToSelected({ section_id: bulkSectionId })}
              className="h-9 px-3 rounded-lg text-xs font-semibold text-[#16222E] bg-[#F5C84B] hover:bg-[#FAE08A] transition-colors cursor-pointer"
            >
              Aplicar sección
            </button>
          </div>

          <div className="flex items-end gap-1.5">
            <button
              type="button"
              onClick={() => applyToSelected({ is_active: true })}
              className="h-9 px-3 rounded-lg text-xs font-semibold text-green-400 bg-green-500/10 hover:bg-green-500/20 transition-colors cursor-pointer"
            >
              Publicar
            </button>
            <button
              type="button"
              onClick={() => applyToSelected({ is_active: false })}
              className="h-9 px-3 rounded-lg text-xs font-semibold text-white/60 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
            >
              Despublicar
            </button>
          </div>

          <div className="flex items-end gap-1.5 md:ml-auto">
            <button
              type="button"
              onClick={() => setShowBulkDeleteConfirm(true)}
              className="h-9 px-3 rounded-lg text-xs font-semibold text-red-400 bg-red-500/10 hover:bg-red-500/20 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 size={14} />
              Eliminar
            </button>
          </div>
        </div>
      )}

      {/* Cabecera de columnas (desktop) */}
      <div className={`hidden md:grid ${GRID_COLS} gap-3 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-white/40 border-b border-white/10 flex-shrink-0`}>
        <span>Producto</span>
        <span>Descripción</span>
        <span>Precio</span>
        <span>Promo</span>
        <span>Sección</span>
        <span>Stock</span>
        <span>Activo</span>
        <span>Más</span>
      </div>

      {/* Filas */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {visibleIds.length === 0 ? (
          <div className="border-2 border-dashed border-white/15 rounded-xl px-6 py-8 text-center">
            <p className="text-sm text-white/40">No hay productos que coincidan con el filtro.</p>
          </div>
        ) : (
          visibleIds.map((id) => (
            <ProductGridRow
              key={id}
              row={rowsById[id]}
              sectionOptions={sectionOptions}
              selected={selectedIds.has(id)}
              onFieldChange={onFieldChange}
              onToggleSelect={toggleSelect}
              onOpenModal={openModalFor}
            />
          ))
        )}
      </div>

      {/* Guardado explícito */}
      {dirtyCount > 0 && (
        <div className="flex-shrink-0 sticky bottom-0 border-t border-white/10 bg-[#1A2634] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[#F5C84B] font-medium">
            {dirtyCount} producto{dirtyCount === 1 ? '' : 's'} con cambios sin guardar
            {blockingErrorCount > 0 && (
              <span className="text-red-400">
                {' '}
                — corregí {blockingErrorCount} fila{blockingErrorCount === 1 ? '' : 's'} con errores para poder guardar
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDiscardConfirm(true)}
              disabled={saving}
              className="min-h-[40px] px-4 rounded-lg text-sm font-semibold text-white/70 hover:text-white hover:bg-white/10 border border-white/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Descartar cambios
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || blockingErrorCount > 0}
              className="min-h-[40px] px-5 rounded-lg text-sm font-bold text-[#16222E] bg-[#F5C84B] hover:bg-[#FAE08A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Guardar cambios
            </button>
          </div>
        </div>
      )}

      {modalProduct && (
        <ProductModal
          storeId={storeId}
          sections={sections}
          product={modalProduct}
          nextPosition={products.length}
          maxImagesPerProduct={maxImagesPerProduct}
          allowVariants={allowVariants}
          onSaved={(saved) => {
            originalProductsRef.current[saved.id] = saved;
            const fields = buildEditableFields(saved);
            baselineRef.current[saved.id] = fields;
            setRowsById((prev) => ({
              ...prev,
              [saved.id]: {
                ...fields,
                id: saved.id,
                imageUrl: saved.image_urls?.[0] ?? null,
                dirty: false,
                errors: computeRowValidation(fields),
              },
            }));
            setModalProductId(null);
            toast.success('Producto actualizado');
          }}
          onClose={() => setModalProductId(null)}
        />
      )}

      <ConfirmModal
        open={showExitConfirm}
        onClose={() => setShowExitConfirm(false)}
        onConfirm={() => {
          setShowExitConfirm(false);
          onClose();
        }}
        title="Salir sin guardar"
        message={`Tenés ${dirtyCount} producto${dirtyCount === 1 ? '' : 's'} con cambios sin guardar. Si salís ahora, los vas a perder.`}
        confirmLabel="Salir sin guardar"
        variant="destructive"
      />

      <ConfirmModal
        open={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        onConfirm={handleDiscardConfirmed}
        title="Descartar cambios"
        message={`Se van a perder los cambios sin guardar de ${dirtyCount} producto${dirtyCount === 1 ? '' : 's'}.`}
        confirmLabel="Sí, descartar"
        variant="destructive"
      />

      <ConfirmModal
        open={showBulkDeleteConfirm}
        onClose={() => setShowBulkDeleteConfirm(false)}
        onConfirm={handleBulkDeleteConfirmed}
        title="Eliminar productos"
        message={`Vas a eliminar ${selectedIds.size} producto${selectedIds.size === 1 ? '' : 's'}. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        variant="destructive"
      />
    </div>
  );
}
