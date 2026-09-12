## Context

`orders` ya modela dos canales (`whatsapp`, `mercadopago`) con un `CHECK` y un discriminador que el panel de pedidos usa para filtrar y para el badge. `getOrderStats` no filtra por canal: suma todo lo confirmado. Eso significa que **un tercer canal entra a las métricas sin tocar el cálculo**, que es la razón principal para modelar la venta manual como un pedido y no como una tabla aparte.

El obstáculo real es temporal: todo el sistema de métricas y filtros agrupa por `created_at`, y una venta manual se carga después de ocurrida. Sin una fecha de venta propia, cargar el lunes lo que se vendió el martes anterior ensucia el gráfico justo en el caso de uso central.

## Goals / Non-Goals

**Goals:**
- Que una venta hecha por fuera aparezca en las métricas igual que una del sitio, en el día en que realmente pasó.
- Que cargarla sea rápido: pocos campos, catálogo a mano, y la posibilidad de escribir una línea suelta sin crear un producto.
- Que no distorsione el stock ni el historial cuando el dueño ya ajustó las cosas a mano.

**Non-Goals:**
- Editar una venta manual ya creada. Borrar y rehacer alcanza, y evita razonar sobre reversiones parciales de stock.
- Importación masiva de ventas históricas por CSV.
- Facturación, comprobantes, medios de pago discriminados, o cuentas corrientes de clientes.

## Decisions

### D1 — Mismo `orders`, tercer valor de `channel`

**Alternativa descartada**: una tabla `manual_sales` separada. Obligaría a duplicar cada query de métricas (KPIs, ingresos por día, top de productos, secciones), cada filtro del panel, la exportación y el cálculo de margen — y a mantener las dos ramas en sincronía para siempre. El precio de la tabla separada es que las dos fuentes se desincronizan a la primera métrica nueva.

Compartir la tabla trae la contraparte de que hay campos que no aplican (`mp_payment_id`, `coupon_code`), pero ya conviven así `whatsapp` y `mercadopago`: esos campos son nullables y el canal dice cuáles tienen sentido.

### D2 — `sold_at` como eje temporal de todas las métricas

Columna `timestamptz NOT NULL DEFAULT now()`, backfilleada con `created_at`. Para todo pedido que no sea manual, `sold_at` y `created_at` coinciden siempre, porque el pedido se crea cuando ocurre.

**Alternativa descartada**: usar `COALESCE(sold_at, created_at)` en cada query con la columna nullable. Evita el backfill pero mete un `COALESCE` en cada filtro, cada índice parcial y cada `GROUP BY`, y tarde o temprano alguien escribe una query nueva sin él y obtiene números distintos a los del resto del dashboard. El backfill es una sola pasada sobre una tabla chica.

**Alternativa descartada**: que solo los pedidos manuales tengan fecha editable y las métricas hagan `if channel = 'manual'`. La lógica condicional en el cálculo central de métricas es exactamente lo que no queremos mantener.

La migración de columna es mecánica pero **amplia**: hay que barrer `getOrderStats`, `getRangeStart`, el bucketing por día en `America/Argentina/Buenos_Aires`, los filtros de fecha de `fetchFilteredOrders` y `exportOrdersCsv`. El criterio: `sold_at` para todo lo que sea "cuándo pasó el negocio", `created_at` para todo lo que sea "cuándo se cargó el registro" (auditoría, orden de aparición por default).

### D3 — `stock_applied` para que la reposición no invente unidades

Si la venta manual no descontó stock y después se cancela o se borra, `replenishOrderStock` repondría unidades que nunca salieron: stock fantasma, que ya es un problema conocido del backlog de MercadoPago y no queremos sumarle otro origen.

`orders.stock_applied boolean NOT NULL DEFAULT true` — el default describe lo que hacen hoy todos los pedidos existentes, así que el backfill es el propio default. `replenishOrderStock` chequea la columna y no hace nada si es `false`. Es una guarda en un helper compartido, no en cada caller.

### D4 — Nace `confirmed`, no `pending`

Una venta manual se carga porque ya ocurrió: no hay nada que confirmar. Nace en `confirmed` con `payment_status = 'approved'`, entra de inmediato en las métricas (que solo cuentan `confirmed` / `delivered`) y de ahí en más sigue las transiciones normales — se puede marcar `delivered` o cancelar.

Los dos crons de expiración filtran por `channel` explícitamente (`app/api/cron/expire-orders/route.ts:56` y `:90`), así que ninguna venta manual se expira sola. Es una propiedad que conviene fijar con un test, porque depende de que nadie cambie esos filtros por un `NOT IN`.

### D5 — Líneas de catálogo y líneas sueltas, en el mismo formato

`order_items.product_id` ya es nullable (`ON DELETE SET NULL`), y `product_name` es texto plano que todas las métricas ya usan para agrupar el top de productos. Una línea suelta es simplemente `product_id = NULL` con nombre, precio y cantidad escritos a mano.

Consecuencia buscada: una línea suelta con el mismo nombre que un producto del catálogo se agrupa junto a él en "lo más vendido", porque el agrupamiento es por nombre. Es el comportamiento razonable, y vale documentarlo para que no sorprenda.

La línea de catálogo copia precio y costo efectivos **al momento de cargar la venta**, no al momento en que la venta ocurrió — no tenemos el precio histórico y pedirlo sería fricción. El dueño puede corregir el precio a mano si cambió. La línea suelta acepta costo opcional escrito a mano.

### D6 — Sin recálculo de precios server-side

A diferencia de `createPendingOrder`, que recalcula todo (tramos, promos, `min_quantity`, `qty_step`) porque el input viene de un comprador anónimo, acá el input viene del dueño autenticado y es deliberado: si quiere cargar una venta a un precio especial que hizo en la feria, tiene que poder. El servidor valida rangos y pertenencia de los productos a la tienda, pero **no pisa los precios**.

El total del pedido se calcula server-side a partir de las líneas para que no pueda quedar inconsistente.

## Risks / Trade-offs

- **El cambio de `created_at` a `sold_at` se aplica a medias** → Una query olvidada muestra números distintos a las demás. Mitigación: barrer por búsqueda de `created_at` en el módulo de pedidos como parte del change y dejar un test que cargue una venta con fecha pasada y verifique que cae en el día correcto de `revenue_by_day`.
- **Ventas manuales que inflan las métricas por error de carga** → Son borrables como cualquier pedido, y el borrado ya repone stock y es soft. El filtro por canal permite auditarlas aparte.
- **Stock fantasma por doble descuento** → Es precisamente lo que resuelve el checkbox y `stock_applied`. El riesgo residual es el inverso: destildar por costumbre y que el stock quede alto. Se mitiga con el default en "descontar".
- **Fecha futura** → Una venta con fecha futura quedaría fuera de todos los rangos y desaparecería de la vista. Se rechaza en validación.
- **La venta manual entra en el top de productos y en el desglose por sección** → Deseado, pero las líneas sueltas no tienen sección: caen en el grupo "sin sección" del desglose. Aceptable; conviene que el gráfico lo etiquete con claridad.
- **Depende del change de costo** → Si se implementa antes, `cost_at_purchase` no existe. Es una dependencia dura, no una preferencia de orden.

## Migration Plan

1. Implementar y desplegar `add-product-cost-tracking` primero (dependencia dura).
2. Aplicar `043_manual_sales.sql`: ampliación del `CHECK` de canal, `sold_at` con backfill desde `created_at`, `stock_applied` con default `true`, índice `(store_id, sold_at)`.
3. Regenerar tipos y desplegar. Con la columna backfilleada, las métricas dan exactamente los mismos números que antes del cambio — conviene verificarlo comparando un rango antes y después.
4. **Rollback**: revertir el `CHECK` requiere que no existan filas con `channel = 'manual'`. Si ya se cargaron ventas manuales, el rollback implica borrarlas primero. Es el único paso no trivialmente reversible del change y hay que tenerlo presente antes de aplicar en producción.

## Open Questions

- ¿La venta manual debería poder descontar del cupo de un cupón, o ser alcanzada por uno? Por ahora no: los cupones son del flujo público. El descuento manual se carga como monto en `discount_cents` si hace falta.
- ¿Conviene un canal más granular a futuro (feria, Instagram, local) en vez de un único `'manual'`? Hoy no hay evidencia de que se necesite; agregar una etiqueta libre después es barato y no cambia este diseño.
