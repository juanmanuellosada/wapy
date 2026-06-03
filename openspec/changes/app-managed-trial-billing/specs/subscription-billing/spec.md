## ADDED Requirements

### Requirement: Vinculación de tarjeta in-app y suscripción por API con trial gestionado por la app

El sistema SHALL permitir al dueño vincular una tarjeta y crear su suscripción **sin abandonar la app**, capturando la tarjeta con MP Bricks/CardForm (tokenización client-side con `NEXT_PUBLIC_MP_PUBLIC_KEY`) y creando el `preapproval` por API **sin plan asociado** mediante una server action. El `card_token_id` SHALL ser lo único que viaje al server (los datos de la tarjeta nunca tocan el server de wapy). El payload SHALL incluir `status = "authorized"`, `payer_email`, `external_reference = store_id`, y `auto_recurring` con `transaction_amount = PLAN_PRICES[store.plan]`, `currency_id = "ARS"`, `frequency = 1`, `frequency_type = "months"`. El período de prueba SHALL ser gestionado **exclusivamente por la app**: el sistema SHALL pasar `free_trial = { frequency: díasRestantes, frequency_type: "days" }` con `díasRestantes = ceil((trial_ends_at - now) / 1 día)` calculado en UTC, de modo que el primer cobro caiga exacto al fin del trial. El sistema SHALL NOT depender de `free_trial` configurado en planes de MP ni de `start_date`.

#### Scenario: Alta con trial vigente difiere el primer cobro al fin del trial
- **WHEN** el dueño de una tienda en `trial` (con `trial_ends_at` futuro) vincula su tarjeta
- **THEN** se crea un `preapproval` `authorized` por API con `free_trial.frequency = ceil(días restantes)` y `frequency_type = "days"`, y el primer cobro queda programado para el fin del trial

#### Scenario: La tarjeta no toca el server
- **WHEN** el dueño ingresa los datos de la tarjeta en el formulario de Bricks
- **THEN** la tokenización ocurre en el navegador y solo el `card_token_id` llega a la server action

#### Scenario: Token de un solo uso consumido de inmediato
- **WHEN** la server action recibe un `card_token_id`
- **THEN** crea el `preapproval` inmediatamente sin persistir el token (que es de un solo uso y expira a los 7 días)

#### Scenario: Suscripción autorizada se registra
- **WHEN** `preApproval.create` devuelve `{ id, status }`
- **THEN** la tienda queda con `mp_preapproval_id` seteado y `mp_subscription_status` derivado de `status`

### Requirement: Cobro inmediato al vincular con el trial vencido

El sistema SHALL **omitir** el objeto `free_trial` del payload cuando `díasRestantes <= 0` (trial ya vencido al vincular la tarjeta), de modo que la suscripción `authorized` cobre de inmediato (comportamiento estándar de MP). El sistema SHALL incluir `free_trial` únicamente cuando `díasRestantes >= 1`.

#### Scenario: Reactivación tras bloqueo cobra de inmediato
- **WHEN** el dueño de una tienda `blocked` (trial vencido, sin suscripción) vincula su tarjeta
- **THEN** se crea el `preapproval` `authorized` **sin** `free_trial` y el cobro ocurre de inmediato

#### Scenario: Borde de exactamente cero días
- **WHEN** al vincular `díasRestantes` resulta `0` o negativo
- **THEN** el payload no incluye `free_trial`

### Requirement: Manejo de errores de alta de suscripción

La server action de creación de suscripción SHALL devolver un resultado tipado (`ok` o `error` con motivo) ante tarjeta rechazada, token inválido o expirado, o fallo de la API de MP. La UI SHALL mostrar el error y permitir reintentar (re-tokenizar y recrear). El sistema SHALL NOT persistir `mp_preapproval_id` si la creación falla; la tienda SHALL permanecer en su estado previo (`trial` o `blocked`).

#### Scenario: Tarjeta rechazada
- **WHEN** MP rechaza la creación del `preapproval` por tarjeta inválida
- **THEN** la server action devuelve un error con motivo, la UI lo muestra y ofrece reintentar, y `mp_preapproval_id` no se modifica

#### Scenario: Token expirado
- **WHEN** se intenta usar un `card_token_id` expirado o ya usado
- **THEN** la operación falla con error y la UI permite re-tokenizar

## MODIFIED Requirements

### Requirement: Cambio de plan (upgrade/downgrade)
El sistema SHALL permitir al dueño cambiar el plan de su tienda entre sus tiers (`inicial`, `medio`, `pro`) desde la sección de Suscripción. El cambio SHALL aplicar de inmediato los límites del plan destino (vía `stores.plan`) y SHALL ajustar el cobro creando una **nueva suscripción por API** (`preapproval` sin plan asociado) con `transaction_amount = PLAN_PRICES[plan destino]`. Como la tienda ya tuvo suscripción (`mp_preapproval_id` no nulo), el cambio SHALL NOT otorgar una nueva prueba: `díasRestantes` se evalúa contra el `trial_ends_at` ya vencido (resultando `<= 0`) y por lo tanto el payload omite `free_trial`. La suscripción anterior SHALL cancelarse al autorizarse la nueva, para evitar doble cobro.

#### Scenario: Upgrade a pro levanta límites de inmediato
- **WHEN** el dueño de una tienda en `inicial` elige cambiar a `pro`
- **THEN** `stores.plan` pasa a `pro` y se eliminan los límites de productos/secciones del plan inicial

#### Scenario: Upgrade ajusta el cobro sin nueva prueba
- **WHEN** el dueño confirma el cambio a `pro` y vincula/confirma su tarjeta
- **THEN** se crea un nuevo `preapproval` por API con el monto de Pro **sin** `free_trial` y, al autorizarse, la suscripción anterior se cancela

#### Scenario: Downgrade a inicial
- **WHEN** el dueño de una tienda en `pro` elige cambiar a `inicial`
- **THEN** `stores.plan` pasa a `inicial`, los límites de inicial aplican hacia adelante, el cobro se ajusta al monto del plan Inicial (los productos ya existentes por encima del límite no se eliminan)

## REMOVED Requirements

### Requirement: Checkout de suscripción vía Mercado Pago
**Reason**: El checkout hosteado con `preapproval_plan_id` apila el `free_trial` estático del plan sobre el trial de la app (doble-trial) y no permite controlar el momento del primer cobro. Se reemplaza por la creación de `preapproval` por API sin plan con `free_trial` dinámico (ver "Vinculación de tarjeta in-app y suscripción por API con trial gestionado por la app").
**Migration**: Las suscripciones ya creadas por este flujo siguen activas sin cambios (el webhook las sigue sincronizando). Las altas y reactivaciones nuevas usan la server action de creación por API. Se eliminan `getMyCheckoutUrl`, el helper `pickPlanId` y las 6 env `MP_PREAPPROVAL_PLAN_ID_*`; el dueño borra los 6 `preapproval_plan` del dashboard de MP tras el deploy.
