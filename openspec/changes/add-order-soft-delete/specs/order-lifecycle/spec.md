## MODIFIED Requirements

### Requirement: Criterio único de venta en las métricas
Las métricas del panel SHALL considerar venta únicamente a los pedidos en estado `confirmed` o `delivered` que no hayan sido borrados, y SHALL aplicar ese mismo criterio a todos los indicadores de una misma vista. Los ingresos SHALL calcularse sobre el monto neto, descontando el descuento aplicado.

#### Scenario: Ingresos netos
- **WHEN** una tienda tiene un pedido confirmado de $10.000 con $2.000 de descuento por cupón
- **THEN** los ingresos reportados suman $8.000 y no $10.000

#### Scenario: Consistencia entre indicadores
- **WHEN** el panel muestra ingresos junto a productos más pedidos
- **THEN** ambos consideran solamente pedidos confirmados o entregados, sin incluir pendientes, cancelados ni borrados

#### Scenario: Pedido pendiente no computa
- **WHEN** una tienda tiene pedidos pendientes sin confirmar
- **THEN** esos pedidos no suman a los ingresos ni a los productos más pedidos

#### Scenario: Pedido borrado no computa
- **WHEN** la dueña borra un pedido que estaba confirmado
- **THEN** deja de sumar a los ingresos, a los productos más pedidos y a las recomendaciones de la tienda pública
