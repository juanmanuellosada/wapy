## ADDED Requirements

### Requirement: Registro de las acciones del dueño sobre pedidos
El sistema SHALL registrar cada operación del dueño que confirme, cancele, entregue o borre pedidos, ya sea individual o en lote, guardando una única entrada de registro por operación. El registro MUST incluir, para cada pedido afectado, su estado anterior y si esa operación repuso stock y revirtió el uso del cupón. El sistema MUST NOT registrar la creación de pedidos ni los cambios originados en procesos automáticos.

#### Scenario: Acción individual registrada
- **WHEN** el dueño marca un pedido como entregado
- **THEN** queda registrada una operación con ese pedido, su estado anterior y los efectos aplicados

#### Scenario: Un lote es una sola operación
- **WHEN** el dueño cancela 50 pedidos seleccionados
- **THEN** queda registrada **una** operación con las 50 entradas, no 50 operaciones

#### Scenario: Solo se registran los pedidos efectivamente afectados
- **WHEN** una operación en lote aplica sobre 47 pedidos y falla en 3
- **THEN** la operación registrada contiene únicamente las 47 entradas aplicadas

#### Scenario: Los procesos automáticos no se registran
- **WHEN** el proceso automático de expiración cancela pedidos vencidos
- **THEN** no se registra ninguna operación deshacible

#### Scenario: Un fallo al registrar no revierte la acción
- **WHEN** la acción se aplica correctamente pero el registro no puede guardarse
- **THEN** la acción permanece aplicada y la operación simplemente no queda disponible para deshacer

### Requirement: Ventana de operaciones deshacibles
El sistema SHALL ofrecer como deshacibles, para cada tienda, las últimas cinco operaciones no deshechas realizadas dentro de las últimas veinticuatro horas, ordenadas de la más reciente a la más antigua. Las operaciones fuera de esa ventana MUST NOT ofrecerse, aunque sus registros se conserven.

#### Scenario: Lista de acciones recientes
- **WHEN** el dueño realizó ocho operaciones en la última hora
- **THEN** la lista de acciones recientes ofrece las cinco más recientes

#### Scenario: Operación de hace dos días
- **WHEN** la última operación del dueño ocurrió hace dos días
- **THEN** no se ofrece deshacerla y la lista de acciones recientes aparece vacía

#### Scenario: Las operaciones ya deshechas salen de la lista
- **WHEN** el dueño deshace una operación
- **THEN** esa operación deja de aparecer entre las deshacibles

#### Scenario: Aislamiento entre tiendas
- **WHEN** el dueño consulta sus acciones recientes
- **THEN** solo ve operaciones de su propia tienda

### Requirement: Deshacer restaura el estado previo del pedido
Al deshacer una operación, el sistema SHALL devolver cada pedido afectado al estado que tenía antes, restaurando su estado, limpiando el marcador temporal que la operación había escrito y restaurando el motivo de cancelación y la marca de borrado. El deshacer MUST NOT estar sujeto a las transiciones de estado permitidas, dado que restaura un estado anterior en lugar de avanzar el ciclo de vida.

#### Scenario: Deshacer una entrega
- **WHEN** el dueño deshace la operación que marcó un pedido como entregado
- **THEN** el pedido vuelve a estar confirmado y deja de tener marca de entrega

#### Scenario: Deshacer una confirmación
- **WHEN** el dueño deshace la operación que confirmó un pedido
- **THEN** el pedido vuelve a estar pendiente y deja de tener marca de confirmación

#### Scenario: Deshacer una cancelación propia
- **WHEN** el dueño deshace una cancelación que él mismo había hecho
- **THEN** el pedido vuelve a su estado anterior, sin marca de cancelación ni motivo de cancelación

#### Scenario: Deshacer un borrado
- **WHEN** el dueño deshace el borrado de un pedido
- **THEN** el pedido vuelve a aparecer en el panel, en el mismo estado en que estaba

#### Scenario: Deshacer un lote completo
- **WHEN** el dueño deshace una operación que había afectado a 50 pedidos
- **THEN** los 50 vuelven a su estado anterior en una sola acción

#### Scenario: No se puede deshacer dos veces
- **WHEN** el dueño intenta deshacer una operación ya deshecha
- **THEN** el sistema informa que ya fue deshecha y no modifica ningún pedido

### Requirement: Reversión de los efectos sobre stock y cupón
Al deshacer, el sistema SHALL revertir los efectos sobre el stock y sobre el uso del cupón **según lo registrado en la operación**, y MUST NOT deducirlos del estado actual del pedido. Cuando la operación repuso stock, el deshacer SHALL volver a descontarlo; cuando revirtió el uso de un cupón, SHALL volver a contarlo.

#### Scenario: Deshacer una cancelación vuelve a descontar el stock
- **WHEN** se deshace una cancelación que había repuesto 3 unidades
- **THEN** esas 3 unidades vuelven a descontarse del stock

#### Scenario: Deshacer el borrado de un pedido entregado no toca el stock
- **WHEN** se deshace el borrado de un pedido que estaba entregado, cuyo borrado no había repuesto stock
- **THEN** el pedido se restaura y el stock no se modifica

#### Scenario: Deshacer el borrado de un pedido pendiente vuelve a descontar
- **WHEN** se deshace el borrado de un pedido pendiente cuyo borrado había repuesto stock
- **THEN** el stock vuelve a descontarse exactamente una vez

#### Scenario: El uso del cupón se vuelve a contar
- **WHEN** se deshace una operación que había devuelto el uso de un cupón
- **THEN** el uso vuelve a contarse una sola vez

#### Scenario: Sin cupón no hay efecto
- **WHEN** se deshace una operación sobre un pedido sin cupón
- **THEN** ningún cupón se modifica

### Requirement: El deshacer se rechaza cuando no puede restaurar fielmente
El sistema MUST NOT deshacer un pedido cuyo estado haya cambiado después de la operación registrada, ni uno cuyo stock sea insuficiente para revertir la reposición. En ambos casos el pedido MUST quedar intacto y el motivo MUST informarse. Cuando la operación abarca varios pedidos, el sistema SHALL deshacer los que pueda e informar los que no, con el mismo formato de resultado parcial que usan las acciones en lote.

#### Scenario: El pedido cambió después
- **WHEN** se intenta deshacer la confirmación de un pedido que luego fue cancelado
- **THEN** ese pedido no se modifica y se informa que cambió desde entonces

#### Scenario: Stock insuficiente
- **WHEN** se intenta deshacer una cancelación pero las unidades ya se vendieron a otra persona
- **THEN** el pedido queda intacto y se informa qué producto no tiene stock suficiente

#### Scenario: Resultado parcial en un lote
- **WHEN** se deshace una operación de 50 pedidos donde 3 cambiaron después y 1 no tiene stock
- **THEN** 46 vuelven a su estado anterior y se informan los 4 restantes con su motivo

#### Scenario: La operación queda marcada aunque haya fallos parciales
- **WHEN** una operación se deshace parcialmente
- **THEN** deja de ofrecerse como deshacible y no se reintenta automáticamente

### Requirement: Acceso al deshacer desde el panel
El sistema SHALL ofrecer deshacer desde el aviso que aparece inmediatamente después de cada acción, y desde una lista de acciones recientes en el panel de pedidos. Tras deshacer, la vista SHALL reflejar el estado restaurado sin que el usuario tenga que recargar. Los textos de confirmación de las acciones MUST NOT afirmar que la acción es irreversible cuando puede deshacerse.

#### Scenario: Deshacer desde el aviso
- **WHEN** el dueño cancela un pedido y presiona "Deshacer" en el aviso
- **THEN** el pedido vuelve a su estado anterior y la lista de pedidos se actualiza

#### Scenario: Deshacer después de que el aviso desapareció
- **WHEN** el dueño busca deshacer una acción cuyo aviso ya no está visible
- **THEN** la encuentra en la lista de acciones recientes y puede deshacerla desde ahí

#### Scenario: El aviso sobrevive a un cambio de filtro
- **WHEN** el dueño cambia los filtros del panel y luego presiona "Deshacer" en un aviso anterior
- **THEN** la operación se deshace correctamente y la vista se actualiza según los filtros vigentes

#### Scenario: El texto de borrado refleja que puede deshacerse
- **WHEN** el dueño abre la confirmación de borrado de un pedido
- **THEN** el texto no afirma que la acción sea imposible de deshacer
