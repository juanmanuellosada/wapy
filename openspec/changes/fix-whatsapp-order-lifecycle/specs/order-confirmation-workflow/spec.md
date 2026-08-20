## ADDED Requirements

### Requirement: Deep link al pedido desde el mensaje de WhatsApp
El mensaje de WhatsApp que la compradora envía a la tienda SHALL incluir un enlace que abra ese pedido puntual en el panel de la dueña, con la acción de confirmar disponible sin ninguna búsqueda previa. El enlace SHALL ser solo navegación: la autorización SHALL seguir dependiendo de la sesión de la dueña, de modo que quien no sea dueña de esa tienda no pueda ver ni modificar el pedido.

#### Scenario: La dueña abre el link con sesión activa
- **WHEN** la dueña toca el enlace del mensaje estando logueada
- **THEN** aterriza en ese pedido, con sus items y total visibles y el botón de confirmar a mano

#### Scenario: La dueña abre el link sin sesión
- **WHEN** la dueña toca el enlace desde el celular sin sesión activa
- **THEN** se le pide iniciar sesión y, al hacerlo, llega al pedido que abrió y no a una pantalla genérica

#### Scenario: La compradora toca el enlace
- **WHEN** la compradora abre el enlace que quedó en su propio chat
- **THEN** no accede al pedido ni puede confirmarlo

#### Scenario: Dueña de otra tienda
- **WHEN** una dueña de otra tienda abre el enlace con su sesión
- **THEN** no accede al pedido

### Requirement: El pedido de WhatsApp es identificable en el panel
El panel SHALL distinguir visualmente los pedidos según su canal de origen, incluidos los de WhatsApp, y SHALL permitir filtrar por canal. El buscador SHALL aceptar el número correlativo del pedido, que es el mismo que aparece en el mensaje de WhatsApp.

#### Scenario: Distinción por canal
- **WHEN** la dueña mira la lista con pedidos de WhatsApp y de Mercado Pago mezclados
- **THEN** puede reconocer a simple vista de qué canal viene cada uno

#### Scenario: Filtro por canal
- **WHEN** la dueña filtra por canal WhatsApp
- **THEN** la lista muestra solo esos pedidos

#### Scenario: Búsqueda por número correlativo
- **WHEN** la dueña ingresa el número que leyó en el mensaje de WhatsApp
- **THEN** encuentra ese pedido

#### Scenario: Búsqueda de un pedido anterior al cambio
- **WHEN** la dueña busca por la referencia corta que circuló en chats de pedidos previos a este change
- **THEN** también encuentra ese pedido, aunque la pantalla lo identifique por su número correlativo

### Requirement: Confirmación en lote con resultado parcial
El panel SHALL permitir seleccionar varios pedidos y aplicarles un cambio de estado en una sola acción. Cada pedido SHALL validarse individualmente contra las transiciones permitidas, y un pedido inválido NO SHALL abortar el lote. La operación SHALL informar cuántos pedidos cambiaron y cuáles no, con el motivo.

#### Scenario: Lote homogéneo
- **WHEN** la dueña selecciona ocho pedidos pendientes y los confirma
- **THEN** los ocho quedan confirmados en una sola operación

#### Scenario: Lote con un pedido no transicionable
- **WHEN** la dueña confirma un lote donde uno de los pedidos ya estaba cancelado
- **THEN** los demás se confirman igual y se informa cuál falló y por qué

### Requirement: Confirmar no deja la vista en un estado intermedio
Cuando la dueña confirma un pedido desde su detalle, la interfaz SHALL reflejar el resultado y devolverla al listado sin requerir un cierre manual adicional.

#### Scenario: Confirmación individual
- **WHEN** la dueña confirma un pedido desde el detalle
- **THEN** la vista vuelve al listado con el pedido ya actualizado, sin que tenga que cerrar nada

### Requirement: Resumen diario de pedidos pendientes
El sistema SHALL enviar a la dueña un resumen periódico de sus pedidos pendientes, en un único mensaje agrupado y no uno por pedido. El resumen SHALL enviarse únicamente cuando haya pedidos pendientes, de modo que su ausencia sea informativa, y SHALL incluir el enlace directo a cada pedido.

#### Scenario: Tienda con pendientes
- **WHEN** una tienda tiene pedidos pendientes al momento del envío
- **THEN** la dueña recibe un solo mensaje con todos ellos y un enlace a cada uno

#### Scenario: Tienda sin pendientes
- **WHEN** una tienda no tiene pedidos pendientes
- **THEN** no se le envía ningún mensaje

### Requirement: Revisión del backlog anterior a la política
Mientras existan pedidos pendientes creados antes de la fecha de vigencia de la política, el panel SHALL informarlo y ofrecer llegar a esa lista filtrada en un paso. El sistema NO SHALL confirmar ni cancelar esos pedidos por su cuenta: la decisión SHALL ser siempre de la dueña.

#### Scenario: Tienda con backlog
- **WHEN** la dueña entra al panel y tiene pedidos pendientes previos a la fecha de corte
- **THEN** ve cuántos son y puede llegar a esa lista filtrada directamente

#### Scenario: La dueña resuelve el backlog en lote
- **WHEN** la dueña revisa esa lista y confirma o cancela los que corresponden
- **THEN** el aviso deja de mostrarse

#### Scenario: El sistema no decide por ella
- **WHEN** pasan meses sin que la dueña toque el backlog
- **THEN** esos pedidos siguen en el estado en que estaban

### Requirement: El listado de pedidos es paginado y se filtra completo
El listado de pedidos SHALL estar paginado y NO SHALL truncar el historial a un tope fijo. Todos los filtros —canal, estado, sección, rango de fechas y búsqueda— SHALL aplicarse sobre el conjunto completo de pedidos de la tienda y no sobre la página visible. La exportación SHALL abarcar el conjunto filtrado completo.

#### Scenario: Tienda con historial extenso
- **WHEN** una tienda acumuló más pedidos de los que entran en una página
- **THEN** puede recorrer todo su historial y ninguno queda inaccesible

#### Scenario: Filtro sobre el conjunto completo
- **WHEN** la dueña filtra por estado pendiente teniendo pedidos que superan una página
- **THEN** el resultado incluye todos los pendientes de la tienda y no solo los de la página que estaba viendo

#### Scenario: Exportación de una vista filtrada
- **WHEN** la dueña exporta con un filtro aplicado
- **THEN** el archivo contiene todos los pedidos que cumplen el filtro, no únicamente la página visible
