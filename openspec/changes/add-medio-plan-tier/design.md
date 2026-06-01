## Context

Wapy maneja hoy dos planes (`inicial`, `pro`) con precios de demo. Los límites viven en `lib/plans/limits.ts` (`{ maxProducts, maxSections }` por plan) y se enforzan en `lib/store/actions.ts`. Los precios viven en `lib/subscription/plans.ts`. El billing usa Mercado Pago con 4 Preapproval Plans (inicial/pro × con-trial/returning) seleccionados en `pickPlanId()` de `lib/mercadopago.ts`. El tope de imágenes por producto es un CHECK global (`<= 10`) en la migración 008, no por plan. Las variantes (`product_*` de la migración 021) están disponibles para todos los planes.

Este change introduce un tercer plan y dos dimensiones nuevas de límite (imágenes por plan, variantes por plan), más una migración de datos que renombra el valor de plan existente.

## Goals / Non-Goals

**Goals:**
- Tres planes `inicial`/`medio`/`pro` con precios $7.000/$9.000/$18.000 y trial 14 días en los tres.
- Modelo de límites por plan extendido a `maxImagesPerProduct` y `allowVariants`.
- Enforcement server-side de los cuatro límites + reflejo en UI del dashboard.
- 6 Preapproval Plans mapeados desde env vars; checkout y cambio de plan operando sobre los 3 planes.
- Migración idempotente que renombra `inicial`→`medio` en datos existentes y relaja el CHECK de imágenes.
- Landing con 3 cards + comparador de planes.

**Non-Goals:**
- No se borra contenido que exceda límites tras un downgrade (solo se bloquea agregar más).
- No se cambia la state machine de suscripción ni el webhook/cron (siguen igual).
- No se crean los Preapproval Plans automáticamente: el operador los crea en MP y carga las env vars.

## Decisions

**1. `inicial` se reusa como identificador del nuevo plan barato; el actual `inicial` se renombra a `medio`.**
Alternativa descartada: usar un id nuevo para el plan barato (p. ej. `basico`) y dejar `inicial` como está. Se descarta porque el usuario quiere que el plan de entrada se llame "inicial". Consecuencia: BREAKING en el valor de datos → requiere migración de `stores.plan` y `whitelist.plan` de `'inicial'`→`'medio'` ANTES (o junto) al deploy del código que define los nuevos límites de `inicial`, para que las tiendas existentes no hereden los límites recortados.

**2. Modelo de límites unificado en `lib/plans/limits.ts`.**
Se extiende `PLAN_LIMITS` a `{ maxProducts, maxSections, maxImagesPerProduct, allowVariants }` con `Infinity`/`true` para ilimitado. Un único helper (`getPlanLimits(plan)`) es la fuente de verdad para server actions, UI y comparador de la landing. Alternativa descartada: dispersar límites por feature; se descarta por riesgo de divergencia.

**3. El límite de imágenes deja de ser CHECK global y pasa a enforcement por plan.**
La migración relaja el CHECK de `image_urls` de la 008 (lo elimina o lo sube a un tope técnico alto, p. ej. 20) y el límite real (1 para inicial, ilimitado para medio/pro) se valida en la server action de guardado de productos y en el uploader. Razón: el CHECK no conoce el plan de la tienda. Trade-off: la integridad del límite por plan queda en la capa de aplicación, no en la DB; aceptable porque todas las escrituras pasan por server actions.

**4. Variantes gated por `allowVariants` en server actions + ocultar UI.**
Se valida en las actions de creación de option types/variants y se oculta el panel de variantes en el dashboard cuando el plan no las permite. Las variantes existentes no se tocan (downgrade-safe).

**5. 6 Preapproval Plans vía env vars; `pickPlanId(plan, returning)` mapea los 3 planes.**
Nuevas env vars `MP_PREAPPROVAL_PLAN_ID_MEDIO` y `MP_PREAPPROVAL_PLAN_ID_MEDIO_RETURNING`. Las de `inicial` ahora apuntan al nuevo plan de $7.000 (el operador crea Preapproval Plans nuevos con el precio correcto; los de demo quedan obsoletos). `getMyCheckoutUrl(plan)` y `changePlan(plan)` aceptan los 3 valores.

## Risks / Trade-offs

- **Orden migración vs deploy** → Si el código con los límites recortados de `inicial` se activa antes de migrar los datos, las tiendas existentes (hoy `inicial`) quedarían limitadas a 20 productos/1 sección. Mitigación: la migración corre antes del/junto al deploy; el rename es lo primero.
- **Precios de demo en MP** → Los Preapproval Plans viejos ($99/$180) no sirven. Mitigación: documentar claramente los 6 plans a crear y mapear cada uno a su env var antes de habilitar checkout en prod.
- **Límite de imágenes en capa de app** → Si en el futuro alguien escribe a la DB por fuera de las actions, no hay tope. Mitigación: aceptable hoy (todas las escrituras pasan por service-role actions); se podría reintroducir un CHECK técnico alto como red de seguridad.
- **Downgrade con contenido excedente** → una tienda que baja a `inicial` puede quedar con 40 productos. Es intencional (no se borra), pero la UI debe comunicar que no puede agregar más.

## Migration Plan

1. Nueva migración SQL: `UPDATE stores SET plan='medio' WHERE plan='inicial'` y lo mismo en `whitelist`; ajustar el `DEFAULT` de `stores.plan` si corresponde (sigue `inicial` para nuevas, que ahora es el plan barato — confirmar que el default deseado es `inicial`); eliminar/relajar el CHECK de `image_urls` de la migración 008.
2. Deploy del código (plans, limits, mercadopago, actions, dashboard, landing) junto con la migración.
3. Operador crea los 6 Preapproval Plans en Mercado Pago y carga las 6 env vars (incluyendo las 2 nuevas de `medio`).
4. Rollback: revertir el deploy; la migración de datos es reversible con `UPDATE ... SET plan='inicial' WHERE plan='medio'` solo si no se crearon tiendas nuevas en `inicial` real en el medio (por eso conviene ventana corta entre migración y verificación).

## Open Questions

- ¿El `DEFAULT` de `stores.plan` debe seguir siendo `inicial` (ahora el plan barato) para altas sin whitelist? Asumido que sí.
- Tope técnico para `image_urls` tras relajar el CHECK: ¿se elimina del todo o se deja un máximo alto de seguridad? Asumido que se deja un tope técnico holgado.
