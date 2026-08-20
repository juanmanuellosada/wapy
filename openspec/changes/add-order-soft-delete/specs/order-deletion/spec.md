## ADDED Requirements

### Requirement: La dueña puede borrar un pedido
El sistema SHALL permitirle a la dueña borrar un pedido de su tienda, individualmente o en lote. Un pedido borrado SHALL desaparecer de toda vista y todo cálculo de la dueña: listado, buscador, exportación, métricas, conteo de backlog y RPCs públicas del storefront. La operación SHALL pedir confirmación indicando la cantidad exacta de pedidos afectados.

#### Scenario: Borrado individual
- **WHEN** la dueña borra un pedido
- **THEN** ese pedido deja de aparecer en el listado y en el buscador de su panel

#### Scenario: Borrado en lote
- **WHEN** la dueña selecciona varios pedidos y los borra
- **THEN** todos desaparecen, y la confirmación previa le indicó cuántos eran

#### Scenario: Confirmación sobre una selección amplia
- **WHEN** la dueña borra habiendo seleccionado "todos los que coinciden con el filtro", que abarca más pedidos de los que ve en pantalla
- **THEN** la confirmación indica la cantidad total real, no la cantidad visible

#### Scenario: Aislamiento entre tiendas
- **WHEN** se intenta borrar un pedido que pertenece a otra tienda
- **THEN** la operación se rechaza y el pedido no se modifica

### Requirement: Borrar libera lo que el pedido tenía comprometido
Al borrar un pedido que mantenía stock descontado, el sistema SHALL reponer ese stock. Si el pedido había consumido un uso de cupón, el sistema SHALL devolverlo. La operación SHALL ser idempotente y NO SHALL depender del canal del pedido.

#### Scenario: Borrar un pedido pendiente con stock comprometido
- **WHEN** la dueña borra un pedido pendiente
- **THEN** las unidades de ese pedido vuelven al catálogo

#### Scenario: Borrar un pedido con cupón
- **WHEN** la dueña borra un pedido que había consumido un uso de cupón
- **THEN** ese uso vuelve a estar disponible

#### Scenario: Borrar un pedido ya cancelado
- **WHEN** la dueña borra un pedido cancelado, cuyo stock y cupón ya habían sido devueltos al cancelarlo
- **THEN** no se repone stock ni se devuelve el cupón por segunda vez

#### Scenario: Borrar un pedido entregado no inventa mercadería
- **WHEN** la dueña borra un pedido entregado, cuya mercadería ya salió físicamente del catálogo
- **THEN** el stock NO se repone y el uso del cupón NO se devuelve, porque la venta efectivamente ocurrió: borrarla saca el registro de la vista, no deshace el hecho

### Requirement: Borrar una venta concretada avisa que se modifica el historial
El sistema SHALL permitir borrar pedidos entregados, y SHALL advertir explícitamente que hacerlo modifica el historial de ingresos de la tienda. Esa advertencia SHALL distinguirse de la confirmación genérica que se usa para los demás pedidos.

#### Scenario: Borrar un pedido entregado
- **WHEN** la dueña borra un pedido entregado
- **THEN** la confirmación le dice que está modificando su historial de ingresos, y no solo que la acción es irreversible

#### Scenario: Efecto sobre los ingresos
- **WHEN** se borra un pedido entregado que sumaba a los ingresos del período
- **THEN** los ingresos reportados bajan en ese monto

### Requirement: El borrado es recuperable a nivel de datos y definitivo en la interfaz
El sistema NO SHALL destruir la información del pedido al borrarlo: SHALL conservarla marcada de modo que un borrado por error pueda revertirse por fuera del producto. La interfaz NO SHALL ofrecer ninguna forma de ver ni restaurar pedidos borrados: desde la dueña, el borrado es definitivo.

#### Scenario: El pedido no reaparece
- **WHEN** la dueña borra un pedido y navega el panel con cualquier combinación de filtros
- **THEN** el pedido no aparece bajo ninguna vista

#### Scenario: El número correlativo no se reutiliza
- **WHEN** se borra el pedido número 19 y luego entra un pedido nuevo
- **THEN** el pedido nuevo recibe el número siguiente al último asignado, y nunca el 19
