## Context

El cobro del SaaS wapy usa Mercado Pago Suscripciones. Hoy:

- La app asigna `stores.trial_ends_at = alta + 14 días` y un cron diario (`app/api/cron/check-subscriptions/route.ts`) bloquea a la tienda si el trial venció sin suscripción, o si MP reporta `paused`/`cancelled` por más del grace de 7 días.
- El alta de tarjeta **redirige** al checkout hosteado de MP con un `preapproval_plan_id` (`lib/subscription/actions.ts` → `getMyCheckoutUrl`). Cada plan tiene `free_trial = 14 días` configurado en el dashboard de MP.
- Existen **6 planes** (`inicial/medio/pro` × `_RETURNING`): los originales con `free_trial = 14d`, los `_RETURNING` con `free_trial = 0`. `pickPlanId` (`lib/mercadopago.ts`) elige según `mp_preapproval_id` previo.

El `free_trial` de MP arranca al momento de suscribirse, no en el alta de la tienda. Como la vinculación de tarjeta puede ocurrir en cualquier punto del trial de la app, una tienda que vincula tarde acumula hasta ~28 días gratis. Este doble-trial fue aceptado como trade-off en `archive/2026-05-30-wapy-mercadopago-billing`. Este cambio lo revierte: la app pasa a ser la **única** dueña del trial.

Este diseño es un **espejo** del change homónimo ya validado en el repo hermano `../wody` (mismo patrón, misma investigación documental de MP), adaptado a wapy. Diferencias de wapy: un único flujo (`stores`, no gym+Personal), 6 planes a remover (no 4), montos por tier desde `PLAN_PRICES`, datos en Supabase (no Prisma).

Constraints: Next.js (App Router) con Server Actions; los campos de billing ya existen en la migración 027 — **no** se toca el schema; el webhook firmado y el cron deben mantener su semántica actual.

## Goals / Non-Goals

**Goals:**
- La app es la única fuente de verdad del período de prueba; MP no maneja `free_trial`.
- El primer cobro ocurre exactamente al fin del trial, sin cobro anticipado ni doble-trial, aunque la tarjeta se vincule antes.
- Captura de tarjeta in-app (MP Bricks) sin que datos de tarjeta toquen el server de wapy.
- Eliminar los 6 planes `preapproval_plan` y la selección de plan por historial.
- No romper suscripciones ya creadas bajo el esquema viejo.

**Non-Goals:**
- Cambiar la duración del trial (sigue siendo 14 días).
- Cambiar la lógica del cron (bloqueo por trial vencido + grace de 7 días) ni la del webhook firmado.
- Cambiar el modelo de datos / migraciones (los campos ya existen en 027).
- Cambiar montos (`PLAN_PRICES`: inicial 7.000 / medio 9.000 / pro 18.000 ARS) ni la política de exención manual del superadmin.
- Migrar las suscripciones MP existentes a la nueva forma.

## Decisions

### Decisión 1 — `preapproval` por API **sin plan asociado**, con `free_trial` dinámico en días

Se crea la suscripción con `preApproval.create(...)` del SDK `mercadopago@3.0.0` (ya instalado) usando el modelo **sin plan asociado**: `POST /preapproval` **sin `preapproval_plan_id`**, pasando `card_token_id`, `payer_email`, `status = "authorized"`, `external_reference = store.id`, `reason`, `back_url`, y `auto_recurring` con `transaction_amount = PLAN_PRICES[store.plan]`, `currency_id = "ARS"`, `frequency = 1`, `frequency_type = "months"`, y un **`free_trial = { frequency: díasRestantes, frequency_type: "days" }`** calculado al vincular la tarjeta (`díasRestantes = ceil((trial_ends_at - now)/día)` en UTC). **No** se usa `start_date`. `create` devuelve `{ id, status }` → se mapea a `mp_preapproval_id` y `parseMpSubscriptionStatus`.

- **Por qué `free_trial` dinámico y NO `start_date`**: la doc oficial de MP, en la página exacta de "suscripción sin plan + pago autorizado", indica que el primer cobro ocurre **~1 hora después** de crear la suscripción y **no** documenta `start_date` como mecanismo de diferimiento (confirmado en 3 dominios de MP). Es decir, `start_date` futuro NO garantiza posponer el cobro. En cambio `free_trial` SÍ difiere el primer cobro exactamente por el período indicado: es el **mismo mecanismo que ya corre en producción** de wapy (free_trial estático de 14d). La única diferencia es calcularlo dinámicamente = días restantes del trial de la app, en vez de fijarlo en el plan. `free_trial` acepta `frequency_type: "days"` con cantidad arbitraria y va dentro de `auto_recurring` del preapproval sin plan (tipo `AutoRecurringWithFreeTrial` del SDK 3.0.0).
- **Por qué sin plan**: en modo sin-plan se define monto y ciclo en el payload, sin que el `free_trial` estático ni el ciclo de un plan del dashboard interfieran. Los 6 IDs de plan salen por completo del flujo de cobro.
- **Alternativa descartada (`start_date` futuro)**: contradicha por la doc (primer cobro a la ~1h). Habría cobrado de inmediato al vincular. Descartada tras investigación documental.
- **Alternativa descartada (reusar planes `_RETURNING`)**: traen su propio ciclo/`free_trial` estático; volvería al doble-trial o a precedencia no documentada. Innecesario yendo sin plan.
- **Alternativa descartada (statu quo)**: aceptar el doble-trial. Es el problema que motiva el cambio.

### Decisión 2 — Captura de tarjeta in-app con MP Bricks/CardForm (tokenización client-side)

El front monta el Card Payment Brick / CardForm de MP (`@mercadopago/sdk-js`, `new MercadoPago(PUBLIC_KEY)`) con la **public key**. MP tokeniza la tarjeta en el navegador y devuelve un `card_token_id`. Ese token (no los datos de la tarjeta) viaja a una server action que crea el `preapproval`.

- **Por qué**: PCI — la tarjeta nunca toca el server de wapy; wapy solo maneja el token efímero. Es el patrón recomendado por MP para suscripciones creadas por API con `card_token_id`.
- **Implicancia**: se agrega el SDK JS de MP en el cliente y se expone la public key en una nueva env pública `NEXT_PUBLIC_MP_PUBLIC_KEY` (hoy no existe ninguna public key de MP en el repo). La server action queda como único punto que habla con la API privada de MP (con `MP_ACCESS_TOKEN`).
- **Gotcha confirmado**: el `card_token` es de **un solo uso y expira a los 7 días**. Debe consumirse en el `preApproval.create` inmediatamente después de tokenizar; no se guarda. Una vez creada la suscripción, MP guarda la tarjeta y cobra recurrente sin re-tokenizar.

### Decisión 3 — Cobro inmediato cuando la tarjeta se vincula con el trial ya vencido

Si al crear el `preapproval` el trial ya venció (`díasRestantes <= 0`), la implementación SHALL **omitir** el objeto `free_trial`. Una suscripción `authorized` sin `free_trial` cobra a la ~1h (comportamiento estándar documentado), que es exactamente lo deseado para una tienda que se reactiva tras estar bloqueada: paga ya. Solo se incluye `free_trial` cuando `díasRestantes >= 1`.

### Decisión 4 — Compatibilidad con suscripciones existentes (sin migración)

Las tiendas con `mp_preapproval_id` ya seteado bajo el esquema viejo (plan + `free_trial`) **conviven** sin cambios: su suscripción sigue activa en MP y el webhook sigue sincronizando su estado. El nuevo flujo solo aplica a altas nuevas y reactivaciones desde el bloqueo.

- **Por qué**: migrar preapprovals vivos es riesgoso (re-tokenización, posible interrupción de cobro) y no aporta valor — el doble-trial solo afecta altas futuras.
- **Trade-off**: durante un tiempo coexisten suscripciones creadas por plan y por API. Como ambas terminan reflejadas en los mismos campos (`mp_preapproval_id`, `mp_subscription_status`), el webhook y el cron las tratan igual, sin ramificar.

### Decisión 5 — Manejo de errores de creación de `preapproval` y reintentos

La server action SHALL devolver un resultado tipado (`ok` / `error` con motivo) ante tarjeta rechazada, token inválido/expirado o fallo de la API de MP. La UI SHALL mostrar el error y permitir reintentar (re-tokenizar y volver a crear). No se persiste `mp_preapproval_id` si la creación falla; la tienda sigue en `trial` hasta resolverlo.

### Decisión 6 — Eliminación de TODOS los planes y de la selección por historial

Como el cobro va sin plan asociado (Decisión 1), los planes de MP salen por completo del flujo. Se elimina `getMyCheckoutUrl` y el helper `pickPlanId` (que elegía plan por `mp_preapproval_id` previo) y la dependencia de las 6 env `MP_PREAPPROVAL_PLAN_ID_INICIAL/_MEDIO/_PRO` y sus `_RETURNING`. El monto pasa a definirse en el payload (`transaction_amount = PLAN_PRICES[store.plan]`, en `lib/subscription/plans.ts`). El cambio de plan (upgrade/downgrade) sigue existiendo, pero el ajuste de cobro se hace creando un nuevo `preapproval` por API (sin trial si `mp_preapproval_id` previo no es nulo → `díasRestantes` calculado contra el `trial_ends_at` ya vencido o nulo da `<= 0` → cobro inmediato) y cancelando el anterior, como ya hace el webhook. El dueño borra los 6 planes del dashboard una vez en producción.

### Decisión 7 — Una sola función de creación (a diferencia de wody)

wody mantiene dos funciones espejo (gym y Personal). wapy tiene un único tipo de tenant (`stores`), así que se implementa **una sola** función de creación de `preapproval` por API en `lib/mercadopago.ts`.

## Risks / Trade-offs

- [El mecanismo de diferimiento no es confiable] → **Resuelto**: se usa `free_trial`, el mismo mecanismo ya validado en la producción de wapy (difiere el primer cobro por el período indicado). `start_date` quedó descartado por estar contradicho por la doc. No requiere sandbox.
- [`free_trial.frequency` máximo en días no publicado oficialmente] → Mitigación: irrelevante — `díasRestantes` siempre es ≤ duración del trial (14 días), muy por debajo de cualquier tope plausible.
- [Card token de un solo uso / expira a los 7 días] → Mitigación: crear el `preapproval` inmediatamente tras tokenizar; ante expiración/uso previo, re-tokenizar (Decisión 5).
- [Bricks expone la public key y agrega un script externo de MP en el cliente] → Mitigación: usar solo la public key (no el access token), cargar el SDK de MP de forma controlada, mantener toda llamada privada en la server action.
- [Desfase de 1 día en `díasRestantes` por redondeo / zona horaria] → Mitigación: usar `ceil` (favorece al cliente, nunca cobra antes de tiempo) y calcular contra `trial_ends_at` en UTC.
- [Coexistencia de suscripciones viejas (por plan) y nuevas (por API)] → Mitigación: el webhook/cron operan sobre los mismos campos; no se requiere ramificar lógica downstream.
- [`transaction_amount` en la unidad equivocada] → Mitigación: `PLAN_PRICES` está en ARS enteros (7.000/9.000/18.000) y MP espera ARS en `transaction_amount`; verificar en el smoke test que el monto cobrado coincide con el del tier.

## Migration Plan

1. Cargar la public key de MP para el front (`NEXT_PUBLIC_MP_PUBLIC_KEY`). No hay que crear ni tocar planes en MP — el cobro va sin plan asociado.
2. Implementar la función de creación de `preapproval` por API en `lib/mercadopago.ts`, conservando `verifyWebhookSignature`, `parseMpSubscriptionStatus` y la cancelación de preapproval. Eliminar `pickPlanId`.
3. Reemplazar el CTA de redirect por el componente Bricks en la UI de la sección Suscripción y conectar la server action (que reemplaza a `getMyCheckoutUrl`).
4. Verificar que webhook y cron no requieren cambios (smoke test end-to-end en sandbox de MP: alta con `free_trial` dinámico → confirmar primer cobro diferido; alta con trial vencido → cobro inmediato).
5. Quitar las 6 env de plan de la config; el dueño borra los 6 planes del dashboard de MP tras el deploy.
6. Actualizar la doc de billing.

**Rollback**: las suscripciones viejas no se tocan; revertir el código de UI + lib restaura el flujo de redirect por plan. Las env de plan solo se eliminan en el paso final, así que el rollback previo a ese paso es directo.

## Open Questions

_Resueltas durante la investigación:_

- ~~¿Cómo diferir el primer cobro a fecha futura sin sandbox?~~ → **Resuelto: `free_trial` dinámico en días** (Decisión 1). `start_date` descartado por estar contradicho por la doc oficial (primer cobro a la ~1h).
- ~~¿Sin plan asociado o reusar planes `_RETURNING`?~~ → **Resuelto: sin plan asociado** (Decisión 1).
- ~~¿De dónde sale `transaction_amount` por tier?~~ → **Resuelto: `PLAN_PRICES[store.plan]`** en `lib/subscription/plans.ts` (ARS enteros).

_Pendiente (no bloqueante):_

- Confirmar en el smoke test de sandbox que `free_trial` dinámico en una suscripción `authorized` por API difiere el primer cobro exactamente N días (esperado por ser el mismo mecanismo de prod, pero el path API + token es nuevo en wapy).
