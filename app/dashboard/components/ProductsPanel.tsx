'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Eye, EyeOff, ChevronDown, ChevronRight, Copy, Download, FileArchive, Table2 } from 'lucide-react';
import { SortableList } from '@/app/components/store/SortableList';
import { ProductModal } from '@/app/components/store/ProductModal';
import { BulkImportModal } from './BulkImportModal';
import { BulkEditGrid } from './BulkEditGrid';
import { saveStoreProduct, deleteStoreProduct, duplicateProduct, reorderProducts } from '@/lib/store/actions';
import { exportProductsCsv } from '@/lib/store/exports/products';
import type { Store, Section, Product } from '@/lib/onboarding/state';
import type { PriceTier } from '@/lib/store/pricing';
import { ConfirmModal } from '@/app/components/ConfirmModal';
import { toast } from '@/lib/toast';
import { resolveSortMode, sortModeLabel, type SortMode } from '@/lib/storefront/sorting';

const NO_SECTION_KEY = '__no_section__';

type Props = {
  store: Store;
  initialProducts: Product[];
  /** Tramos por cantidad ya guardados, por product_id (los sin tramos no aparecen).
   *  Requerido: si faltara, el guardado desde la grilla borraría los tramos existentes. */
  priceTiersByProduct: Record<string, PriceTier[]>;
  sections: Section[];
  productsCount: number;
  productsLimit: number;
  limitIsUnlimited: boolean;
  maxImagesPerProduct: number;
  allowVariants: boolean;
  allowBulkProducts: boolean;
};

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

export function ProductsPanel({ store, initialProducts, priceTiersByProduct, sections, productsCount, productsLimit, limitIsUnlimited, maxImagesPerProduct, allowVariants, allowBulkProducts }: Props) {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>(initialProducts);
  // Mantiene la lista sincronizada tras el refresh automático que dispara
  // bulkCreateProducts/bulkUpdateProducts (vía revalidatePath) al cerrar
  // el import o la grilla de edición masiva.
  useEffect(() => {
    setProducts(initialProducts);
  }, [initialProducts]);
  const [tiersByProduct, setTiersByProduct] = useState<Record<string, PriceTier[]>>(priceTiersByProduct);
  useEffect(() => {
    setTiersByProduct(priceTiersByProduct);
  }, [priceTiersByProduct]);
  const atProductsLimit = products.length >= productsLimit;
  const [modalProduct, setModalProduct] = useState<Product | null | undefined>(undefined);
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkEditProducts, setBulkEditProducts] = useState<Product[] | null>(null);

  const toggleCollapsed = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Build hierarchical groups: for each level-1 section, show its direct products
  // first, then a sub-group per child section. Flat sections without parent follow
  // the same logic (treated as level-1). Unsectioned products go last.
  type Group = {
    key: string;
    label: string;
    items: Product[];
    indent?: boolean;
    /** Modo efectivo de la sección: solo `manual` habilita el arrastre. */
    sortMode: SortMode;
  };
  const groups: Group[] = [];

  // El arrastre guarda `position`, y `position` solo se mira cuando la sección
  // ordena en manual. Dejar arrastrar en los otros modos persistiría algo que
  // la tienda ignora: la acción parecería andar y no tendría efecto.
  const sortModeOf = (section: Section | null) => resolveSortMode(section, store);

  const level1Sections = sections.filter((s) => s.parent_id == null);
  const childrenOf = (parentId: string) => sections.filter((s) => s.parent_id === parentId);

  for (const s of level1Sections) {
    const directProducts = products.filter((p) => p.section_id === s.id);
    const children = childrenOf(s.id);
    const hasChildren = children.some((c) => products.some((p) => p.section_id === c.id));

    if (directProducts.length > 0 || hasChildren) {
      if (directProducts.length > 0) {
        groups.push({ key: s.id, label: s.name, items: directProducts, sortMode: sortModeOf(s) });
      } else if (hasChildren) {
        // Show the parent label as a header-only group (0 items, just to mark start)
        groups.push({ key: s.id, label: s.name, items: [], sortMode: sortModeOf(s) });
      }
    }

    for (const child of children) {
      const childProducts = products.filter((p) => p.section_id === child.id);
      if (childProducts.length > 0) {
        groups.push({ key: child.id, label: child.name, items: childProducts, indent: true, sortMode: sortModeOf(child) });
      }
    }
  }

  const unsectioned = products.filter((p) => p.section_id === null);
  if (unsectioned.length > 0) {
    groups.push({ key: NO_SECTION_KEY, label: 'Sin sección', items: unsectioned, sortMode: sortModeOf(null) });
  }

  const handleProductSaved = (product: Product, savedTiers: PriceTier[]) => {
    setProducts((prev) => {
      const idx = prev.findIndex((p) => p.id === product.id);
      if (idx === -1) return [...prev, product];
      const next = [...prev];
      next[idx] = product;
      return next;
    });
    setTiersByProduct((prev) => ({ ...prev, [product.id]: savedTiers }));
    setModalProduct(undefined);
  };

  const handleDelete = (productId: string) => {
    setConfirmDeleteId(productId);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId) return;
    const productId = confirmDeleteId;
    setConfirmDeleteId(null);
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

  const handleDuplicate = async (product: Product) => {
    setDuplicatingId(product.id);
    try {
      const result = await duplicateProduct(product.id);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      setProducts((prev) => [...prev, result.product as Product]);
      toast.success('Producto duplicado');
    } catch {
      toast.error('No se pudo duplicar');
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const result = await exportProductsCsv();
      if ('error' in result) {
        if (result.error === 'empty') {
          toast.info('No hay productos para exportar');
        } else {
          toast.error('No se pudo exportar el CSV');
        }
        return;
      }
      const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `catalogo-${date}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('CSV exportado');
    } catch {
      toast.error('No se pudo exportar el CSV');
    } finally {
      setExporting(false);
    }
  };

  const handleBulkImported = (created: number) => {
    if (created > 0) router.refresh();
  };

  const closeBulkEdit = () => {
    setBulkEditProducts(null);
    router.refresh();
  };

  const handleReorder = async (newOrder: Product[]) => {
    const reordered = newOrder.map((p, i) => ({ ...p, position: i }));
    const previous = products;
    // El grupo arrastrado es una subsecuencia de `products`, y la lista se
    // renderiza en el orden del array (no por `position`). Hay que reubicar los
    // ítems en sus propios huecos: mapear por id dejaba el array en el orden
    // viejo y el producto "volvía" a su lugar al soltarlo.
    setProducts((prev) => {
      const byId = new Map(reordered.map((p) => [p.id, p]));
      let next = 0;
      return prev.map((p) => (byId.has(p.id) ? reordered[next++] : p));
    });

    const result = await reorderProducts(
      reordered.map((p) => ({ id: p.id, position: p.position }))
    );
    if ('error' in result) {
      setProducts(previous);
      setServerError(result.error);
    }
  };

  // La fila del producto se comparte entre el listado arrastrable y el de
  // orden automático, donde no hay handle.
  const renderProductRow = (product: Product, handle: React.ReactNode) => (
    <div className={`flex items-center gap-3 border rounded-xl px-3 py-2.5 transition-colors ${
      product.is_active
        ? 'bg-white/6 border-white/10'
        : 'bg-white/3 border-white/5 opacity-60'
    }`}>
      {handle}
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
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#FBF7EC] truncate">{product.name}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs text-[#F5C84B]/80">{formatPrice(product.price_cents)}</p>
          {product.stock === 0 && (
            <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">Sin stock</span>
          )}
          {product.stock !== null && product.stock >= 1 && product.stock <= 5 && (
            <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">Stock bajo: {product.stock}</span>
          )}
          {product.stock !== null && product.stock > 5 && (
            <span className="text-xs text-white/30">Stock: {product.stock}</span>
          )}
        </div>
      </div>
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
          onClick={() => handleDuplicate(product)}
          disabled={duplicatingId === product.id || atProductsLimit}
          className="w-7 h-7 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label={`Duplicar ${product.name}`}
          title={atProductsLimit ? 'Límite de productos alcanzado' : 'Duplicar producto'}
        >
          <Copy size={13} />
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
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-[#FBF7EC]">Productos</h1>
          {!limitIsUnlimited && (
            <span className={`text-xs font-medium tabular-nums ${atProductsLimit ? 'text-[#F5C84B]' : 'text-white/40'}`}>
              {products.length} / {productsLimit}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-white/50 hover:text-white hover:bg-white/8 border border-white/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? (
              <span className="w-3 h-3 rounded-full border border-white/40 border-t-white/80 animate-spin" />
            ) : (
              <Download size={12} />
            )}
            Exportar catálogo CSV
          </button>
          {allowBulkProducts ? (
            <>
              <button
                type="button"
                onClick={() => setShowBulkImport(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-white/50 hover:text-white hover:bg-white/8 border border-white/10 transition-colors cursor-pointer"
              >
                <FileArchive size={12} />
                Importar ZIP de fotos
              </button>
              <button
                type="button"
                onClick={() => setBulkEditProducts(products)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-white/50 hover:text-white hover:bg-white/8 border border-white/10 transition-colors cursor-pointer"
              >
                <Table2 size={12} />
                Edición masiva
              </button>
            </>
          ) : (
            <a
              href="/#precios"
              className="text-xs text-white/50 hover:text-white/80 transition-colors"
            >
              Importación y edición masiva con Pro →
            </a>
          )}
          <button
            type="button"
            onClick={() => setModalProduct(null)}
            disabled={atProductsLimit}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-[#F5C84B] hover:text-[#FAE08A] hover:bg-white/8 border border-white/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={12} />
            Agregar producto
          </button>
        </div>
      </div>

      {modalProduct !== undefined && (
        <ProductModal
          storeId={store.id}
          sections={sections}
          product={modalProduct}
          priceTiers={modalProduct ? tiersByProduct[modalProduct.id] ?? [] : []}
          nextPosition={products.length}
          maxImagesPerProduct={maxImagesPerProduct}
          allowVariants={allowVariants}
          onSaved={handleProductSaved}
          onClose={() => setModalProduct(undefined)}
        />
      )}

      {showBulkImport && (
        <BulkImportModal
          storeId={store.id}
          sections={sections}
          onClose={() => setShowBulkImport(false)}
          onImported={handleBulkImported}
          onOpenGrid={() => {
            setShowBulkImport(false);
            setBulkEditProducts(products.filter((p) => !p.is_active));
          }}
        />
      )}

      {bulkEditProducts && (
        <BulkEditGrid
          storeId={store.id}
          products={bulkEditProducts}
          priceTiersByProduct={tiersByProduct}
          sections={sections}
          maxImagesPerProduct={maxImagesPerProduct}
          allowVariants={allowVariants}
          onClose={closeBulkEdit}
        />
      )}

      {serverError && (
        <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300 mb-4">
          {serverError}
        </div>
      )}

      <div className="space-y-4">
        <p className="text-sm text-white/50">
          Administrá los productos de tu tienda. En las secciones que ordenás a mano, podés arrastrarlos.
        </p>

        {products.length > 0 && (
          <div className="space-y-3">
            {groups.map((group) => {
              const isCollapsed = collapsed.has(group.key);
              const isEmpty = group.items.length === 0;
              return (
                <div key={group.key} className={group.indent ? 'ml-4' : undefined}>
                  <button
                    type="button"
                    onClick={() => !isEmpty && toggleCollapsed(group.key)}
                    className={`flex items-center gap-2 w-full text-left py-1.5 text-sm font-semibold transition-colors ${
                      group.indent
                        ? 'text-white/50 hover:text-white/70 text-xs'
                        : 'text-white/70 hover:text-white/90'
                    }${isEmpty ? ' cursor-default' : ' cursor-pointer'}`}
                  >
                    {isEmpty ? (
                      <span className="w-[15px]" />
                    ) : isCollapsed ? (
                      <ChevronRight size={15} />
                    ) : (
                      <ChevronDown size={15} />
                    )}
                    <span>{group.label}</span>
                    {!isEmpty && <span className="text-white/30 font-normal">({group.items.length})</span>}
                  </button>

                  {!isCollapsed && !isEmpty && (
                    <div className="mt-1">
                      {group.sortMode !== 'manual' && (
                        <p className="text-xs text-white/30 mb-1.5">
                          Orden automático: {sortModeLabel(group.sortMode).toLowerCase()}. Se cambia desde Secciones.
                        </p>
                      )}
                      {group.sortMode === 'manual' ? (
                        <SortableList
                          items={group.items}
                          onReorder={handleReorder}
                          renderItem={renderProductRow}
                        />
                      ) : (
                        <div className="flex flex-col gap-2">
                          {group.items.map((product) => (
                            <div key={product.id}>{renderProductRow(product, null)}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {products.length === 0 && (
          <div className="border-2 border-dashed border-white/15 rounded-xl px-6 py-8 text-center">
            <p className="text-sm text-white/40">No hay productos. Agregá el primero.</p>
          </div>
        )}

        {!limitIsUnlimited && atProductsLimit && (
          <a
            href="/#precios"
            className="text-xs text-white/50 hover:text-white/80 transition-colors"
          >
            Pasate a Pro para sumar productos ilimitados →
          </a>
        )}
      </div>

      <ConfirmModal
        open={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={handleConfirmDelete}
        title="Borrar producto"
        message="¿Borrar este producto? Esta acción no se puede deshacer."
        confirmLabel="Sí, borrar"
        variant="destructive"
      />
    </div>
  );
}
