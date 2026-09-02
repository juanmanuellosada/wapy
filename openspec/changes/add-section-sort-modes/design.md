## Contexto

El catálogo público se arma en un solo lugar: `resolveStoreSlug` (`lib/storefront/resolve.ts`) trae tienda, secciones, productos, tramos y variantes; `app/[slug]/page.tsx` compone y le pasa el array de productos a `StoreClient`, que en `visibleProductsBySection` (línea 2334) reparte por sección con un `filter`. Como `Array.prototype.filter` preserva el orden del array de entrada, **el orden del catálogo está determinado por el orden del array que sale del servidor**. Ese es el punto de apoyo de todo este change.

## Decisión 1 — Ordenar en el servidor, no en el cliente

El orden se aplica en `app/[slug]/page.tsx`, sobre `resolution.products`, antes de pasarlo a `StoreClient`.

- El HTML inicial ya sale ordenado: no hay reordenamiento visible después de la hidratación.
- `visibleProductsBySection` y la grilla plana filtrada heredan el orden sin tocar una línea de `StoreClient` (2.500 líneas que no hace falta abrir).
- Es una sola implementación, no una por vista.

**Por qué en `page.tsx` y no dentro de `resolve.ts`:** el modo "Más vendidos" necesita el resultado de la RPC `storefront_top_sellers`, que hoy se llama en `page.tsx` dentro del `Promise.all` de la línea 114. Meter esa llamada en `resolve.ts` la impondría a todos sus consumidores (checkout incluido), que no ordenan nada. El módulo de orden queda puro y sin I/O; `page.tsx` le pasa los ids ya resueltos.

## Decisión 2 — El modo efectivo se resuelve por sección, con herencia

```
modoEfectivo(seccion) = seccion.sort_mode ?? store.default_product_sort
```

`sort_mode` nullable no es lo mismo que `'manual'`: nulo significa **heredar**. Una sección en NULL sigue al default de la tienda cuando la dueña lo cambia; una sección puesta explícitamente en `'manual'` se queda en manual pase lo que pase. Sin esa distinción, cambiar el default de tienda no tendría forma de propagarse a las secciones que nunca se configuraron, que son todas las existentes.

Las subsecciones son filas de `sections` como cualquier otra, así que tienen su propio `sort_mode` y su propia herencia. Una subsección **no** hereda de su sección madre: hereda del default de la tienda. Es la regla más simple de explicar y evita una cadena de tres niveles cuyo resultado nadie puede predecir mirando la UI.

## Decisión 3 — Precio efectivo a nivel producto, no mínimo entre variantes

El comparador de precio usa `resolveEffectivePrice(product)` de `lib/store/pricing.ts`: precio de lista, o promo si hay promo válida.

Elegimos **el precio que la card muestra en su estado inicial**. `ProductCardClient` renderiza el precio que sale de `useVariantSelection` sin selección activa, que cae al nivel producto (`StoreClient.tsx:782-790`). Si ordenáramos por el mínimo entre variantes, el orden se explicaría por un número que en la card no está escrito en ningún lado.

Consecuencia conocida: `applyFilters` **sí** usa el mínimo entre `price_override` de variantes para el filtro de rango de precio (`filters.ts:105-115`), y además ignora la promo. O sea que filtro y orden no comparten criterio. Es una incoherencia que ya existe hoy entre el filtro y la card; este change no la introduce ni la arregla, la deja anotada. Unificar los tres criterios es un change aparte, porque cambia el resultado del filtro de precio en tiendas vivas.

Los **tramos por cantidad** no entran en el criterio: el precio del tramo depende de cuántas unidades lleve el comprador, y el orden de la grilla tiene que ser el mismo para todos.

## Decisión 4 — "Sin stock al final" es una partición, no un modo

```
productos ordenados = [ ...conStock.sort(cmp), ...sinStock.sort(cmp) ]
```

Se parte primero por disponibilidad y se aplica el mismo comparador a cada mitad. Así el toggle se combina con los seis modos en vez de competir con ellos, y con `out_of_stock_last = false` el resultado es exactamente `todos.sort(cmp)`.

El predicado es `isInStock` de `app/[slug]/filters.ts`, que hoy es privado y hay que exportar: contempla producto simple (`stock === null` = sin control de stock = disponible) y producto con variantes (disponible si alguna variante lo está). Reimplementarlo sería garantizar que las dos definiciones se separen con el tiempo.

## Decisión 5 — Desempate estable por `position`

Todos los comparadores desempatan por `position` ascendente y, si empatan, por `id`. Dos productos al mismo precio tienen que salir siempre en el mismo orden: sin desempate explícito el resultado depende del orden de llegada de la query y del algoritmo de sort, y la grilla puede bailar entre un render y otro. Para el modo `manual`, el comparador *es* el desempate.

En `best_selling`, los productos sin ventas en la ventana van todos después de los que vendieron, entre sí en orden manual. La RPC solo devuelve los que vendieron algo.

## Decisión 6 — Ventana y límite de "Más vendidos"

`getTopSellers(storeId, days = 30, limit = 10)` ya existe y alimenta la fila "Lo más pedido". Para ordenar hace falta la lista completa, no el top 10.

Se hace **una sola llamada** con `limit` alto (500, por encima de cualquier catálogo real) cuando al menos una sección resuelve a `best_selling`, y la fila de destacados usa `.slice(0, 10)` del mismo resultado. Si ninguna sección usa el modo, se mantiene la llamada con `limit = 10` de hoy. Nunca dos RPCs.

La ventana de 30 días se hereda tal cual. Es corta a propósito: "más vendidos" tiene que reflejar lo que se vende ahora, no el acumulado histórico, que se congela y deja de moverse.

## Decisión 7 — El arrastre se apaga cuando el modo no es manual

En `ProductsPanel`, si la sección resuelve a un modo automático, la lista se renderiza sin el handle de arrastre y con una nota que dice en qué orden está y desde dónde se cambia.

La alternativa —dejar arrastrar y guardar el `position` igual— produce el peor resultado posible: la acción parece funcionar, se persiste, y la tienda no cambia. Es la misma clase de bug que el arreglado en `51e724e`, con el agravante de que ahí había una causa técnica y acá sería una decisión de diseño.

El `position` **se sigue guardando y no se destruye**: volver el modo a manual devuelve el orden que la dueña había armado.

## Decisión 8 — Sin gating por plan

Los tres planes lo tienen. Ordenar un catálogo por precio no es una capacidad premium, es la expectativa mínima de cualquiera que vio una tienda online. Además el problema que resuelve aparece con volumen, y el volumen ya está gateado: el alta masiva es Pro y los límites de productos por plan viven en `getPlanLimits`.

## Alternativas descartadas

- **Materializar el orden en `position` al elegir el modo** (recalcular y escribir todas las posiciones). Convierte un cambio de configuración en una escritura masiva, se desactualiza en cuanto cambia un precio o entra stock, y destruye el orden manual previo sin vuelta atrás.
- **Ordenar en la query de Supabase** con `.order()` dinámico. No sirve: el criterio es por sección, no por tienda, y el precio efectivo con promo no es una columna.
- **Ordenar en `StoreClient` con un `useMemo`**. Duplicaría la lógica en la grilla por secciones y en la grilla filtrada, correría en cada render y mandaría el HTML inicial desordenado.
