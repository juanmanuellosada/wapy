## MODIFIED Requirements

### Requirement: Snapshot del costo al crear el pedido
Al crear un pedido, el sistema SHALL guardar en cada línea el costo efectivo vigente en ese momento para el producto o variante comprado. El cálculo de ganancia de un pedido SHALL usar siempre ese valor congelado y MUST NOT leer el costo actual del producto. Cuando no hay costo efectivo al momento de la compra, la línea MUST quedar con el costo ausente, y ese costo ausente SHALL poder completarse después únicamente mediante la operación explícita de completar pedidos anteriores, que MUST marcar la línea como estimada. Una vez que una línea tiene costo, congelado o completado, el sistema MUST NOT volver a modificarlo.

#### Scenario: Se congela el costo vigente
- **WHEN** se crea un pedido con 2 unidades de un producto cuyo costo efectivo es $500
- **THEN** la línea del pedido queda con `cost_at_purchase = 50000` y `quantity = 2`

#### Scenario: Cambiar el costo no altera el historial
- **WHEN** un producto vendido con costo $500 pasa a costar $700 y se consultan las métricas del período anterior
- **THEN** la ganancia de ese pedido se sigue calculando con $500 por unidad

#### Scenario: Producto sin costo al momento de la compra
- **WHEN** se crea un pedido con un producto que no tiene costo cargado
- **THEN** la línea queda con `cost_at_purchase` ausente y el pedido se crea normalmente

#### Scenario: El snapshot se guarda para cualquier plan
- **WHEN** se crea un pedido en una tienda de plan Inicial cuyo producto tiene costo cargado
- **THEN** la línea igual guarda `cost_at_purchase`, aunque la tienda no pueda ver las métricas de margen

#### Scenario: Borrar el producto no borra el margen histórico
- **WHEN** se elimina un producto que tenía pedidos con costo congelado
- **THEN** las líneas de esos pedidos conservan su `cost_at_purchase` y la ganancia histórica no cambia

#### Scenario: Una línea sin costo puede completarse después
- **WHEN** una línea quedó sin costo y el dueño carga el costo del producto y acepta completar los pedidos anteriores
- **THEN** esa línea pasa a tener costo y queda marcada como estimada

#### Scenario: Una línea con costo no se modifica nunca más
- **WHEN** una línea ya tiene costo, sea congelado o completado
- **THEN** ninguna operación posterior de carga de costo la modifica
