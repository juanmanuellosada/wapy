# subscription-billing

## ADDED Requirements

### Requirement: Subscription state machine
El sistema SHALL derivar el estado de suscripción de una tienda a partir de sus campos crudos (`payment_exempt`, `trial_ends_at`, `mp_subscription_status`, `subscription_status_changed_at`, `blocked_at`) mediante una función pura, produciendo uno de: `exempt`, `trial`, `active`, `grace`, `blocked`. La precedencia SHALL ser: `exempt` > `blocked` > `active` > `grace` > `trial`.

#### Scenario: Tienda exenta
- **WHEN** una tienda tiene `payment_exempt = true`
- **THEN** su estado es `exempt` sin importar los demás campos

#### Scenario: Tienda bloqueada
- **WHEN** `payment_exempt = false` y `blocked_at` no es nulo
- **THEN** su estado es `blocked`

#### Scenario: Suscripción autorizada
- **WHEN** no está exenta ni bloqueada y `mp_subscription_status = 'authorized'`
- **THEN** su estado es `active`

#### Scenario: En prueba
- **WHEN** no está exenta, bloqueada ni autorizada, no tiene suscripción previa y `now < trial_ends_at`
- **THEN** su estado es `trial`

#### Scenario: En gracia tras pago fallido
- **WHEN** `mp_subscription_status` es `paused` o `cancelled` y han pasado menos de 7 días desde `subscription_status_changed_at`
- **THEN** su estado es `grace`

### Requirement: Trial de 14 días para tiendas nuevas
El sistema SHALL otorgar 14 días de prueba gratis a cada tienda nueva, registrando `trial_ends_at = fecha_de_alta + 14 días`. Las tiendas pre-existentes al lanzamiento del cobro SHALL quedar exentas (`payment_exempt = true`) en lugar de recibir trial.

#### Scenario: Alta de tienda nueva
- **WHEN** se crea una tienda después del lanzamiento del cobro
- **THEN** se establece `trial_ends_at` a 14 días desde el alta y `payment_exempt = false`

#### Scenario: Tienda pre-existente (grandfathering)
- **WHEN** corre la migración de billing sobre una tienda ya existente
- **THEN** la tienda queda `payment_exempt = true` con un motivo de grandfathering

### Requirement: Checkout de suscripción vía Mercado Pago
El sistema SHALL generar una URL de checkout hosteado de Mercado Pago para que el dueño suscriba o reactive su tienda, incluyendo `preapproval_plan_id` según el plan de la app y `external_reference` igual al `store_id`.

#### Scenario: Primera suscripción usa plan con trial
- **WHEN** el dueño de una tienda con `mp_preapproval_id` nulo solicita suscribirse al plan `pro`
- **THEN** la URL usa el `preapproval_plan_id` del plan Pro **con** trial y `external_reference = store_id`

#### Scenario: Reactivación usa plan sin trial
- **WHEN** el dueño de una tienda con `mp_preapproval_id` no nulo solicita reactivar el plan `inicial`
- **THEN** la URL usa el `preapproval_plan_id` del plan Inicial **sin** trial (returning)

#### Scenario: Solo el dueño genera su checkout
- **WHEN** un usuario solicita la URL de checkout
- **THEN** el sistema la genera únicamente para la tienda de la que ese usuario es dueño

### Requirement: Cambio de plan (upgrade/downgrade)
El sistema SHALL permitir al dueño cambiar el plan de su tienda entre `inicial` y `pro` desde la sección de Suscripción. El cambio SHALL aplicar de inmediato los límites del plan destino (vía `stores.plan`) y SHALL ajustar el cobro mediante una nueva suscripción al Preapproval Plan correspondiente al plan destino (sin nueva prueba si ya hubo suscripción).

#### Scenario: Upgrade a pro levanta límites de inmediato
- **WHEN** el dueño de una tienda en `inicial` elige cambiar a `pro`
- **THEN** `stores.plan` pasa a `pro` y se eliminan los límites de productos/secciones del plan inicial

#### Scenario: Upgrade ajusta el cobro
- **WHEN** el dueño confirma el cambio a `pro`
- **THEN** el sistema lo lleva al checkout del Preapproval Plan de Pro (sin trial por tener historial) y, al autorizarse, la suscripción anterior se cancela para evitar doble cobro

#### Scenario: Downgrade a inicial
- **WHEN** el dueño de una tienda en `pro` elige cambiar a `inicial`
- **THEN** `stores.plan` pasa a `inicial`, los límites de inicial aplican hacia adelante, y el cobro se ajusta al plan Inicial (los productos ya existentes por encima del límite no se eliminan)

### Requirement: Webhook de Mercado Pago registra estado
El sistema SHALL exponer un endpoint POST que reciba notificaciones de Mercado Pago, valide la firma HMAC con `MP_WEBHOOK_SECRET`, re-lea el preapproval desde la API de MP, y actualice en la tienda `mp_preapproval_id`, `mp_subscription_status` y `subscription_status_changed_at`. El webhook SHALL NOT setear `blocked_at`.

#### Scenario: Firma inválida o ausente
- **WHEN** llega una notificación sin firma válida
- **THEN** el sistema la rechaza con error HTTP y no modifica datos

#### Scenario: Suscripción autorizada
- **WHEN** llega una notificación válida cuyo preapproval (leído desde MP) tiene `status = 'authorized'` y `external_reference = store_id`
- **THEN** la tienda queda con `mp_subscription_status = 'authorized'` y `mp_preapproval_id` seteado

#### Scenario: Idempotencia ante reentregas
- **WHEN** llega dos veces la misma notificación con el mismo `status`
- **THEN** el estado resultante es el mismo y `subscription_status_changed_at` solo avanza cuando el `status` cambia

#### Scenario: El webhook no bloquea
- **WHEN** llega una notificación con `status = 'cancelled'`
- **THEN** se registra `mp_subscription_status = 'cancelled'` pero `blocked_at` permanece nulo

### Requirement: Cron diario aplica bloqueos
El sistema SHALL exponer un endpoint de cron, protegido por `CRON_SECRET`, que se ejecute a diario y sea el único en setear `blocked_at`. El cron SHALL bloquear: (1) tiendas con `trial_ends_at` vencido, `mp_preapproval_id` nulo y `payment_exempt = false`; y (2) tiendas con `mp_subscription_status` en `paused`/`cancelled` desde hace más de 7 días y `payment_exempt = false`.

#### Scenario: Acceso no autorizado al cron
- **WHEN** se llama al endpoint sin el `Authorization: Bearer <CRON_SECRET>` correcto
- **THEN** el sistema responde no autorizado y no modifica datos

#### Scenario: Trial vencido sin suscripción
- **WHEN** corre el cron y una tienda no exenta tiene el trial vencido y nunca se suscribió
- **THEN** la tienda queda con `blocked_at` seteado

#### Scenario: Pago fallido pasada la gracia
- **WHEN** corre el cron y una tienda no exenta está en `paused`/`cancelled` hace más de 7 días
- **THEN** la tienda queda con `blocked_at` seteado

#### Scenario: Dentro de la gracia no se bloquea
- **WHEN** corre el cron y una tienda está en `paused` hace menos de 7 días
- **THEN** la tienda NO se bloquea

#### Scenario: Exenta nunca se bloquea
- **WHEN** corre el cron y una tienda tiene `payment_exempt = true`
- **THEN** la tienda nunca queda bloqueada por el cron

### Requirement: Bloqueo del dashboard del dueño
El sistema SHALL restringir el dashboard del dueño cuando su tienda está en estado `blocked`, permitiendo el acceso únicamente a la sección de Suscripción.

#### Scenario: Dueño bloqueado intenta usar otra sección
- **WHEN** el dueño de una tienda `blocked` navega a cualquier sección del dashboard distinta de Suscripción
- **THEN** el sistema lo redirige a la sección de Suscripción

#### Scenario: Dueño bloqueado accede a Suscripción
- **WHEN** el dueño de una tienda `blocked` abre la sección de Suscripción
- **THEN** puede verla y usar la acción de reactivar

### Requirement: Cancelación de suscripción por el dueño
El sistema SHALL permitir al dueño cancelar su suscripción de Mercado Pago desde la sección de Suscripción.

#### Scenario: Dueño cancela
- **WHEN** el dueño con suscripción activa solicita cancelar
- **THEN** el sistema cancela el preapproval en Mercado Pago y el estado pasa a reflejar la cancelación

### Requirement: Exención de pago administrada por superadmin
El sistema SHALL permitir a un superadmin marcar y desmarcar cualquier tienda como exenta de pago, registrando un motivo. Una tienda exenta nunca se bloquea por falta de pago. Una tienda exenta SHALL poder igualmente acceder a la sección de Suscripción y vincular/suscribir un medio de pago real; vincular pago NO SHALL quitar la exención (solo el superadmin la cambia).

#### Scenario: Superadmin marca exención
- **WHEN** un superadmin marca una tienda como exenta con un motivo
- **THEN** la tienda queda `payment_exempt = true` con `payment_exempt_reason` y su estado pasa a `exempt`

#### Scenario: Superadmin quita exención
- **WHEN** un superadmin desmarca la exención de una tienda
- **THEN** la tienda vuelve a regirse por su trial/suscripción

#### Scenario: Usuario no superadmin no puede eximir
- **WHEN** un usuario sin rol superadmin intenta cambiar la exención
- **THEN** el sistema rechaza la operación

#### Scenario: Tienda exenta vincula pago real sin perder la exención
- **WHEN** el dueño de una tienda `exempt` usa la sección de Suscripción para vincular/suscribir un medio de pago
- **THEN** se genera el checkout y, al autorizarse, la tienda queda con suscripción registrada pero `payment_exempt` permanece `true` y su estado sigue siendo `exempt`

### Requirement: UI de suscripción en el dashboard
El sistema SHALL ofrecer una sección "Suscripción" en el dashboard del dueño que muestre el plan actual, su precio, el estado de la suscripción (trial con días restantes / activo / en gracia / bloqueado / exento) y las acciones disponibles (suscribir, reactivar, cancelar, y cambiar de plan inicial↔pro). El sistema SHALL mostrar un banner de aviso cuando el trial está por vencer o el pago está pendiente. La sección SHALL ser accesible en todos los estados, incluido `exempt`.

#### Scenario: Estado en trial
- **WHEN** el dueño abre la sección con la tienda en `trial`
- **THEN** ve los días restantes de prueba y la acción de suscribirse

#### Scenario: Aviso de trial por vencer
- **WHEN** al dueño le quedan pocos días de trial
- **THEN** ve un banner que lo invita a suscribirse antes del vencimiento

#### Scenario: Estado exento
- **WHEN** el dueño abre la sección con la tienda en `exempt`
- **THEN** ve que su cuenta está exenta de pago y además dispone de la acción de vincular/suscribir un medio de pago real

#### Scenario: Acción de cambiar de plan
- **WHEN** el dueño abre la sección estando en plan `inicial`
- **THEN** ve la opción de cambiar a `pro` (con su precio), y al confirmarla se aplica el cambio de plan

### Requirement: Escrituras de billing solo por el servidor
El sistema SHALL escribir los campos de billing (`mp_preapproval_id`, `mp_subscription_status`, `subscription_status_changed_at`, `payment_exempt`, `payment_exempt_reason`, `blocked_at`) únicamente desde el servidor con el cliente de service role. El dueño SHALL poder leer el estado de billing de su propia tienda.

#### Scenario: Lectura del propio estado
- **WHEN** el dueño consulta su tienda
- **THEN** puede leer sus campos de estado de billing

#### Scenario: El cliente no puede escribir billing
- **WHEN** un cliente intenta modificar directamente un campo de billing vía la API de datos
- **THEN** la operación es rechazada (sin política de escritura para roles no-service)
