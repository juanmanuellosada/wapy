## Why

Hoy todos los productos del storefront se venden de a una unidad sin restricciones. Eso no calza con muchos rubros reales: empanadas se venden por docena, cervezas por six-pack, calcetines por par. Forzar al cliente a "poner 12" cuando el producto SÓLO existe por docena es fricción que pierde ventas y confunde el inventario.

Necesitamos que cada producto pueda declarar:
- **Cantidad mínima** (`min_quantity`): el mínimo de unidades que el cliente debe pedir para agregarlo al carrito.
- **Múltiplo / paso** (`qty_step`): el incremento permitido por encima del mínimo (1 por default; 6 para six-packs; 12 para docenas, etc.).

Esto se ofrece como configuración por producto desde el dashboard, y se valida tanto en la card del storefront como en el modal y en el carrito.

## What Changes

- **Schema**: agregar dos columnas a `products`:
  - `min_quantity int NOT NULL DEFAULT 1 CHECK (min_quantity >= 1)`
  - `qty_step int NOT NULL DEFAULT 1 CHECK (qty_step >= 1)`
- **Dashboard**: en el form de producto (crear/editar) agregar dos inputs:
  - "Cantidad mínima" (default 1).
  - "Vender de a" (default 1).
  - Con un helper text: "Ej.: para vender empanadas por docena, poné mínimo 12 y vender de a 6."
- **Storefront — Card**:
  - Si el producto tiene `min_quantity > 1` o `qty_step > 1`, mostrar un sub-label discreto bajo el nombre/precio: "Mín. 12, de a 6".
  - El botón "Agregar" añade `min_quantity` al carrito (no 1) si el item no estaba presente.
  - El selector inline de cantidad (si lo tiene en algún flujo) usa `qty_step` como increment y respeta `min_quantity` como floor.
- **Storefront — Modal**:
  - El selector de cantidad inicia en `min_quantity` y usa `qty_step` como increment/decrement.
  - Si el visitante intenta poner una cantidad por debajo del mínimo o que no es múltiplo, el botón "Agregar" se deshabilita con un tooltip/label que explica.
  - El "Quedan N" warning sigue funcionando sobre el stock disponible (`stock - existingQty`).
- **Storefront — Carrito**:
  - Los controles +/- por item usan `qty_step` y respetan `min_quantity` (no se puede bajar la cantidad por debajo del mínimo; en su lugar, el botón "-" cuando ya está en `min_quantity` se transforma en "Quitar" — remueve el item).
  - Al checkout, validar server-side en `createPendingOrder` que las cantidades respetan min/step de cada producto. Si no, devolver error `qty_violation` (mismo patrón que `stock_insufficient`) y mostrar toast.
- **Variantes**: cuando un producto tiene variantes, `min_quantity` y `qty_step` aplican al producto en su conjunto (no por variante). Esto es deliberadamente simple: la mayoría de los casos (docena, six-pack) no requieren reglas por variante. Si surge la necesidad, se evalúa en un change posterior.

## Capabilities

### New Capabilities
- _none — extiende capabilities existentes_

### Modified Capabilities
- `public-storefront`: el storefront SHALL respetar `min_quantity` y `qty_step` por producto al agregar al carrito, mostrar visualmente la restricción cuando aplica, y bloquear cantidades inválidas. El checkout SHALL validar server-side.
- `product-variants`: clarificar que `min_quantity` y `qty_step` aplican a nivel producto, no variante (en este change). Las variantes existentes siguen siendo válidas; sólo el escenario "min_quantity por variante" queda fuera.

## Impact

- **Código afectado**:
  - `app/[slug]/StoreClient.tsx` — modal: estado inicial de qty + increment con step.
  - `app/[slug]/ProductCardClient.tsx` — sub-label de min/step, qty inicial al agregar.
  - `app/[slug]/CartContext.tsx` — `setQty` validando step; `removeItem` cuando se baja al floor.
  - `lib/store/orders/actions.ts` (`createPendingOrder`) — validación de min/step antes de insertar.
  - Dashboard: form de producto (`app/dashboard/.../products/...` — ubicación exacta a verificar) con los dos inputs nuevos.
  - `lib/storefront/resolve.ts` — agregar `min_quantity` y `qty_step` al select de productos.
  - Tipos compartidos (donde estén): agregar a `Product` / `UIProduct`.
- **Datos**:
  - Migración `0NN_product_min_qty_and_step.sql` con `ALTER TABLE products ADD COLUMN min_quantity int NOT NULL DEFAULT 1 CHECK (min_quantity >= 1)` y equivalente para `qty_step`.
  - Backfill innecesario: defaults cubren productos existentes.
- **RLS**: sin cambios.
- **Variantes**: por scope, `min_quantity` y `qty_step` viven en `products`, no en `product_variants`. Si el producto tiene variantes, las reglas aplican al total agregado al carrito (todas las variantes del producto cuentan para el mínimo). Decisión clarificada en `design.md`.
- **Backwards compat**: defaults preservan el comportamiento actual (mínimo 1, paso 1). Productos existentes no cambian sin acción del dueño.

## Dependencies

- **No depende** de los otros changes propuestos en esta tanda. Puede aplicarse en cualquier orden.
- **Coexiste con** `wapy-product-variants` (ya 91/92). No se mete con el modelo de variantes.
