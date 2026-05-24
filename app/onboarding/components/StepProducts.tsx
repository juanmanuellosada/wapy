'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, ChevronLeft, Loader2, Pencil, Trash2 } from 'lucide-react';
import { SortableList } from './SortableList';
import { ProductModal } from './ProductModal';
import { removeProduct, saveProduct, advanceProductsStep } from '@/lib/onboarding/actions';
import type { Store, Section, Product } from '@/lib/onboarding/state';
import { ConfirmModal } from '@/app/components/ConfirmModal';

type Props = {
  store: Store;
  initialProducts: Product[];
  sections: Section[];
};

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

export function StepProducts({ store, initialProducts, sections }: Props) {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [modalProduct, setModalProduct] = useState<Product | null | undefined>(undefined); // undefined = closed
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleProductSaved = (product: Product) => {
    setProducts((prev) => {
      const idx = prev.findIndex((p) => p.id === product.id);
      if (idx === -1) return [...prev, product];
      const next = [...prev];
      next[idx] = product;
      return next;
    });
    setModalProduct(undefined);
  };

  const handleDelete = (productId: string) => {
    setConfirmDeleteId(productId);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId) return;
    const productId = confirmDeleteId;
    setConfirmDeleteId(null);
    const result = await removeProduct(productId);
    if ('error' in result) {
      setServerError(result.error);
      return;
    }
    setProducts((prev) => prev.filter((p) => p.id !== productId));
  };

  const handleReorder = async (newOrder: Product[]) => {
    const reordered = newOrder.map((p, i) => ({ ...p, position: i }));
    setProducts(reordered);
    // Persist new positions
    for (const p of reordered) {
      await saveProduct({
        id: p.id,
        name: p.name,
        description: p.description,
        price_cents: p.price_cents,
        stock: p.stock,
        section_id: p.section_id,
        image_urls: p.image_urls,
        position: p.position,
        is_active: p.is_active,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (products.length === 0) {
      setServerError('Agregá al menos un producto para continuar.');
      return;
    }

    setSubmitting(true);
    const result = await advanceProductsStep();

    if ('error' in result) {
      setServerError(result.error);
      setSubmitting(false);
      return;
    }

    router.push('/onboarding/whatsapp');
  };

  return (
    <>
      {modalProduct !== undefined && (
        <ProductModal
          storeId={store.id}
          sections={sections}
          product={modalProduct}
          nextPosition={products.length}
          onSaved={handleProductSaved}
          onClose={() => setModalProduct(undefined)}
        />
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {serverError && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">
            {serverError}
          </div>
        )}

        <p className="text-sm text-white/50">
          Agregá tu primer producto para arrancar. El resto lo cargás con calma desde tu panel cuando publiques.
        </p>

        {products.length > 0 && (
          <SortableList
            items={products}
            onReorder={handleReorder}
            renderItem={(product, handle) => (
              <div className="flex items-center gap-3 bg-white/6 border border-white/10 rounded-xl px-3 py-2.5">
                {handle}
                {/* Thumbnail */}
                <div className="flex-shrink-0 w-10 h-10 rounded-lg overflow-hidden bg-white/10">
                  {product.image_urls[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.image_urls[0]} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">
                      📦
                    </div>
                  )}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#FBF7EC] truncate">{product.name}</p>
                  <p className="text-xs text-[#F5C84B]/80">{formatPrice(product.price_cents)}</p>
                </div>
                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setModalProduct(product)}
                    className="w-7 h-7 rounded-lg text-white/40 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
                    aria-label={`Editar ${product.name}`}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(product.id)}
                    className="w-7 h-7 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-colors cursor-pointer"
                    aria-label={`Borrar ${product.name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )}
          />
        )}

        {products.length === 0 && (
          <div className="border-2 border-dashed border-white/15 rounded-xl px-6 py-8 text-center">
            <p className="text-sm text-white/40">Todavía no tenés productos. Agregá el primero para arrancar.</p>
          </div>
        )}

        <button
          type="button"
          onClick={() => setModalProduct(null)}
          className="flex items-center gap-2 text-sm text-[#F5C84B] hover:text-[#FAE08A] font-semibold transition-colors cursor-pointer"
        >
          <Plus size={16} />
          {products.length === 0 ? 'Agregá tu primer producto' : 'Agregar producto'}
        </button>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => router.push('/onboarding/sections')}
            className="flex items-center gap-1 text-sm text-white/50 hover:text-white/80 transition-colors cursor-pointer"
          >
            <ChevronLeft size={16} />
            Atrás
          </button>
          <button
            type="submit"
            disabled={submitting || products.length === 0}
            className="min-h-[44px] px-8 rounded-xl bg-[#F5C84B] text-[#16222E] font-bold text-sm hover:bg-[#FAE08A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2 cursor-pointer"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Siguiente →
          </button>
        </div>
      </form>

      <ConfirmModal
        open={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={handleConfirmDelete}
        title="Borrar producto"
        message="¿Borrar este producto del catálogo? Esta acción no se puede deshacer."
        confirmLabel="Sí, borrar"
        variant="destructive"
      />
    </>
  );
}
