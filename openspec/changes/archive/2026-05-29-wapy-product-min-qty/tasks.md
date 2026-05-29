## 1. Migración DB

- [x] 1.1 Crear `supabase/migrations/0NN_product_min_qty_and_step.sql` (chequear próximo número)
- [x] 1.2 `ALTER TABLE products ADD COLUMN min_quantity int NOT NULL DEFAULT 1 CHECK (min_quantity >= 1);`
- [x] 1.3 `ALTER TABLE products ADD COLUMN qty_step int NOT NULL DEFAULT 1 CHECK (qty_step >= 1);`
- [ ] 1.4 Aplicar localmente (`supabase db reset` o `supabase migration up`) y verificar con `\d products`

## 2. Tipos y resolver del storefront

- [x] 2.1 Agregar `min_quantity` y `qty_step` al tipo `UIProduct` (donde sea que viva — `lib/storefront/resolve.ts` o `types/`)
- [x] 2.2 Incluir las columnas en el SELECT de `resolveStoreSlug()` (`lib/storefront/resolve.ts`)
- [x] 2.3 Asegurar que los tipos serializados al cliente reflejan los nuevos campos

## 3. Dashboard: form de producto

- [x] 3.1 Localizar el form de crear/editar producto (`app/dashboard/...` — exacto pendiente)
- [x] 3.2 Agregar dos inputs numéricos: "Cantidad mínima" (default 1, min 1) y "Vender de a" (default 1, min 1)
- [x] 3.3 Helper text debajo: "Ej.: para vender empanadas por docena, poné mínimo 12 y de a 6."
- [x] 3.4 Validación cliente: enteros ≥ 1; warning blando (no error) si `min_quantity < qty_step` (ej. min=5, step=10 nunca alcanza el mínimo limpio)
- [x] 3.5 Server Action de upsert: persistir los campos con defaults si no vienen

## 4. Storefront — card

- [x] 4.1 En `ProductCardClient.tsx`, agregar render del sub-label "Mín. N, de a M" cuando `min_quantity > 1` o `qty_step > 1`
- [x] 4.2 Modificar el handler "Agregar" para que use `quantityToAdd(product, currentInCart)` que devuelve `min_quantity` si vacío, sino `qty_step`
- [x] 4.3 Verificar comportamiento idéntico al actual para productos con 1/1

## 5. Storefront — modal

- [x] 5.1 En `ProductModal` (`StoreClient.tsx:639`), agregar lógica de qty inicial: si `existingQty === 0`, inicial = `min_quantity`; sino, inicial = `qty_step`
- [x] 5.2 Botones +/- usan `qty_step` como increment/decrement
- [x] 5.3 "-" deshabilitado o no baja si la operación dejaría la suma < `min_quantity`
- [x] 5.4 Botón "Agregar" se deshabilita con label claro si la qty propuesta + existing < `min_quantity`
- [x] 5.5 Sub-label "Mín. N, de a M" cerca del precio o debajo del nombre cuando aplica

## 6. CartContext + CartDrawer

- [x] 6.1 En `CartContext`, agregar helper `nextQtyAfterDecrement(item, products)`: si `item.quantity - product.qty_step < product.qty_step`, devolver 0 (signal de remove); sino devolver el resultado
- [x] 6.2 En `CartDrawer`, los controles +/- por item: "+" suma `qty_step`; "-" usa el helper, si devuelve 0 transforma el botón en "Quitar" y llama `removeItem`
- [x] 6.3 Visual del "Quitar": icono de basura o texto pequeño, accesible (`aria-label`)

## 7. Server Action `createPendingOrder` — validación

- [x] 7.1 En `lib/store/orders/actions.ts`, antes de insertar:
- [x] 7.2 Cargar `products.min_quantity` y `products.qty_step` para todos los `product_id` involucrados (single query)
- [x] 7.3 Agrupar items del carrito por `product_id`, sumar quantities
- [x] 7.4 Validar `sum >= min_quantity` y `sum % qty_step === 0` por grupo
- [x] 7.5 Si alguno falla, devolver `{ error: 'qty_violation', productId, productName, min, step }` (sin transaction; sólo SELECT antes del INSERT)
- [ ] 7.6 Tests unitarios: 3 casos (mínimo ok / mínimo violado / step violado)

## 8. Cliente: manejo de error `qty_violation`

- [x] 8.1 En el botón "Comprar por WhatsApp" del `CartDrawer`, si `createPendingOrder` devuelve `qty_violation`, mostrar `toast.error(\`Necesitás al menos \${min} unidades de '\${productName}' para comprar.\`)` y NO abrir wa.me
- [x] 8.2 Mismo manejo en el botón "Compartí tu pedido" (del change growth): pre-validar antes de armar el share (suma agregada por producto, si viola mínimo bloquear)

## 9. Edge cases

- [x] 9.1 Producto con variantes y min/step: validación server-side suma TODAS las variantes del producto, no por variante
- [ ] 9.2 CSV de productos: si las columnas no vienen en el CSV de importación, asumir defaults (1/1); si vienen, validar enteros ≥ 1
- [x] 9.3 Duplicar producto (en el dashboard) clona también min/step
- [x] 9.4 Si el dueño actualiza el `min_quantity` mientras un cliente tiene items en el carrito, el carrito **no se invalida automáticamente** — el cliente lo descubre al cerrar el pedido (es OK, cantidad de tráfico es bajo en Wapy hoy)

## 10. QA manual (preview)

- [ ] 10.1 Crear un producto con `min=12, step=6`, otro con `min=1, step=6` (six-pack), otro con defaults
- [ ] 10.2 Card del producto 12/6 muestra "Mín. 12, de a 6"
- [ ] 10.3 Click en "Agregar" del 12/6: carrito queda con 12; click otra vez: queda con 18
- [ ] 10.4 Abrir modal del 12/6 con carrito vacío: qty inicial = 12; "+" lleva a 18; "-" deshabilitado o queda en 12
- [ ] 10.5 Abrir modal del 12/6 con 12 ya en el carrito: qty inicial = 6; "+" lleva a 12; "-" deshabilita
- [ ] 10.6 Carrito con 12 empanadas: "-" baja a 6; nuevo "-" se transforma en "Quitar"; remueve el item
- [ ] 10.7 Intentar comprar con 6 empanadas: bloquea, toast con nombre del producto y mín. 12
- [ ] 10.8 Producto 1/1 sigue como antes: agrega 1, decrementa hasta quitar
- [ ] 10.9 Producto con dos variantes y min=12: 6 de A + 6 de B en carrito → checkout pasa (suma 12)
- [ ] 10.10 Server-side validation testeable via curl/SQL: forzar payload inválido → `qty_violation` esperado
