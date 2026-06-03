## 1. Config y dependencias

- [x] 1.1 Agregar `NEXT_PUBLIC_MP_PUBLIC_KEY` a `.env.example` (con comentario) y documentar que se carga en el entorno
- [x] 1.2 Agregar `@mercadopago/sdk-js` como dependencia del cliente
- [x] 1.3 Marcar como deprecadas (comentario) las 6 env `MP_PREAPPROVAL_PLAN_ID_*` en `.env.example` — se eliminan al final del rollout

## 2. Capa de Mercado Pago (`lib/mercadopago.ts`)

- [x] 2.1 Implementar la función única `createSubscriptionPreapproval({ store, cardTokenId, payerEmail })` que arma el payload sin plan: `status: "authorized"`, `external_reference = store.id`, `reason`, `back_url`, `auto_recurring` con `transaction_amount = PLAN_PRICES[store.plan]`, `currency_id: "ARS"`, `frequency: 1`, `frequency_type: "months"`
- [x] 2.2 Calcular `díasRestantes = ceil((trial_ends_at - now)/día)` en UTC e incluir `free_trial: { frequency: díasRestantes, frequency_type: "days" }` solo si `díasRestantes >= 1`; omitirlo si `<= 0`
- [x] 2.3 Mapear la respuesta `{ id, status }` a `mp_preapproval_id` + `parseMpSubscriptionStatus`; devolver resultado tipado (`ok` / `error` con motivo)
- [x] 2.4 Eliminar `pickPlanId` y toda referencia a las 6 env de plan; conservar `verifyWebhookSignature` (firma), `parseMpSubscriptionStatus` y la cancelación de preapproval intactos

## 3. Server action (`lib/subscription/actions.ts`)

- [x] 3.1 Crear la server action que recibe `card_token_id` (y plan destino si aplica), valida que el usuario sea dueño de la tienda, y llama a `createSubscriptionPreapproval`
- [x] 3.2 Persistir `mp_preapproval_id` / `mp_subscription_status` solo en caso `ok`; no persistir nada en caso `error`
- [x] 3.3 En cambio de plan: actualizar `stores.plan`, crear el nuevo preapproval por API (sin `free_trial` por historial) y cancelar el anterior al autorizarse
- [x] 3.4 Eliminar `getMyCheckoutUrl`

## 4. UI de la sección Suscripción

- [x] 4.1 Montar el Card Payment Brick / CardForm de MP (`new MercadoPago(NEXT_PUBLIC_MP_PUBLIC_KEY)`) reemplazando el CTA de redirect
- [x] 4.2 Conectar la tokenización → server action; mostrar estado de carga
- [x] 4.3 Mostrar errores tipados y permitir reintentar (re-tokenizar y recrear)
- [x] 4.4 Mantener visibles los estados (trial con días restantes / activo / gracia / bloqueado / exento) y las acciones (suscribir, reactivar, cancelar, cambiar de plan)

## 5. Verificación

- [ ] 5.1 Smoke test en sandbox de MP: alta con trial vigente → confirmar que el primer cobro se difiere `díasRestantes` días (no cobra a la ~1h)
- [ ] 5.2 Smoke test: alta con trial vencido (`díasRestantes <= 0`) → confirmar cobro inmediato
- [ ] 5.3 Smoke test: cambio de plan → confirmar cobro inmediato del nuevo monto y cancelación del preapproval anterior
- [ ] 5.4 Verificar que el webhook firmado sigue sincronizando estado sin cambios y que el cron de bloqueo/grace sigue operando igual
- [ ] 5.5 Verificar que una suscripción creada bajo el esquema viejo (por plan) sigue activa y sincronizando (sin migración)

## 6. Limpieza post-deploy

- [ ] 6.1 Eliminar las 6 env `MP_PREAPPROVAL_PLAN_ID_*` de la config
- [ ] 6.2 El dueño borra los 6 `preapproval_plan` del dashboard de MP
- [ ] 6.3 Actualizar la doc de billing con el nuevo flujo (API sin plan + Bricks + free_trial dinámico)
