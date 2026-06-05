'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Loader2 } from 'lucide-react';
import { ImageUpload } from './ImageUpload';
import { VariantsSection } from './VariantsSection';
import { Select } from '@/app/components/Select';
import { deleteImage } from '@/lib/onboarding/storage';
import { uploadProductImageAction } from '@/lib/onboarding/upload-actions';
import { saveStoreProduct } from '@/lib/store/actions';
import type { Section, Product } from '@/lib/onboarding/state';

const productFormSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(120, 'Máximo 120 caracteres'),
  description: z.string().max(500, 'Máximo 500 caracteres').optional(),
  price_display: z.string().min(1, 'El precio es requerido'),
  stock: z.string().optional(),
  section_id: z.string().optional(),
  min_quantity: z.string().optional(),
  qty_step: z.string().optional(),
});

type ProductFormData = z.infer<typeof productFormSchema>;

type Props = {
  storeId: string;
  sections: Section[];
  product?: Product | null; // null = new
  nextPosition: number;
  maxImagesPerProduct: number;
  allowVariants: boolean;
  onSaved: (product: Product) => void;
  onClose: () => void;
};

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString('es-AR', { minimumFractionDigits: 0 });
}

function parsePriceCents(display: string): number {
  const cleaned = display.replace(/[^0-9,]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  if (isNaN(num) || num < 0) return 0;
  return Math.round(num * 100);
}

export function ProductModal({ storeId, sections, product, nextPosition, maxImagesPerProduct, allowVariants, onSaved, onClose }: Props) {
  const isEdit = !!product;
  const [imageUrls, setImageUrls] = useState<string[]>(product?.image_urls ?? []);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // Variants state: has variants → hide stock input, show read-only aggregate
  const [hasVariants, setHasVariants] = useState(false);
  const [variantsTotalStock, setVariantsTotalStock] = useState(0);

  const handleVariantsChange = useCallback(
    (hv: boolean, total: number) => {
      setHasVariants(hv);
      setVariantsTotalStock(total);
    },
    []
  );

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<ProductFormData>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: product?.name ?? '',
      description: product?.description ?? '',
      price_display: product ? formatPrice(product.price_cents) : '',
      stock: product?.stock != null ? String(product.stock) : '',
      section_id: product?.section_id ?? '',
      min_quantity: product ? String((product as unknown as { min_quantity?: number }).min_quantity ?? 1) : '1',
      qty_step: product ? String((product as unknown as { qty_step?: number }).qty_step ?? 1) : '1',
    },
  });

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleImageUpload = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('storeId', storeId);
    const result = await uploadProductImageAction(fd);
    if (!result.ok) {
      throw new Error(result.message ?? 'Error al subir la imagen. Intentá de nuevo.');
    }
    setImageUrls((prev) => [...prev, result.url]);
    return result.url;
  };

  const handleImageDelete = async (url: string) => {
    await deleteImage(url, 'product-images');
    setImageUrls((prev) => prev.filter((u) => u !== url));
  };

  const onSubmit = async (data: ProductFormData) => {
    setSaving(true);
    setServerError(null);

    const price_cents = parsePriceCents(data.price_display);
    const min_quantity = Math.max(1, parseInt(data.min_quantity ?? '1', 10) || 1);
    const qty_step = Math.max(1, parseInt(data.qty_step ?? '1', 10) || 1);

    const result = await saveStoreProduct({
      id: product?.id,
      name: data.name,
      description: data.description || null,
      price_cents,
      stock: data.stock ? parseInt(data.stock, 10) : null,
      section_id: data.section_id || null,
      image_urls: imageUrls,
      position: product?.position ?? nextPosition,
      is_active: true,
      min_quantity,
      qty_step,
    });

    if ('error' in result) {
      setServerError(result.error);
      setSaving(false);
      return;
    }

    const savedProduct: Product = {
      id: result.productId,
      store_id: storeId,
      name: data.name,
      description: data.description ?? null,
      price_cents,
      currency: 'ARS',
      stock: data.stock ? parseInt(data.stock, 10) : null,
      section_id: data.section_id || null,
      image_urls: imageUrls,
      position: product?.position ?? nextPosition,
      is_active: true,
      created_at: product?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
      // New fields (cast needed until types regenerated)
      ...(({ min_quantity, qty_step } as unknown as object)),
    } as unknown as Product;

    onSaved(savedProduct);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-0 sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? 'Editar producto' : 'Agregar producto'}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Sheet */}
      <div className="relative z-10 w-full sm:max-w-lg bg-[#1A2634] rounded-t-2xl sm:rounded-2xl border border-white/10 max-h-[90dvh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-[#1A2634] border-b border-white/10 px-5 py-4 flex items-center justify-between z-10">
          <h2 className="font-bold text-[#FBF7EC]">
            {isEdit ? 'Editar producto' : 'Agregar producto'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-white/50 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-5 py-5 space-y-5">
          {serverError && (
            <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">
              {serverError}
            </div>
          )}

          {/* Name */}
          <div>
            <label htmlFor="prod-name" className="block text-sm font-semibold text-[#FBF7EC] mb-1.5">
              Nombre <span aria-hidden className="text-red-400">*</span>
            </label>
            <input
              id="prod-name"
              type="text"
              {...register('name')}
              maxLength={120}
              className="w-full rounded-xl bg-white/8 border border-white/15 text-[#FBF7EC] placeholder-white/30 px-4 py-2.5 text-sm focus:outline-none focus:border-[#F5C84B]/70 transition-colors"
              aria-invalid={!!errors.name}
            />
            {errors.name && <p role="alert" className="text-xs text-red-400 mt-1">{errors.name.message}</p>}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="prod-desc" className="block text-sm font-semibold text-[#FBF7EC] mb-1.5">
              Descripción <span className="text-white/30 font-normal">(opcional)</span>
            </label>
            <textarea
              id="prod-desc"
              rows={2}
              maxLength={500}
              {...register('description')}
              className="w-full rounded-xl bg-white/8 border border-white/15 text-[#FBF7EC] placeholder-white/30 px-4 py-2.5 text-sm focus:outline-none focus:border-[#F5C84B]/70 transition-colors resize-none"
            />
          </div>

          {/* Price + Stock */}
          <div className={hasVariants ? '' : 'grid grid-cols-2 gap-3'}>
            <div className={hasVariants ? 'mb-3' : ''}>
              <label htmlFor="prod-price" className="block text-sm font-semibold text-[#FBF7EC] mb-1.5">
                Precio (ARS) <span aria-hidden className="text-red-400">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/40">$</span>
                <input
                  id="prod-price"
                  type="text"
                  inputMode="numeric"
                  {...register('price_display')}
                  className="w-full rounded-xl bg-white/8 border border-white/15 text-[#FBF7EC] placeholder-white/30 pl-7 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#F5C84B]/70 transition-colors"
                  aria-invalid={!!errors.price_display}
                />
              </div>
              {errors.price_display && <p role="alert" className="text-xs text-red-400 mt-1">{errors.price_display.message}</p>}
            </div>

            {/* Stock input: hidden when product has variants; replaced by read-only summary */}
            {hasVariants ? (
              <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/60 mb-3">
                Stock total: <span className="text-[#FBF7EC] font-semibold">{variantsTotalStock}</span>{' '}
                <span className="text-white/40">(suma de las variedades)</span>
              </div>
            ) : (
              <div>
                <label htmlFor="prod-stock" className="block text-sm font-semibold text-[#FBF7EC] mb-1.5">
                  Stock <span className="text-white/30 font-normal">(opcional)</span>
                </label>
                <input
                  id="prod-stock"
                  type="number"
                  min="0"
                  {...register('stock')}
                  className="w-full rounded-xl bg-white/8 border border-white/15 text-[#FBF7EC] placeholder-white/30 px-4 py-2.5 text-sm focus:outline-none focus:border-[#F5C84B]/70 transition-colors"
                />
              </div>
            )}
          </div>

          {/* Min quantity + qty step */}
          {(() => {
            const watchedMin = parseInt(watch('min_quantity') ?? '1', 10) || 1;
            const watchedStep = parseInt(watch('qty_step') ?? '1', 10) || 1;
            const showStepWarning = watchedMin > 1 && watchedStep > 1 && watchedMin < watchedStep;
            return (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="prod-min-qty" className="block text-sm font-semibold text-[#FBF7EC] mb-1.5">
                      Cantidad mínima
                    </label>
                    <input
                      id="prod-min-qty"
                      type="number"
                      min="1"
                      step="1"
                      {...register('min_quantity')}
                      className="w-full rounded-xl bg-white/8 border border-white/15 text-[#FBF7EC] placeholder-white/30 px-4 py-2.5 text-sm focus:outline-none focus:border-[#F5C84B]/70 transition-colors"
                    />
                  </div>
                  <div>
                    <label htmlFor="prod-qty-step" className="block text-sm font-semibold text-[#FBF7EC] mb-1.5">
                      Vender de a
                    </label>
                    <input
                      id="prod-qty-step"
                      type="number"
                      min="1"
                      step="1"
                      {...register('qty_step')}
                      className="w-full rounded-xl bg-white/8 border border-white/15 text-[#FBF7EC] placeholder-white/30 px-4 py-2.5 text-sm focus:outline-none focus:border-[#F5C84B]/70 transition-colors"
                    />
                  </div>
                </div>
                <p className="text-xs text-white/40 -mt-2">
                  Ej.: para vender empanadas por docena, poné mínimo 12 y de a 6.
                </p>
                {showStepWarning && (
                  <p className="text-xs text-amber-400 -mt-1">
                    El mínimo ({watchedMin}) es menor al paso ({watchedStep}). Un cliente nunca podría alcanzar el mínimo exacto con un solo incremento.
                  </p>
                )}
              </>
            );
          })()}

          {/* Section */}
          {sections.length > 0 && (
            <div>
              <label htmlFor="prod-section" className="block text-sm font-semibold text-[#FBF7EC] mb-1.5">
                Sección <span className="text-white/30 font-normal">(opcional)</span>
              </label>
              <Controller
                name="section_id"
                control={control}
                render={({ field }) => (
                  <Select
                    id="prod-section"
                    value={field.value || null}
                    onChange={(v) => field.onChange(v)}
                    options={[
                      { value: '', label: 'Sin sección' },
                      ...(() => {
                        const level1 = sections.filter((s) => s.parent_id == null);
                        const result: { value: string; label: string }[] = [];
                        for (const parent of level1) {
                          result.push({ value: parent.id, label: parent.name });
                          const children = sections.filter((s) => s.parent_id === parent.id);
                          for (const child of children) {
                            result.push({ value: child.id, label: `— ${child.name}` });
                          }
                        }
                        // Sections with no parent match (edge case: orphaned children already covered above)
                        return result;
                      })(),
                    ]}
                    placeholder="Sin sección"
                    ariaLabel="Sección del producto"
                  />
                )}
              />
            </div>
          )}

          {/* Images */}
          <div>
            <label className="block text-sm font-semibold text-[#FBF7EC] mb-1.5">
              {maxImagesPerProduct === 1
                ? 'Imagen'
                : `Imágenes ${maxImagesPerProduct === Infinity ? '' : `(hasta ${maxImagesPerProduct})`}`}
            </label>
            <ImageUpload
              images={imageUrls.map((url) => ({ url }))}
              maxCount={maxImagesPerProduct === Infinity ? 99 : maxImagesPerProduct}
              accept={{
                'image/png': ['.png'],
                'image/jpeg': ['.jpg', '.jpeg'],
                'image/webp': ['.webp'],
              }}
              maxSizeMB={5}
              onUpload={handleImageUpload}
              onDelete={handleImageDelete}
              label="Subí fotos del producto"
            />
          </div>

          {/* Variants */}
          <div>
            <label className="block text-sm font-semibold text-[#FBF7EC] mb-2">
              Variedades <span className="text-white/30 font-normal">(color, talle, etc.)</span>
            </label>
            {allowVariants ? (
              <VariantsSection
                productId={product?.id ?? null}
                productPriceCents={parsePriceCents(watch('price_display') ?? '') ?? product?.price_cents ?? 0}
                onVariantsChange={handleVariantsChange}
              />
            ) : (
              <div className="border border-dashed border-white/15 rounded-xl px-4 py-4 text-sm text-white/40">
                Las variedades están disponibles en los planes Medio y Pro.{' '}
                <a href="/#precios" className="text-[#F5C84B]/70 hover:text-[#F5C84B] transition-colors">
                  Conocé los planes →
                </a>
              </div>
            )}
          </div>

          {/* Save */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[44px] rounded-xl border border-white/20 text-white/70 font-semibold text-sm hover:border-white/40 hover:text-white transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 min-h-[44px] rounded-xl bg-[#F5C84B] text-[#16222E] font-bold text-sm hover:bg-[#FAE08A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
