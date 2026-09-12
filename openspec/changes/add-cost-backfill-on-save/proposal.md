## Why

Una tienda que carga el costo de 61 productos no ve ninguna ganancia: el costo se congela al crear el pedido, así que todo lo vendido antes de cargarlo queda sin costo y la cobertura da cero. Es correcto por diseño, pero se siente como que la función no anda — el dueño hizo el trabajo y la pantalla sigue igual. Le pasó a la primera tienda que la usó, y le va a pasar a todas las que empiecen a cargar costos de acá en adelante.

## What Changes

- **Al guardar un costo, se ofrece completar los pedidos anteriores de ese producto**: el sistema cuenta cuántas líneas de pedido quedaron sin costo y pregunta si aplicarles el valor recién cargado, diciendo cuántos pedidos son y que el resultado es estimado.
- **Nunca se pisa un costo ya congelado**: solo se completan las líneas vacías. Cambiar el precio de compra en el futuro no reescribe la ganancia de un mes cerrado, que es la regla que sostiene toda la feature de margen.
- **Las líneas completadas quedan marcadas como estimadas**: nueva columna `order_items.cost_is_estimated`. Un costo congelado al vender y uno completado después dejan de ser indistinguibles, lo que permite avisarlo donde corresponde y revertir solo lo estimado si hiciera falta.
- **El detalle del pedido y la tarjeta de ganancia lo dicen** cuando parte del número viene de costos estimados. Un dueño que toma decisiones de precio tiene que saber si está mirando lo que realmente ganó o una reconstrucción.
- **El costo efectivo se resuelve por línea con la regla de siempre** (override de variante, si no el del producto), así que funciona igual cargando el costo en el producto o en una variante.
- **Backfill de la marca**: las líneas que ya se completaron a mano —la tienda que motivó este change— quedan marcadas como estimadas en la migración.

## Capabilities

### New Capabilities
- `cost-backfill`: completar el costo de pedidos anteriores al cargar el costo de un producto, su confirmación explícita, la distinción entre costo real y estimado, y su visibilidad.

### Modified Capabilities
- `product-cost-margin`: hasta ahora una línea de pedido sin costo solo podía quedar vacía para siempre. Se agrega que puede completarse después, y que el origen del costo (congelado al vender o estimado después) queda registrado y visible.

## Impact

- **DB (nueva migración `042`)**: `order_items.cost_is_estimated boolean NOT NULL DEFAULT false`, más el backfill de las líneas completadas a mano antes de este change (pedidos anteriores al 2026-09-11, fecha del despliegue del costo: ninguna línea previa a esa fecha puede tener un costo real congelado).
- **Renumeración**: `add-manual-sales` pasa de `042` a `043` y `add-order-action-undo` de `043` a `044`.
- **Server actions**: `lib/store/actions.ts` y `lib/variants/actions.ts` — contar líneas sin costo de un producto y aplicar el costo a esas líneas, ambas gateadas a Pro y verificando pertenencia a la tienda.
- **Métricas**: `lib/store/orders/margin.ts` — informar si parte de la ganancia proviene de costos estimados, sin cambiar el cálculo.
- **UI**: `app/components/store/ProductModal.tsx` y `app/components/store/VariantsSection.tsx` para la confirmación; `app/dashboard/components/OrdersPanel.tsx` y `OrdersStats.tsx` para el aviso.
- **Fuera de alcance**: aplicar el backfill desde la edición masiva (una confirmación por producto en un lote de 50 es inusable, y una sola confirmación agregada merece pensarse aparte), revertir lo estimado desde la interfaz, historial de cambios de costo, y estimar el costo de productos borrados del catálogo, que no tienen de dónde sacarlo.
