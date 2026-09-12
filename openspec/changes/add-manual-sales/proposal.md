## Why

Muchas ventas de un negocio chico no pasan por el sitio: la vecina que pasa a buscar, la feria del domingo, el pedido cerrado por Instagram. Hoy esas ventas no existen para Wapy, así que las métricas del dashboard muestran una parte del negocio y el dueño termina llevando la cuenta real en otro lado. Si además se cargó el costo de los productos, la ganancia calculada queda incompleta por el mismo motivo.

## What Changes

- **Tercer canal de pedido**: se amplía `orders.channel` a `'manual'`. Una venta manual **es un pedido más**, en la misma tabla — no una entidad paralela. Entra sola en las métricas, el listado, la búsqueda, la exportación y el filtro por canal que el panel de pedidos ya tiene.
- **Fecha de venta editable**: nueva columna `orders.sold_at`, backfilleada a `created_at` para todo lo existente. Las métricas pasan a agrupar por `sold_at` en lugar de `created_at`, de modo que una venta cargada hoy pero ocurrida el martes pasado cae en el martes del gráfico. **BREAKING** interno: todo cálculo de métricas y de rango de fechas cambia de columna; para los pedidos ya existentes el valor es idéntico, así que ningún número se mueve.
- **Alta manual desde el dashboard**: formulario con fecha, cliente opcional, líneas del pedido y notas. Las líneas pueden salir del catálogo (traen precio y costo vigentes) o ser **líneas sueltas** escritas a mano, para vender algo que no está publicado. El modelo ya lo soporta: `order_items.product_id` es nullable.
- **Descuento de stock opcional**: un checkbox prendido por default. Si el dueño ya ajustó el stock a mano, lo destilda y la venta no lo vuelve a tocar. Para no reponer stock que nunca se descontó, se agrega `orders.stock_applied`, que la cancelación y el borrado consultan antes de reponer.
- **La venta manual nace cerrada**: se crea directamente en `confirmed`, con el pago marcado como aprobado, y sigue las mismas transiciones de estado que cualquier otro pedido a partir de ahí. No la expira ningún cron: los dos jobs de expiración filtran por canal explícitamente.
- **Costo por línea**: la venta manual también congela el costo, heredado del catálogo o escrito a mano en las líneas sueltas, para que no abra un agujero en la cobertura de margen.
- **Feature de plan Pro**, con el mismo flag y el mismo patrón que el resto del gating.

## Capabilities

### New Capabilities
- `manual-sales`: la carga manual de una venta ocurrida fuera del sitio, su fecha retroactiva, sus líneas de catálogo y sueltas, el descuento opcional de stock y su integración con los pedidos y las métricas existentes.

### Modified Capabilities
<!-- Ninguna capability con spec propio cambia de requisito. `public-storefront`, `discount-coupons` y `product-variants` no se ven afectadas: la venta manual no toca la tienda pública ni el flujo de compra. -->

## Impact

- **Depende de** `add-product-cost-tracking`: usa `order_items.cost_at_purchase` y `resolveEffectiveCost`. Hay que implementarlo después de ese change, no en paralelo.
- **DB (nueva migración `044`)**: ampliar el `CHECK` de `orders.channel` a `('whatsapp','mercadopago','manual')`; `orders.sold_at timestamptz NOT NULL DEFAULT now()` con backfill `sold_at = created_at`; `orders.stock_applied boolean NOT NULL DEFAULT true` (el default refleja lo que hacen hoy todos los pedidos); índice por `(store_id, sold_at)` para las métricas.
- **Trigger existente**: `prevent_order_payment_column_writes` (031) restringe la escritura de `channel` y `payment_status` a `service_role`. La creación manual pasa por una server action con el admin client, igual que `createPendingOrder`, así que no hay que tocar el trigger.
- **Métricas**: `lib/store/orders/actions.ts` — `getOrderStats` y `getRangeStart` cambian de `created_at` a `sold_at`, incluido el bucketing por día en zona horaria de Argentina.
- **Pedidos**: nueva server action de creación manual; `fetchFilteredOrders`, `listOrders`, `exportOrdersCsv` y los filtros por fecha pasan a `sold_at`; `replenishOrderStock` consulta `stock_applied` antes de reponer.
- **Numeración**: la venta manual toma número con el RPC `next_order_number` como cualquier otro pedido.
- **Dashboard**: `app/dashboard/components/OrdersPanel.tsx` (botón de alta, tercer valor en el filtro de canal, badge) y un formulario nuevo.
- **Fuera de alcance**: editar las líneas de una venta manual ya creada (se borra y se rehace), importación masiva de ventas por CSV, ventas manuales en moneda distinta a la de la tienda, cupones aplicados a mano, y comprobantes o facturación.
