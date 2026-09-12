## Context

`add-product-cost-tracking` congela el costo en `order_items.cost_at_purchase` al crear el pedido (su decisión D1). La consecuencia práctica, verificada en producción con la primera tienda que lo usó: cargó costo en 61 de 78 productos y su cobertura quedó en 0%, porque sus 46 líneas de pedido son todas anteriores. No vio ninguna tarjeta de ganancia.

El backfill manual que se le hizo resolvió el caso puntual —cobertura 92%, margen 57,2%— pero dejó dos cosas pendientes: no es repetible para las próximas tiendas, y esas 39 líneas quedaron indistinguibles de un costo real congelado al vender.

## Goals / Non-Goals

**Goals:**
- Que cargar un costo tenga efecto visible de inmediato, sin esperar a vender de nuevo.
- Que el dueño sepa cuándo está mirando un número reconstruido y cuándo uno real.
- Que la regla que sostiene la feature —el costo congelado no se reescribe— siga intacta.

**Non-Goals:**
- Backfill desde la edición masiva. Una confirmación por producto en un lote de 50 es inusable y una confirmación agregada es otro problema de UX.
- Revertir lo estimado desde la interfaz. La marca lo hace posible; la pantalla puede esperar a que alguien la necesite.
- Adivinar el costo de productos borrados del catálogo. No hay de dónde sacarlo.

## Decisions

### D1 — Solo se completan las líneas vacías; jamás se pisa un costo congelado

La condición es `cost_at_purchase IS NULL`, siempre. Sin excepción ni opción para saltarla.

**Alternativa descartada**: recalcular todo el historial del producto con el costo más reciente. Es más simple de explicar, pero con inflación el precio de compra cambia varias veces al año: la ganancia de marzo se reescribiría sola en cada actualización y un mes cerrado dejaría de ser un dato firme. Es exactamente lo que la decisión D1 del change de costo evita, y no tiene sentido construir encima algo que la anule.

Efecto secundario buscado: el backfill es idempotente. Aplicarlo dos veces no cambia nada la segunda vez, porque ya no quedan líneas vacías.

### D2 — Confirmación explícita, con el número de pedidos a la vista

Al guardar un costo, el sistema cuenta las líneas vacías de ese producto y, si hay, pregunta: cuántos pedidos son y que el resultado es una estimación, no el costo real de ese momento.

**Alternativa descartada**: hacerlo automático y silencioso. Menos fricción, pero el dueño termina mirando una ganancia histórica reconstruida creyendo que es exacta — y es un número con el que toma decisiones de precio. La fricción acá es el punto, no un costo.

La confirmación va **después** de guardar, no antes: guardar el costo y completar pedidos viejos son dos decisiones distintas, y la segunda no debe poder bloquear la primera.

### D3 — `cost_is_estimated` en la línea, no en el pedido ni en el producto

La granularidad correcta es la línea: un mismo pedido puede tener una línea con costo real (producto que ya tenía costo al venderse) y otra estimada (producto al que se le cargó después). Marcarlo a nivel pedido perdería esa distinción y a nivel producto no diría nada sobre una venta puntual.

`boolean NOT NULL DEFAULT false`: el default describe lo que son todas las líneas que se congelan al vender, que es el camino normal.

**El backfill de la marca** aprovecha un hecho verificable: el costo se desplegó el 2026-09-11, así que **ninguna línea de un pedido anterior a esa fecha puede tener un costo real congelado**. La migración marca como estimadas las líneas con costo cuyo pedido sea anterior a ese día, que son exactamente las 39 completadas a mano. No depende de recordar ids ni de cuándo se aplique la migración.

### D4 — El costo se resuelve por línea con la regla de siempre

`coalesce(variante.cost_override, producto.cost_cents)`, el mismo `resolveEffectiveCost` que usa la creación de pedidos. Así da igual si el dueño cargó el costo en el producto o en una variante: cada línea toma el que le corresponde, y una variante con override propio no hereda el del producto por accidente.

Consecuencia: al guardar el costo de un producto, las líneas de sus variantes **con** override propio no se tocan si ese override ya estaba — porque su costo efectivo no cambió.

### D5 — Lo estimado se avisa donde se lee el número

Dos lugares: el detalle del pedido, donde se ve el margen de esa venta puntual, y la tarjeta de ganancia del período, si parte de su total viene de líneas estimadas. No cambia el cálculo —una línea estimada suma igual que una real— solo se dice de dónde sale.

Es la misma lógica que la cobertura: el número se muestra, y al lado se dice qué tan confiable es.

## Risks / Trade-offs

- **El dueño confirma sin leer y toma lo estimado por real** → Por eso la marca viaja hasta la pantalla, no solo a la base: el aviso está donde se lee el número, no solo en el momento de confirmar.
- **Un producto con mucho historial se completa entero con el costo de hoy** → Para dos semanas es una aproximación razonable; para dos años no. El texto de confirmación dice cuántos pedidos son, que es la señal que permite frenar. No se pone un límite duro de antigüedad: sería arbitrario y el dueño tiene mejor contexto que nosotros.
- **La operación toca muchas filas de una vez** → Es un `UPDATE` acotado por producto y por tienda, con la condición de nulidad. A la escala del producto son decenas de filas, no millones.
- **Renumeración de migraciones** → `add-manual-sales` y `add-order-action-undo` están escritos pero no implementados; hay que corregir el número en sus artefactos antes de que alguien los tome.

## Migration Plan

1. Aplicar `042_cost_is_estimated.sql`: una columna con default más el `UPDATE` de marcado para los pedidos anteriores al 2026-09-11.
2. Verificar que las 39 líneas completadas a mano quedaron marcadas y que ninguna línea de un pedido nuevo lo quedó.
3. Desplegar. Sin costos nuevos cargados no cambia nada visible.
4. **Rollback**: `DROP COLUMN`. Se pierde la distinción entre real y estimado; no se pierde ningún costo ni pedido.

## Open Questions

- ¿Conviene ofrecer el backfill también cuando se corrige un costo ya cargado, para las líneas que hayan quedado vacías por otra razón? Hoy no hay forma de que eso pase, pero si aparece, la condición de nulidad ya lo cubre sin cambios.
