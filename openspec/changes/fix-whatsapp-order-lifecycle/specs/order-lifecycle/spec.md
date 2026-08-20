## ADDED Requirements

### Requirement: Numeración correlativa por tienda
Cada pedido SHALL recibir, al crearse, un número correlativo único dentro de su tienda, persistido en el pedido y estable para siempre. La asignación SHALL ser atómica para que dos pedidos simultáneos de la misma tienda nunca reciban el mismo número. El número SHALL ser la identificación visible del pedido en el panel, en el buscador y en el mensaje de WhatsApp.

#### Scenario: Asignación al crear el pedido
- **WHEN** se crea un pedido en una tienda cuyo último pedido fue el número 126
- **THEN** el pedido nuevo queda con el número 127 y ese valor no cambia nunca más

#### Scenario: Creación concurrente
- **WHEN** dos pedidos de la misma tienda se crean simultáneamente
- **THEN** cada uno recibe un número distinto y ninguno queda sin número

#### Scenario: Numeración independiente entre tiendas
- **WHEN** dos tiendas distintas crean su primer pedido
- **THEN** ambas obtienen el número 1, sin interferencia entre sí

#### Scenario: Huecos por pedidos no concretados
- **WHEN** el pedido 127 se cancela
- **THEN** el número 127 no se reasigna y el siguiente pedido de esa tienda es el 128

#### Scenario: Pedidos preexistentes
- **WHEN** se aplica la migración sobre una tienda con pedidos anteriores
- **THEN** esos pedidos reciben números correlativos según su orden de creación

### Requirement: Política de expiración diferenciada por canal
El sistema SHALL aplicar una política de expiración a los pedidos pendientes de todos los canales, no solo de Mercado Pago. Los pedidos de Mercado Pago SHALL mantener su ventana actual de 24 horas. Los pedidos de WhatsApp SHALL usar una ventana configurable por tienda, expresada en días, sensiblemente más larga porque su ciclo incluye coordinación humana por chat.

#### Scenario: Pedido de WhatsApp que supera la ventana
- **WHEN** un pedido de WhatsApp lleva pendiente más días que la ventana configurada de su tienda
- **THEN** el sistema aplica la política de la tienda en vez de dejarlo pendiente indefinidamente

#### Scenario: Pedido de WhatsApp dentro de la ventana
- **WHEN** un pedido de WhatsApp lleva pendiente menos días que la ventana configurada
- **THEN** el pedido no se toca

#### Scenario: Mercado Pago conserva su ventana
- **WHEN** el cron evalúa un pedido pendiente de Mercado Pago de más de 24 horas
- **THEN** se cancela como hasta ahora, sin verse afectado por la configuración de WhatsApp

### Requirement: Cancelación automática repone stock y devuelve el cupón
Cuando el sistema cancela un pedido por vencimiento de la ventana, SHALL reponer el stock comprometido y SHALL devolver el uso del cupón si ese uso había sido contabilizado. La operación SHALL ser idempotente: reprocesar el mismo pedido no repone stock ni devuelve usos dos veces.

#### Scenario: Cancelación por vencimiento
- **WHEN** un pedido de WhatsApp con cupón vence su ventana y la tienda no tiene auto-confirmación
- **THEN** el pedido pasa a cancelado, el stock vuelve al catálogo y el uso del cupón se devuelve

#### Scenario: Reprocesamiento del mismo pedido
- **WHEN** el cron vuelve a evaluar un pedido ya cancelado
- **THEN** no se repone stock ni se devuelve el cupón por segunda vez

### Requirement: Auto-confirmación al vencer es opt-in por tienda
El sistema SHALL ofrecer a cada tienda la opción de confirmar automáticamente los pedidos de WhatsApp al vencer la ventana, en lugar de cancelarlos. Esa opción SHALL venir desactivada por default. La interfaz que la expone SHALL advertir explícitamente que confirmar sin evidencia de pago registra como ventas pedidos que pueden no haberse concretado.

#### Scenario: Tienda con auto-confirmación desactivada
- **WHEN** vence la ventana de un pedido de WhatsApp en una tienda que no activó la opción
- **THEN** el pedido se cancela

#### Scenario: Tienda con auto-confirmación activada
- **WHEN** vence la ventana de un pedido de WhatsApp en una tienda que activó la opción
- **THEN** el pedido pasa a confirmado y el stock queda descontado

#### Scenario: Default de una tienda nueva
- **WHEN** se crea una tienda
- **THEN** la auto-confirmación queda desactivada sin intervención

### Requirement: La política no se aplica retroactivamente
Cada tienda SHALL tener una fecha desde la cual rige la política de ciclo de vida, y el sistema SHALL evaluar únicamente los pedidos creados a partir de esa fecha. Los pedidos pendientes anteriores SHALL permanecer intactos hasta que la dueña actúe sobre ellos.

#### Scenario: Pedido anterior a la fecha de corte
- **WHEN** el cron encuentra un pedido de WhatsApp pendiente creado antes de la fecha de vigencia de su tienda
- **THEN** no lo cancela ni lo confirma, y lo deja como está

#### Scenario: Pedido posterior a la fecha de corte
- **WHEN** el cron encuentra un pedido pendiente vencido creado después de la fecha de vigencia
- **THEN** aplica la política configurada por la tienda

### Requirement: Transiciones de estado válidas
El sistema SHALL permitir únicamente las transiciones `pending → confirmed`, `pending → cancelled`, `confirmed → delivered` y `confirmed → cancelled`. El estado `delivered` SHALL ser terminal, y `cancelled` SHALL ser terminal salvo en el caso previsto para la cancelación automática. Toda transición no permitida SHALL rechazarse con un error explícito, tanto en operaciones individuales como en lote.

#### Scenario: Transición inválida
- **WHEN** se intenta pasar un pedido entregado a confirmado
- **THEN** la operación se rechaza y el pedido no cambia de estado

#### Scenario: Cancelación manual desde pendiente
- **WHEN** la dueña cancela un pedido pendiente con cupón
- **THEN** el pedido queda cancelado, el stock vuelve al catálogo y el uso del cupón se devuelve

### Requirement: Criterio único de venta en las métricas
Las métricas del panel SHALL considerar venta únicamente a los pedidos en estado `confirmed` o `delivered`, y SHALL aplicar ese mismo criterio a todos los indicadores de una misma vista. Los ingresos SHALL calcularse sobre el monto neto, descontando el descuento aplicado.

#### Scenario: Ingresos netos
- **WHEN** una tienda tiene un pedido confirmado de $10.000 con $2.000 de descuento por cupón
- **THEN** los ingresos reportados suman $8.000 y no $10.000

#### Scenario: Consistencia entre indicadores
- **WHEN** el panel muestra ingresos junto a productos más pedidos
- **THEN** ambos consideran solamente pedidos confirmados o entregados, sin incluir pendientes ni cancelados

#### Scenario: Pedido pendiente no computa
- **WHEN** una tienda tiene pedidos pendientes sin confirmar
- **THEN** esos pedidos no suman a los ingresos ni a los productos más pedidos

### Requirement: La cancelación automática es reversible
El sistema SHALL registrar si una cancelación fue decidida por la dueña o aplicada automáticamente por vencimiento de la ventana. Una cancelación automática SHALL poder revertirse a `confirmed`, reponiendo el compromiso de stock y volviendo a contabilizar el uso del cupón. Una cancelación decidida por la dueña SHALL permanecer terminal.

#### Scenario: Recuperar una venta real cancelada por el sistema
- **WHEN** el sistema canceló un pedido por vencimiento y la dueña confirma que esa venta sí ocurrió
- **THEN** puede pasarlo a confirmado, y el stock vuelve a descontarse y el uso del cupón vuelve a contabilizarse

#### Scenario: La cancelación manual sigue siendo definitiva
- **WHEN** la dueña canceló un pedido ella misma
- **THEN** no puede pasarlo a confirmado

#### Scenario: Stock insuficiente al revivir
- **WHEN** la dueña intenta revivir un pedido cancelado por el sistema pero ya no hay stock suficiente
- **THEN** la operación se rechaza con un motivo explícito y el pedido queda como estaba
