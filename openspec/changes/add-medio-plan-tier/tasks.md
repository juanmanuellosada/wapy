## 1. Migración de datos y DB

- [x] 1.1 Crear nueva migración SQL en `supabase/migrations/` que: `UPDATE stores SET plan='medio' WHERE plan='inicial'` y `UPDATE whitelist SET plan='medio' WHERE plan='inicial'`
- [x] 1.2 En la misma migración, relajar/eliminar el CHECK de `image_urls` (`<= 10`) definido en la migración 008 (dejar opcionalmente un tope técnico holgado, p. ej. 20)
- [x] 1.3 Confirmar/ajustar el `DEFAULT` de `stores.plan` (sigue `inicial`, que ahora es el plan barato)

## 2. Catálogo de planes y límites

- [x] 2.1 Actualizar `lib/subscription/plans.ts`: tres planes `inicial` ($7.000) / `medio` ($9.000) / `pro` ($18.000) con nombre y precio formateado
- [x] 2.2 Extender `lib/plans/limits.ts` a `{ maxProducts, maxSections, maxImagesPerProduct, allowVariants }` con la matriz: inicial 20/1/1/false, medio 50/3/∞/true, pro ∞/∞/∞/true; exponer helper `getPlanLimits(plan)`
- [x] 2.3 Actualizar el tipo `PlanId` para incluir `medio` y revisar todos los usos (`inicial`|`pro` → `inicial`|`medio`|`pro`)

## 3. Enforcement server-side

- [x] 3.1 En `lib/store/actions.ts` `saveStoreProduct()`: límite de productos por plan (bloquear creación al alcanzar `maxProducts`; permitir edición por encima del tope)
- [x] 3.2 En `lib/store/actions.ts` `saveStoreSections()`: límite de secciones por `maxSections`
- [x] 3.3 En `saveStoreProduct()` (o action de imágenes): validar cantidad de imágenes contra `maxImagesPerProduct` del plan
- [x] 3.4 En las actions de variantes/option types: bloquear creación cuando `allowVariants` es false (no borrar variantes existentes)

## 4. Billing / Mercado Pago

- [x] 4.1 Agregar env vars `MP_PREAPPROVAL_PLAN_ID_MEDIO` y `MP_PREAPPROVAL_PLAN_ID_MEDIO_RETURNING` (y documentar las 6 en `.env.example`/README de env)
- [x] 4.2 Actualizar `pickPlanId()` en `lib/mercadopago.ts` para mapear los 3 planes × (trial/returning) a los 6 Preapproval Plans
- [x] 4.3 Actualizar `getMyCheckoutUrl(plan)` y `changePlan(plan)` en `lib/subscription/actions.ts` para aceptar `inicial`|`medio`|`pro`

## 5. Dashboard UI

- [x] 5.1 `ProductsPanel.tsx`: mostrar contador y deshabilitar agregar según `maxProducts` del plan actual
- [x] 5.2 `SectionsPanel.tsx`: reflejar el límite de secciones del plan
- [x] 5.3 Uploader de imágenes del producto: limitar a `maxImagesPerProduct` del plan (inicial = 1)
- [x] 5.4 Panel/editor de variantes: ocultar o deshabilitar cuando `allowVariants` es false (plan inicial)
- [x] 5.5 `SubscriptionPanel.tsx`: opción de cambiar de plan entre los 3 (inicial/medio/pro) con sus precios

## 6. Landing

- [x] 6.1 `app/components/Pricing.tsx`: tercera card; orden inicial → medio → pro, cada una con precio, features y "14 días gratis sin tarjeta"
- [x] 6.2 Agregar comparador de planes debajo de las cards: tabla con filas (productos, secciones, imágenes por producto, variantes, prueba 14 días) y columnas por plan, con tilde/cruz/valor

## 7. Verificación

- [x] 7.1 Verificar build/typecheck (cambios de tipo `PlanId`) y que no queden referencias a 2 planes — `tsc --noEmit` exit 0
- [ ] 7.2 Verificar enforcement: tienda inicial no pasa de 20 productos / 1 sección / 1 imagen / sin variantes; medio y pro según matriz
- [ ] 7.3 Verificar landing: 3 cards + comparador con los valores correctos
