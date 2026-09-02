// NOTE: No hay test runner configurado en package.json (ver otros *.test.ts del
// repo). Ejecutar con: npx vitest run lib/storefront/sorting.test.ts

import { describe, it, expect } from 'vitest';
import {
  resolveSortMode,
  needsTopSellers,
  sortCatalog,
  type SortableProduct,
  type SortableStore,
} from './sorting';
import type { ProductVariantData } from './resolve';

let seq = 0;

function product(overrides: Partial<SortableProduct> = {}): SortableProduct {
  seq += 1;
  return {
    id: `p${seq}`,
    name: `Producto ${seq}`,
    position: seq,
    section_id: 's1',
    price_cents: 10000,
    promo_price_cents: null,
    stock: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function store(overrides: Partial<SortableStore> = {}): SortableStore {
  // out_of_stock_last apagado por defecto en los tests que no lo ejercitan,
  // así cada caso mide una sola cosa.
  return { default_product_sort: 'manual', out_of_stock_last: false, ...overrides };
}

const SECTION = { id: 's1', sort_mode: null as string | null };

function ids(products: SortableProduct[]): string[] {
  return products.map((p) => p.id);
}

/** Variantes de un producto, con el stock de cada una. */
function variants(...stocks: (number | null)[]): ProductVariantData {
  return {
    optionTypes: [],
    variants: stocks.map((stock, i) => ({
      id: `v${i}`,
      stock,
      price_override: null,
      promo_price_override: null,
      image_url: null,
      position: i,
      optionValues: {},
    })),
  };
}

describe('resolveSortMode', () => {
  it('sort_mode nulo hereda el default de la tienda', () => {
    expect(resolveSortMode({ id: 's1', sort_mode: null }, store({ default_product_sort: 'name_asc' })))
      .toBe('name_asc');
  });

  it("'manual' explícito no se ve afectado por el default", () => {
    expect(resolveSortMode({ id: 's1', sort_mode: 'manual' }, store({ default_product_sort: 'price_asc' })))
      .toBe('manual');
  });

  it('un sort_mode desconocido cae a manual', () => {
    expect(resolveSortMode({ id: 's1', sort_mode: 'por_color' }, store({ default_product_sort: 'price_asc' })))
      .toBe('manual');
  });

  it('un default desconocido cae a manual', () => {
    expect(resolveSortMode({ id: 's1', sort_mode: null }, store({ default_product_sort: 'lo_que_sea' })))
      .toBe('manual');
  });

  it('sin sección resuelve el default de la tienda', () => {
    expect(resolveSortMode(null, store({ default_product_sort: 'newest' }))).toBe('newest');
  });
});

describe('needsTopSellers', () => {
  it('es falso cuando ninguna sección ordena por ventas', () => {
    expect(needsTopSellers([{ id: 's1', sort_mode: 'price_asc' }], store())).toBe(false);
  });

  it('es verdadero si una sección lo pide', () => {
    expect(needsTopSellers([{ id: 's1', sort_mode: 'best_selling' }], store())).toBe(true);
  });

  it('es verdadero si lo pide el default heredado', () => {
    expect(needsTopSellers([{ id: 's1', sort_mode: null }], store({ default_product_sort: 'best_selling' })))
      .toBe(true);
  });
});

describe('sortCatalog — modos', () => {
  it('manual respeta position', () => {
    const a = product({ id: 'a', position: 2 });
    const b = product({ id: 'b', position: 0 });
    const c = product({ id: 'c', position: 1 });
    const out = sortCatalog([a, b, c], { sections: [SECTION], store: store() });
    expect(ids(out)).toEqual(['b', 'c', 'a']);
  });

  it('price_asc y price_desc ordenan por precio', () => {
    const caro = product({ id: 'caro', price_cents: 500000 });
    const barato = product({ id: 'barato', price_cents: 120000 });
    const medio = product({ id: 'medio', price_cents: 340000 });
    const opts = { sections: [{ id: 's1', sort_mode: 'price_asc' }], store: store() };
    expect(ids(sortCatalog([caro, barato, medio], opts))).toEqual(['barato', 'medio', 'caro']);

    const desc = { sections: [{ id: 's1', sort_mode: 'price_desc' }], store: store() };
    expect(ids(sortCatalog([caro, barato, medio], desc))).toEqual(['caro', 'medio', 'barato']);
  });

  it('ordena por el precio con promo, no por el de lista', () => {
    // El de $5.000 con promo a $900 tiene que ir antes que el de $1.500,
    // porque $900 es el número que muestra la card.
    const conPromo = product({ id: 'promo', price_cents: 500000, promo_price_cents: 90000 });
    const sinPromo = product({ id: 'lista', price_cents: 150000 });
    const out = sortCatalog([sinPromo, conPromo], {
      sections: [{ id: 's1', sort_mode: 'price_asc' }],
      store: store(),
    });
    expect(ids(out)).toEqual(['promo', 'lista']);
  });

  it('una promo mayor o igual al precio de lista no cuenta', () => {
    const invalida = product({ id: 'invalida', price_cents: 100000, promo_price_cents: 120000 });
    const otro = product({ id: 'otro', price_cents: 110000 });
    const out = sortCatalog([invalida, otro], {
      sections: [{ id: 's1', sort_mode: 'price_asc' }],
      store: store(),
    });
    expect(ids(out)).toEqual(['invalida', 'otro']);
  });

  it('name_asc ignora mayúsculas y acentos, y ordena números como números', () => {
    const a = product({ id: 'a', name: 'ñandú' });
    const b = product({ id: 'b', name: 'Alfajor' });
    const c = product({ id: 'c', name: 'Talle 10' });
    const d = product({ id: 'd', name: 'Talle 2' });
    const out = sortCatalog([a, b, c, d], {
      sections: [{ id: 's1', sort_mode: 'name_asc' }],
      store: store(),
    });
    // ñ va después de n y antes de o: 'ñandú' cae entre 'Alfajor' y 'Talle'.
    expect(ids(out)).toEqual(['b', 'a', 'd', 'c']);
  });

  it('newest ordena por created_at descendente', () => {
    const viejo = product({ id: 'viejo', created_at: '2026-01-01T00:00:00Z' });
    const nuevo = product({ id: 'nuevo', created_at: '2026-08-01T00:00:00Z' });
    const medio = product({ id: 'medio', created_at: '2026-05-01T00:00:00Z' });
    const out = sortCatalog([viejo, nuevo, medio], {
      sections: [{ id: 's1', sort_mode: 'newest' }],
      store: store(),
    });
    expect(ids(out)).toEqual(['nuevo', 'medio', 'viejo']);
  });

  it('best_selling deja los productos sin ventas al final, en orden manual', () => {
    const sinVentas = product({ id: 'sin', position: 0 });
    const segundo = product({ id: 'segundo', position: 5 });
    const primero = product({ id: 'primero', position: 9 });
    const out = sortCatalog([sinVentas, segundo, primero], {
      sections: [{ id: 's1', sort_mode: 'best_selling' }],
      store: store(),
      topSellers: ['primero', 'segundo'],
    });
    expect(ids(out)).toEqual(['primero', 'segundo', 'sin']);
  });

  it('best_selling sin ranking equivale a manual', () => {
    const a = product({ id: 'a', position: 3 });
    const b = product({ id: 'b', position: 1 });
    const out = sortCatalog([a, b], {
      sections: [{ id: 's1', sort_mode: 'best_selling' }],
      store: store(),
    });
    expect(ids(out)).toEqual(['b', 'a']);
  });
});

describe('sortCatalog — herencia y secciones', () => {
  it('cada sección usa su propio modo', () => {
    const manualA = product({ id: 'm1', section_id: 'curada', position: 1, price_cents: 900000 });
    const manualB = product({ id: 'm2', section_id: 'curada', position: 2, price_cents: 100000 });
    const autoA = product({ id: 'a1', section_id: 'grande', position: 1, price_cents: 900000 });
    const autoB = product({ id: 'a2', section_id: 'grande', position: 2, price_cents: 100000 });

    const out = sortCatalog([manualA, manualB, autoA, autoB], {
      sections: [
        { id: 'curada', sort_mode: 'manual' },
        { id: 'grande', sort_mode: null },
      ],
      store: store({ default_product_sort: 'price_asc' }),
    });

    expect(ids(out)).toEqual(['m1', 'm2', 'a2', 'a1']);
  });

  it('los productos sin sección van al final, con el default de la tienda', () => {
    const conSeccion = product({ id: 'con', section_id: 's1', position: 5 });
    const sinA = product({ id: 'sinA', section_id: null, position: 9, price_cents: 500000 });
    const sinB = product({ id: 'sinB', section_id: null, position: 1, price_cents: 100000 });

    const out = sortCatalog([sinA, sinB, conSeccion], {
      sections: [SECTION],
      store: store({ default_product_sort: 'price_asc' }),
    });

    expect(ids(out)).toEqual(['con', 'sinB', 'sinA']);
  });

  it('los grupos salen en el orden en que vienen las secciones', () => {
    const b = product({ id: 'b', section_id: 's2' });
    const a = product({ id: 'a', section_id: 's1' });
    const out = sortCatalog([b, a], {
      sections: [{ id: 's1', sort_mode: null }, { id: 's2', sort_mode: null }],
      store: store(),
    });
    expect(ids(out)).toEqual(['a', 'b']);
  });
});

describe('sortCatalog — sin stock al final', () => {
  it('combina la partición con el modo de orden', () => {
    const agotadoBarato = product({ id: 'agotado', price_cents: 80000, stock: 0 });
    const caro = product({ id: 'caro', price_cents: 200000, stock: 3 });
    const barato = product({ id: 'barato', price_cents: 100000, stock: 3 });

    const out = sortCatalog([agotadoBarato, caro, barato], {
      sections: [{ id: 's1', sort_mode: 'price_asc' }],
      store: store({ out_of_stock_last: true }),
    });

    expect(ids(out)).toEqual(['barato', 'caro', 'agotado']);
  });

  it('se aplica también sobre el orden manual', () => {
    const agotado = product({ id: 'agotado', position: 0, stock: 0 });
    const disponible = product({ id: 'disponible', position: 1, stock: null });
    const out = sortCatalog([agotado, disponible], {
      sections: [SECTION],
      store: store({ out_of_stock_last: true }),
    });
    expect(ids(out)).toEqual(['disponible', 'agotado']);
  });

  it('apagado, los agotados quedan donde caen', () => {
    const agotado = product({ id: 'agotado', position: 0, stock: 0 });
    const disponible = product({ id: 'disponible', position: 1, stock: null });
    const out = sortCatalog([agotado, disponible], {
      sections: [SECTION],
      store: store({ out_of_stock_last: false }),
    });
    expect(ids(out)).toEqual(['agotado', 'disponible']);
  });

  it('viene activado cuando la tienda no lo define', () => {
    const agotado = product({ id: 'agotado', position: 0, stock: 0 });
    const disponible = product({ id: 'disponible', position: 1, stock: null });
    const out = sortCatalog([agotado, disponible], {
      sections: [SECTION],
      store: { default_product_sort: 'manual' },
    });
    expect(ids(out)).toEqual(['disponible', 'agotado']);
  });

  it('un producto con todas las variantes agotadas cuenta como sin stock', () => {
    // stock a nivel producto nulo (= sin control), pero ninguna variante tiene
    // unidades: no se puede vender.
    const conVariantes = product({ id: 'variantes', position: 0, stock: null });
    const simple = product({ id: 'simple', position: 1, stock: 5 });

    const out = sortCatalog([conVariantes, simple], {
      sections: [SECTION],
      store: store({ out_of_stock_last: true }),
      variantsByProduct: { variantes: variants(0, 0) },
    });

    expect(ids(out)).toEqual(['simple', 'variantes']);
  });

  it('alcanza con una variante con stock para contar como disponible', () => {
    const conVariantes = product({ id: 'variantes', position: 1, stock: 0 });
    const simple = product({ id: 'simple', position: 0, stock: 0 });

    const out = sortCatalog([simple, conVariantes], {
      sections: [SECTION],
      store: store({ out_of_stock_last: true }),
      variantsByProduct: { variantes: variants(0, 4) },
    });

    expect(ids(out)).toEqual(['variantes', 'simple']);
  });
});

describe('sortCatalog — estabilidad', () => {
  it('dos productos al mismo precio salen siempre en el mismo orden', () => {
    const tarde = product({ id: 'tarde', position: 7, price_cents: 100000 });
    const temprano = product({ id: 'temprano', position: 3, price_cents: 100000 });
    const opts = { sections: [{ id: 's1', sort_mode: 'price_asc' }], store: store() };

    expect(ids(sortCatalog([tarde, temprano], opts))).toEqual(['temprano', 'tarde']);
    expect(ids(sortCatalog([temprano, tarde], opts))).toEqual(['temprano', 'tarde']);
  });

  it('mismo precio y misma position desempatan por id', () => {
    const b = product({ id: 'b', position: 1, price_cents: 100000 });
    const a = product({ id: 'a', position: 1, price_cents: 100000 });
    const opts = { sections: [{ id: 's1', sort_mode: 'price_asc' }], store: store() };
    expect(ids(sortCatalog([b, a], opts))).toEqual(['a', 'b']);
  });

  it('no muta el array recibido', () => {
    const a = product({ id: 'a', position: 5 });
    const b = product({ id: 'b', position: 1 });
    const input = [a, b];
    sortCatalog(input, { sections: [SECTION], store: store() });
    expect(ids(input)).toEqual(['a', 'b']);
  });
});
