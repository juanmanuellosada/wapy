## Context

`getOrderStats` (`lib/store/orders/actions.ts:1245`) calcula los ingresos sumando `computeNetCents(total_cents, discount_cents)` sobre los pedidos `confirmed` / `delivered`. Es una métrica de facturación: no existe ningún dato de costo en el repo (grep confirmado), así que "ganancia" hoy no es calculable ni aproximable.

El modelo de precios ya es rico: precio regular, promo (`034`), tramos por cantidad (`035`), override por variante. Todo eso converge en `lib/store/pricing.ts` y se snapshotea en `order_items.price_at_purchase` al crear el pedido. **El costo tiene que entrar por el mismo camino**: un valor configurable con herencia producto → variante, y un snapshot en la línea del pedido.

La restricción dominante es de compatibilidad: hay tiendas con catálogos enteros cargados. Nada de esto puede volverse obligatorio ni cambiar lo que ven hoy.

## Goals / Non-Goals

**Goals:**
- Que el dueño pueda cargar cuánto le cuesta cada producto, y que eso sea siempre opcional.
- Que el margen de un pedido pasado refleje el costo de ese momento, no el de hoy.
- Que la ganancia mostrada sea honesta: si el costo está cargado a medias, que la pantalla lo diga.
- Que una tienda sin un solo costo cargado no note ninguna diferencia.

**Non-Goals:**
- Costo de envío, comisiones de MercadoPago, prorrateo de cupones sobre el costo. La v1 mide margen bruto de mercadería.
- Historial de cambios de costo, valuación de inventario, costo promedio ponderado.
- Costo por tramo de cantidad (comprar 100 unidades sale más barato por unidad). El costo es un valor único por producto/variante.
- Ventas cargadas a mano — van en su propio change, encima de este.

## Decisions

### D1 — El costo se congela en `order_items`, no se recalcula

`order_items.cost_at_purchase int NULL`, copiado por `createPendingOrder` al armar las líneas.

**Alternativa descartada**: calcular la ganancia con un JOIN a `products.cost_cents` al momento de leer las métricas. Es menos código y cero columnas nuevas, pero con inflación el costo de compra cambia varias veces al año: la ganancia de marzo se reescribiría sola cada vez que el dueño actualiza un precio de compra, y un mes cerrado dejaría de ser un dato estable. Además `order_items.product_id` es `ON DELETE SET NULL`: borrar un producto borraría retroactivamente el margen de todo su historial. El snapshot es el mismo patrón que ya usa `price_at_purchase`.

### D2 — La variante hereda el costo del producto

`resolveEffectiveCost(product, variant?)` en `lib/store/pricing.ts`, con la misma forma que `resolveEffectivePrice`: `variant?.cost_override ?? product.cost_cents ?? null`.

Esto sigue a `price_override` (que hereda) y **no** a `promo_price_override` (que no hereda). La razón es que la promo es una decisión comercial deliberada por variante — no querés que un descuento se derrame solo — mientras que el costo es un hecho físico: si las variantes son talles de la misma remera, el costo del producto es la respuesta correcta por default, y el override existe para la excepción (el talle XXL que sale más caro).

### D3 — `NULL` significa "sin dato", `0` significa "me costó cero"

Son casos distintos y ambos reales: `0` es una muestra, un regalo de proveedor o un servicio sin costo de mercadería. `NULL` es "todavía no lo cargué". Solo `NULL` queda afuera del cálculo de ganancia y baja la cobertura; un costo `0` participa normalmente y da margen 100%. El `CHECK` permite `>= 0`, no `> 0`.

### D4 — La ganancia se calcula sobre la base de ítems, no contra `total_cents`

Este es el punto delicado. Los ingresos actuales salen de `orders.total_cents - discount_cents`; el costo sale de sumar `order_items`. **Son dos bases distintas** y restarlas entre sí produce un número inflado cuando falta costo: si la mitad de los ítems no tiene costo cargado, `ingresos_totales - costo_parcial` muestra una ganancia enorme que no existe.

La decisión es calcular tres cosas separadas sobre la base de ítems:
- `costed_revenue_cents` = Σ `price_at_purchase * quantity` de los ítems **que tienen** `cost_at_purchase`
- `cost_cents` = Σ `cost_at_purchase * quantity` de esos mismos ítems
- `profit_cents` = `costed_revenue_cents - cost_cents`, y `margin_pct` = `profit / costed_revenue`

El KPI de ingresos existente **no se toca**: sigue saliendo de `total_cents` y sigue siendo la facturación real. La ganancia es un número aparte, sobre el subconjunto medible, y siempre acompañado de su cobertura.

**Alternativa descartada**: prorratear el descuento del pedido sobre cada ítem para que las bases coincidan. Es correcto en teoría pero arrastra redondeo por línea y complica el cálculo sin cambiar la conclusión que el dueño necesita ("gano plata o no"). Queda anotado como mejora futura.

### D5 — Cobertura = porcentaje de la facturación medida, no de los productos

`cost_coverage_pct` = `costed_revenue_cents / Σ (price_at_purchase * quantity de TODOS los ítems del período)`.

Se mide sobre plata y no sobre cantidad de productos porque lo que importa es cuánto del negocio está explicado: tener costo en 40 productos que casi no se venden y no tenerlo en el que factura la mitad es una cobertura mala, aunque "40 de 45 productos" suene bien.

Con cobertura `0` (ningún costo cargado en el período) las tarjetas de ganancia no se renderizan. Con cobertura parcial se renderizan con la leyenda de cobertura al lado. El umbral de "parcial" no es un corte duro: se muestra siempre el número real.

### D6 — El snapshot se escribe siempre; el gating es de UI y de carga

Aunque la feature sea Pro, `createPendingOrder` guarda `cost_at_purchase` para cualquier plan. Si una tienda Pro baja a Medio y después vuelve, su historial no tiene un agujero. El costo simplemente será `NULL` mientras no haya podido cargarlo, que es el estado natural. Gatear la escritura del snapshot agregaría un lookup de plan en el camino crítico de creación de pedidos a cambio de nada.

El flag nuevo en `PLAN_LIMITS` (siguiendo `allowBulkProducts`) controla: los campos de costo en los tres formularios, y las tarjetas de margen en métricas.

### D7 — El costo es dato interno y no puede salir en el payload público

Tres columnas nuevas en tablas que el storefront lee. El riesgo concreto es un `select('*')` en la ruta pública arrastrando `cost_cents` al HTML/JSON que ve cualquiera — incluido un competidor. La mitigación es listar columnas explícitas en el camino público (`lib/storefront/resolve.ts` y lo que alimente `app/[slug]/`) y dejar un test que falle si el payload público contiene una clave de costo.

### D8 — El costo y el margen se exportan en el CSV, al final y solo para Pro

`exportOrdersCsv` suma tres columnas por pedido: costo, ganancia y margen, calculadas con el mismo criterio de D4 (solo sobre las líneas con costo congelado del pedido). Van **al final del CSV**, después de las columnas actuales, y solo para tiendas Pro: agregarlas en el medio rompería cualquier planilla que ya esté leyendo por posición.

Un pedido sin ningún costo congelado exporta esas tres celdas vacías, no ceros — un cero se suma solo en una planilla y miente; una celda vacía no.

Esto obliga a calcular el margen **por pedido** y no solo agregado por período, así que la función de cálculo se extrae a un helper reutilizable en lugar de vivir dentro de `getOrderStats`.

## Risks / Trade-offs

- **El costo se filtra al storefront por un `select('*')`** → Auditar todos los selects del camino público antes de cerrar el change; test de regresión sobre el payload serializado, no sobre la query.
- **La ganancia parcial se lee como ganancia total** → La cobertura viaja pegada al número en la misma tarjeta, no en un tooltip ni en una nota al pie. Con cobertura 0 no se muestra nada.
- ~~**La migración `038` está pendiente en producción**~~ → Verificado contra la base el 2026-09-11: `038` está aplicada en producción y no bloquea a `041`. El checkbox en su `tasks.md` estaba sin tildar, nada más.
- **Las columnas nuevas del CSV rompen una planilla existente** → Van al final y nunca en el medio; un pedido sin costo deja la celda vacía en lugar de cero.
- **Dos bases de cálculo conviviendo (ingresos por pedido, ganancia por ítem)** → Puede confundir si alguien suma mentalmente "ingresos - costo" y no da. Se mitiga con el label de cobertura y nombrando la tarjeta por lo que es, no "ganancia" a secas.
- **El dueño carga el costo con IVA incluido o sin IVA, indistinto** → No se resuelve en v1: es un campo libre y el margen es tan bueno como el dato que carguen. Documentar el criterio en el texto de ayuda del campo, no en validación.
- **Variantes con `price_override` pero sin `cost_override`** → Heredan el costo del producto y pueden dar márgenes raros (una variante cara hereda el costo barato). Es el comportamiento correcto por D2; el override está para eso.

## Migration Plan

1. ~~Aplicar la migración `038` pendiente~~ — ya estaba aplicada en producción (verificado 2026-09-11).
2. Aplicar `041_product_cost.sql`: tres `ADD COLUMN ... NULL`, sin backfill, sin reescritura de tablas. Aditiva y segura en caliente.
3. Regenerar `lib/supabase/types.ts`.
4. Desplegar el código. Sin costos cargados, todo el comportamiento visible es idéntico al actual.
5. **Rollback**: `DROP COLUMN` en las tres. Se pierden los costos cargados y los snapshots; no se pierde ningún pedido ni precio.

## Open Questions

- ¿Hace falta una vista de "productos sin costo cargado" para que el dueño sepa qué le falta y suba la cobertura? Probablemente sí en cuanto la cobertura empiece a importar, pero no bloquea esta v1.
