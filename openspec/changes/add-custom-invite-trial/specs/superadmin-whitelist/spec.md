## ADDED Requirements

### Requirement: Superadmin fija plan y duración de prueba al invitar

El formulario de alta manual de `/admin/whitelist` SHALL aceptar, además de email y rol, un **plan** (`inicial` | `medio` | `pro`) y una **cantidad de días de prueba**. La acción `addWhitelistEntry` SHALL persistir esos valores en `whitelist.plan` y `whitelist.trial_days` en el mismo INSERT que crea la fila.

Los días de prueba SHALL guardarse como cantidad, no como fecha: el vencimiento se calcula recién cuando la persona crea su tienda, de modo que la duración pactada no se consuma durante la ventana de invitación.

El formulario SHALL preseleccionar plan `inicial` y `TRIAL_DAYS` días. Un alta enviada sin tocar esos controles SHALL producir el mismo resultado observable que antes de este cambio.

El sistema SHALL aceptar `0` días (alta sin prueba) y SHALL rechazar valores negativos, no enteros o mayores a `365`. El rechazo SHALL ocurrir en el servidor, independientemente de la validación del navegador, y SHALL NOT crear la fila.

#### Scenario: Alta con prueba extendida

- **WHEN** el superadmin da de alta `piloto@example.com` con rol `owner`, plan `pro` y 30 días de prueba
- **THEN** la fila de `whitelist` queda con `plan = 'pro'` y `trial_days = 30`, se envía el invite con su `invite_token`, y `trial_ends_at` permanece nulo

#### Scenario: Alta sin tocar los defaults se comporta como antes

- **WHEN** el superadmin completa solo email y rol y envía el formulario
- **THEN** la fila queda con `plan = 'inicial'` y `trial_days = TRIAL_DAYS`, y la tienda resultante obtiene el mismo plan y la misma duración de prueba que obtenía antes de este cambio

#### Scenario: Alta sin período de prueba

- **WHEN** el superadmin da de alta a alguien con `0` días de prueba
- **THEN** la fila queda con `trial_days = 0` y la tienda que esa persona cree nace con el trial ya vencido, sujeta a bloqueo por el cron si no registra una suscripción

#### Scenario: Días fuera de rango son rechazados

- **WHEN** se invoca `addWhitelistEntry` con `trial_days = -1`, `trial_days = 400` o un valor no numérico
- **THEN** la acción responde un error de validación con mensaje legible y no se crea ninguna fila en `whitelist`

#### Scenario: Plan inválido es rechazado

- **WHEN** se invoca `addWhitelistEntry` con un plan distinto de `inicial`, `medio` o `pro`
- **THEN** la acción responde un error de validación y no se crea ninguna fila

#### Scenario: La tabla refleja lo cargado

- **WHEN** el alta se completa con éxito
- **THEN** la tabla de whitelist muestra en esa fila el plan asignado y la duración de prueba pactada
