## MODIFIED Requirements

### Requirement: Reflejo del cupón en el checkout por WhatsApp
El sistema SHALL reflejar el cupón aplicado en el resumen del carrito y en el mensaje de WhatsApp del pedido, incluyendo el código, el descuento y el total final. El código aplicado SHALL registrarse en el pedido pendiente creado y SHALL incrementar el contador de usos del cupón. El pedido SHALL registrar además si ese incremento efectivamente ocurrió, de modo que el uso pueda devolverse más adelante sin depender del canal ni del estado del pedido.

#### Scenario: Mensaje de WhatsApp con cupón
- **WHEN** el cliente confirma el pedido con un cupón válido aplicado
- **THEN** el mensaje de WhatsApp incluye una línea con el código del cupón y el descuento, y muestra el total final con el descuento aplicado

#### Scenario: Registro del cupón en el pedido
- **WHEN** se crea el pedido pendiente con un cupón aplicado
- **THEN** el código del cupón queda registrado en el pedido, el contador de usos del cupón se incrementa y el pedido queda marcado como que consumió un uso

#### Scenario: Pedido sin cupón
- **WHEN** el cliente confirma el pedido sin haber aplicado ningún cupón
- **THEN** el mensaje de WhatsApp y el pedido se generan como hoy, sin línea de descuento

## ADDED Requirements

### Requirement: Devolución del uso del cupón cuando el pedido no se concreta
Cuando un pedido que consumió un uso de cupón deja de ser una venta —por cancelación manual, por vencimiento de la ventana o por reembolso— el sistema SHALL devolver ese uso al cupón. La devolución SHALL depender de si el uso fue efectivamente contabilizado y NO SHALL depender del canal del pedido ni de su estado previo. La operación SHALL ser idempotente.

#### Scenario: Cancelación manual de un pedido de WhatsApp pendiente
- **WHEN** la dueña cancela un pedido de WhatsApp que estaba pendiente y tenía cupón
- **THEN** el contador de usos del cupón vuelve a bajar y ese uso queda disponible para otra compradora

#### Scenario: Cancelación por vencimiento
- **WHEN** un pedido con cupón se cancela automáticamente por superar su ventana
- **THEN** el uso del cupón se devuelve

#### Scenario: Cupón agotado por pedidos nunca concretados
- **WHEN** un cupón con diez usos máximos acumuló diez pedidos pendientes que luego se cancelan
- **THEN** el cupón vuelve a tener sus diez usos disponibles

#### Scenario: Doble reversión
- **WHEN** se intenta devolver el uso de un pedido cuyo uso ya fue devuelto
- **THEN** el contador no baja por segunda vez

#### Scenario: Pedido que nunca contabilizó uso
- **WHEN** se cancela un pedido de Mercado Pago que nunca llegó a aprobarse y por lo tanto nunca contabilizó el uso
- **THEN** el contador del cupón no se modifica
