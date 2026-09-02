// ---------------------------------------------------------------------------
// Orden de los productos del catálogo público.
//
// El orden se resuelve acá, en el servidor, y viaja como el orden del array de
// productos. StoreClient reparte por sección con un `filter`, que preserva el
// orden de entrada, así que ordenar una vez alcanza para la grilla por
// secciones y para la grilla plana filtrada. Ver design.md, Decisión 1.
// ---------------------------------------------------------------------------

import { resolveEffectivePrice } from '@/lib/store/pricing';
import { isInStock } from './stock';
import type { ProductVariantData } from './resolve';

export type SortMode =
  | 'manual'
  | 'price_asc'
  | 'price_desc'
  | 'name_asc'
  | 'newest'
  | 'best_selling';

/** Única fuente de verdad para la UI del dashboard y para el parseo. */
export const SORT_MODES: readonly { id: SortMode; label: string }[] = [
  { id: 'manual', label: 'Manual (arrastrando)' },
  { id: 'price_asc', label: 'Precio: menor a mayor' },
  { id: 'price_desc', label: 'Precio: mayor a menor' },
  { id: 'name_asc', label: 'Nombre: A-Z' },
  { id: 'newest', label: 'Más nuevos primero' },
  { id: 'best_selling', label: 'Más vendidos' },
];

export const SORT_MODE_IDS: readonly SortMode[] = SORT_MODES.map((m) => m.id);

const VALID_MODES = new Set<string>(SORT_MODE_IDS);

export function isSortMode(value: unknown): value is SortMode {
  return typeof value === 'string' && VALID_MODES.has(value);
}

export function sortModeLabel(mode: SortMode): string {
  return SORT_MODES.find((m) => m.id === mode)?.label ?? mode;
}

/** Lo mínimo que necesita un producto para ordenarse. `ProductRow` lo cumple. */
export interface SortableProduct {
  id: string;
  name: string;
  position: number;
  section_id: string | null;
  price_cents: number;
  promo_price_cents: number | null;
  stock: number | null;
  created_at: string;
}

export interface SortableSection {
  id: string;
  sort_mode?: string | null;
}

export interface SortableStore {
  default_product_sort?: string | null;
  out_of_stock_last?: boolean | null;
}

/**
 * Modo efectivo de una sección.
 *
 * `sort_mode` nulo significa **heredar** el default de la tienda, que no es lo
 * mismo que `'manual'`: una sección en nulo sigue al default cuando la dueña lo
 * cambia, una en `'manual'` se queda donde está. Cualquier valor desconocido
 * (una fila vieja, un valor escrito a mano) cae a `'manual'`: el catálogo nunca
 * se rompe por un dato inesperado.
 */
export function resolveSortMode(
  section: SortableSection | null | undefined,
  store: SortableStore
): SortMode {
  const own = section?.sort_mode ?? null;
  if (own !== null) return isSortMode(own) ? own : 'manual';
  const fallback = store.default_product_sort ?? 'manual';
  return isSortMode(fallback) ? fallback : 'manual';
}

/** ¿Hace falta el ranking de ventas para armar este catálogo? */
export function needsTopSellers(
  sections: readonly SortableSection[],
  store: SortableStore
): boolean {
  if (resolveSortMode(null, store) === 'best_selling') return true;
  return sections.some((s) => resolveSortMode(s, store) === 'best_selling');
}

// ─── Comparadores ────────────────────────────────────────────────────────────

// Todos desempatan por `position` y después por `id`. Sin un desempate total,
// dos productos al mismo precio pueden salir en distinto orden entre un render
// y otro. Para `manual`, este comparador *es* el orden.
function byManual(a: SortableProduct, b: SortableProduct): number {
  if (a.position !== b.position) return a.position - b.position;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// `numeric` para que "Talle 10" vaya después de "Talle 2", y `sensitivity:
// 'base'` para que mayúsculas y acentos no partan el alfabeto.
const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

// El precio que muestra la card: promo si hay promo válida, lista si no.
// No entran ni el mínimo entre variantes ni los tramos por cantidad — el tramo
// depende de cuántas unidades lleve cada comprador. Ver design.md, Decisión 3.
function effectiveCents(p: SortableProduct): number {
  return resolveEffectivePrice(p).effectiveCents;
}

export function comparatorFor(
  mode: SortMode,
  topSellerRank?: ReadonlyMap<string, number>
): (a: SortableProduct, b: SortableProduct) => number {
  switch (mode) {
    case 'price_asc':
      return (a, b) => effectiveCents(a) - effectiveCents(b) || byManual(a, b);

    case 'price_desc':
      return (a, b) => effectiveCents(b) - effectiveCents(a) || byManual(a, b);

    case 'name_asc':
      return (a, b) => collator.compare(a.name, b.name) || byManual(a, b);

    case 'newest':
      return (a, b) =>
        Date.parse(b.created_at) - Date.parse(a.created_at) || byManual(a, b);

    case 'best_selling':
      // La RPC solo devuelve los que vendieron algo: los demás van después,
      // entre sí en orden manual.
      return (a, b) => {
        const ra = topSellerRank?.get(a.id) ?? Number.POSITIVE_INFINITY;
        const rb = topSellerRank?.get(b.id) ?? Number.POSITIVE_INFINITY;
        if (ra !== rb) return ra - rb;
        return byManual(a, b);
      };

    case 'manual':
    default:
      return byManual;
  }
}

// ─── Orden del catálogo ──────────────────────────────────────────────────────

const NO_SECTION_KEY = '__no_section__';

export interface SortCatalogOptions {
  sections: readonly SortableSection[];
  store: SortableStore;
  variantsByProduct?: Record<string, ProductVariantData>;
  /** Ids ordenados por unidades vendidas, o el ranking ya armado. */
  topSellers?: readonly string[] | ReadonlyMap<string, number>;
}

function toRank(
  topSellers: SortCatalogOptions['topSellers']
): ReadonlyMap<string, number> | undefined {
  if (!topSellers) return undefined;
  if (topSellers instanceof Map) return topSellers;
  return new Map((topSellers as readonly string[]).map((id, i) => [id, i]));
}

/**
 * Ordena un grupo ya acotado a una sección: primero se parte por
 * disponibilidad (si la tienda lo pide) y después se aplica el mismo
 * comparador a cada mitad. La partición es ortogonal al modo, no un modo más.
 */
function sortGroup<T extends SortableProduct>(
  group: T[],
  compare: (a: SortableProduct, b: SortableProduct) => number,
  outOfStockLast: boolean,
  variantsByProduct: Record<string, ProductVariantData>
): T[] {
  if (!outOfStockLast) return group.sort(compare);

  const available: T[] = [];
  const soldOut: T[] = [];
  for (const p of group) {
    (isInStock(p, variantsByProduct[p.id]) ? available : soldOut).push(p);
  }
  return [...available.sort(compare), ...soldOut.sort(compare)];
}

/**
 * Devuelve los productos ordenados por sección, aplanados.
 *
 * Los grupos salen en el orden en que vienen las secciones (que ya llegan por
 * `position`), y los productos sin sección al final. Eso hace que la grilla
 * plana de resultados de búsqueda siga el mismo orden que el catálogo.
 */
export function sortCatalog<T extends SortableProduct>(
  products: readonly T[],
  { sections, store, variantsByProduct = {}, topSellers }: SortCatalogOptions
): T[] {
  const rank = toRank(topSellers);
  const outOfStockLast = store.out_of_stock_last ?? true;

  const groups = new Map<string, T[]>();
  for (const p of products) {
    const key = p.section_id ?? NO_SECTION_KEY;
    const group = groups.get(key);
    if (group) group.push(p);
    else groups.set(key, [p]);
  }

  const out: T[] = [];

  const emit = (key: string, section: SortableSection | null) => {
    const group = groups.get(key);
    if (!group) return;
    groups.delete(key);
    const compare = comparatorFor(resolveSortMode(section, store), rank);
    out.push(...sortGroup(group, compare, outOfStockLast, variantsByProduct));
  };

  for (const section of sections) emit(section.id, section);
  // Productos cuya sección ya no existe: se ordenan con el default de tienda.
  for (const key of [...groups.keys()]) {
    if (key !== NO_SECTION_KEY) emit(key, null);
  }
  emit(NO_SECTION_KEY, null);

  return out;
}
