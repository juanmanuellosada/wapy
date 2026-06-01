## ADDED Requirements

### Requirement: Catálogo de tres planes
El sistema SHALL ofrecer tres planes de suscripción identificados como `inicial`, `medio` y `pro`, con los siguientes precios mensuales: `inicial` = $7.000, `medio` = $9.000, `pro` = $18.000. Cada plan SHALL tener un nombre visible, un precio formateado en pesos argentinos, y trial de 14 días. El plan por defecto para tiendas nuevas SHALL ser `inicial`.

#### Scenario: Catálogo expone tres planes con sus precios
- **WHEN** el sistema lista los planes disponibles
- **THEN** devuelve exactamente `inicial` ($7.000), `medio` ($9.000) y `pro` ($18.000), cada uno con su nombre y precio formateado

#### Scenario: Tienda nueva arranca en inicial
- **WHEN** se crea una tienda sin plan asignado por whitelist
- **THEN** su `plan` queda en `inicial`

### Requirement: Migración del plan `inicial` actual a `medio`
El sistema SHALL migrar los registros existentes cuyo plan sea `inicial` (que hoy tienen las features del nuevo `medio`) al identificador `medio`, tanto en `stores.plan` como en `whitelist.plan`, preservando sus límites actuales (50 productos, 3 secciones, variantes, imágenes sin límite por plan).

#### Scenario: Tienda preexistente conserva sus features
- **WHEN** corre la migración sobre una tienda con `plan = 'inicial'`
- **THEN** la tienda queda con `plan = 'medio'` y mantiene acceso a 50 productos, 3 secciones y variantes

#### Scenario: Whitelist preexistente se migra
- **WHEN** corre la migración sobre una fila de whitelist con `plan = 'inicial'`
- **THEN** la fila queda con `plan = 'medio'`

## MODIFIED Requirements

### Requirement: Checkout de suscripción vía Mercado Pago
El sistema SHALL generar una URL de checkout hosteado de Mercado Pago para que el dueño suscriba o reactive su tienda, incluyendo el `preapproval_plan_id` correspondiente al plan de la app y a si la tienda ya tuvo suscripción, y `external_reference` igual al `store_id`. El sistema SHALL mapear cada uno de los tres planes (`inicial`, `medio`, `pro`) a dos Preapproval Plans de Mercado Pago —uno **con** trial (primera suscripción) y otro **sin** trial (reactivación/returning)— totalizando seis Preapproval Plans configurados por variables de entorno.

#### Scenario: Primera suscripción usa plan con trial
- **WHEN** el dueño de una tienda con `mp_preapproval_id` nulo solicita suscribirse al plan `pro`
- **THEN** la URL usa el `preapproval_plan_id` del plan Pro **con** trial y `external_reference = store_id`

#### Scenario: Reactivación usa plan sin trial
- **WHEN** el dueño de una tienda con `mp_preapproval_id` no nulo solicita reactivar el plan `inicial`
- **THEN** la URL usa el `preapproval_plan_id` del plan Inicial **sin** trial (returning)

#### Scenario: Plan medio mapea a su Preapproval Plan
- **WHEN** el dueño solicita suscribirse o reactivar el plan `medio`
- **THEN** la URL usa el `preapproval_plan_id` del plan Medio con trial (primera suscripción) o sin trial (returning) según corresponda

#### Scenario: Solo el dueño genera su checkout
- **WHEN** un usuario solicita la URL de checkout
- **THEN** el sistema la genera únicamente para la tienda de la que ese usuario es dueño

### Requirement: Cambio de plan (upgrade/downgrade)
El sistema SHALL permitir al dueño cambiar el plan de su tienda entre `inicial`, `medio` y `pro` desde la sección de Suscripción. El cambio SHALL aplicar de inmediato los límites del plan destino (vía `stores.plan`) y SHALL ajustar el cobro mediante una nueva suscripción al Preapproval Plan correspondiente al plan destino (sin nueva prueba si ya hubo suscripción). El cambio de plan SHALL NOT eliminar contenido existente que exceda los límites del plan destino.

#### Scenario: Upgrade a pro levanta límites de inmediato
- **WHEN** el dueño de una tienda en `medio` elige cambiar a `pro`
- **THEN** `stores.plan` pasa a `pro` y se eliminan los límites de productos/secciones/imágenes del plan medio

#### Scenario: Upgrade ajusta el cobro
- **WHEN** el dueño confirma el cambio a `pro`
- **THEN** el sistema lo lleva al checkout del Preapproval Plan de Pro (sin trial por tener historial) y, al autorizarse, la suscripción anterior se cancela para evitar doble cobro

#### Scenario: Downgrade a inicial no borra contenido
- **WHEN** el dueño de una tienda en `medio` con 40 productos elige cambiar a `inicial`
- **THEN** `stores.plan` pasa a `inicial`, los límites de inicial aplican hacia adelante (no puede agregar más productos por encima de 20, ni nuevas variantes), pero los productos y variantes ya existentes no se eliminan

### Requirement: UI de suscripción en el dashboard
El sistema SHALL ofrecer una sección "Suscripción" en el dashboard del dueño que muestre el plan actual, su precio, el estado de la suscripción (trial con días restantes / activo / en gracia / bloqueado / exento) y las acciones disponibles (suscribir, reactivar, cancelar, y cambiar de plan entre `inicial`, `medio` y `pro`). El sistema SHALL mostrar un banner de aviso cuando el trial está por vencer o el pago está pendiente. La sección SHALL ser accesible en todos los estados, incluido `exempt`.

#### Scenario: Estado en trial
- **WHEN** el dueño abre la sección con la tienda en `trial`
- **THEN** ve los días restantes de prueba y la acción de suscribirse

#### Scenario: Aviso de trial por vencer
- **WHEN** al dueño le quedan pocos días de trial
- **THEN** ve un banner que lo invita a suscribirse antes del vencimiento

#### Scenario: Estado exento
- **WHEN** el dueño abre la sección con la tienda en `exempt`
- **THEN** ve que su cuenta está exenta de pago y además dispone de la acción de vincular/suscribir un medio de pago real

#### Scenario: Acción de cambiar de plan entre tres opciones
- **WHEN** el dueño abre la sección estando en plan `inicial`
- **THEN** ve la opción de cambiar a `medio` o a `pro` (cada uno con su precio), y al confirmar una se aplica el cambio de plan
