## Context

El billing de Wapy sigue el patrón "el webhook registra estado, el cron aplica bloqueos" (Decision 4 del diseño original de `wapy-mercadopago-billing`). El estado se deriva por una función pura `getSubscriptionState()` en `lib/subscription/state.ts` con precedencia `exempt > blocked > active > grace > trial`. `blocked_at` (timestamp nullable en `stores`) es un "latch": mientras esté seteado, la tienda reporta `blocked` y queda fuera de línea (storefront en mantenimiento, checkout cerrado, dashboard restringido).

El bug: el diseño original asumía que el cron sería "el único que levanta el latch", pero el cron implementado **solo lo setea, nunca lo limpia**, y ningún otro código lo limpia tampoco. Resultado: una tienda bloqueada que reactiva y paga queda cerrada para siempre, porque `blocked_at` tiene precedencia sobre `active`.

Solo el `service_role` puede escribir los campos de billing (trigger `stores_protect_billing_fields` + función `prevent_billing_column_writes()`, migración 027). Tanto el webhook como el cron ya usan el admin client (service role), así que no hay cambios de permisos.

## Goals / Non-Goals

**Goals:**
- Que una tienda bloqueada se reabra automáticamente cuando el pago vuelve a estar `authorized`, sin ninguna acción manual.
- Desbloqueo lo más inmediato posible (al llegar el webhook), con el cron como red de seguridad.
- Reducir el período de gracia a 5 días.

**Non-Goals:**
- No se agrega acción manual de desbloqueo en el admin (queda innecesaria si el ciclo es automático; el superadmin sigue teniendo la exención como override).
- No se cambia el esquema de DB ni el trigger de protección.
- No se toca la lógica de bloqueo por trial vencido ni la de guards/mantenimiento.

## Decisions

**Decisión 1 — El webhook desbloquea, pero sigue sin bloquear.**
Se revisa la Decision 4 original. La razón de "el webhook no toca `blocked_at`" era de seguridad: una sola notificación (posiblemente reentregada, fuera de orden o falsificada) no debe cerrar una tienda. Ese riesgo es **asimétrico**: bloquear por error deja a un cliente que paga sin tienda (grave); desbloquear por error deja online una tienda impaga por unas horas hasta la próxima corrida del cron (leve y auto-corregible). Por eso el webhook puede **desbloquear** (setear `blocked_at = NULL` cuando el preapproval re-leído desde MP es `authorized`) pero nunca **bloquear**. El webhook ya re-lee el preapproval desde la API de MP (Decision 5: nunca confía en el body), así que la señal `authorized` es confiable.
- *Alternativa descartada:* dejar el desbloqueo solo en el cron. Rechazada porque el cron corre 1×/día (06:00 UTC) → el dueño pagaría y podría esperar hasta ~24 h a que se reabra la tienda. No cumple "que se desbloquee al pagar".

**Decisión 2 — El cron reconcilia como red de seguridad.**
El cron agrega una fase idempotente que limpia `blocked_at = NULL` en toda tienda con `mp_subscription_status = 'authorized'` y `blocked_at IS NOT NULL`. Cubre el caso de un webhook perdido/fallido y desbloquea el backlog de tiendas ya autorizadas-pero-bloqueadas en la primera corrida tras el deploy (sin migración de datos).
- *Orden dentro del cron:* correr la reconciliación de desbloqueo de forma independiente de las fases de bloqueo. Las fases de bloqueo ya filtran por condiciones que no aplican a una tienda `authorized`, así que no hay conflicto de orden, pero se mantienen como operaciones separadas para que cada una sea idempotente por sí sola.

**Decisión 3 — `GRACE_DAYS = 5` en un solo valor conceptual, definido en dos lugares.**
La constante vive duplicada en `lib/subscription/state.ts` (para el estado `grace`) y en el cron (para el corte de bloqueo). Ambas SHALL quedar en 5. Se mantiene la duplicación existente (no se introduce un módulo compartido en este change para no ampliar el alcance), pero el ejecutor DEBE cambiar los dos y verificar que no queden otras referencias a 7 días.

## Risks / Trade-offs

- **[Desbloqueo indebido por notificación falsa]** → Mitigación: el webhook valida HMAC y re-lee el preapproval desde MP antes de actuar; solo desbloquea ante `authorized` real. El impacto de un falso positivo es acotado (tienda impaga online unas horas) y el cron lo re-evalúa.
- **[Duplicación de `GRACE_DAYS` desincronizada]** → Mitigación: tarea explícita de cambiar ambos sitios y grep de verificación; a futuro podría unificarse en una constante compartida (fuera de alcance).
- **[Backlog de tiendas autorizadas-bloqueadas se reabre de golpe tras el deploy]** → Es el comportamiento deseado (estaban indebidamente bloqueadas). Riesgo nulo salvo que alguna tienda estuviera `authorized` por error previo; no se conocen casos.

## Migration Plan

- Sin migración de esquema. El desbloqueo del backlog ocurre solo: en la primera corrida del cron tras el deploy, o antes si llega un webhook `authorized`.
- **Rollback:** revertir el commit. `blocked_at` volvería a no limpiarse; las tiendas desbloqueadas por el fix permanecen desbloqueadas (no se re-bloquean salvo que caigan en las condiciones normales del cron), lo cual es seguro.
