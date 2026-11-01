## 1. Migración de base de datos

- [x] 1.1 Crear `supabase/migrations/046_product_multibuy_offers.sql`: `products.multibuy_buy` / `multibuy_pay` (smallint NULL + CHECK de la Decisión 1) y `order_items.discount_cents int NOT NULL DEFAULT 0 CHECK >= 0` + `order_items.offer_label text NULL`
- [x] 1.2 Actualizar `lib/supabase/types.ts` a mano
- [x] 1.3 Aplicar la migración a prod (proyecto `wapy`). Aplicada 2026-11-01 vía MCP de Supabase; columnas verificadas, el advisor de seguridad no reporta nada nuevo.

## 2. Helper de pricing

- [x] 2.1 En `lib/store/pricing.ts`: `MultibuyOffer`, `multibuyLabel()`, `resolveProductLinePrices(lines, offer)` (Decisiones 2–4)
- [x] 2.2 Tests en `lib/store/pricing.test.ts`: sin oferta, 2x1 exacto, sobrantes, 3x2 con Q=7, variantes de precio distinto (bonifica la más barata), promo gana, NxM gana, empate, tramo gana

## 3. Cobro y snapshot

- [x] 3.1 `createPendingOrder`: traer `multibuy_buy/pay`, agrupar líneas por producto y resolver con `resolveProductLinePrices` sobre el resultado de `resolveTieredPrice`
- [x] 3.2 `totalCents` = suma de netos; cupón validado contra ese total
- [x] 3.3 `mp_items`: entrar por la distribución proporcional existente (Decisión 6); verificar reconciliación exacta
- [x] 3.4 Insertar `discount_cents` y `offer_label` en `order_items`

## 4. Consumidores de `order_items`

- [x] 4.1 Restar `discount_cents` en `lib/store/orders/margin.ts`, `OrdersPanel`, `app/[slug]/checkout/success/page.tsx`, webhook `mercadopago-orders` y cualquier otro cálculo de `unit_price × quantity`
- [x] 4.2 `OrdersPanel`: mostrar la etiqueta "2x1" y el descuento en la línea del pedido

## 5. Admin

- [x] 5.1 `product-validation.ts`: validar N/M
- [x] 5.2 `saveStoreProduct` / `bulkUpdateProducts`: aceptar `multibuy` opcional (`!== undefined`)
- [x] 5.3 `ProductModal`: selector de presets + personalizada + hint con ejemplo
- [x] 5.4 Duplicar producto copia la oferta
- [x] 5.5 `BulkEditGrid`: columna NxM, acción en lote aplicar/quitar, dirty/descarte

## 6. Storefront

- [x] 6.1 `resolve.ts` + tipo del payload público + `UIProduct.multibuy`
- [x] 6.2 Badge en `ProductCardClient` y modal de `StoreClient`
- [x] 6.3 Banner superior + filtro "Ver promos"; oculto con `under_construction` o sin ofertas

## 7. Carrito

- [x] 7.1 `CartItem` lleva `multibuy` y `regularPrice`; call-sites de `addItem`
- [x] 7.2 `computeCartLinePrices` agrupa por producto y usa `resolveProductLinePrices`; `ShareCartButton` lo reusa
- [x] 7.3 Línea "2x1 · −$X", aviso "sumá 1 más", mensaje de WhatsApp con descuento

## 8. Verificación

- [x] 8.1 `npx tsc --noEmit`
- [x] 8.2 `npx vitest run lib/store`
- [x] 8.3 `npm run build`
- [ ] 8.4 Prueba en navegador: 2x1 en un producto, banner visible, carrito y total WhatsApp/MP correctos
