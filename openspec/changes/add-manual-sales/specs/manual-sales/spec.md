## ADDED Requirements

### Requirement: Carga manual de una venta
El sistema SHALL permitir al dueño registrar una venta ocurrida fuera del sitio, indicando fecha, líneas vendidas y, opcionalmente, datos del cliente y notas. La venta registrada SHALL quedar almacenada como un pedido del canal manual, con número de pedido propio, y MUST comportarse como cualquier otro pedido en listado, búsqueda, filtros, exportación y métricas.

#### Scenario: Registrar una venta con productos del catálogo
- **WHEN** el dueño registra una venta de 2 unidades de un producto del catálogo
- **THEN** se crea un pedido del canal manual, con número asignado, estado confirmado y el total calculado a partir de las líneas

#### Scenario: La venta manual aparece en el listado
- **WHEN** el dueño abre el panel de pedidos después de registrar una venta manual
- **THEN** la ve junto al resto de los pedidos, identificada como del canal manual

#### Scenario: Filtrar por canal manual
- **WHEN** el dueño filtra el panel de pedidos por canal manual
- **THEN** ve únicamente las ventas cargadas a mano

#### Scenario: Una venta sin líneas se rechaza
- **WHEN** el dueño intenta registrar una venta sin ninguna línea
- **THEN** el sistema rechaza la operación y no crea ningún pedido

#### Scenario: El total lo calcula el servidor
- **WHEN** se registra una venta cuyas líneas suman un total distinto al enviado por el cliente
- **THEN** el pedido queda con el total calculado a partir de las líneas

### Requirement: Fecha de venta retroactiva
El sistema SHALL permitir indicar la fecha en que la venta ocurrió, distinta de la fecha en que se la registra. Todas las métricas y todos los filtros por fecha SHALL usar la fecha de venta y MUST NOT usar la fecha de registro. La fecha de venta MUST NOT ser futura.

#### Scenario: Venta cargada con fecha pasada
- **WHEN** el dueño registra el jueves una venta ocurrida el martes anterior
- **THEN** la venta aparece en el martes del gráfico de ingresos por día

#### Scenario: Los pedidos existentes no se mueven
- **WHEN** se consultan las métricas de un período anterior al despliegue
- **THEN** los ingresos, el ticket promedio y el gráfico por día son idénticos a los que se mostraban antes

#### Scenario: Fecha futura rechazada
- **WHEN** el dueño intenta registrar una venta con fecha posterior a hoy
- **THEN** el sistema rechaza la operación con un mensaje de validación

#### Scenario: Los pedidos del sitio usan su fecha de creación
- **WHEN** se crea un pedido por WhatsApp o por la pasarela de pago
- **THEN** su fecha de venta coincide con su fecha de creación

### Requirement: Líneas sueltas fuera del catálogo
El sistema SHALL permitir incluir en una venta manual líneas escritas a mano, con nombre, cantidad y precio unitario, sin necesidad de que exista un producto en el catálogo. Una línea suelta MUST poder convivir con líneas de catálogo en la misma venta.

#### Scenario: Venta de un producto no publicado
- **WHEN** el dueño registra una venta de "2 remeras lisas" a $8.000 cada una, sin producto en el catálogo
- **THEN** la venta queda registrada con esa línea, sin producto asociado, y suma $16.000 al total

#### Scenario: Líneas mixtas
- **WHEN** una venta combina una línea del catálogo y una línea suelta
- **THEN** ambas se guardan en el mismo pedido y ambas aportan al total

#### Scenario: Línea suelta sin nombre rechazada
- **WHEN** el dueño intenta guardar una línea suelta sin nombre o sin precio
- **THEN** el sistema rechaza la operación

### Requirement: Descuento de stock opcional
El sistema SHALL ofrecer al registrar una venta manual la opción de descontar las unidades del stock, habilitada por defecto. Cuando la venta no descuenta stock, el sistema MUST NOT reponer unidades si esa venta luego se cancela o se borra.

#### Scenario: Descuento activado
- **WHEN** el dueño registra una venta de 3 unidades de un producto con stock 10, con el descuento activado
- **THEN** el producto queda con stock 7

#### Scenario: Descuento desactivado
- **WHEN** el dueño registra la misma venta con el descuento desactivado
- **THEN** el stock del producto no cambia

#### Scenario: Cancelar una venta que descontó stock
- **WHEN** se cancela una venta manual que había descontado 3 unidades
- **THEN** esas 3 unidades vuelven al stock

#### Scenario: Cancelar una venta que no descontó stock
- **WHEN** se cancela una venta manual que no había descontado stock
- **THEN** el stock no se modifica y no se crean unidades inexistentes

#### Scenario: Borrar una venta que no descontó stock
- **WHEN** se borra una venta manual que no había descontado stock
- **THEN** el stock no se modifica

#### Scenario: Las líneas sueltas no afectan stock
- **WHEN** una venta manual incluye una línea suelta sin producto asociado
- **THEN** esa línea no descuenta ni repone stock de ningún producto

### Requirement: Estado y ciclo de vida de la venta manual
La venta manual SHALL crearse en estado confirmado y con el pago marcado como aprobado, y a partir de ahí SHALL seguir las mismas transiciones de estado que cualquier otro pedido. Ningún proceso automático de expiración MUST alterar una venta manual.

#### Scenario: Nace confirmada y cuenta en métricas
- **WHEN** se registra una venta manual
- **THEN** queda en estado confirmado y aporta a los ingresos del período sin ningún paso adicional

#### Scenario: Se puede marcar como entregada
- **WHEN** el dueño marca como entregada una venta manual confirmada
- **THEN** la transición se aplica igual que en cualquier otro pedido

#### Scenario: La expiración automática no la toca
- **WHEN** corren los procesos automáticos de expiración de pedidos pendientes
- **THEN** ninguna venta manual cambia de estado

### Requirement: Costo congelado en la venta manual
La venta manual SHALL congelar el costo de cada línea igual que cualquier otro pedido: tomándolo del catálogo cuando la línea corresponde a un producto o variante, y permitiendo cargarlo a mano en las líneas sueltas. El costo MUST ser opcional.

#### Scenario: Costo heredado del catálogo
- **WHEN** se registra una venta de un producto que tiene costo cargado
- **THEN** la línea queda con ese costo congelado y la venta aporta a la ganancia del período

#### Scenario: Costo manual en una línea suelta
- **WHEN** el dueño registra una línea suelta indicando su costo
- **THEN** la línea queda con ese costo congelado

#### Scenario: Venta sin costo
- **WHEN** se registra una venta sin costo en ninguna línea
- **THEN** la venta se registra igual, aporta a los ingresos y baja la cobertura de costo del período

### Requirement: La carga manual de ventas es exclusiva del plan Pro
El sistema SHALL habilitar el registro manual de ventas únicamente a las tiendas del plan Pro, verificándolo en el servidor.

#### Scenario: Tienda Pro puede registrar
- **WHEN** el dueño de una tienda Pro abre el panel de pedidos
- **THEN** ve la acción para registrar una venta manual

#### Scenario: Tienda sin plan Pro no ve la acción
- **WHEN** el dueño de una tienda Inicial o Medio abre el panel de pedidos
- **THEN** no ve la acción para registrar una venta manual

#### Scenario: La verificación es del lado del servidor
- **WHEN** una tienda que no es Pro invoca directamente la acción de registro manual
- **THEN** el servidor rechaza la operación y no crea ningún pedido

#### Scenario: Aislamiento entre tiendas
- **WHEN** un dueño intenta registrar una venta con productos que pertenecen a otra tienda
- **THEN** el servidor rechaza la operación
