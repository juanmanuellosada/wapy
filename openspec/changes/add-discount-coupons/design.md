## Context

Wapy es un SaaS multi-tenant de tiendas (Next.js App Router + Supabase). Cada dueño tiene exactamente una tienda (`stores.owner_id UNIQUE`). El checkout no es transaccional: el cliente arma un carrito en el storefront público (`app/[slug]`) y el pedido se concreta por WhatsApp. El carrito vive en React Context + `useReducer` + `localStorage` (`app/[slug]/CartContext.tsx`); el botón "Pedir por WhatsApp" arma un mensaje de texto y crea un pedido pendiente vía `createPendingOrder` (`lib/store/orders/actions.ts`).

El dashboard usa una ruta única `app/dashboard/[section]/page.tsx` con secciones whitelisteadas. Las entidades tenant-scoped (`sections`, `products`) siguen un patrón consistente: tabla con FK `store_id ON DELETE CASCADE` + RLS de tres políticas (owner CRUD por `owner_id = auth.uid()`, select público acotado, superadmin), Server Actions en `lib/store/actions.ts` que usan `createAdminClient()` (service role, bypassa RLS) y aplican tenancy manualmente con `requireOwnerStore()` + `.eq('store_id', store.id)`, validación Zod y `revalidatePath`.

Esta feature agrega una entidad `coupons` siguiendo ese patrón, más un camino nuevo: validación de cupón desde el cliente **anónimo** del storefront (no hay sesión de cliente).

## Goals / Non-Goals

**Goals:**
- CRUD de cupones para el dueño, consistente con el patrón de `sections`/`products`.
- Aplicación de un cupón por compra en el carrito, con descuento calculado y validado server-side.
- Reflejar el descuento en el resumen del carrito, en el mensaje de WhatsApp y en el pedido pendiente.
- Vigencia correcta hasta fin del día en hora de Argentina.
- Corregir el bug de `totalPrice` (`price` vs `variantPrice`) de paso.

**Non-Goals:**
- Límite de usos "por cliente" (no hay identidad de cliente en el flujo WhatsApp; sería poco confiable).
- Acumular varios cupones en una compra.
- Descuentos por producto/categoría, envío gratis, o reglas de elegibilidad por item (solo descuento sobre el total).
- Conteo de usos exacto/transaccional: el contador se incrementa al crear el pedido pendiente, que es una aproximación (el cliente puede no concretar la compra por WhatsApp). Aceptado explícitamente.

## Decisions

### 1. Tabla `coupons` espejando `sections`
Nueva migración `supabase/migrations/030_coupons.sql`:
```
coupons(
  id uuid pk,
  store_id uuid not null references stores(id) on delete cascade,
  code text not null,                          -- normalizado mayúsculas/trim
  discount_type text not null check in ('percent','fixed'),
  discount_value numeric not null check (> 0), -- percent: 0<v<=100 (validado en app); fixed: monto
  expires_at date null,                        -- opcional; NULL = no expira. Se interpreta como fin del día AR
  min_purchase numeric null check (>= 0),      -- opcional
  max_uses integer null check (> 0),           -- opcional
  uses_count integer not null default 0,
  is_active boolean not null default true,
  created_at/updated_at timestamptz, trigger set_updated_at,
  unique (store_id, upper(code))               -- vía índice único funcional o columna normalizada
)
```
RLS: tres políticas espejando `sections` (`coupons_owner_crud`, `coupons_select_public` para anon limitado a stores publicadas + `is_active`, `coupons_superadmin_all`). Índice por `store_id`.

**Unicidad case-insensitive**: se normaliza el código en la app antes de guardar (mayúsculas + trim), y la constraint `UNIQUE(store_id, code)` opera sobre el valor ya normalizado. Alternativa considerada: índice único sobre `upper(code)` — se descarta para mantener la constraint simple y porque la normalización en la app ya garantiza consistencia.

**`expires_at` como `date` nullable** (no `timestamptz`): el dueño elige un día, no una hora; y es opcional — `NULL` significa que el cupón no expira. La interpretación "fin del día en AR" se resuelve en la validación (decisión 4), no en el tipo de columna. Más simple para la UI (un date picker que puede quedar vacío).

### 2. Server Actions: dueño vs público
- **Dueño** (`lib/store/coupons/actions.ts`, nuevo módulo `'use server'`): `saveCoupon` (create/update), `deleteCoupon`, `toggleCoupon`. Reusan `requireOwnerStore()` + `createAdminClient()` + `.eq('store_id', store.id)` + Zod + `revalidatePath('/dashboard','layout')`. Resultado tipado `{ ok: true } | { error: string }`.
- **Público** (`validateCoupon`): action anónima que recibe `{ storeId, code, cartTotal }`, busca el cupón por `store_id` + código normalizado con `createAdminClient()`, corre TODAS las validaciones server-side (existe, activo, no vencido, mínimo, límite de usos) y devuelve `{ ok: true, discount, finalTotal, coupon: {code, type, value} } | { error }`. Es la fuente de verdad del descuento.

**Por qué validar el total en el server**: el cliente envía `cartTotal`, pero el descuento (porcentaje/fijo, tope a 0) se calcula en el server a partir de los datos del cupón. El `cartTotal` solo se usa para chequear el mínimo y calcular el monto; como el checkout es informativo por WhatsApp, no se re-valida el carrito item por item (el dueño ve el detalle en el mensaje). Esto es coherente con el modelo de confianza actual del proyecto.

### 3. Estado del cupón en el carrito
`CartContext.tsx` agrega al estado: `appliedCoupon: { code, discountType, discountValue } | null`. Acciones nuevas en el reducer: `APPLY_COUPON` / `REMOVE_COUPON`. Se persiste en `localStorage` junto con el carrito (misma clave `wapy-cart-${slug}`).

El context expone: `discountAmount` y `finalTotal` derivados de `totalPrice` + `appliedCoupon`. **El cálculo del descuento se hace en el server** (`validateCoupon`) al aplicar; el valor del descuento se recalcula en el cliente solo para reflejar cambios de cantidad después de aplicado (re-derivando porcentaje/fijo sobre el `totalPrice` actual, con tope a 0). Si el carrito cambia y deja de cumplir el mínimo, se puede re-validar al confirmar; para v1, el descuento se recalcula localmente y la verdad final la fija el mensaje/pedido.

**Fix `totalPrice`**: cambiar el `reduce` para usar `i.variantPrice ?? i.price` (líneas ~167-171 de `CartContext.tsx`), alineándolo con el cálculo que ya hace `handleWhatsApp()`.

### 4. Vigencia hasta fin del día en hora de Argentina
Si `expires_at` es `NULL`, el cupón no expira (siempre vigente mientras esté activo). Si tiene valor, la validación compara "ahora" contra el fin del día de `expires_at` en UTC-3. Implementación: construir el límite como `expires_at` a las 23:59:59 AR → en UTC es `expires_at + 1 día a las 02:59:59Z`. Comparar `now() < limite`. Se centraliza en un helper (ej. `lib/store/coupons/validity.ts`) usado por `validateCoupon` para evitar drift entre client y server. AR no tiene DST hoy (UTC-3 fijo), así que un offset fijo es correcto y simple; se documenta el supuesto.

### 5. `createPendingOrder` acepta el cupón
Extender la firma para aceptar opcionalmente `{ coupon_code, discount_amount }`. Al crear el pedido: persistir el código y el descuento en el registro del pedido (columnas nuevas o JSON existente — a confirmar contra el esquema actual de `orders`), e incrementar `uses_count` del cupón (`update ... set uses_count = uses_count + 1`). El incremento es best-effort; si falla no bloquea la creación del pedido.

### 6. UI del dashboard
`CouponsPanel.tsx` basado en `SectionsPanel`/`ProductsPanel`: lista de cupones con estado (activo/vencido/agotado), botón crear, formulario modal (estilo `ProductModal`) con campos código, tipo (toggle percent/fixed), valor, vencimiento (date), mínimo (opcional), límite de usos (opcional), activo. Registrar la sección en `VALID_SECTIONS` + `SECTION_TITLES` (`app/dashboard/[section]/page.tsx`), precargar cupones del store, y agregar `NAV_ITEMS` en `Sidebar.tsx` con un icono `lucide-react` (ej. `Ticket`/`BadgePercent`).

## Risks / Trade-offs

- **Conteo de usos aproximado** → el contador se incrementa al crear el pedido pendiente, no al concretarse la venta (que ocurre fuera del sistema, en WhatsApp). Mitigación: documentarlo en la UI del dueño ("usos = veces que se generó un pedido con el cupón"); aceptado como Non-Goal.
- **Descuento manipulable en el mensaje** → el mensaje de WhatsApp es texto; un cliente técnico podría editar la URL. Mitigación: el descuento real lo decide `validateCoupon` server-side y queda registrado en el pedido pendiente; el dueño coteja contra el pedido, no contra el texto. Riesgo residual igual al modelo actual del checkout.
- **Recalcular el descuento en el cliente tras cambios de carrito** → un cupón aplicado con mínimo cumplido podría dejar de cumplirlo si el cliente baja cantidades. Mitigación v1: recalcular el monto localmente y, si el total cae por debajo del mínimo, quitar el cupón o marcarlo inválido en el resumen. Se puede re-validar server-side al confirmar en una iteración futura.
- **Tipos de Supabase desfasados** → la tabla nueva no estará en `lib/supabase/types.ts` hasta regenerar. Mitigación: regenerar tipos o usar casts `as any` puntuales como ya hace `actions.ts`.
- **Zona horaria fija UTC-3** → si Argentina reintroduce DST, el offset fijo fallaría. Mitigación: helper centralizado y documentado; cambio localizado si alguna vez aplica.

## Migration Plan

1. Aplicar `030_coupons.sql` (siguiendo el flujo de migraciones del proyecto; recordar que migraciones previas como `027` quedaron pendientes de prod — coordinar el orden de aplicación).
2. Regenerar tipos de Supabase (`lib/supabase/types.ts`).
3. Desplegar actions + dashboard + storefront. Feature aditiva: tiendas sin cupones no cambian de comportamiento.
4. Rollback: como es aditivo, deshabilitar la sección del dashboard y el input del carrito; la tabla puede quedar sin uso. `DROP TABLE coupons` solo si se revierte por completo (CASCADE no afecta otras tablas porque nadie referencia a `coupons`).

## Open Questions

- ¿El esquema actual de `orders` tiene dónde guardar `coupon_code`/`discount_amount`, o hace falta extenderlo en esta misma migración? (Resolver leyendo la migración de `orders` durante la implementación.)
- ¿El descuento `fixed` debe poder superar el total y dejarlo en 0 (decidido: sí, tope a 0) o debería rechazarse? Decidido: tope a 0.
