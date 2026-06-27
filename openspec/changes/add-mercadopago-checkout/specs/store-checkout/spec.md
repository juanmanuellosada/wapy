## ADDED Requirements

### Requirement: Toggle de modo de checkout por tienda
La tienda SHALL tener un modo de checkout (`checkout_mode`) que sea `whatsapp` o `mercadopago`, con default `whatsapp`. El modo `mercadopago` SHALL ser efectivo únicamente cuando la tienda tenga una conexión de Mercado Pago válida (capability `mercadopago-connect`); de lo contrario el storefront SHALL comportarse como modo `whatsapp`.

#### Scenario: Default es WhatsApp
- **WHEN** se crea una tienda nueva
- **THEN** su `checkout_mode` es `whatsapp` y el storefront mantiene el handoff a WhatsApp sin cambios

#### Scenario: Activar modo Mercado Pago con conexión válida
- **WHEN** el dueño tiene una conexión MP válida y setea `checkout_mode = 'mercadopago'`
- **THEN** el storefront público ofrece pagar online en vez del handoff a WhatsApp

#### Scenario: Modo Mercado Pago sin conexión cae a WhatsApp
- **WHEN** una tienda tiene `checkout_mode = 'mercadopago'` pero no tiene conexión MP válida (nunca conectó o fue revocada)
- **THEN** el storefront se comporta como modo `whatsapp` y el dashboard indica que falta conectar la cuenta

#### Scenario: Solo el dueño cambia el modo de su tienda
- **WHEN** un usuario que no es el dueño intenta cambiar el `checkout_mode`
- **THEN** la operación es rechazada

### Requirement: Formulario de datos del comprador (guest checkout)
En modo `mercadopago`, antes de pagar el sistema SHALL solicitar los datos de contacto y entrega del comprador (nombre, email, teléfono y dirección/entrega) sin requerir que el comprador cree una cuenta. Estos datos SHALL guardarse asociados al pedido.

#### Scenario: Datos completos habilitan el pago
- **WHEN** el comprador completa nombre, email, teléfono y dirección/entrega
- **THEN** se habilita continuar al pago y los datos quedan asociados al pedido creado

#### Scenario: Datos incompletos o inválidos bloquean el pago
- **WHEN** falta un campo requerido o el email/teléfono tienen formato inválido
- **THEN** el sistema muestra el error y no continúa al pago

#### Scenario: Sin cuenta de comprador
- **WHEN** el comprador procede al pago
- **THEN** no se le exige registro ni login

### Requirement: Creación server-side de la preferencia de pago con precios de la DB
El sistema SHALL crear la preferencia de Checkout Pro en el servidor recalculando los precios desde la base de datos (productos, variantes y cupones), nunca usando importes provistos por el cliente. La preferencia SHALL crearse con el token de la cuenta de Mercado Pago del dueño, de modo que el pago se acredite directamente en su cuenta. El sistema SHALL crear el pedido en estado de pago `pending` antes de crear la preferencia y SHALL correlacionar la preferencia con el pedido vía `external_reference`.

#### Scenario: Precios recalculados en el servidor
- **WHEN** se solicita iniciar el pago de un carrito
- **THEN** el importe de la preferencia se calcula desde la DB y se ignora cualquier precio enviado por el cliente

#### Scenario: Cobro a la cuenta del dueño
- **WHEN** se crea la preferencia
- **THEN** se usa el token de Mercado Pago del dueño y el `external_reference` es el id del pedido

#### Scenario: Pedido creado antes de la preferencia
- **WHEN** se inicia el flujo de pago
- **THEN** existe un pedido en estado `pending` con su `mp_preference_id` antes de redirigir al comprador a Mercado Pago

#### Scenario: Carrito inválido no genera pago
- **WHEN** el carrito está vacío o contiene productos inexistentes/despublicados
- **THEN** no se crea preferencia y se informa el error

#### Scenario: Tienda sin conexión MP no puede iniciar pago
- **WHEN** se intenta iniciar un pago en una tienda sin conexión MP válida
- **THEN** la operación falla y no se crea preferencia

### Requirement: Redirect a Mercado Pago y páginas de resultado
Tras crear la preferencia, el sistema SHALL redirigir al comprador al checkout hospedado de Mercado Pago y SHALL definir URLs de retorno para los resultados `success`, `failure` y `pending`. Las páginas de resultado NO SHALL marcar el pedido como pagado; el estado de pago lo determina exclusivamente el webhook.

#### Scenario: Redirect al checkout de MP
- **WHEN** la preferencia se crea correctamente
- **THEN** el comprador es redirigido al `init_point` de Mercado Pago

#### Scenario: Retorno exitoso muestra confirmación pendiente
- **WHEN** el comprador vuelve por la URL de `success`
- **THEN** se muestra una confirmación que indica que el pago está siendo verificado, sin afirmar que el pedido ya está pago salvo que el webhook lo haya confirmado

#### Scenario: Retorno con fallo o pendiente
- **WHEN** el comprador vuelve por la URL de `failure` o `pending`
- **THEN** se muestra el estado correspondiente y se ofrece reintentar o volver a la tienda

### Requirement: Estado de pago sobre el pedido
El pedido SHALL registrar el canal (`whatsapp` | `mercadopago`), el estado de pago (`pending` | `approved` | `rejected` | `cancelled`) y las referencias de Mercado Pago (`mp_preference_id`, `mp_payment_id`). Las columnas de pago SHALL ser escritas únicamente por el proceso de servidor (service role); ningún rol cliente puede modificarlas.

#### Scenario: Pedido de pago nace pending
- **WHEN** se crea un pedido por el flujo de checkout MP
- **THEN** su canal es `mercadopago` y su estado de pago es `pending`

#### Scenario: Cliente no puede escribir estado de pago
- **WHEN** un rol cliente intenta modificar el `payment_status` o las referencias de MP de un pedido
- **THEN** la escritura es rechazada

### Requirement: Webhook de pagos de pedidos como fuente de verdad
El sistema SHALL exponer un webhook de pagos de pedidos, separado del webhook de billing de suscripciones. El webhook SHALL verificar la firma de la notificación y rechazar las inválidas, SHALL re-leer el pago desde Mercado Pago en lugar de confiar en el cuerpo de la notificación o en el redirect, SHALL correlacionar el pago con el pedido vía `external_reference`, y SHALL actualizar el estado de pago del pedido de forma idempotente.

#### Scenario: Firma inválida o ausente
- **WHEN** llega una notificación sin firma válida
- **THEN** el webhook responde 401 y no modifica ningún pedido

#### Scenario: Pago aprobado actualiza el pedido
- **WHEN** llega una notificación de tipo `payment` y la re-lectura desde MP indica `approved`
- **THEN** el pedido correlacionado pasa a `payment_status = approved` y se guarda su `mp_payment_id`

#### Scenario: No confía en el cuerpo de la notificación
- **WHEN** llega una notificación de pago
- **THEN** el estado se determina re-leyendo el pago desde Mercado Pago, no a partir del cuerpo recibido

#### Scenario: Idempotencia ante reentregas
- **WHEN** la misma notificación de pago llega más de una vez
- **THEN** el pedido no se actualiza repetidamente ni se duplican efectos; solo se escribe si el estado cambió

#### Scenario: Tipo no relevante se reconoce sin efecto
- **WHEN** llega una notificación de un tipo distinto de `payment`
- **THEN** el webhook responde 200 sin modificar pedidos

### Requirement: Estado de pago visible en el panel del dueño
El panel de Pedidos del dueño SHALL mostrar el estado de pago de cada pedido (incluido el canal) para que el dueño distinga los pedidos pagados de los pendientes o rechazados.

#### Scenario: Pedido pago se distingue
- **WHEN** el dueño abre la sección de Pedidos
- **THEN** ve el estado de pago y el canal de cada pedido y puede identificar los que están pagos
