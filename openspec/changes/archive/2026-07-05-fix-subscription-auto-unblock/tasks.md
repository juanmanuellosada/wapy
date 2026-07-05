## 1. Reducir período de gracia a 5 días

- [x] 1.1 Cambiar `GRACE_DAYS` de 7 a 5 en `lib/subscription/state.ts`
- [x] 1.2 Cambiar `GRACE_DAYS` de 7 a 5 en `app/api/cron/check-subscriptions/route.ts`
- [x] 1.3 Grep del repo por `7` / "7 días" / "GRACE" para confirmar que no queden otras referencias al período de gracia anterior

## 2. Desbloqueo automático en el webhook

- [x] 2.1 En `app/api/webhooks/mercadopago/route.ts`, cuando el preapproval re-leído desde MP tiene `status = 'authorized'`, incluir `blocked_at: null` en el update de la tienda (junto a `mp_subscription_status`, `mp_preapproval_id` y `subscription_status_changed_at`)
- [x] 2.2 Verificar que para estados distintos de `authorized` el webhook sigue SIN tocar `blocked_at` (no bloquea ni desbloquea)

## 3. Reconciliación de desbloqueo en el cron

- [x] 3.1 En `app/api/cron/check-subscriptions/route.ts`, agregar una fase idempotente que haga `UPDATE stores SET blocked_at = NULL WHERE mp_subscription_status = 'authorized' AND blocked_at IS NOT NULL`
- [x] 3.2 Asegurar que la fase de reconciliación es independiente de las fases de bloqueo y no interfiere con ellas (siguen filtrando sus propias condiciones)
- [x] 3.3 Incluir el conteo de tiendas desbloqueadas en la respuesta/log del cron para observabilidad

## 4. Verificación

- [x] 4.1 Actualizar/agregar test de la máquina de estados si existe suite para `getSubscriptionState` (gracia a 5 días; tienda `authorized` con `blocked_at` no nulo sigue reportando `blocked` hasta que se limpia — confirma que el desbloqueo depende de limpiar el campo, no de la función pura)
- [ ] 4.2 Agregar/ajustar test del webhook: notificación `authorized` sobre tienda con `blocked_at` no nulo → el update incluye `blocked_at = null` — SIN MARCAR: no existe infraestructura de test para rutas de `app/api/**` en este repo (no hay archivos `*.test.ts` bajo `app/api/`, ni patrón de mocking para `createAdminClient`/MP SDK). Montarla desde cero está fuera del alcance quirúrgico de este change.
- [ ] 4.3 Agregar/ajustar test del cron: tienda `authorized` + `blocked_at` no nulo → queda `blocked_at = null`; tienda `paused` hace 4 días → NO se bloquea; hace 6 días → se bloquea — SIN MARCAR: misma razón que 4.2 (sin infraestructura de test de rutas API/Supabase admin client en el repo).
- [x] 4.4 Verificar build/typecheck y correr los tests afectados
