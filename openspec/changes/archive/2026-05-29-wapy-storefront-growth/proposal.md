## Why

Una vez que el storefront tiene buen discovery (`wapy-storefront-discovery`), el siguiente cuello para mover la aguja con dueños de tienda es **crecimiento data-driven** sin esfuerzo del dueño. Los dueños no van a mantener manualmente secciones de "más vendidos" ni "comprá esto con esto". Si lo hacemos automático a partir de `order_items`, el storefront se vuelve más persuasivo por sí solo a medida que vende.

Además, el share por WhatsApp actual sólo manda el pedido del cliente **al dueño** (es el checkout). Falta el ángulo viral: que el cliente reenvíe su carrito a un grupo o amigo antes de comprar, llevando tráfico nuevo al storefront.

## What Changes

- **Share viral del carrito**: botón nuevo "Compartí tu pedido" dentro del carrito drawer, separado del "Comprar por WhatsApp" actual. Abre WhatsApp (o el share-sheet nativo del SO) con un mensaje pre-armado: nombre de tienda, lista de items con cantidades y precios, total, y link a la tienda (`https://wapy.com.ar/<slug>`). No persiste estado del carrito en DB — el mensaje es texto plano + link a la tienda en general (no al carrito reconstruido). El "Comprar" actual queda intacto.
- **Sección "Lo más pedido"**: bloque automático en el storefront público que muestra los N productos más pedidos de la tienda en los últimos 30 días, derivado de `order_items` filtrado a órdenes con `status IN ('confirmed','delivered')` (no contamos `pending` para no inflar con carritos abandonados). Si no hay datos suficientes (< 3 productos vendidos), el bloque NO se renderiza. Aparece debajo del hero, antes de las secciones del catálogo.
- **Productos relacionados en el modal de detalle**: dentro del modal, debajo del bloque "Agregar al carrito" (usando el slot reservado por `wapy-storefront-discovery`), mostrar 3-6 productos relacionados al actual. La relación se calcula por **co-pedidos**: productos que aparecen juntos en las mismas órdenes confirmadas/delivered. Si no hay co-pedidos para ese producto, no se renderiza el bloque (sin fallback en este change — agregar fallback "misma sección" se evaluará si el data layer no rinde).
- **RPCs Postgres** para "top sellers" y "co-purchased": funciones SQL accesibles desde el cliente anon (o desde Server Components con admin client, según seguridad) que devuelven los rankings sin requerir cron ni cache. Indexes apropiados sobre `order_items(product_id)` y `orders(store_id, status, created_at)`.

## Capabilities

### New Capabilities
- _none — todo extiende capabilities existentes_

### Modified Capabilities
- `public-storefront`: agrega botón de share viral en el carrito drawer, sección "Lo más pedido" en el storefront, y productos relacionados (co-pedidos) en el modal de detalle (consumiendo el slot del discovery change).

## Impact

- **Código afectado**:
  - `app/[slug]/StoreClient.tsx` — render del bloque "Lo más pedido" y botón "Compartí tu pedido" en el `CartDrawer`.
  - `app/[slug]/page.tsx` (Server Component) — fetch de top sellers y de productos relacionados para el producto inicial (si hay `?p=<id>`), pasar a `StoreClient`.
  - Nuevos componentes: `app/[slug]/TopSellers.tsx`, `app/[slug]/RelatedProducts.tsx`, `app/[slug]/ShareCartButton.tsx`.
  - `lib/storefront/resolve.ts` (o un módulo nuevo `lib/storefront/insights.ts`) — funciones que llaman a las RPCs para top sellers y co-purchased.
- **Datos / DB**:
  - **Migración nueva** con:
    - RPC `storefront_top_sellers(p_store_id uuid, p_days int default 30, p_limit int default 10) returns table(product_id uuid, units_sold bigint)` — SQL function `STABLE`, `SECURITY INVOKER` (respeta RLS). Suma `quantity` de `order_items` joineado a `orders` con status confirmed/delivered y `created_at >= now() - interval`.
    - RPC `storefront_co_purchased(p_product_id uuid, p_store_id uuid, p_limit int default 6) returns table(product_id uuid, co_orders bigint)` — encuentra productos que aparecen en las mismas órdenes que el producto dado.
    - Índices: `idx_order_items_product_orders` sobre `order_items(product_id, order_id)` si no existe; `idx_orders_store_status_created` sobre `orders(store_id, status, created_at DESC)` ya existe parcialmente (verificar).
  - GRANT execute sobre las RPCs a `anon` y `authenticated`. Las RPCs respetan RLS via `SECURITY INVOKER` y filtran por `store_id` explícitamente.
- **Performance**:
  - Top sellers se ejecuta en cada SSR de la home → query sobre tabla potencialmente grande. Para Fase 2 de Wapy (volumen bajo) está OK; cuando se requiera, agregar materialized view + refresh cada hora.
  - Co-purchased corre en el SSR cuando hay `?p=<id>` deep-link, y en cliente cuando el usuario abre un modal manualmente. Cliente puede llamar a Server Action o tener un endpoint dedicado — decisión en design.md.
- **Privacidad**: las RPCs no exponen identidad de compradores ni cantidades por orden, sólo agregados por producto. No hay riesgo de leak.
- **Lo que NO se toca**:
  - Schema base de `orders`, `products`, `order_items`.
  - El share por WhatsApp existente al dueño (que cierra la orden).
  - Modal estructural — sólo se consume el `relatedSlot` ya reservado.

## Dependencies

- **Requiere** `wapy-storefront-discovery` aplicado (para tener el slot del modal y el sistema de URL params). Si por algún motivo este change se aplica primero, los productos relacionados quedarían inline en `ProductModal` sin el wiring del slot.
