## Context

El schema actual de `products` (008_sections_products.sql) no tiene noción de cantidad mínima ni de múltiplos. El selector de cantidad en el modal inicia en 1, incrementa de a 1, y `setQty` en `CartContext` acepta cualquier entero positivo. El carrito drawer no impone restricciones más allá del stock.

`createPendingOrder` en `lib/store/orders/actions.ts` valida stock (`stock_insufficient`) y crea la orden + items en una transacción. No valida cantidades mínimas / múltiplos.

Por separado, el change `wapy-product-variants` (91/92, esencialmente cerrado) introduce `product_variants` con stock por variante. Las decisiones de ese change asumen que un "item" del carrito es `(producto, variante?)` con su key compuesta.

## Goals / Non-Goals

**Goals:**
- Permitir al dueño declarar `min_quantity` y `qty_step` por producto desde el dashboard.
- Bloquear en UI y en checkout cualquier intento de agregar cantidades inválidas.
- Mantener el comportamiento actual para productos que no setean estos campos (defaults preservan 1/1).
- Solución simple, sin sobrediseñar para casos exóticos.

**Non-Goals:**
- `min_quantity` / `qty_step` por variante (todas las variantes comparten las reglas del producto).
- Reglas escalonadas (ej.: "comprá 10 a $X, 20 a $Y"). Eso es promociones, fuera de scope.
- Cantidad máxima por producto u orden. Si surge la necesidad, change separado.
- Mostrar "te faltan 4 para el mínimo" en el carrito (lo deja simple: si está por debajo, no deja agregar).

## Decisions

### D1. Schema: dos columnas en `products`, no tabla aparte

`ALTER TABLE products ADD COLUMN min_quantity int NOT NULL DEFAULT 1 CHECK (min_quantity >= 1); ADD COLUMN qty_step int NOT NULL DEFAULT 1 CHECK (qty_step >= 1);`

**Por qué**: son atributos atómicos del producto, no tienen historial ni varían por contexto. NOT NULL + DEFAULT 1 + CHECK para preservar el invariante.

### D2. Las reglas aplican al producto, no a la variante

Cuando un producto tiene variantes, todas las variantes del producto se cuentan juntas para verificar el mínimo. Ejemplo: empanadas de carne (variante A) y de pollo (variante B), el producto "Empanada" tiene `min_quantity=12`. El cliente puede agregar 6 de A + 6 de B = 12, y eso satisface el mínimo. No tiene que ser 12 de uno solo.

**Por qué**: refleja la realidad de un cliente que pide "una docena, surtidas". Si se quisiera "12 de la misma variante", sería más restrictivo y confunde.

**Cómo se mide en el carrito**: sumar `quantity` de todos los items cuyo `productId === <product>`, comparar contra `min_quantity`. Para `qty_step`, la suma debe ser múltiplo de `step`.

### D3. UX cuando el carrito está por debajo del mínimo

El visitante puede agregar de a una unidad por variante (el botón "+" en la card no fuerza a 12 si elige una variante distinta). Sin embargo, al intentar **comprar** (click en "Comprar por WhatsApp" o "Compartí tu pedido"), si algún producto está por debajo de `min_quantity`, el botón se bloquea con toast: "Necesitás al menos 12 unidades de 'Empanadas' para comprar."

**Por qué bloquear en checkout y no al agregar**: permitir agregar progresivamente respeta el mental model del cliente que arma su pedido. Bloquear sólo al cerrar evita frustración prematura.

**Alternativa descartada**: bloquear el botón "Agregar" individual hasta llegar al mínimo. Contra: el cliente no entiende por qué no puede agregar 1; aprende solo si lee el sub-label "Mín. 12".

### D4. Botón "+" en la card respeta `qty_step`

El primer click en "Agregar" añade `min_quantity` (o, si ya hay items del mismo producto, añade `qty_step`). Para productos sin restricciones (1/1), comportamiento idéntico al actual.

```ts
function quantityToAdd(product, currentQtyInCart) {
  if (currentQtyInCart === 0) return product.min_quantity;
  return product.qty_step;
}
```

### D5. Modal: cantidad inicial y step

Cuando se abre el modal:
- Si `existingQty === 0`: cantidad inicial = `min_quantity`.
- Si `existingQty > 0`: cantidad inicial = `qty_step` (lo que sumaría al agregar de nuevo).
- Botones +/- usan `qty_step`. El "-" no baja por debajo de `qty_step` (en el modal, donde la qty es "lo que sumás", el mínimo siempre es el step; el mínimo absoluto del carrito ya está garantizado por la suma).

**Edge case**: si `min_quantity = 12` y `qty_step = 6`, abrir el modal con 0 items previos arranca en 12. El "-" lo baja a 6 (que sería sumar 6 al carrito, dejando 6 < 12, lo cual viola el mínimo). Decisión: cuando el carrito quedaría < `min_quantity` tras la operación, el botón "Agregar" se deshabilita con label "Mín. 12 para agregar". Esto es coherente con D3 (validación al cerrar carrito), pero refuerza en el modal cuando es obvio.

### D6. Carrito: -/+ por item respeta step, "Quitar" cuando se llega al floor

En el `CartDrawer`, los controles por item:
- "+" suma `qty_step`.
- "-" resta `qty_step`. Si tras restar la qty queda < `qty_step`, el botón se convierte en "Quitar" (remueve el item de la lista). Esto evita estados intermedios inválidos.

**Por qué transformar "-" en "Quitar"**: keeps the model clean. Sin esto, el usuario podría quedar con qty=0 sin remover, o el reducer tiene que manejar transiciones a 0 = remove.

### D7. Validación server-side en `createPendingOrder`

Antes de insertar la orden, agrupar los items por `product_id`, sumar quantities, y para cada grupo validar:
- `sum_qty >= product.min_quantity`
- `sum_qty % product.qty_step === 0`

Si falla, devolver `{ error: 'qty_violation', productId, productName, min, step }` (sin insertar). El cliente recibe el error y muestra el toast con el nombre del producto.

**Por qué validar también server-side**: defensa en profundidad. El cliente puede ser modificado (devtools, navegación rara, race conditions). Server es la autoridad.

### D8. Dashboard: dos inputs nuevos en el form de producto

En el form de creación/edición de producto en el dashboard:
- Campo "Cantidad mínima" (input numérico, default 1, min 1).
- Campo "Vender de a" (input numérico, default 1, min 1).
- Helper text debajo de los dos: "Ej.: para vender empanadas por docena, poné mínimo 12 y de a 6."
- Validar en cliente: ambos ≥ 1, enteros.

**Tradeoff**: incluso para productos simples, el dueño verá dos inputs nuevos que probablemente no toque. Mitigación: defaults sensatos (1/1) y helper text que aclara.

### D9. UI: sub-label "Mín. 12, de a 6"

En la card (sólo cuando `min_quantity > 1` o `qty_step > 1`):
- Sub-label compacto: "Mín. 12" si sólo `min_quantity > 1`; "De a 6" si sólo `qty_step > 1`; "Mín. 12, de a 6" si ambos.
- Color: `var(--store-ink-muted)`, font-size más chico que el precio.

En el modal:
- Mismo sub-label cerca del precio o debajo del nombre.

## Risks / Trade-offs

- **[Riesgo]** Dueños existentes ven dos campos nuevos en el form de producto y no entienden qué son → **Mitigación**: helper text + defaults conservadores. La mayoría no necesita tocarlo.
- **[Riesgo]** Mostrar "Mín. 12" sin contexto puede confundir a clientes finales acostumbrados a comprar de a uno → **Aceptado**: es información necesaria; el dueño tiene la opción de no ponerlo (default 1).
- **[Trade-off]** La validación se centra al checkout, no por-add: clientes pueden armar carritos inválidos y descubrirlo recién al comprar → **Aceptado**: la fricción al armar es peor que la fricción al cerrar. Toast claro mitiga.
- **[Riesgo]** Productos con variantes y `min_quantity`/`qty_step` deliberadamente simples: si el dueño quiere reglas por variante, no puede → **Aceptado en este change**: si surge demanda real, extender modelo en un change futuro (columnas en `product_variants` que pisen las del producto).
- **[Riesgo]** El "Quitar" cuando llega al floor puede sorprender a clientes que quieren "bajar un poco la cantidad" → **Aceptado**: la alternativa (qty=0 sin remover) es peor; el cliente puede volver a agregar.
- **[Riesgo]** Race condition: cliente envía qty válida, server valida y produce, mientras tanto el dueño actualizó el `min_quantity` → la orden ya creada queda con qty < nuevo min → **Aceptado**: las órdenes ya creadas reflejan la configuración del momento; cambios futuros no las invalidan.

## Migration Plan

1. Crear y aplicar migración con las columnas + checks + defaults.
2. Modificar el form del dashboard para incluir los dos inputs (defaults 1/1, no rompen productos existentes).
3. Modificar `createPendingOrder` con la validación server-side.
4. Modificar la UI del storefront (card, modal, drawer) con los sub-labels y la lógica de step/min.
5. Deploy en preview. Validar con un producto seteado a `min_quantity=12, qty_step=6` que:
   - El form lo guarda correctamente.
   - La card muestra "Mín. 12, de a 6".
   - "+" desde la card agrega 12, después incrementa de a 6.
   - El modal abre con qty inicial = 12.
   - El carrito permite restar de a 6 hasta llegar a 6 y ahí se convierte en "Quitar".
   - El checkout bloquea si el carrito tiene 6 unidades de ese producto.
6. Rollback: revertir el código y dropear las columnas (los productos existentes pierden la config si ya la pusieron, pero schema vuelve al estado previo).

## Open Questions

- ¿El selector inline de variantes en la card debe respetar `min_quantity` al agregar la variante? Default: sí, el primer click en "Agregar" desde una variante también añade `min_quantity` al producto (variante seleccionada).
- ¿El dashboard muestra una advertencia si `min_quantity < qty_step`? (Caso raro: mín=5, paso=10 → no se puede llegar nunca al mínimo con un solo step). Default: validación blanda en el form (warning, no error) — permitido por si el dueño tiene un workflow legítimo.
- ¿`min_quantity` y `qty_step` son visibles en CSV import/export? Default: sí, se agregan como columnas opcionales (si la fila no las trae, asume defaults 1/1).
