## 1. Base de datos

- [x] 1.1 Crear migración SQL con tablas `product_option_types`, `product_option_values`, `product_variants` (incluyendo `deleted_at`), `product_variant_option_values` con FKs, índices y constraints (ver D1 del design) → `supabase/migrations/021_product_variants.sql`
- [x] 1.2 Agregar columna `variant_id` (uuid, nullable, FK a `product_variants.id`) a `order_items`
- [x] 1.3 Agregar columnas `price_at_purchase` (int en cents, not null, default 0) y `variant_label` (text, nullable) a `order_items` para snapshot
- [x] 1.4 Habilitar RLS en las 4 tablas nuevas con políticas: owner CRUD, lectura pública (anon) condicionada a `p.is_active=TRUE` y `s.status='published'`, y superadmin all (espejado del patrón de `products`)
- [x] 1.5 Migración aplicada al proyecto Wapy (id `gtiujuarwoatjekmljhn`) — name `product_variants`
- [x] 1.6 Tipos TypeScript actualizados manualmente en `lib/supabase/types.ts`. Tras aplicar la migración remota conviene regenerar desde el schema vivo

## 2. Server Actions: dominio de variedades

- [x] 2.1 Crear módulo `actions/variants.ts` (o ubicación equivalente al patrón actual de `actions/products.ts`)
- [x] 2.2 Implementar `upsertProductOptions({ productId, optionTypes })` que crea/actualiza tipos, valores y genera la matriz de variedades inicial (D5). Validaciones: nombre único por producto, valor único por tipo, max 32 chars, cap 25 variedades, al menos 1 valor por tipo
- [x] 2.3 Implementar `updateVariant({ variantId, stock, priceOverride, imageUrl })` con validaciones (stock ≥ 0, precio ≥ 0 o null)
- [x] 2.4 Implementar `addOptionValue({ optionTypeId, value })` que crea variedades nuevas para la matriz sin tocar las existentes
- [x] 2.5 Implementar `removeOptionValue({ optionValueId })` con lógica de soft-delete vs hard-delete según si las variedades aparecen en `order_items` (D5)
- [x] 2.6 Bloquear `addOptionType` cuando el producto ya tiene variedades (devolver error explícito; UI lo muestra)
- [x] 2.7 Implementar `uploadVariantImage({ variantId, file })` usando admin client de Supabase Storage (no client-side; path `store_id/product_id/variant_id/`)

## 3. Server Actions: integración con carrito y checkout

- [x] 3.1 Extender la action existente "agregar al carrito" para aceptar `variantId` opcional; validar que el producto tenga (o no) variedades según corresponda
- [x] 3.2 Extender la action de confirmar pedido para descontar stock atómicamente: `update product_variants set stock = stock - :qty where id = :variant_id and stock >= :qty returning stock`, todo dentro de una transacción que agrupe todos los items (D4)
- [x] 3.3 Asegurar que el descuento de stock sobre producto simple (sin variant_id) sigue funcionando como hoy
- [x] 3.4 Poblar snapshot en `order_items`: `price_at_purchase` y `variant_label` al crear cada line item (D3)
- [x] 3.5 Extender la action de duplicar producto para clonar tipos de opción, valores, variedades (preservando stock, precio override e imagen de cada variedad) y relaciones (D8); imágenes referencian las mismas URLs sin copia física

## 4. Dashboard: form de producto con variedades

- [x] 4.1 Crear componente `<VariantsSection>` en el form de alta/edición de producto con CTA inicial "Agregar tipo de opción"
- [x] 4.2 UI para definir tipos de opción (nombre + lista de valores con chips agregables/eliminables, drag-to-reorder por `position`)
- [x] 4.3 Renderizar tabla editable de variedades: una fila por combinación, columnas: combinación (read-only), stock, precio opcional (placeholder = precio del producto), imagen opcional (uploader)
- [x] 4.4 Ocultar el input de stock del producto cuando hay al menos una variedad; reemplazar por resumen agregado read-only (suma de stocks de variedades)
- [x] 4.5 Bloquear en UI agregar nuevo tipo de opción si ya hay variedades, con mensaje "borrá las variedades existentes para cambiar la dimensionalidad" (D5)
- [x] 4.6 Wire-up con Server Actions: `upsertProductOptions`, `updateVariant`, `addOptionValue`, `removeOptionValue`, `uploadVariantImage`
- [x] 4.7 Validación cliente espejo de la del server (stock ≥ 0, precio ≥ 0, longitud, cap 25 variedades) con mensajes claros

## 5. Storefront: selector inline en la card

- [x] 5.1 Crear/extender `ProductCardClient` (componente cliente) que recibe `product` y `variants` serializados
- [x] 5.2 Implementar state local `selectedValues` y lookup de variedad activa contra la matriz
- [x] 5.3 Render condicional: sin tipos de opción → card idéntica a hoy; con tipos → selectores inline (uno por tipo) más precio/imagen/stock de la variedad activa
- [x] 5.4 Deshabilitar valores que no producen combinación válida con la selección actual (D6)
- [x] 5.5 Deshabilitar botón "Agregar" cuando: selección incompleta, o stock 0 en la variedad activa
- [x] 5.6 Adaptar layout para mobile (swatch/segmented control compacto si hay 2 tipos × varios valores) — primer pase puede usar select nativo si el diseño se complica
- [x] 5.7 Wire-up del botón "Agregar" pasando `variantId` a la action del carrito

## 6. Carrito y pedidos: render

- [x] 6.1 Mostrar `variant_label` (combinación de valores) junto al nombre del producto en el carrito y en el detalle del pedido
- [x] 6.2 Asegurar que vistas históricas de pedidos usen el snapshot (`price_at_purchase`, `variant_label`) en vez de joinear contra producto/variedad actuales

## 7. Export CSV

- [x] 7.1 Extender el generador del export CSV para emitir una fila por variedad cuando el producto tenga variedades; productos simples siguen siendo una fila
- [x] 7.2 Columnas nuevas: combinación de valores (ej. `"Rojo / M"`), precio efectivo (override o herencia), stock de variedad
- [x] 7.3 Smoke test manual del CSV en Excel/Numbers con un mix de productos simples y con variedades
- [x] 7.4 Cablear botón "Exportar catálogo CSV" en `ProductsPanel.tsx` que invoca `exportProductsCsv()` y dispara descarga `catalogo-YYYY-MM-DD.csv` (mirror del patrón de `exportOrdersCsv` en `OrdersPanel.tsx`)

## 8. Observabilidad y errores

- [x] 8.1 Toasts (Sonner) de éxito/error para todas las acciones nuevas (crear tipo, agregar valor, guardar variedad, subir imagen, etc.) siguiendo el patrón existente
- [x] 8.2 Capturar en Sentry los errores de validación inesperados de las nuevas Server Actions (con contexto: productId, variantId)
  - [x] 8.A Bugfix UX: ProductModal del storefront oculta botón "Agregar" cuando el producto tiene variedades; muestra mensaje "Elegí una variedad en la card para agregar"
  - [x] 8.B Bugfix UX: CartDrawer stock warning usa stock de la variedad (clave compuesta productId::variantId) para items de variedad, en lugar del stock del producto

## 10. Fixes post-prod

- [x] 10.1 **Fix 1 — stock nullable**: migración `022_product_variants_stock_nullable.sql` — `product_variants.stock` pasa a nullable (null = sin tracking = stock infinito)
- [x] 10.2 **Fix 1 — tipos TS**: `lib/supabase/types.ts` y `lib/storefront/resolve.ts` actualizados para reflejar `stock: number | null` en `product_variants` y `StorefrontVariant`
- [x] 10.3 **Fix 1 — server actions**: `lib/variants/actions.ts` — `updateVariant` acepta `stock: number | null`; nuevas variedades creadas con `stock: null` en `upsertProductOptions` y `addOptionValue`
- [x] 10.4 **Fix 1 — checkout**: `lib/store/orders/actions.ts` — si `variant.stock === null` se omite validación y descuento atómico (mismo principio que `products.stock = null`)
- [x] 10.5 **Fix 1 — dashboard**: `VariantsSection.tsx` — input vacío = null (placeholder `∞`); resumen diferencia tracked vs sin tracking; validación cliente acepta null
- [x] 10.6 **Fix 1 — storefront**: `ProductCardClient.tsx` — `isOutOfStock` y `isLowStock` ya funcionan con null (sin cambios); confirmado por revisión de código
- [x] 10.7 **Fix 1 — CartDrawer**: `StoreClient.tsx` — `overStockedItems` ya filtra `stock !== null` correctamente; confirmado por revisión de código
- [x] 10.8 **Fix 1 — CSV**: `lib/store/exports/products.ts` — variedad con `stock = null` exporta columna Stock vacía
- [x] 10.9 **Fix 1 — spec**: `spec.md` actualizado con semantics de stock nullable y scenarios correspondientes
- [x] 10.10 ~~**Fix 2 — precio condicional**: `ProductCardClient.tsx` — precio oculto cuando la variedad activa no tiene `price_override`; visible en estado inicial (sin selección) y cuando hay override~~ **REVERTIDO** — usuario confirmó en prod que el precio debe mostrarse siempre; revertido a `justify-between` permanente con `formatARS(effectivePrice)` incondicional
- [x] 10.11 ~~**Fix 2 — spec**: `spec.md` actualizado con scenario de precio condicional~~ **REVERTIDO** — scenario "Variedad sin price_override oculta el precio en la card" eliminado de spec.md

## 11. Hardening post-incidente (tipos de opción sin valores)

- [x] 11.1 **Fix A — Path 2 `removeOptionValue`**: rechaza con error claro cuando se intenta borrar el último valor de un tipo. Mensaje: `"No se puede borrar el último valor de '{type_name}'. Si querés eliminar el tipo, usá 'Quitar tipo' en su lugar."`
- [x] 11.2 **Fix A — Path 4 nueva acción `removeOptionType`**: nueva server action en `lib/variants/actions.ts` que borra el tipo entero (cascade limpia values + variant_option_values); soft-delete de variantes en order_items históricos, igual que en `removeOptionValue`
- [x] 11.3 **Fix A — Wire-up UI**: botón "Quitar tipo" (con ícono X + label) en cada tarjeta de tipo en la vista de resumen de `VariantsSection.tsx`, usa `removeOptionType`
- [x] 11.4 **Fix B — Copy: input nombre del tipo**: label `"Nombre del tipo de opción"`, placeholder `"ej. Color, Talle, Versión"`, helper text: `"Es el nombre de la categoría que el cliente elige. Los valores específicos los cargás abajo."`
- [x] 11.5 **Fix B — Copy: input valores**: placeholder `"ej. Rojo"` (singular, concreto), helper text: `"Cada valor es una opción que el cliente puede elegir (ej. para 'Color': Rojo, Azul, Verde)"`
- [x] 11.6 **Fix B — Banner ilustrativo**: panel `Info` arriba de la sección cuando no hay tipos cargados (y en modo editor), con ejemplo de Color/Talle y generación automática de combinaciones
- [x] 11.7 **Fix B — Validación cliente**: `validateDraft` detecta tipos con 0 valores efectivos (incluyendo valores con solo espacios), mensaje: `"El tipo 'X' necesita al menos un valor. Agregalo antes de guardar."` — impide submit
- [x] 11.8 **Fix B — CTA label**: botón CTA cambiado a `"+ Agregar tipo (ej. Color, Talle)"` en vista vacía y en modo editor

## 9. Verificación end-to-end

- [ ] 9.1 Crear un producto simple en el dashboard y verificar que el storefront lo renderiza exactamente como antes (regresión)
- [ ] 9.2 Crear un producto con `Color = [Rojo, Azul]` y `Talle = [M, L]`, stock distinto en cada variedad, precio override solo en una y verificar matriz generada
- [ ] 9.3 Comprar una variedad desde el storefront público y verificar: descuento de stock atómico, snapshot en order_item, render del label en el carrito y pedido
- [ ] 9.4 Intentar comprar más unidades que el stock disponible y verificar rollback completo del pedido
- [ ] 9.5 Duplicar un producto con variedades y verificar: tipos+valores+variedades duplicados, stock y precio override preservados de cada variedad, imágenes referenciadas
- [ ] 9.6 Quitar un valor de opción que esté en un pedido histórico y verificar soft-delete (no se borra de DB, no aparece en storefront, pedido histórico sigue legible)
- [ ] 9.7 Probar RLS con usuario no-dueño: lectura pública OK en tienda pública, escritura rechazada
- [ ] 9.8 Exportar CSV con mix de productos simples y con variedades y verificar formato
