## MODIFIED Requirements

### Requirement: Trial de 14 días para tiendas nuevas

El sistema SHALL otorgar un período de prueba gratis a cada tienda nueva, registrando `trial_ends_at` en el momento en que la tienda se crea. La duración por defecto SHALL ser de `TRIAL_DAYS` (7) días.

La duración SHALL poder fijarse por invitación: al dar de alta a alguien manualmente, el superadmin puede indicar una cantidad de días distinta, que se guarda en `whitelist.trial_days` y se aplica recién al crear la tienda. La resolución SHALL seguir esta precedencia:

1. `whitelist.trial_ends_at` — fecha explícita, usada por la aprobación de leads y por ediciones manuales en la base
2. `whitelist.trial_days` — cantidad de días pactada al invitar, contada desde la creación de la tienda
3. `TRIAL_DAYS` — default del sistema

Las tiendas pre-existentes al lanzamiento del cobro SHALL quedar exentas (`payment_exempt = true`) en lugar de recibir trial.

#### Scenario: Alta de tienda nueva

- **WHEN** se crea una tienda cuya fila de whitelist no tiene ni `trial_ends_at` ni `trial_days`
- **THEN** se establece `trial_ends_at` a `TRIAL_DAYS` días desde el alta y `payment_exempt = false`

#### Scenario: Alta con duración pactada al invitar

- **WHEN** se crea una tienda cuya fila de whitelist tiene `trial_days = 30` y `trial_ends_at` nulo
- **THEN** se establece `trial_ends_at` a 30 días desde la creación de la tienda, sin importar cuánto tiempo pasó entre la invitación y el registro

#### Scenario: Fecha explícita tiene prioridad

- **WHEN** se crea una tienda cuya fila de whitelist tiene `trial_ends_at` seteado
- **THEN** se respeta esa fecha y `trial_days` se ignora

#### Scenario: Alta sin prueba

- **WHEN** se crea una tienda cuya fila de whitelist tiene `trial_days = 0`
- **THEN** `trial_ends_at` queda igual al momento del alta, la tienda no está en estado `trial`, y el cron la bloquea si no registra una suscripción

#### Scenario: Tienda pre-existente (grandfathering)

- **WHEN** corre la migración de billing sobre una tienda ya existente
- **THEN** la tienda queda `payment_exempt = true` con un motivo de grandfathering
