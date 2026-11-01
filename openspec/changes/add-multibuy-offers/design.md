# Design — Ofertas NxM (2x1, 3x2, 3x1…)

## Decisión 1 — Modelo de datos: dos columnas en `products`

```sql
products.multibuy_buy smallint NULL   -- N: unidades que se llevan
products.multibuy_pay smallint NULL   -- M: unidades que se pagan
CHECK ((multibuy_buy IS NULL AND multibuy_pay IS NULL)
    OR (multibuy_buy >= 2 AND multibuy_pay >= 1 AND multibuy_pay < multibuy_buy))
```

Ambas NULL = sin oferta. Se descartó una tabla aparte: es **una** oferta por producto (no una lista como
los tramos) y dos columnas mantienen el payload público y el save simples. Las variantes no tienen NxM
propio: la oferta es del producto y aplica a todas sus variantes.

Las columnas entran al tipo del payload público del storefront explícitamente (ver memoria de privacidad
del payload: el límite vive en el tipo, no en el `select`).

## Decisión 2 — Agrupación de a N, bonifica las unidades más baratas

La cantidad se agrega **por producto** sumando todas sus variantes del carrito. Con `Q` unidades:

```
grupos       = floor(Q / N)
gratis       = grupos × (N − M)
sobrantes    = Q − grupos × N           → pagan precio normal
```

Para decidir **qué** unidades salen gratis se expanden las unidades a su precio regular de línea y se
bonifican las `gratis` más baratas. Con un producto sin variantes (o variantes del mismo precio) es
indistinto; con talles de precios distintos evita que la tienda regale la XL cara.

```
Remera 2x1: 1 S ($1000) + 1 XL ($1200)  → grupos=1, gratis=1 → se bonifica la S → total $1200
Producto $1000, 2x1, Q=3                 → grupos=1, gratis=1                  → total $2000
Producto $1000, 3x2, Q=7                 → grupos=2, gratis=2                  → total $5000
```

## Decisión 3 — Gana el más barato, comparado a nivel producto

No se acumula con promo ni con tramos. Por cada producto del carrito se calculan dos totales:

```
totalEscalonado = Σ líneas  resolveTieredPrice(...).unitCents × qty     // promo y/o tramo (lógica actual)
totalNxM        = Σ líneas  regularCents × qty  −  descuento NxM          // sobre precio REGULAR
```

Se cobra `min(totalEscalonado, totalNxM)`. En empate gana el escalonado (no cambia nada respecto de hoy).
El NxM se calcula sobre el **regular** porque aplicarlo sobre el promo sería acumular, que el dueño
descartó explícitamente.

La comparación es por producto y no por línea porque la oferta agrega variantes: decidir línea a línea
podría mezclar NxM en una talla y tramo en otra del mismo producto, y el resultado no sería explicable.

Nota sobre grupos de tramos: la cantidad del **tramo** se sigue agregando por grupo de escalera
(`qtyByTierGroup`, sin cambios); la del **NxM** por producto. El NxM no combina entre productos distintos
en v1 (ver "Fuera de alcance").

## Decisión 4 — Helper puro único: `resolveProductLinePrices`

En `lib/store/pricing.ts`:

```ts
interface MultibuyOffer { buy: number; pay: number }

interface LineInput { key: string; regularCents: number; tieredUnitCents: number; quantity: number }

interface LineResult {
  key: string;
  unitCents: number;       // unitario que se snapshotea en order_items
  discountCents: number;   // descuento de la línea (0 si no gana el NxM)
  offerLabel: string | null; // "2x1" si ganó el NxM
}

resolveProductLinePrices(lines: LineInput[], offer: MultibuyOffer | null): LineResult[]
multibuyLabel(offer): string            // "2x1", "3x2"
```

- Si gana el escalonado: `unitCents = tieredUnitCents`, `discountCents = 0`.
- Si gana el NxM: `unitCents = regularCents`, y el descuento total (suma de las unidades bonificadas) se
  asigna a las líneas dueñas de esas unidades. Siempre es un entero exacto (son precios de unidades enteras).

El mismo helper lo usan `createPendingOrder` (cobro) y `CartContext` (display), así nunca divergen.

## Decisión 5 — Snapshot: descuento por línea en `order_items`

`order_items.unit_price_cents` sigue siendo un entero por unidad (MP lo exige). Un 2x1 no se puede expresar
como unitario entero en todos los casos (3 unidades pagando 2 → $666,67), así que se agregan:

```sql
order_items.discount_cents int NOT NULL DEFAULT 0 CHECK (discount_cents >= 0)
order_items.offer_label    text NULL       -- "2x1", congelado
```

Neto de la línea = `unit_price_cents × quantity − discount_cents`. `orders.total_cents` es la suma de netos
(antes del cupón, como hoy). Se descartó partir la línea en dos filas (pagas + gratis) porque duplica
la línea en stock, fulfillment y el panel de pedidos.

**Todos los consumidores** que hoy calculan `unit_price × quantity` pasan a restar `discount_cents`:
márgenes (`margin.ts`, la ganancia ya se calcula sobre base de ítems, esto la mantiene correcta),
`OrdersPanel`, la página de éxito y el webhook de MP. Las filas viejas tienen `discount_cents = 0`, sin
cambio de comportamiento.

## Decisión 6 — Mercado Pago: se reusa la distribución proporcional del cupón

`createPendingOrder` ya distribuye un descuento de orden (cupón) proporcionalmente sobre los `mp_items` con
reconciliación exacta de centavos. El NxM entra por ese mismo camino: el `mpFinalTotalCents` pasa a ser
`Σ netos − cupón`, y la base de reparto es el bruto de cada línea. No se inventa un segundo mecanismo de
redondeo. El cupón se valida contra el total **después** del NxM (orden: promo/tramo/NxM → cupón).

## Decisión 7 — Carrito: la oferta viaja en el `CartItem`

Igual que los tramos (Decisión 4 de `add-quantity-price-tiers`): `CartItem` lleva `multibuy: {buy, pay} | null`
y `regularPrice`. `computeCartLinePrices` agrupa por producto y llama a `resolveProductLinePrices`. Puede
quedar stale en `localStorage`, es irrelevante: el server recalcula todo. La línea muestra "2x1 · −$X" y el
mensaje de WhatsApp incluye el descuento. Un aviso "sumá 1 más y llevás 2x1" cuando `Q mod N == N − 1`
reutiliza el lugar del contador de tramos.

## Decisión 8 — Banner y badge en el storefront

- **Badge** en card y modal: etiqueta "2x1" (`multibuyLabel`). Convive con el tachado del promo.
- **Banner** arriba del catálogo, solo si hay ≥ 1 producto activo con oferta. Texto derivado, sin
  configuración: lista las ofertas distintas ("2x1 y 3x2 en productos seleccionados"). Un botón
  "Ver promos" filtra el catálogo a los productos con oferta (filtro de cliente, sin ruta nueva).
- No se renderiza con `under_construction` (la tienda queda inerte igual, pero no tiene sentido promocionar).
- Sin switch para ocultarlo en v1: si el dueño no quiere banner, no quiere la oferta.

## Decisión 9 — Admin

- `ProductModal`, sección de ofertas: selector con presets 2x1 / 3x2 / 3x1 / 4x3 / "Personalizada" (N y M)
  / "Sin oferta". Hint con el ejemplo resultante ("Llevando 2 de $1000 pagan $1000").
- Validación compartida en `product-validation.ts` (N ≥ 2, 1 ≤ M < N, enteros) y en el CHECK de la DB.
- `saveStoreProduct` / `bulkUpdateProducts` solo tocan las columnas si el caller las manda (`!== undefined`),
  así el wizard de onboarding no las borra.
- `BulkEditGrid`: columna "NxM" y acción en lote "Aplicar 2x1 / quitar oferta" sobre la selección.
- Duplicar producto copia la oferta.

## Fuera de alcance

- NxM combinable entre productos distintos ("2x1 en toda la sección" mezclando sabores). Se puede derivar
  después con una clave de grupo como en los tramos.
- Ofertas con fecha de vigencia, "segunda unidad al 50%", NxM por variante.
- Texto o imagen del banner configurables.
