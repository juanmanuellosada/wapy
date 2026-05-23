'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, Eye, EyeOff, Loader2 } from 'lucide-react';
import { SortableList } from '@/app/components/store/SortableList';
import { ProductModal } from '@/app/components/store/ProductModal';
import { saveStoreProduct, deleteStoreProduct } from '@/lib/store/actions';
import type { Store, Section, Product } from '@/lib/onboarding/state';

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

export function ProductsPanel({ store, initialProducts, sections }: Props) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [modalProduct, setModalProduct] = useState<Product | null | undefined>(undefined); // undefined = closed
  const [serverError, setServerError] = useState<string | null>(null);

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

  const handleDelete = async (productId: string) => {
    if (!confirm('¿Borrar este producto? Esta acción no se puede deshacer.')) return;
    const result = await deleteStoreProduct(productId);
    if ('error' in result) {
      setServerError(result.error);
      return;
    }
    setProducts((prev) => prev.filter((p) => p.id !== productId));
  };

  const handleToggleActive = async (product: Product) => {
    const updated = { ...product, is_active: !product.is_active };
    const result = await saveStoreProduct({
      id: product.id,
      name: product.name,
      description: product.description,
      price_cents: product.price_cents,
      stock: product.stock,
      section_id: product.section_id,
      image_urls: product.image_urls,
      position: product.position,
      is_active: updated.is_active,
    });
    if ('error' in result) {
      setServerError(result.error);
      return;
    }
    setProducts((prev) => prev.map((p) => (p.id === product.id ? updated : p)));
  };

  const handleReorder = async (newOrder: Product[]) => {
    const reordered = newOrder.map((p, i) => ({ ...p, position: i }));
    setProducts(reordered);
    for (const p of reordered) {
      await saveStoreProduct({
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

  return (
    <div>
      <h1 className="text-xl font-bold text-[#FBF7EC] mb-6">Productos</h1>

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

      {serverError && (
        <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300 mb-4">
          {serverError}
        </div>
      )}

      <div className="space-y-4">
        <p className="text-sm text-white/50">
          Administrá los productos de tu tienda. Podés arrastrarlos para cambiar el orden.
        </p>

        {products.length > 0 && (
          <SortableList
            items={products}
            onReorder={handleReorder}
            renderItem={(product, handle) => (
              <div className={`flex items-center gap-3 border rounded-xl px-3 py-2.5 transition-colors ${
                product.is_active
                  ? 'bg-white/6 border-white/10'
                  : 'bg-white/3 border-white/5 opacity-60'
              }`}>
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
                    onClick={() => handleToggleActive(product)}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                      product.is_active
                        ? 'text-white/40 hover:text-green-400 hover:bg-green-500/10'
                        : 'text-white/30 hover:text-white/60 hover:bg-white/10'
                    }`}
                    aria-label={product.is_active ? `Ocultar ${product.name}` : `Mostrar ${product.name}`}
                    title={product.is_active ? 'Marcar como inactivo' : 'Marcar como activo'}
                  >
                    {product.is_active ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
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
            <p className="text-sm text-white/40">No hay productos. Agregá el primero.</p>
          </div>
        )}

        <button
          type="button"
          onClick={() => setModalProduct(null)}
          className="flex items-center gap-2 text-sm text-[#F5C84B] hover:text-[#FAE08A] font-semibold transition-colors cursor-pointer"
        >
          <Plus size={16} />
          Agregar producto
        </button>
      </div>
    </div>
  );
}
