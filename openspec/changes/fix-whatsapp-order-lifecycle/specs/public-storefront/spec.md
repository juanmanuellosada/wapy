## ADDED Requirements

### Requirement: El mensaje de WhatsApp identifica el pedido de forma accionable
El mensaje de WhatsApp generado al finalizar la compra SHALL identificar el pedido con su número correlativo por tienda, legible y transcribible por una persona, y SHALL incluir el enlace que lleva a la dueña directamente a ese pedido en su panel.

#### Scenario: Mensaje con número legible
- **WHEN** la compradora finaliza un pedido por WhatsApp
- **THEN** el mensaje identifica el pedido con su número correlativo y no con un identificador interno

#### Scenario: Mensaje con enlace al pedido
- **WHEN** la dueña recibe el mensaje
- **THEN** encuentra en él un enlace que la lleva a ese pedido en su panel

### Requirement: Un pedido que no pudo registrarse no se anuncia como registrado
Si la creación del pedido falla, el sistema NO SHALL entregar a la compradora un mensaje que referencie un pedido inexistente. La compradora SHALL recibir una indicación de que el pedido no pudo registrarse y el fallo SHALL quedar registrado para diagnóstico en vez de descartarse en silencio.

#### Scenario: Falla la creación del pedido
- **WHEN** la creación del pedido falla por un error del servidor
- **THEN** la compradora no recibe un mensaje con un número de pedido que no existe en el sistema

#### Scenario: Visibilidad del fallo
- **WHEN** la creación del pedido falla
- **THEN** el error queda registrado y no se descarta silenciosamente

#### Scenario: Creación exitosa
- **WHEN** el pedido se crea correctamente
- **THEN** el flujo de WhatsApp continúa como hasta ahora
