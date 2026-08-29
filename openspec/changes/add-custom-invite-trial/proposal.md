## Why

Hoy el alta manual de una persona desde `/admin/whitelist` solo acepta email y rol: quien entra por ahí queda con `whitelist.plan = NULL` y `whitelist.trial_ends_at = NULL`, y termina cayendo al default de plan `inicial` con `TRIAL_DAYS` (7) fijo. No hay forma de decir "a esta persona le doy Pro con 30 días de prueba" salvo editando la base a mano. Eso bloquea los casos comerciales concretos: pilotos extendidos, acuerdos puntuales, altas sin prueba.

El resto del camino ya está construido — `lib/onboarding/actions.ts:142-146` ya lee la whitelist para resolver plan y trial al crear la tienda, con un comentario que dice *"manually set by admin"*. Lo único que falta es la UI y la escritura.

## What Changes

- El form de alta manual (`app/admin/AddEmailForm.tsx`) suma dos campos: **plan** (`inicial` | `medio` | `pro`) y **días de prueba**.
- Ambos campos tienen default explícito y preseleccionado — plan `inicial`, días `TRIAL_DAYS` (7) — de modo que un alta sin tocar nada produce **exactamente** el mismo resultado que hoy. No hay cambio de comportamiento por omisión.
- Se admite **0 días** como valor válido: alta sin prueba, la tienda nace exigiendo pago. El tope es 365 días.
- Nueva columna `whitelist.trial_days` (integer, nullable). El alta manual guarda **la cantidad de días**, no una fecha: el reloj de la prueba arranca cuando la persona crea su tienda, no cuando se la invita. Así "30 días" significan 30 días de uso real, sin que el invite TTL de 7 días se coma parte del trial.
- `lib/onboarding/actions.ts` pasa a resolver el trial con esta precedencia: `whitelist.trial_ends_at` (fecha explícita, camino de `approveLead`) → `whitelist.trial_days` → `TRIAL_DAYS`. Retrocompatible: las filas existentes tienen ambas columnas nulas y siguen cayendo al default.
- Se corrige la deriva de la spec: el requirement de billing dice "14 días" desde el archivado original, pero el código usa 7 desde el commit `2a7d3c4` (2026-07-22).

Fuera de alcance, explícitamente: `/admin/leads` (aprobación de leads sigue usando `TRIAL_DAYS` fijo), `/admin/stores` (no se agrega edición de trial de tiendas ya creadas), y `whitelist.checkout_mode` (columna sin escritor desde la migración 032, queda como deuda conocida).

## Capabilities

### New Capabilities
- `superadmin-whitelist`: el alta manual de personas en la whitelist por parte del superadmin, incluyendo qué plan y qué duración de prueba se le asigna a cada invitado. La capability todavía no está promovida a `openspec/specs/` (vive en el change sin archivar `wapy-superadmin-panel`), así que este delta agrega un requirement nuevo y complementario en lugar de modificar uno existente.

### Modified Capabilities
- `subscription-billing`: el requirement del trial de tiendas nuevas cambia de "14 días fijos" a "duración por defecto de 7 días, sobreescribible por invitación". Corrige además la deriva 14 → 7 respecto del código.

## Impact

**Base de datos**
- Migración nueva (`039`): `ALTER TABLE whitelist ADD COLUMN trial_days integer` con CHECK `0 <= trial_days <= 365`. Nullable, sin backfill — nulo significa "usar el default".
- No toca `stores` ni el trigger `prevent_billing_column_writes` (migración 027), que aplica solo a `stores` y ni siquiera cubre `trial_ends_at`.

**Código**
- `lib/admin/schemas.ts` — `addEmailSchema` suma `plan` y `trial_days` con coerción desde `FormData` (todo llega como string).
- `lib/admin/actions.ts` — `addWhitelistEntry` (líneas 37-85) escribe las dos columnas nuevas en el INSERT.
- `app/admin/AddEmailForm.tsx` — dos controles nuevos (líneas 170-206).
- `lib/onboarding/actions.ts` — la resolución del trial (142-146) suma el escalón `trial_days`.
- `lib/supabase/types.ts` — regenerar tipos para la columna nueva.

**Sin impacto**
- El cron de bloqueo, el webhook de MP y `getSubscriptionState` no cambian: siguen leyendo `stores.trial_ends_at`, que se sigue calculando en el mismo lugar de siempre.
- `app/admin/WhitelistTable.tsx` ya muestra las columnas Plan y Trial; no requiere cambios para reflejar los valores nuevos.
