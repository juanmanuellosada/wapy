# Design — Tramos de precio por cantidad

## Decisión 1 — El tramo fija un precio unitario que aplica a todas las unidades

Descartado el modelo "pack" (`3x$2800` + sueltas a precio lleno) y el modelo "% off". El tramo es
`(min_quantity, unit_price_cents)`: se elige el tramo de mayor `min_quantity` que sea `<= qty` y su
precio unitario aplica a **todas** las unidades.

```
Producto $1000, tramos: 3 → $933,33 | 6 → $880

qty=2 → 2 × 1000    = $2.000
qty=3 → 3 × 933,33  = $2.799,99
qty=5 → 5 × 933,33  = $4.666,65
qty=6 → 6 × 880     = $5.280
```

`unit_price_cents` es **entero** porque `mp_items[].unit_price` que se manda a Mercado Pago tiene que ser
representable en centavos y se multiplica por `quantity`. Por eso "3 por $2800" se guarda como 93333 y el
total real es $2.799,99. El form muestra siempre el total resultante, así el dueño ve el centavo antes de guardar.

## Decisión 2 — La cantidad se agrega por producto, el descuento se aplica proporcional a la variante

`createPendingOrder` ya agrupa `qtyByProduct` para validar `min_quantity` / `qty_step`. Se reutiliza ese mismo
mapa: 2 remeras M + 1 L = 3 unidades del producto "Remera" → el tramo de 3 se activa para las tres líneas.

Como el tramo se configura contra `products.price_cents` pero una variante puede tener `price_override`,
aplicar el `unit_price_cents` literal a todas las variantes borraría la diferencia de precio entre ellas
(una talle XL de $1200 pasaría a costar lo mismo que una S de $1000). En su lugar el tramo se traduce a un
**ratio**:

```
ratio        = tier.unit_price_cents / product.price_cents      (si price_cents == 0 → ratio = 1)
tierUnitLine = variante ? round(varianteRegular × ratio) : tier.unit_price_cents
```

Para productos sin variantes el ratio es la identidad y el precio del tramo se respeta al centavo.

## Decisión 3 — Gana el más barato entre tramo y promo

```
base       = resolveEffectivePrice(product, variant).effectiveCents   // promo si hay, si no regular
unitCents  = tier ? min(base, tierUnitLine) : base
```

No se acumulan. Esto hace imposible que configurar un tramo suba el precio, y evita tener que validar
cross-table que el tramo sea menor que la promo de cada variante. El flag `onTier` (que dispara el display
"llevando 3 pagás $X c/u") solo es `true` cuando el tramo efectivamente ganó.

## Decisión 4 — Los tramos viajan dentro del `CartItem`

El carrito vive en `localStorage` y el `CartProvider` solo recibe el `slug`, no el catálogo. Meter los tramos
en cada `CartItem` (junto al `price` que ya guarda) evita tener que inyectar el catálogo en el provider y
hace que el carrito sobreviva un reload sin perder el tramo. El riesgo de que queden stale es irrelevante:
`createPendingOrder` recalcula **todo** desde la DB y nunca confía en precios del cliente — el carrito es
solo display.

`CartContext` agrupa por `productId`, suma cantidades y recalcula el unitario de cada línea con el mismo
helper puro que usa el servidor.

## Decisión 5 — En la edición masiva el lote se expresa en porcentaje

Aplicar un `unit_price_cents` absoluto a 200 productos de precios distintos no tiene sentido. La acción en
lote es "**-X% desde N unidades**" y calcula, para cada producto seleccionado,
`unit_price_cents = round(price_cents × (1 - X/100))`. Reemplaza los tramos existentes de las filas
seleccionadas por ese único tramo (con un segundo botón "Quitar tramos" para limpiar). La edición fina
multi-tramo sigue estando en el modal de producto, accesible desde la grilla.

## Decisión 6 — Sin gating por plan

Ni el precio promocional ni `min_quantity` están gateados por plan; los tramos siguen el mismo criterio.
La parte de edición masiva ya está detrás de `allowBulkProducts` (Pro) por ser parte de esa pantalla.
