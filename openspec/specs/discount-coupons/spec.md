# discount-coupons Specification

## Purpose
TBD - created by archiving change add-discount-coupons. Update Purpose after archive.
## Requirements
### Requirement: Modelo de cupón
El sistema SHALL persistir cupones asociados a una tienda. Cada cupón MUST tener: un código, un tipo de descuento (`percent` o `fixed`), un valor de descuento positivo y un estado activo/inactivo. Cada cupón MAY tener una fecha de vencimiento (si no la tiene, el cupón no expira), un monto mínimo de compra y un límite total de usos. El código MUST ser único dentro de la misma tienda y SHALL almacenarse normalizado (mayúsculas, sin espacios al inicio/fin). Un cupón pertenece a exactamente una tienda y SHALL eliminarse en cascada si la tienda se elimina.

#### Scenario: Código único por tienda
- **WHEN** un dueño intenta crear un cupón con un código que ya existe en su tienda (ignorando mayúsculas/minúsculas)
- **THEN** el sistema rechaza la operación con un mensaje de error y no crea un segundo cupón

#### Scenario: Mismo código en tiendas distintas
- **WHEN** dos tiendas distintas crean cada una un cupón con el código `VERANO20`
- **THEN** el sistema acepta ambos porque la unicidad es por tienda

#### Scenario: Validación del tipo y valor
- **WHEN** un dueño guarda un cupón de tipo `percent` con valor mayor a 100, o un valor menor o igual a 0
- **THEN** el sistema rechaza la operación con un mensaje de error de validación

### Requirement: Gestión de cupones por el dueño
El sistema SHALL ofrecer al dueño de la tienda una sección "Cupones" en el dashboard donde puede crear, editar, borrar y activar/desactivar cupones. Todas las operaciones MUST estar restringidas a los cupones de la tienda del dueño autenticado.

#### Scenario: Crear cupón
- **WHEN** el dueño completa el formulario de cupón con código, tipo y valor válidos (con o sin fecha de vencimiento) y guarda
- **THEN** el cupón queda persistido en su tienda y aparece en la lista de cupones

#### Scenario: Editar cupón
- **WHEN** el dueño modifica el valor o el vencimiento de un cupón existente y guarda
- **THEN** los cambios quedan persistidos

#### Scenario: Borrar cupón
- **WHEN** el dueño borra un cupón
- **THEN** el cupón deja de existir y ya no puede aplicarse en el storefront

#### Scenario: Activar/desactivar sin borrar
- **WHEN** el dueño desactiva un cupón
- **THEN** el cupón se conserva pero deja de ser válido para aplicar en el storefront

#### Scenario: Aislamiento entre tiendas
- **WHEN** una solicitud autenticada intenta editar o borrar un cupón que pertenece a otra tienda
- **THEN** el sistema rechaza la operación y no modifica el cupón ajeno

### Requirement: Validación de cupón en el storefront
El sistema SHALL permitir al cliente ingresar un código de cupón en el carrito y validarlo del lado del servidor antes de aplicarlo. La validación MUST verificar que el cupón existe en la tienda, está activo, no está vencido, cumple el monto mínimo de compra (si lo tiene) y no superó el límite total de usos (si lo tiene). El sistema MUST NOT confiar en un descuento calculado por el cliente.

#### Scenario: Cupón válido
- **WHEN** el cliente ingresa un código que existe, está activo, no está vencido y el carrito cumple el mínimo
- **THEN** el sistema confirma el cupón y devuelve el descuento a aplicar

#### Scenario: Cupón inexistente o inactivo
- **WHEN** el cliente ingresa un código que no existe en la tienda o que está desactivado
- **THEN** el sistema rechaza el cupón con un mensaje claro y el total no cambia

#### Scenario: Cupón vencido
- **WHEN** el cliente ingresa un código cuya fecha de vencimiento ya pasó (considerando el fin del día en hora de Argentina)
- **THEN** el sistema rechaza el cupón como vencido

#### Scenario: No cumple el mínimo de compra
- **WHEN** el cupón tiene un mínimo de compra y el total del carrito es menor a ese mínimo
- **THEN** el sistema rechaza el cupón indicando el monto mínimo requerido

#### Scenario: Límite de usos alcanzado
- **WHEN** el cupón tiene un límite total de usos y ese límite ya fue alcanzado
- **THEN** el sistema rechaza el cupón como agotado

### Requirement: Vigencia del cupón
La fecha de vencimiento de un cupón es opcional. Si un cupón no tiene fecha de vencimiento, el sistema SHALL considerarlo siempre vigente (mientras esté activo). Si la tiene, el sistema SHALL considerarlo válido hasta el final (23:59:59) de esa fecha en la zona horaria de Argentina (UTC-3).

#### Scenario: Cupón sin fecha de vencimiento
- **WHEN** un cupón no tiene fecha de vencimiento y está activo
- **THEN** el cupón nunca es rechazado por vencimiento

#### Scenario: Último día de validez
- **WHEN** un cupón vence el 30/06 y el cliente lo aplica el 30/06 a las 20:00 hora de Argentina
- **THEN** el cupón es válido

#### Scenario: Día posterior al vencimiento
- **WHEN** un cupón vence el 30/06 y el cliente lo aplica el 01/07 a las 00:30 hora de Argentina
- **THEN** el cupón es rechazado por vencido

### Requirement: Aplicación del descuento sobre el total
El sistema SHALL aplicar como máximo un cupón por compra. El descuento SHALL calcularse sobre el total del carrito: para tipo `percent`, el porcentaje sobre el total; para tipo `fixed`, el monto fijo. El total final MUST NOT ser menor a cero. Aplicar un nuevo cupón SHALL reemplazar al cupón previamente aplicado.

#### Scenario: Descuento por porcentaje
- **WHEN** el carrito suma $1000 y se aplica un cupón `percent` de 20%
- **THEN** el descuento es $200 y el total final es $800

#### Scenario: Descuento por monto fijo
- **WHEN** el carrito suma $1000 y se aplica un cupón `fixed` de $300
- **THEN** el descuento es $300 y el total final es $700

#### Scenario: Descuento fijo mayor al total
- **WHEN** el carrito suma $200 y se aplica un cupón `fixed` de $300
- **THEN** el total final es $0 (no negativo)

#### Scenario: Reemplazo de cupón
- **WHEN** ya hay un cupón aplicado y el cliente aplica otro código válido
- **THEN** el segundo cupón reemplaza al primero y el descuento se recalcula

### Requirement: Reflejo del cupón en el checkout por WhatsApp
El sistema SHALL reflejar el cupón aplicado en el resumen del carrito y en el mensaje de WhatsApp del pedido, incluyendo el código, el descuento y el total final. El código aplicado SHALL registrarse en el pedido pendiente creado y SHALL incrementar el contador de usos del cupón.

#### Scenario: Mensaje de WhatsApp con cupón
- **WHEN** el cliente confirma el pedido con un cupón válido aplicado
- **THEN** el mensaje de WhatsApp incluye una línea con el código del cupón y el descuento, y muestra el total final con el descuento aplicado

#### Scenario: Registro del cupón en el pedido
- **WHEN** se crea el pedido pendiente con un cupón aplicado
- **THEN** el código del cupón queda registrado en el pedido y el contador de usos del cupón se incrementa

#### Scenario: Pedido sin cupón
- **WHEN** el cliente confirma el pedido sin haber aplicado ningún cupón
- **THEN** el mensaje de WhatsApp y el pedido se generan como hoy, sin línea de descuento

### Requirement: Total del carrito consistente con variantes
El sistema SHALL calcular el total del carrito usando el precio de la variante seleccionada cuando exista, de modo que el total mostrado en el carrito coincida con el total del mensaje de WhatsApp.

#### Scenario: Item con variante de precio distinto
- **WHEN** el carrito contiene un item con una variante cuyo precio difiere del precio base del producto
- **THEN** el total del carrito y el total del mensaje de WhatsApp usan el precio de la variante y coinciden

