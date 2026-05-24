'use client';

import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Loader2 } from 'lucide-react';
import { ImageUpload } from './ImageUpload';
import { uploadProductImage, deleteImage } from '@/lib/onboarding/storage';
import { saveStoreProduct } from '@/lib/store/actions';
import type { Section, Product } from '@/lib/onboarding/state';

const productFormSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(120, 'Máximo 120 caracteres'),
  description: z.string().max(500, 'Máximo 500 caracteres').optional(),
  price_display: z.string().min(1, 'El precio es requerido'),
  stock: z.string().optional(),
  section_id: z.string().optional(),
});

type ProductFormData = z.infer<typeof productFormSchema>;

type Props = {
  storeId: string;
  sections: Section[];
  product?: Product | null; // null = new
  nextPosition: number;
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

export function ProductModal({ storeId, sections, product, nextPosition, onSaved, onClose }: Props) {
  const isEdit = !!product;
  const [imageUrls, setImageUrls] = useState<string[]>(product?.image_urls ?? []);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProductFormData>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: product?.name ?? '',
      description: product?.description ?? '',
      price_display: product ? formatPrice(product.price_cents) : '',
      stock: product?.stock != null ? String(product.stock) : '',
      section_id: product?.section_id ?? '',
    },
  });

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleImageUpload = async (file: File): Promise<string> => {
    const url = await uploadProductImage(file, storeId);
    setImageUrls((prev) => [...prev, url]);
    return url;
  };

  const handleImageDelete = async (url: string) => {
    await deleteImage(url, 'product-images');
    setImageUrls((prev) => prev.filter((u) => u !== url));
  };

  const onSubmit = async (data: ProductFormData) => {
    setSaving(true);
    setServerError(null);

    const price_cents = parsePriceCents(data.price_display);

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
    };

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
          <div className="grid grid-cols-2 gap-3">
            <div>
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
          </div>

          {/* Section */}
          {sections.length > 0 && (
            <div>
              <label htmlFor="prod-section" className="block text-sm font-semibold text-[#FBF7EC] mb-1.5">
                Sección <span className="text-white/30 font-normal">(opcional)</span>
              </label>
              <select
                id="prod-section"
                {...register('section_id')}
                className="w-full rounded-xl bg-white/8 border border-white/15 text-[#FBF7EC] px-4 py-2.5 text-sm focus:outline-none focus:border-[#F5C84B]/70 transition-colors cursor-pointer"
              >
                <option value="">Sin sección</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Images */}
          <div>
            <label className="block text-sm font-semibold text-[#FBF7EC] mb-1.5">
              Imágenes <span className="text-white/30 font-normal">(hasta 5)</span>
            </label>
            <ImageUpload
              images={imageUrls.map((url) => ({ url }))}
              maxCount={5}
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
