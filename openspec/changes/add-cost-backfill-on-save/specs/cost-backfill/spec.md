## ADDED Requirements

### Requirement: Ofrecer completar pedidos anteriores al guardar un costo
Cuando el dueño guarda un costo para un producto o una variante, el sistema SHALL contar las líneas de pedido de ese producto que quedaron sin costo y, si existe al menos una, SHALL ofrecer completarlas con el valor recién guardado. El ofrecimiento MUST indicar a cuántos pedidos afecta y MUST aclarar que el resultado es una estimación y no el costo real del momento de la venta. El guardado del costo MUST completarse con independencia de lo que el dueño responda.

#### Scenario: Producto con pedidos sin costo
- **WHEN** el dueño guarda un costo para un producto que tiene 12 líneas de pedido sin costo
- **THEN** el sistema le ofrece completarlas, indicando la cantidad de pedidos afectados y que el resultado es estimado

#### Scenario: Producto sin pedidos previos
- **WHEN** el dueño guarda un costo para un producto que nunca se vendió
- **THEN** no se le ofrece nada y el costo queda guardado

#### Scenario: Rechazar el ofrecimiento
- **WHEN** el dueño guarda el costo y rechaza completar los pedidos anteriores
- **THEN** el costo queda guardado y ninguna línea de pedido se modifica

#### Scenario: El guardado no depende de la respuesta
- **WHEN** falla la operación de completar los pedidos anteriores
- **THEN** el costo del producto permanece guardado

### Requirement: Completar nunca sobrescribe un costo ya congelado
Al completar pedidos anteriores, el sistema MUST modificar únicamente las líneas que no tienen costo, y MUST NOT alterar ninguna línea con costo ya congelado, sin importar cuánto difiera del valor actual.

#### Scenario: Convivencia de líneas con y sin costo
- **WHEN** un producto tiene una línea con costo congelado de $500 y otra sin costo, y se completa con un costo actual de $700
- **THEN** la primera línea conserva $500 y la segunda queda en $700

#### Scenario: Cambiar el costo no reescribe el historial
- **WHEN** el dueño actualiza el costo de un producto cuyas líneas ya fueron todas completadas
- **THEN** ninguna línea de pedido cambia de valor

#### Scenario: Completar dos veces no duplica nada
- **WHEN** se completa un producto que ya fue completado
- **THEN** no queda ninguna línea por modificar y el resultado es el mismo

### Requirement: El costo se resuelve por línea con la regla de herencia
Al completar, el sistema SHALL asignar a cada línea el costo efectivo que le corresponde según la regla habitual: el propio de la variante cuando lo tiene, y el del producto en caso contrario. Las líneas cuyo producto ya no exista en el catálogo MUST quedar sin completar.

#### Scenario: Línea de una variante con costo propio
- **WHEN** se completa un producto y una de sus líneas corresponde a una variante con costo propio
- **THEN** esa línea toma el costo de la variante, no el del producto

#### Scenario: Línea de una variante sin costo propio
- **WHEN** se completa un producto y una de sus líneas corresponde a una variante sin costo propio
- **THEN** esa línea toma el costo del producto

#### Scenario: Producto borrado del catálogo
- **WHEN** una línea corresponde a un producto que ya no existe
- **THEN** queda sin completar y sigue sin aportar a la ganancia

### Requirement: Las líneas completadas quedan marcadas como estimadas
El sistema SHALL registrar, en cada línea de pedido, si su costo fue congelado al momento de la venta o completado posteriormente. Las líneas completadas MUST quedar marcadas como estimadas y las congeladas al vender MUST NOT estarlo.

#### Scenario: Línea completada
- **WHEN** se completa una línea con el costo actual del producto
- **THEN** queda marcada como estimada

#### Scenario: Línea congelada al vender
- **WHEN** se crea un pedido de un producto que ya tenía costo cargado
- **THEN** su línea queda con el costo congelado y sin marca de estimada

#### Scenario: Las líneas completadas antes de esta funcionalidad quedan marcadas
- **WHEN** se aplica la migración sobre líneas que habían sido completadas manualmente
- **THEN** esas líneas quedan marcadas como estimadas

### Requirement: Se avisa cuándo la ganancia proviene de costos estimados
El sistema SHALL indicar en el detalle de un pedido cuando su costo es estimado, y en las métricas del período cuando parte de la ganancia proviene de líneas estimadas. La presencia de líneas estimadas MUST NOT alterar el cálculo de costo, ganancia, margen ni cobertura.

#### Scenario: Detalle de un pedido con costo estimado
- **WHEN** el dueño abre un pedido cuyo costo fue completado después de la venta
- **THEN** ve indicado que ese costo es estimado

#### Scenario: Métricas con ganancia parcialmente estimada
- **WHEN** parte de la ganancia del período proviene de líneas estimadas
- **THEN** la tarjeta de ganancia lo indica

#### Scenario: El cálculo no cambia
- **WHEN** una línea estimada participa del período
- **THEN** aporta a costo, ganancia, margen y cobertura igual que una línea con costo real

### Requirement: Completar pedidos anteriores es exclusivo del plan Pro
El sistema SHALL permitir completar pedidos anteriores únicamente a las tiendas del plan Pro, verificándolo en el servidor, y MUST rechazar cualquier intento sobre productos que no pertenezcan a la tienda del solicitante.

#### Scenario: Tienda sin plan Pro
- **WHEN** una tienda que no es Pro invoca la operación de completar
- **THEN** el servidor la rechaza y ninguna línea se modifica

#### Scenario: Producto de otra tienda
- **WHEN** el dueño intenta completar las líneas de un producto de otra tienda
- **THEN** el servidor rechaza la operación
