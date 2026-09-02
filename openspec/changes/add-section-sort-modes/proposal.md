## Why

El orden de los productos en la tienda pública es **manual y nada más**: `lib/storefront/resolve.ts:98` los trae con `.order('position')` y el storefront respeta ese array tal cual. La única forma de cambiarlo es arrastrar de a un producto en el dashboard.

Eso no escala con la forma en que hoy se cargan los catálogos. El alta masiva por ZIP admite hasta 150 fotos de una sola vez (`MAX_PHOTOS_PER_ZIP`), y esos 150 productos nacen en el orden alfabético del ZIP. Dejar una sección ordenada por precio significa 150 arrastres. En la práctica nadie lo hace: el catálogo queda en el orden en que se importó.

El orden manual sigue siendo el correcto para secciones curadas — "Destacados", "Combos", una vidriera de 6 productos donde el orden es una decisión de venta. El problema es que hoy es la **única** opción, para las 6 y para las 150.

## What Changes

- Cada sección puede elegir cómo ordena sus productos: **Manual** (como hoy), **Precio ↑**, **Precio ↓**, **Nombre A-Z**, **Más nuevos primero** y **Más vendidos**.
- Nueva columna `sections.sort_mode` (text, **nullable**). Nulo significa "heredar el default de la tienda", que vive en `stores.default_product_sort` (text, NOT NULL, default `'manual'`). Así se elige "precio ascendente" una vez para todo el catálogo y se ajustan a mano solo las secciones que se quieren curadas.
- Nuevo toggle **"Mostrar los productos sin stock al final"** (`stores.out_of_stock_last`, boolean, default `true`). Es **ortogonal al modo de orden**: se aplica encima de cualquiera de los seis, manual incluido. No es un modo más porque no compite con ellos — un catálogo puede querer precio ascendente *y* los agotados al final.
- El orden por precio usa el **precio efectivo** (el que muestra la card, con promo aplicada), no `price_cents`. Ordenar por precio de lista pondría un producto con promo a $2.000 entre los de $5.000, contradiciendo el número que se ve en pantalla.
- En el dashboard, cuando la sección está en un modo automático, **el arrastre se apaga** con una explicación. Sin eso el arrastre guardaría un `position` que la tienda ignora: exactamente el síntoma del bug corregido en `51e724e`, pero esta vez sin causa visible.
- Todo el orden se resuelve **en el servidor**, una sola vez por request, sobre el array de productos que ya viaja a `StoreClient`. No hay componente nuevo ni estado nuevo en el cliente.

Fuera de alcance, explícitamente:
- **Selector de orden para el visitante.** Un "Ordenar por" en la barra de filtros es un feature distinto: opera sobre la grilla plana filtrada, no sobre una sección, y necesita persistencia en la URL como el resto de `CatalogFilters`. Se puede construir después encima de estas mismas funciones de orden.
- **Gating por plan.** El orden de una sección es usabilidad básica del catálogo, no una capacidad premium; entra en los tres planes. Si más adelante se quiere reservar "Más vendidos" para Pro, el punto de corte natural es `getPlanLimits`.
- **Productos sin sección.** Hoy `visibleProductsBySection` solo mapea secciones existentes, así que un producto con `section_id = NULL` no se renderiza en la tienda. Este change no cambia eso.

## Capabilities

### Modified Capabilities
- `public-storefront`: se agrega el orden configurable de productos dentro de cada sección, el criterio de precio efectivo y la partición por disponibilidad de stock.
- `owner-dashboard`: la dueña configura el modo de orden por sección y el default de tienda, y el arrastre manual queda condicionado al modo activo.

## Impact

**Base de datos**
- Migración nueva (`040`): `sections.sort_mode` (text, nullable, CHECK contra los seis valores), `stores.default_product_sort` (text, NOT NULL, default `'manual'`, mismo CHECK) y `stores.out_of_stock_last` (boolean, NOT NULL, default `true`).
- Sin backfill: las secciones existentes quedan en NULL y heredan `'manual'`, que es su comportamiento actual.
- El trigger `prevent_billing_column_writes` (migración 027) aplica solo a columnas de facturación de `stores`; hay que verificar que no bloquee el UPDATE de las dos columnas nuevas.

**Código**
- `lib/storefront/sorting.ts` (nuevo) — el módulo puro con los seis comparadores, la partición por stock y la resolución sección → modo efectivo.
- `app/[slug]/page.tsx` — ordena `resolution.products` antes de pasarlo a `StoreClient`; sube el `limit` de `getTopSellers` cuando alguna sección usa "Más vendidos".
- `app/[slug]/filters.ts` — exportar `isInStock`, hoy privada, para no tener dos definiciones de "hay stock".
- `app/dashboard/components/SectionsPanel.tsx` — un select de orden por fila de sección.
- `app/dashboard/components/SettingsPanel.tsx` — el default de tienda y el toggle de sin-stock.
- `app/dashboard/components/ProductsPanel.tsx` — el arrastre se deshabilita según el modo de la sección.
- `lib/store/actions.ts` — `saveStoreSections` persiste `sort_mode`; acción nueva para las dos preferencias de tienda.
- `lib/supabase/types.ts` — regenerar.

**Cambio de comportamiento observable en tiendas existentes**
- `out_of_stock_last` arranca en `true`, así que las tiendas que hoy tienen productos agotados intercalados los van a ver moverse al final del bloque. Es el único cambio visible sin que la dueña toque nada, y es deliberado: es lo que hace cualquier catálogo serio y nadie lo va a ir a buscar a la configuración.
- Ninguna otra cosa cambia por omisión: sin `sort_mode` y sin `default_product_sort`, el orden sigue siendo `position`.

**Sin impacto**
- El carrito, el checkout, el mensaje de WhatsApp, MP y el snapshot de la orden no leen el orden del catálogo.
- `TopSellers` y `RelatedProducts` traen su propio orden desde sus RPCs y no se tocan.
