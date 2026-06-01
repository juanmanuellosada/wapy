## Why

Hoy Wapy tiene dos planes (`inicial` y `pro`) con precios de demo. Queremos un escalón de entrada más barato para captar tiendas chicas y reposicionar los planes existentes: agregar un plan `inicial` económico ($7.000) y correr el plan actual a una capa intermedia (`medio`), dejando `pro` como tope. Esto crea una grilla good/better/best clara y habilita límites por plan que hoy no existen (imágenes por producto y variantes).

## What Changes

- **Nuevo plan `inicial`** ($7.000/mes, trial 14 días): máx **20 productos**, máx **1 sección**, máx **1 imagen por producto**, **sin variantes**.
- **Renombrar el plan `inicial` actual a `medio`** ($9.000/mes, trial 14 días): máx 50 productos, máx 3 secciones, variantes incluidas, sin límite de imágenes. Los valores de límites son los del `inicial` de hoy. **BREAKING**: cambia el identificador de plan `inicial` → `medio` para tiendas existentes.
- **Plan `pro` sin cambios funcionales** (todo ilimitado, variantes, trial 14 días); solo el precio pasa a $18.000/mes.
- **Nuevo modelo de límites por plan**: `maxProducts`, `maxSections`, `maxImagesPerProduct`, `allowVariants` por plan.
- **Enforcement nuevo**: límite de imágenes por producto según plan (hoy es un CHECK global de 10) y bloqueo de creación de variantes para `inicial`.
- **Billing**: 3 planes × 2 variantes (con trial / returning sin trial) = **6 Preapproval Plans** en Mercado Pago. Nuevas env vars `MP_PREAPPROVAL_PLAN_ID_MEDIO` y `_MEDIO_RETURNING`; `pickPlanId()` y `getMyCheckoutUrl()`/`changePlan()` deben soportar los 3 planes.
- **Migración**: renombrar `'inicial'`→`'medio'` en `stores.plan` y `whitelist.plan` para registros existentes, ajustar default de nuevas tiendas, y relajar el CHECK de `image_urls`.
- **Landing**: tercera card en `Pricing.tsx` (inicial/medio/pro) + un **comparador de planes** debajo de las cards con todas las features tildadas/cruzadas por plan.

## Capabilities

### New Capabilities
- `plan-limits`: cuotas por plan (productos, secciones, imágenes por producto, variantes habilitadas) y su enforcement en server actions y dashboard.
- `landing-pricing`: presentación de los 3 planes en la landing (cards + tabla comparadora de features).

### Modified Capabilities
- `subscription-billing`: el catálogo de planes pasa de 2 a 3 (`inicial`/`medio`/`pro`), nuevos precios, mapeo a 6 Preapproval Plans de Mercado Pago, y checkout/cambio de plan operando sobre los 3 planes.
- `product-variants`: las variantes quedan condicionadas al plan (disponibles en `medio` y `pro`, no en `inicial`).

## Impact

- **Código**: `lib/subscription/plans.ts`, `lib/plans/limits.ts`, `lib/mercadopago.ts` (`pickPlanId`), `lib/subscription/actions.ts` (`getMyCheckoutUrl`, `changePlan`), `lib/store/actions.ts` (enforcement de productos/secciones/imágenes/variantes), paneles del dashboard (`ProductsPanel`, `SectionsPanel`, uploader de imágenes, panel de variantes), `app/components/Pricing.tsx` (+ nuevo comparador).
- **DB**: nueva migración (rename de valor de plan, default, relax del CHECK de `image_urls`).
- **Config/Env**: 2 nuevas env vars de Preapproval Plan; el operador debe crear 6 Preapproval Plans en Mercado Pago.
- **Datos**: tiendas y whitelist con plan `inicial` actual migran a `medio` (mantienen sus features).
