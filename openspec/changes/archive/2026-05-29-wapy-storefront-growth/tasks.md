## 1. Migración DB: RPCs + grants

- [x] 1.1 Crear migración `supabase/migrations/0NN_storefront_insights_rpcs.sql` (chequear próximo número en `supabase/migrations/`)
- [x] 1.2 Definir `storefront_top_sellers(p_store_id uuid, p_days int default 30, p_limit int default 10)` `STABLE SECURITY DEFINER` con validación de `stores.status='published'` y query agregando `order_items` joineado a `orders` con status confirmed/delivered y ventana de días
- [x] 1.3 Definir `storefront_co_purchased(p_product_id uuid, p_store_id uuid, p_limit int default 6)` `STABLE SECURITY DEFINER` con la CTE de órdenes que contienen el target + agregado de co-pedidos excluyendo el target
- [x] 1.4 `GRANT EXECUTE` a `anon` y `authenticated` sobre ambas funciones
- [x] 1.5 Verificar índices: `idx_order_items_product_id` (probablemente ya existe por el FK), `idx_orders_store_status_created` ya tiene `(store_id, status)` y `(store_id, created_at DESC)`; si falta `(store_id, status, created_at DESC)` agregarlo
- [ ] 1.6 Aplicar migración localmente (`supabase db reset` o `supabase migration up`) y validar con SQL editor que las funciones retornan resultados esperados sobre seed data

## 2. Tipos y módulo de insights

- [x] 2.1 Crear `lib/storefront/insights.ts` con función `getTopSellers(storeId: string, days?: number, limit?: number): Promise<string[]>` (devuelve ids ordenados)
- [x] 2.2 Implementar `getRelatedProductIds(productId: string, storeId: string, limit?: number): Promise<string[]>` con `"use server"` para uso desde cliente
- [x] 2.3 Ambas funciones usan Supabase anon client (`createServerClient` sin auth o admin si necesario; la RPC con SECURITY DEFINER acepta anon) via `.rpc('storefront_top_sellers', {...})`
- [x] 2.4 Manejar errores: catch + log + return `[]` (silencioso para no romper SSR si la DB tiembla)

## 3. Server Component: integración SSR

- [x] 3.1 En `app/[slug]/page.tsx`, después de `resolveStoreSlug`, llamar `getTopSellers(store.id)` en paralelo
- [x] 3.2 Mapear los ids resultantes a `UIProduct` del catálogo cargado, filtrando los inactivos. Pasar como prop `topSellerProducts: UIProduct[]` a `StoreClient`
- [x] 3.3 Si hay `searchParams.p` válido y matchea un producto, llamar `getRelatedProductIds(p, store.id)` en paralelo y pasar `initialRelatedIds: string[]` a `StoreClient`
- [x] 3.4 Las dos llamadas RPC se ejecutan en `Promise.all` para no bloquear el SSR secuencialmente

## 4. TopSellers component

- [x] 4.1 Crear `app/[slug]/TopSellers.tsx`. Props: `products: UIProduct[]`, `accentColor: string`, `variantsByProduct`, `onOpenModal`
- [x] 4.2 Render condicional: si `products.length < 3`, devolver `null`
- [x] 4.3 Sino, renderizar título "Lo más pedido" + grid: mobile scroll horizontal con snap, desktop 4 columnas
- [x] 4.4 Cada item es `<ProductCardClient />` con los mismos props que en el catálogo principal (carrito, variantes, etc.)
- [x] 4.5 Render en `StoreClient` después del hero y antes del primer bloque de secciones del catálogo

## 5. RelatedProducts component (mini-cards)

- [x] 5.1 Crear `app/[slug]/RelatedProducts.tsx`. Props: `relatedIds: string[]`, `products: UIProduct[]`, `onSelect: (p: UIProduct) => void`
- [x] 5.2 Mapear `relatedIds → UIProduct[]` filtrando los no encontrados/inactivos. Si quedan 0, devolver `null`
- [x] 5.3 Render: título "Quienes lo pidieron, también pidieron…" + fila horizontal scrollable (mobile + desktop) de mini-cards
- [x] 5.4 Mini-card: imagen 80x80 cuadrada, nombre (truncado a 2 líneas), precio. Click → `onSelect(p)`. Sin selector de variantes, sin botón agregar.
- [x] 5.5 Hover/focus accesible con el accent color

## 6. StoreClient: integrar relacionados en el modal

- [x] 6.1 Aceptar prop nueva `initialRelatedIds: string[]` (default `[]`)
- [x] 6.2 Mantener un `Map<string, string[]>` de relacionados ya fetcheados (cache en memoria por modal session)
- [x] 6.3 Cuando el modal abre y no hay relacionados en cache para ese producto, llamar `getRelatedProductIds(p.id, storeId)` y guardar resultado en el Map
- [x] 6.4 Construir el `relatedSlot` para `ProductModal` como `<RelatedProducts relatedIds={ids} products={products} onSelect={setModalProduct} />`
- [x] 6.5 Para el deep-link inicial, hidratar el Map con `initialRelatedIds` antes del primer render del modal (evita flicker)
- [x] 6.6 Al cambiar de un modal a otro via click en relacionado, actualizar URL via el mismo flujo del discovery change (`router.replace`)

## 7. ShareCartButton component

- [x] 7.1 Crear `app/[slug]/ShareCartButton.tsx` (client). Props: `storeName: string`, `slug: string`, `items: CartItem[]`, `total: number`, `accentColor: string`
- [x] 7.2 Función `buildShareText()`: pieza por pieza, items con cantidad + subtotal en ARS, total, link `https://wapy.com.ar/<slug>`
- [x] 7.3 onClick: intentar `await navigator.share({ text, url })`, si falla o no existe, fallback a `window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank')`
- [x] 7.4 Estilo: botón secundario con icono (lucide `Share2` o `MessageCircle`), label "Compartí tu pedido"
- [x] 7.5 Insertar en `CartDrawer` (`StoreClient.tsx:850+`) arriba o al lado del botón "Comprar por WhatsApp", visible sólo si `items.length > 0`
- [x] 7.6 Verificar que el botón NO dispara `createPendingOrder` (no toca DB)

## 8. Edge cases y polish

- [x] 8.1 Cuando el modal cambia de producto via click en relacionado, asegurar que el estado interno (qty selector) se resetea
- [x] 8.2 Si `initialRelatedIds` es no-vacío pero los productos referenciados no están en el catálogo cargado (raro: data inconsistency), el componente devuelve `null` sin error
- [x] 8.3 Mensaje vacío para "Compartí" si por algún bug `items` quedó vacío (defensa): no abrir share, no error
- [x] 8.4 Loading state mínimo en relacionados cuando se llaman via click (no SSR): mostrar 3 skeletons hasta que llegue la respuesta
- [x] 8.5 Logs: usar `console.warn` (no error) si las RPCs fallan, para no llenar Sentry con falsos positivos

## 9. QA manual (preview deploy)

- [ ] 9.1 Crear seed o usar tienda existente con ≥ 5 órdenes confirmed/delivered en los últimos 30 días sobre 3+ productos
- [ ] 9.2 Verificar "Lo más pedido" aparece, productos correctos en orden de unidades
- [ ] 9.3 Verificar que en una tienda nueva (sin órdenes) el bloque NO aparece
- [ ] 9.4 Verificar productos relacionados al abrir un producto con co-pedidos: aparecen, click navega entre modales
- [ ] 9.5 Verificar producto sin co-pedidos: no muestra el bloque
- [ ] 9.6 Deep-link `?p=<id>` con relacionados: aparecen en primer paint (sin loading visible)
- [ ] 9.7 Botón "Compartí tu pedido" en mobile: abre share-sheet con texto correcto
- [ ] 9.8 Botón "Compartí tu pedido" en desktop: abre WhatsApp Web (wa.me) con texto correcto
- [ ] 9.9 El texto del share contiene: nombre tienda, items con cantidades y subtotales, total, link `https://wapy.com.ar/<slug>`
- [ ] 9.10 El share NO crea órdenes en `orders` (chequear en SQL después del click)
- [ ] 9.11 Validar perf de SSR con tienda con 1000+ órdenes: top sellers responde <100ms

## 10. Cleanup

- [ ] 10.1 Documentar en README o `openspec/specs/public-storefront/spec.md` (post-archive) que los insights derivan de órdenes confirmed/delivered, ventana 30 días
- [ ] 10.2 Revisar que las RPCs no tienen dependencias indirectas que rompan otro change (chequear con `\df+` en psql)
