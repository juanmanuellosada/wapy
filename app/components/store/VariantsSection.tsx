'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from '@/lib/toast';
import { Plus, X, Loader2, Upload, ImageIcon, Info } from 'lucide-react';
import {
  upsertProductOptions,
  updateVariant,
  addOptionValue,
  removeOptionValue,
  removeOptionType,
  uploadVariantImage,
  getProductVariantsData,
} from '@/lib/variants/actions';
import type { OptionTypeData, VariantData } from '@/lib/variants/actions';

// ---------------------------------------------------------------------------
// Validation constants (mirrors server D10)
// ---------------------------------------------------------------------------
const MAX_LABEL_LEN = 32;
const MAX_VARIANTS = 25;

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

type DraftOptionType = {
  /** Defined when the type already exists in the DB */
  id?: string;
  name: string;
  values: DraftOptionValue[];
};

type DraftOptionValue = {
  /** Defined when the value already exists in the DB */
  id?: string;
  value: string;
};

type Props = {
  /** Null when creating a new product (variants not available yet) */
  productId: string | null;
  /** Used as placeholder for price_override inputs */
  productPriceCents: number;
  /** Called when variants change so parent can update stock summary display */
  onVariantsChange?: (hasVariants: boolean, totalStock: number) => void;
};

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString('es-AR', { minimumFractionDigits: 0 });
}

function parsePriceCents(display: string): number | null {
  if (!display || display.trim() === '') return null;
  const cleaned = display.replace(/[^0-9,]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  if (isNaN(num) || num < 0) return null;
  return Math.round(num * 100);
}

// ---------------------------------------------------------------------------
// Build human-readable label for a variant given the option types structure
// ---------------------------------------------------------------------------
function variantLabel(
  variant: VariantData,
  optionTypes: OptionTypeData[]
): string {
  const parts: string[] = [];
  for (const type of optionTypes) {
    const matchedValue = type.values.find((v) => variant.option_value_ids.includes(v.id));
    if (matchedValue) parts.push(matchedValue.value);
  }
  return parts.join(' / ');
}

// ---------------------------------------------------------------------------
// VariantsSection
// ---------------------------------------------------------------------------

export function VariantsSection({ productId, productPriceCents, onVariantsChange }: Props) {
  // ---- server state ----
  const [optionTypes, setOptionTypes] = useState<OptionTypeData[]>([]);
  const [variants, setVariants] = useState<VariantData[]>([]);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // ---- draft (option type editor) ----
  const [draftTypes, setDraftTypes] = useState<DraftOptionType[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // ---- per-variant editing ----
  // stockInput[variantId] = string value of the input
  const [stockInputs, setStockInputs] = useState<Record<string, string>>({});
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [variantErrors, setVariantErrors] = useState<Record<string, string>>({});
  const [savingVariant, setSavingVariant] = useState<string | null>(null);

  // ---- image upload ----
  const [uploadingVariantId, setUploadingVariantId] = useState<string | null>(null);

  // ---- add value inline (per existing type) ----
  const [addingValueTypeId, setAddingValueTypeId] = useState<string | null>(null);
  const [addValueInput, setAddValueInput] = useState('');
  const [addValueLoading, setAddValueLoading] = useState(false);
  const [addValueError, setAddValueError] = useState<string | null>(null);

  // ---- remove value loading ----
  const [removingValueId, setRemovingValueId] = useState<string | null>(null);

  // ---- remove type loading ----
  const [removingTypeId, setRemovingTypeId] = useState<string | null>(null);

  const hasVariants = variants.length > 0;
  const hasOptionTypes = optionTypes.length > 0;
  // For tracked variants (stock !== null) sum their stock; untracked ones are "infinite"
  const trackedVariants = variants.filter((v) => v.stock !== null);
  const untrackedCount = variants.length - trackedVariants.length;
  const totalTrackedStock = trackedVariants.reduce((sum, v) => sum + (v.stock as number), 0);
  // Legacy: totalStock for onVariantsChange (sum of tracked only, untracked contributes 0)
  const totalStock = totalTrackedStock;

  // Notify parent of variant state changes
  useEffect(() => {
    onVariantsChange?.(hasVariants, totalStock);
  }, [hasVariants, totalStock, onVariantsChange]);

  // ---- Load data when productId is available ----
  const loadData = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    setServerError(null);
    try {
      const result = await getProductVariantsData(productId);
      if ('error' in result) {
        setServerError(result.error);
        return;
      }
      setOptionTypes(result.optionTypes);
      setVariants(result.variants);
      // Initialize input buffers
      const stocks: Record<string, string> = {};
      const prices: Record<string, string> = {};
      for (const v of result.variants) {
        // null stock = no tracking; show empty input (placeholder "∞")
        stocks[v.id] = v.stock !== null ? String(v.stock) : '';
        prices[v.id] = v.price_override != null ? formatPrice(v.price_override) : '';
      }
      setStockInputs(stocks);
      setPriceInputs(prices);
    } catch {
      setServerError('No se pudo cargar las variedades.');
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ---- Validation for draft types ----
  function validateDraft(types: DraftOptionType[]): string[] {
    const errors: string[] = [];
    if (types.length === 0) return errors;

    const typeNames = types.map((t) => t.name.trim());
    const duplicateType = typeNames.find((n, i) => typeNames.indexOf(n) !== i);
    if (duplicateType) errors.push(`El tipo "${duplicateType}" aparece más de una vez.`);

    for (const type of types) {
      const typeName = type.name.trim() || '(sin nombre)';
      if (!type.name.trim()) {
        errors.push('El nombre del tipo de opción no puede estar vacío.');
      } else if (type.name.trim().length > MAX_LABEL_LEN) {
        errors.push(`El nombre "${type.name}" supera los ${MAX_LABEL_LEN} caracteres.`);
      }
      const nonEmptyValues = type.values.filter((v) => v.value.trim());
      if (type.values.length === 0 || nonEmptyValues.length === 0) {
        errors.push(`El tipo "${typeName}" necesita al menos un valor. Agregalo antes de guardar.`);
      }
      const vals = type.values.map((v) => v.value.trim());
      const duplicateVal = vals.find((v, i) => v && vals.indexOf(v) !== i);
      if (duplicateVal) errors.push(`El valor "${duplicateVal}" aparece más de una vez en "${typeName}".`);
      for (const val of type.values) {
        if (!val.value.trim()) {
          errors.push(`Un valor en "${typeName}" está vacío.`);
        } else if (val.value.trim().length > MAX_LABEL_LEN) {
          errors.push(`El valor "${val.value}" supera los ${MAX_LABEL_LEN} caracteres.`);
        }
      }
    }

    // Cap check (client-side estimate)
    if (types.length > 0) {
      const nonEmptyTypes = types.filter((t) => t.values.some((v) => v.value.trim()));
      const count = nonEmptyTypes.reduce((acc, t) => acc * t.values.filter((v) => v.value.trim()).length, 1);
      if (count > MAX_VARIANTS) {
        errors.push(`Esta combinación generaría ${count} variedades, superando el límite de ${MAX_VARIANTS}.`);
      }
    }

    return errors;
  }

  // ---- Start editing option types ----
  const handleStartEditing = () => {
    if (hasVariants) {
      // Only editing existing types/values is allowed; initialize from DB state
      setDraftTypes(
        optionTypes.map((t) => ({
          id: t.id,
          name: t.name,
          values: t.values.map((v) => ({ id: v.id, value: v.value })),
        }))
      );
    } else {
      // Fresh — start with one empty type
      setDraftTypes([{ name: '', values: [{ value: '' }] }]);
    }
    setIsEditing(true);
    setValidationErrors([]);
  };

  const handleCancelEditing = () => {
    setIsEditing(false);
    setDraftTypes([]);
    setValidationErrors([]);
  };

  // ---- Draft type/value manipulation ----
  const updateDraftTypeName = (index: number, name: string) => {
    setDraftTypes((prev) => prev.map((t, i) => (i === index ? { ...t, name } : t)));
  };

  const updateDraftValue = (typeIndex: number, valueIndex: number, value: string) => {
    setDraftTypes((prev) =>
      prev.map((t, i) =>
        i === typeIndex
          ? {
              ...t,
              values: t.values.map((v, j) => (j === valueIndex ? { ...v, value } : v)),
            }
          : t
      )
    );
  };

  const addDraftValue = (typeIndex: number) => {
    setDraftTypes((prev) =>
      prev.map((t, i) =>
        i === typeIndex ? { ...t, values: [...t.values, { value: '' }] } : t
      )
    );
  };

  const removeDraftValue = (typeIndex: number, valueIndex: number) => {
    setDraftTypes((prev) =>
      prev.map((t, i) =>
        i === typeIndex
          ? { ...t, values: t.values.filter((_, j) => j !== valueIndex) }
          : t
      )
    );
  };

  const addDraftType = () => {
    setDraftTypes((prev) => [...prev, { name: '', values: [{ value: '' }] }]);
  };

  const removeDraftType = (index: number) => {
    setDraftTypes((prev) => prev.filter((_, i) => i !== index));
  };

  // ---- Save option types (upsertProductOptions) ----
  const handleSaveTypes = async () => {
    if (!productId) return;
    const errors = validateDraft(draftTypes);
    if (errors.length > 0) {
      setValidationErrors(errors);
      toast.error(errors[0]);
      return;
    }
    setValidationErrors([]);
    setSaveLoading(true);
    setServerError(null);
    try {
      const result = await upsertProductOptions({
        productId,
        optionTypes: draftTypes.map((t) => ({
          name: t.name.trim(),
          values: t.values.map((v) => v.value.trim()),
        })),
      });
      if ('error' in result) {
        setServerError(result.error);
        toast.error(result.error);
        return;
      }
      setIsEditing(false);
      setDraftTypes([]);
      toast.success('Variedades generadas');
      await loadData();
    } catch {
      setServerError('No se pudo guardar las opciones.');
      toast.error('No se pudo guardar las opciones.');
    } finally {
      setSaveLoading(false);
    }
  };

  // ---- Per-variant stock/price save (on blur) ----
  const handleVariantBlur = async (variantId: string) => {
    const stockStr = (stockInputs[variantId] ?? '').trim();
    const priceStr = priceInputs[variantId] ?? '';

    // Empty string = null (no tracking). Otherwise parse as integer.
    const stock: number | null = stockStr === '' ? null : parseInt(stockStr, 10);
    const priceOverride = parsePriceCents(priceStr);

    const errors: Record<string, string> = { ...variantErrors };

    if (stock !== null && (isNaN(stock) || stock < 0)) {
      errors[variantId] = 'Stock debe ser un número ≥ 0, o vacío para sin tracking.';
      setVariantErrors(errors);
      toast.error('Stock debe ser un número ≥ 0, o vacío para sin tracking.');
      return;
    }
    if (priceStr.trim() !== '' && (priceOverride === null || priceOverride < 0)) {
      errors[variantId] = 'Precio debe ser un número ≥ 0.';
      setVariantErrors(errors);
      toast.error('Precio debe ser un número ≥ 0.');
      return;
    }

    delete errors[variantId];
    setVariantErrors(errors);

    setSavingVariant(variantId);
    try {
      const result = await updateVariant({ variantId, stock, priceOverride });
      if ('error' in result) {
        setVariantErrors((prev) => ({ ...prev, [variantId]: result.error }));
        toast.error(result.error);
      } else {
        // Update local state
        setVariants((prev) =>
          prev.map((v) => (v.id === variantId ? { ...v, stock, price_override: priceOverride } : v))
        );
      }
    } catch {
      setVariantErrors((prev) => ({ ...prev, [variantId]: 'Error al guardar.' }));
      toast.error('Error al guardar la variedad.');
    } finally {
      setSavingVariant(null);
    }
  };

  // ---- Inline add value to existing type ----
  const handleAddValue = async (optionTypeId: string) => {
    const value = addValueInput.trim();
    if (!value) { setAddValueError('El valor no puede estar vacío.'); return; }
    if (value.length > MAX_LABEL_LEN) { setAddValueError(`Máximo ${MAX_LABEL_LEN} caracteres.`); return; }
    setAddValueError(null);
    setAddValueLoading(true);
    try {
      const result = await addOptionValue({ optionTypeId, value });
      if ('error' in result) {
        setAddValueError(result.error);
        toast.error(result.error);
      } else {
        setAddingValueTypeId(null);
        setAddValueInput('');
        toast.success(`Valor "${value}" agregado`);
        await loadData();
      }
    } catch {
      setAddValueError('Error al agregar el valor.');
      toast.error('Error al agregar el valor.');
    } finally {
      setAddValueLoading(false);
    }
  };

  // ---- Remove value from existing type ----
  const handleRemoveValue = async (optionValueId: string) => {
    setRemovingValueId(optionValueId);
    setServerError(null);
    try {
      const result = await removeOptionValue({ optionValueId });
      if ('error' in result) {
        setServerError(result.error);
        toast.error(result.error);
      } else {
        if (result.softDeleted) {
          toast.info('Las variedades con ese valor fueron archivadas porque aparecen en pedidos históricos.');
        }
        await loadData();
      }
    } catch {
      setServerError('Error al eliminar el valor.');
      toast.error('Error al eliminar el valor.');
    } finally {
      setRemovingValueId(null);
    }
  };

  // ---- Remove entire option type ----
  const handleRemoveType = async (optionTypeId: string, typeName: string) => {
    if (!confirm(`¿Borrar el tipo "${typeName}" y todas sus variedades?`)) return;
    setRemovingTypeId(optionTypeId);
    setServerError(null);
    try {
      const result = await removeOptionType({ optionTypeId });
      if ('error' in result) {
        setServerError(result.error);
        toast.error(result.error);
      } else {
        if (result.softDeleted) {
          toast.info('Las variedades con ese tipo fueron archivadas porque aparecen en pedidos históricos.');
        } else {
          toast.success(`Tipo "${typeName}" eliminado`);
        }
        await loadData();
      }
    } catch {
      setServerError('Error al eliminar el tipo.');
      toast.error('Error al eliminar el tipo.');
    } finally {
      setRemovingTypeId(null);
    }
  };

  // ---- Image upload for a variant ----
  const handleImageUpload = async (variantId: string, file: File) => {
    setUploadingVariantId(variantId);
    setServerError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('variantId', variantId);
      const result = await uploadVariantImage(fd);
      if (!result.ok) {
        setServerError(result.error);
        toast.error(result.error);
      } else {
        setVariants((prev) =>
          prev.map((v) => (v.id === variantId ? { ...v, image_url: result.url } : v))
        );
        toast.success('Imagen subida');
      }
    } catch {
      setServerError('Error al subir la imagen.');
      toast.error('Error al subir la imagen.');
    } finally {
      setUploadingVariantId(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Render: no productId (new product)
  // ---------------------------------------------------------------------------
  if (!productId) {
    return (
      <div className="border border-dashed border-white/15 rounded-xl px-4 py-4 text-sm text-white/40">
        Guardá el producto primero para poder agregar variedades (color, talle, etc.).
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: loading
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-white/40 py-3">
        <Loader2 size={14} className="animate-spin" />
        Cargando variedades…
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: editor mode (defining option types + values from scratch)
  // ---------------------------------------------------------------------------
  if (isEditing) {
    return (
      <div className="space-y-4">
        {/* Illustrative banner in editor mode too (if no types yet) */}
        {!hasVariants && (
          <div className="flex gap-2.5 bg-white/4 border border-white/10 rounded-xl px-4 py-3">
            <Info size={14} className="text-white/40 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-white/50 leading-relaxed">
              <strong className="text-white/70">Ejemplo:</strong> si vendés remeras en varios colores y talles, creá UN tipo{' '}
              <span className="text-white/70">&ldquo;Color&rdquo;</span> (con valores Rojo, Azul) y OTRO tipo{' '}
              <span className="text-white/70">&ldquo;Talle&rdquo;</span> (con valores S, M, L).
              Se generan automáticamente todas las combinaciones.
            </p>
          </div>
        )}
        <p className="text-xs text-white/50">
          Definí los tipos de opción (ej. Color, Talle) y sus valores. Una vez guardado se generarán las variedades.
        </p>

        {validationErrors.length > 0 && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-xs text-red-300 space-y-1">
            {validationErrors.map((e, i) => <p key={i}>{e}</p>)}
          </div>
        )}

        <div className="space-y-4">
          {draftTypes.map((type, typeIdx) => {
            // Block adding a new type if there are already variants (D5)
            const isNewType = !type.id;
            const isBlockedNewType = isNewType && hasVariants;

            return (
              <div key={typeIdx} className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                <div className="space-y-1.5">
                  <label className="block text-xs text-white/50 font-medium">
                    Nombre del tipo de opción
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="ej. Color, Talle, Versión"
                      value={type.name}
                      onChange={(e) => updateDraftTypeName(typeIdx, e.target.value)}
                      maxLength={MAX_LABEL_LEN}
                      disabled={isBlockedNewType}
                      className="flex-1 rounded-lg bg-white/8 border border-white/15 text-[#FBF7EC] placeholder-white/30 px-3 py-2 text-sm focus:outline-none focus:border-[#F5C84B]/70 transition-colors disabled:opacity-40"
                    />
                    {draftTypes.length > 1 && !hasVariants && (
                      <button
                        type="button"
                        onClick={() => removeDraftType(typeIdx)}
                        className="w-7 h-7 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-colors cursor-pointer flex-shrink-0"
                        aria-label="Quitar tipo de opción"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  {!isBlockedNewType && (
                    <p className="text-xs text-white/35">
                      Es el nombre de la categoría que el cliente elige. Los valores específicos los cargás abajo.
                    </p>
                  )}
                </div>

                {isBlockedNewType && (
                  <p className="text-xs text-amber-400">
                    Ya hay variedades. Para agregar este tipo debés borrar las variedades existentes.
                  </p>
                )}

                {/* Values chips */}
                <div className="space-y-2">
                  <label className="block text-xs text-white/50 font-medium">Valores</label>
                  <div className="flex flex-wrap gap-2">
                    {type.values.map((val, valIdx) => (
                      <div key={valIdx} className="flex items-center gap-1 bg-white/10 border border-white/15 rounded-full px-3 py-1">
                        <input
                          type="text"
                          value={val.value}
                          onChange={(e) => updateDraftValue(typeIdx, valIdx, e.target.value)}
                          maxLength={MAX_LABEL_LEN}
                          placeholder="ej. Rojo"
                          className="bg-transparent text-[#FBF7EC] placeholder-white/30 text-xs outline-none w-20 min-w-0"
                          style={{ width: `${Math.max(val.value.length * 8, 64)}px` }}
                        />
                        {type.values.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeDraftValue(typeIdx, valIdx)}
                            className="text-white/40 hover:text-red-400 transition-colors cursor-pointer flex-shrink-0"
                            aria-label={`Quitar valor ${val.value}`}
                          >
                            <X size={10} />
                          </button>
                        )}
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => addDraftValue(typeIdx)}
                      className="flex items-center gap-1 text-xs text-[#F5C84B]/70 hover:text-[#F5C84B] transition-colors cursor-pointer px-2 py-1 rounded-full border border-dashed border-[#F5C84B]/30 hover:border-[#F5C84B]/60"
                    >
                      <Plus size={11} /> Agregar valor
                    </button>
                  </div>
                  <p className="text-xs text-white/35">
                    Cada valor es una opción que el cliente puede elegir
                    {type.name.trim()
                      ? <> (ej. para &ldquo;{type.name}&rdquo;: Rojo, Azul, Verde)</>
                      : <> (ej. para &ldquo;Color&rdquo;: Rojo, Azul, Verde)</>
                    }.
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Add new type button — blocked if variants exist */}
        {hasVariants ? (
          <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
            Para agregar otro tipo de opción (ej. Talle si ya hay Color), borrá las variedades existentes primero.
          </p>
        ) : (
          <button
            type="button"
            onClick={addDraftType}
            className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition-colors cursor-pointer"
          >
            <Plus size={14} /> + Agregar tipo (ej. Color, Talle)
          </button>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleCancelEditing}
            className="flex-1 min-h-[38px] rounded-lg border border-white/20 text-white/60 text-sm font-medium hover:border-white/40 hover:text-white transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSaveTypes}
            disabled={saveLoading}
            className="flex-1 min-h-[38px] rounded-lg bg-[#F5C84B] text-[#16222E] text-sm font-bold hover:bg-[#FAE08A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            {saveLoading && <Loader2 size={13} className="animate-spin" />}
            Generar variedades
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: no option types yet → show CTA
  // ---------------------------------------------------------------------------
  if (!hasOptionTypes) {
    return (
      <div className="space-y-3">
        {serverError && (
          <p role="alert" className="text-xs text-red-400">{serverError}</p>
        )}
        {/* Illustrative banner */}
        <div className="flex gap-2.5 bg-white/4 border border-white/10 rounded-xl px-4 py-3">
          <Info size={14} className="text-white/40 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-white/50 leading-relaxed">
            <strong className="text-white/70">Ejemplo:</strong> si vendés remeras en varios colores y talles, creá UN tipo{' '}
            <span className="text-white/70">&ldquo;Color&rdquo;</span> (con valores Rojo, Azul) y OTRO tipo{' '}
            <span className="text-white/70">&ldquo;Talle&rdquo;</span> (con valores S, M, L).
            Se generan automáticamente todas las combinaciones.
          </p>
        </div>
        <div className="border border-dashed border-white/15 rounded-xl px-4 py-5 text-center">
          <p className="text-sm text-white/40 mb-3">
            Sin variedades — precio, stock e imagen son del producto.
          </p>
          <button
            type="button"
            onClick={handleStartEditing}
            className="inline-flex items-center gap-1.5 text-sm text-[#F5C84B] hover:text-[#FAE08A] font-semibold transition-colors cursor-pointer"
          >
            <Plus size={15} /> + Agregar tipo (ej. Color, Talle)
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: has option types — show type/value summary + variants table
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-4">
      {serverError && (
        <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-xs text-red-300">
          {serverError}
        </div>
      )}

      {/* Option types summary with inline add-value */}
      <div className="space-y-3">
        {optionTypes.map((type) => (
          <div key={type.id} className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-white/60 uppercase tracking-wide">{type.name}</p>
              <button
                type="button"
                disabled={removingTypeId === type.id}
                onClick={() => handleRemoveType(type.id, type.name)}
                className="text-xs text-white/30 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                aria-label={`Quitar tipo ${type.name}`}
              >
                {removingTypeId === type.id
                  ? <Loader2 size={11} className="animate-spin" />
                  : <X size={11} />}
                Quitar tipo
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              {type.values.map((val) => (
                <div
                  key={val.id}
                  className="flex items-center gap-1 bg-white/10 rounded-full px-2.5 py-0.5"
                >
                  <span className="text-xs text-[#FBF7EC]">{val.value}</span>
                  <button
                    type="button"
                    disabled={removingValueId === val.id}
                    onClick={() => handleRemoveValue(val.id)}
                    className="text-white/30 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label={`Quitar ${val.value}`}
                  >
                    {removingValueId === val.id
                      ? <Loader2 size={9} className="animate-spin" />
                      : <X size={9} />}
                  </button>
                </div>
              ))}

              {/* Add value inline */}
              {addingValueTypeId === type.id ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={addValueInput}
                    onChange={(e) => setAddValueInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); handleAddValue(type.id); }
                      if (e.key === 'Escape') { setAddingValueTypeId(null); setAddValueInput(''); setAddValueError(null); }
                    }}
                    maxLength={MAX_LABEL_LEN}
                    placeholder="Nuevo valor"
                    autoFocus
                    className="rounded-full bg-white/8 border border-white/20 text-[#FBF7EC] placeholder-white/30 px-2.5 py-0.5 text-xs focus:outline-none focus:border-[#F5C84B]/70 w-28"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddValue(type.id)}
                    disabled={addValueLoading}
                    className="text-[#F5C84B] hover:text-[#FAE08A] text-xs font-semibold cursor-pointer disabled:opacity-40"
                  >
                    {addValueLoading ? <Loader2 size={11} className="animate-spin" /> : 'OK'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAddingValueTypeId(null); setAddValueInput(''); setAddValueError(null); }}
                    className="text-white/40 hover:text-white/70 cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setAddingValueTypeId(type.id); setAddValueInput(''); setAddValueError(null); }}
                  className="text-xs text-[#F5C84B]/60 hover:text-[#F5C84B] transition-colors cursor-pointer px-2 py-0.5 rounded-full border border-dashed border-[#F5C84B]/20 hover:border-[#F5C84B]/50 flex items-center gap-0.5"
                >
                  <Plus size={9} /> valor
                </button>
              )}
            </div>
            {addingValueTypeId === type.id && addValueError && (
              <p role="alert" className="text-xs text-red-400">{addValueError}</p>
            )}
          </div>
        ))}
      </div>

      {/* Block adding new type when variants exist */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
        <p className="text-xs text-amber-400">
          Para agregar otro tipo de opción (ej. Talle si ya hay Color), borrá las variedades existentes primero.
        </p>
      </div>

      {/* Variants table */}
      {hasVariants && (
        <div>
          <p className="text-xs font-semibold text-white/50 uppercase tracking-wide mb-2">
            Variedades ({variants.length}) — Stock:{' '}
            {untrackedCount === 0
              ? totalTrackedStock
              : untrackedCount === variants.length
              ? '∞ (sin tracking)'
              : `${totalTrackedStock} + ${untrackedCount} sin tracking`}
          </p>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left text-xs text-white/40 font-medium py-2 pr-3 w-auto">Combinación</th>
                  <th className="text-left text-xs text-white/40 font-medium py-2 pr-3 w-28">Stock</th>
                  <th className="text-left text-xs text-white/40 font-medium py-2 pr-3 w-36">Precio (opcional)</th>
                  <th className="text-left text-xs text-white/40 font-medium py-2 w-24">Imagen</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((variant) => (
                  <VariantRow
                    key={variant.id}
                    variant={variant}
                    label={variantLabel(variant, optionTypes)}
                    stockInput={stockInputs[variant.id] ?? ''}
                    priceInput={priceInputs[variant.id] ?? ''}
                    priceOverridePlaceholder={formatPrice(productPriceCents)}
                    error={variantErrors[variant.id]}
                    saving={savingVariant === variant.id}
                    uploadingImage={uploadingVariantId === variant.id}
                    fileInputRef={() => {}}
                    onStockChange={(v) => setStockInputs((prev) => ({ ...prev, [variant.id]: v }))}
                    onPriceChange={(v) => setPriceInputs((prev) => ({ ...prev, [variant.id]: v }))}
                    onBlur={() => handleVariantBlur(variant.id)}
                    onImageFileSelected={(file) => handleImageUpload(variant.id, file)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile list */}
          <div className="sm:hidden space-y-3">
            {variants.map((variant) => (
              <VariantCard
                key={variant.id}
                variant={variant}
                label={variantLabel(variant, optionTypes)}
                stockInput={stockInputs[variant.id] ?? ''}
                priceInput={priceInputs[variant.id] ?? ''}
                priceOverridePlaceholder={formatPrice(productPriceCents)}
                error={variantErrors[variant.id]}
                saving={savingVariant === variant.id}
                uploadingImage={uploadingVariantId === variant.id}
                fileInputRef={() => {}}
                onStockChange={(v) => setStockInputs((prev) => ({ ...prev, [variant.id]: v }))}
                onPriceChange={(v) => setPriceInputs((prev) => ({ ...prev, [variant.id]: v }))}
                onBlur={() => handleVariantBlur(variant.id)}
                onImageFileSelected={(file) => handleImageUpload(variant.id, file)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// VariantRow (desktop table row)
// ---------------------------------------------------------------------------

type VariantRowProps = {
  variant: VariantData;
  label: string;
  stockInput: string;
  priceInput: string;
  priceOverridePlaceholder: string;
  error?: string;
  saving: boolean;
  uploadingImage: boolean;
  fileInputRef: (el: HTMLInputElement | null) => void;
  onStockChange: (v: string) => void;
  onPriceChange: (v: string) => void;
  onBlur: () => void;
  onImageFileSelected: (file: File) => void;
};

function VariantRow({
  variant,
  label,
  stockInput,
  priceInput,
  priceOverridePlaceholder,
  error,
  saving,
  uploadingImage,
  fileInputRef,
  onStockChange,
  onPriceChange,
  onBlur,
  onImageFileSelected,
}: VariantRowProps) {
  return (
    <>
      <tr className="border-b border-white/5 hover:bg-white/2 transition-colors">
        <td className="py-2.5 pr-3">
          <span className="text-[#FBF7EC] text-sm font-medium">{label}</span>
        </td>
        <td className="py-2.5 pr-3">
          <input
            type="number"
            min="0"
            value={stockInput}
            placeholder="∞"
            onChange={(e) => onStockChange(e.target.value)}
            onBlur={onBlur}
            className="w-full rounded-lg bg-white/8 border border-white/15 text-[#FBF7EC] placeholder-white/30 px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#F5C84B]/70 transition-colors"
            aria-label={`Stock para ${label}`}
          />
        </td>
        <td className="py-2.5 pr-3">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-white/40">$</span>
            <input
              type="text"
              inputMode="numeric"
              value={priceInput}
              onChange={(e) => onPriceChange(e.target.value)}
              onBlur={onBlur}
              placeholder={priceOverridePlaceholder}
              className="w-full rounded-lg bg-white/8 border border-white/15 text-[#FBF7EC] placeholder-white/30 pl-6 pr-2.5 py-1.5 text-sm focus:outline-none focus:border-[#F5C84B]/70 transition-colors"
              aria-label={`Precio para ${label}`}
            />
          </div>
        </td>
        <td className="py-2.5">
          <VariantImageCell
            imageUrl={variant.image_url}
            uploading={uploadingImage}
            saving={saving}
            fileInputRef={fileInputRef}
            onImageFileSelected={onImageFileSelected}
            label={label}
          />
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={4} className="pb-2">
            <p role="alert" className="text-xs text-red-400">{error}</p>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// VariantCard (mobile accordion-style card)
// ---------------------------------------------------------------------------

function VariantCard({
  variant,
  label,
  stockInput,
  priceInput,
  priceOverridePlaceholder,
  error,
  saving,
  uploadingImage,
  fileInputRef,
  onStockChange,
  onPriceChange,
  onBlur,
  onImageFileSelected,
}: VariantRowProps) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2.5">
      <p className="text-sm font-semibold text-[#FBF7EC]">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-white/40 mb-1">Stock</label>
          <input
            type="number"
            min="0"
            value={stockInput}
            placeholder="∞"
            onChange={(e) => onStockChange(e.target.value)}
            onBlur={onBlur}
            className="w-full rounded-lg bg-white/8 border border-white/15 text-[#FBF7EC] placeholder-white/30 px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#F5C84B]/70 transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs text-white/40 mb-1">Precio (opcional)</label>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-white/40">$</span>
            <input
              type="text"
              inputMode="numeric"
              value={priceInput}
              onChange={(e) => onPriceChange(e.target.value)}
              onBlur={onBlur}
              placeholder={priceOverridePlaceholder}
              className="w-full rounded-lg bg-white/8 border border-white/15 text-[#FBF7EC] placeholder-white/30 pl-6 pr-2.5 py-1.5 text-sm focus:outline-none focus:border-[#F5C84B]/70 transition-colors"
            />
          </div>
        </div>
      </div>
      <div>
        <label className="block text-xs text-white/40 mb-1">Imagen (opcional)</label>
        <VariantImageCell
          imageUrl={variant.image_url}
          uploading={uploadingImage}
          saving={saving}
          fileInputRef={fileInputRef}
          onImageFileSelected={onImageFileSelected}
          label={label}
        />
      </div>
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// VariantImageCell (shared between row and card)
// Uses an internal ref for the file input to avoid fragile DOM queries.
// ---------------------------------------------------------------------------

type VariantImageCellProps = {
  imageUrl: string | null;
  uploading: boolean;
  saving: boolean;
  /** Kept for API compatibility but not used internally — cell manages its own ref */
  fileInputRef: (el: HTMLInputElement | null) => void;
  onImageFileSelected: (file: File) => void;
  label: string;
};

function VariantImageCell({
  imageUrl,
  uploading,
  saving,
  fileInputRef,
  onImageFileSelected,
  label,
}: VariantImageCellProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const setRef = (el: HTMLInputElement | null) => {
    inputRef.current = el;
    fileInputRef(el);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onImageFileSelected(file);
    e.target.value = '';
  };

  const triggerPicker = () => inputRef.current?.click();

  return (
    <div className="flex items-center gap-2">
      {/* Hidden file input */}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        ref={setRef}
        onChange={handleChange}
        aria-label={`Subir imagen para ${label}`}
      />

      {imageUrl ? (
        <button
          type="button"
          onClick={triggerPicker}
          className="w-10 h-10 rounded-lg overflow-hidden border border-white/15 bg-white/5 flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity relative group"
          title="Cambiar imagen"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={label} className="w-full h-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
            <Upload size={12} className="text-white" />
          </div>
        </button>
      ) : (
        <button
          type="button"
          onClick={triggerPicker}
          className="w-10 h-10 rounded-lg border border-dashed border-white/20 flex items-center justify-center text-white/30 hover:text-white/60 hover:border-white/40 cursor-pointer transition-colors flex-shrink-0"
          title="Agregar imagen"
        >
          <ImageIcon size={14} />
        </button>
      )}

      {(uploading || saving) && (
        <Loader2 size={13} className="animate-spin text-[#F5C84B]" />
      )}
    </div>
  );
}
