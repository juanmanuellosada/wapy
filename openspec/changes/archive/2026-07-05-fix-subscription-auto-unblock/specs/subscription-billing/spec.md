## MODIFIED Requirements

### Requirement: Subscription state machine
El sistema SHALL derivar el estado de suscripción de una tienda a partir de sus campos crudos (`payment_exempt`, `trial_ends_at`, `mp_subscription_status`, `subscription_status_changed_at`, `blocked_at`) mediante una función pura, produciendo uno de: `exempt`, `trial`, `active`, `grace`, `blocked`. La precedencia SHALL ser: `exempt` > `blocked` > `active` > `grace` > `trial`. El período de gracia SHALL ser de 5 días.

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
- **WHEN** `mp_subscription_status` es `paused` o `cancelled` y han pasado menos de 5 días desde `subscription_status_changed_at`
- **THEN** su estado es `grace`

### Requirement: Webhook de Mercado Pago registra estado
El sistema SHALL exponer un endpoint POST que reciba notificaciones de Mercado Pago, valide la firma HMAC con `MP_WEBHOOK_SECRET`, re-lea el preapproval desde la API de MP, y actualice en la tienda `mp_preapproval_id`, `mp_subscription_status` y `subscription_status_changed_at`. El webhook SHALL NOT bloquear (nunca setea `blocked_at` a un timestamp), pero SHALL desbloquear la tienda (setear `blocked_at = NULL`) cuando el preapproval leído desde MP tenga `status = 'authorized'`.

#### Scenario: Firma inválida o ausente
- **WHEN** llega una notificación sin firma válida
- **THEN** el sistema la rechaza con error HTTP y no modifica datos

#### Scenario: Suscripción autorizada
- **WHEN** llega una notificación válida cuyo preapproval (leído desde MP) tiene `status = 'authorized'` y `external_reference = store_id`
- **THEN** la tienda queda con `mp_subscription_status = 'authorized'`, `mp_preapproval_id` seteado y `blocked_at = NULL`

#### Scenario: Desbloqueo al reactivar tras pago
- **WHEN** una tienda con `blocked_at` no nulo recibe una notificación cuyo preapproval tiene `status = 'authorized'`
- **THEN** `blocked_at` vuelve a `NULL` y su estado derivado pasa a `active` (queda públicamente accesible sin intervención manual)

#### Scenario: Idempotencia ante reentregas
- **WHEN** llega dos veces la misma notificación con el mismo `status`
- **THEN** el estado resultante es el mismo y `subscription_status_changed_at` solo avanza cuando el `status` cambia

#### Scenario: El webhook no bloquea
- **WHEN** llega una notificación con `status = 'cancelled'`
- **THEN** se registra `mp_subscription_status = 'cancelled'` pero `blocked_at` no se setea a un timestamp

### Requirement: Cron diario aplica bloqueos
El sistema SHALL exponer un endpoint de cron, protegido por `CRON_SECRET`, que se ejecute a diario y sea el único en setear `blocked_at` a un timestamp. El cron SHALL bloquear: (1) tiendas con `trial_ends_at` vencido, `mp_preapproval_id` nulo y `payment_exempt = false`; y (2) tiendas con `mp_subscription_status` en `paused`/`cancelled` desde hace más de 5 días y `payment_exempt = false`. El cron SHALL además reconciliar el desbloqueo: limpiar `blocked_at = NULL` en toda tienda con `mp_subscription_status = 'authorized'` y `blocked_at` no nulo.

#### Scenario: Acceso no autorizado al cron
- **WHEN** se llama al endpoint sin el `Authorization: Bearer <CRON_SECRET>` correcto
- **THEN** el sistema responde no autorizado y no modifica datos

#### Scenario: Trial vencido sin suscripción
- **WHEN** corre el cron y una tienda no exenta tiene el trial vencido y nunca se suscribió
- **THEN** la tienda queda con `blocked_at` seteado

#### Scenario: Pago fallido pasada la gracia
- **WHEN** corre el cron y una tienda no exenta está en `paused`/`cancelled` hace más de 5 días
- **THEN** la tienda queda con `blocked_at` seteado

#### Scenario: Dentro de la gracia no se bloquea
- **WHEN** corre el cron y una tienda está en `paused` hace menos de 5 días
- **THEN** la tienda NO se bloquea

#### Scenario: Exenta nunca se bloquea
- **WHEN** corre el cron y una tienda tiene `payment_exempt = true`
- **THEN** la tienda nunca queda bloqueada por el cron

#### Scenario: Reconciliación desbloquea tienda autorizada
- **WHEN** corre el cron y una tienda tiene `mp_subscription_status = 'authorized'` y `blocked_at` no nulo
- **THEN** el cron limpia `blocked_at = NULL` (red de seguridad si el webhook no la desbloqueó)
