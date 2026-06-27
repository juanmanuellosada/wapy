## 1. Base de datos

- [x] 1.1 Crear migración `supabase/migrations/030_coupons.sql` con la tabla `coupons` (`store_id` FK `ON DELETE CASCADE`, `code`, `discount_type` con CHECK in (`percent`,`fixed`), `discount_value` CHECK > 0, `expires_at date` **nullable** (NULL = no expira), `min_purchase` nullable CHECK >= 0, `max_uses` nullable CHECK > 0, `uses_count` default 0, `is_active` default true, timestamps), trigger `set_updated_at`, `UNIQUE(store_id, code)` e índice por `store_id`.
- [x] 1.2 Agregar las 3 políticas RLS espejando `sections`: `coupons_owner_crud` (owner por `auth.uid()`), `coupons_select_public` (anon, store publicada + `is_active`), `coupons_superadmin_all`.
- [x] 1.3 Revisar la migración existente de `orders` y decidir si extender `orders` con `coupon_code` / `discount_amount` (columnas o JSON) en esta misma migración o en `031`. Aplicar el cambio elegido. → Extendido en 030_coupons.sql con `ALTER TABLE orders ADD COLUMN coupon_code text NULL, ADD COLUMN discount_cents bigint NULL`.
- [x] 1.4 Regenerar tipos de Supabase en `lib/supabase/types.ts` (o documentar el cast `as any` puntual si no se regenera). → Cast `as any` puntual en todos los accesos a `coupons` y en el `INSERT` de `orders`, siguiendo el patrón ya establecido en el proyecto.

## 2. Tipos y validación compartida

- [x] 2.1 Definir el tipo `Coupon` (en `lib/onboarding/state.ts` o módulo de tipos del store) y un schema Zod base para cupón (código, tipo, valor con regla percent ≤ 100; vencimiento, mínimo y límite opcionales). → Tipo `Coupon` exportado desde `lib/store/coupons/actions.ts`; schema Zod con `superRefine` para la regla percent ≤ 100.
- [x] 2.2 Crear helper de vigencia `lib/store/coupons/validity.ts`: dada `expires_at` (date nullable) determina si el cupón sigue válido — si es NULL nunca expira; si tiene valor, considera fin del día en hora de Argentina (UTC-3 fijo). Incluir helper de cálculo de descuento (`percent`/`fixed`, tope a 0) reutilizable por client y server.
- [x] 2.3 Helper de normalización de código (mayúsculas + trim) usado al guardar y al validar. → `normalizeCouponCode()` en `lib/store/coupons/validity.ts`.

## 3. Server Actions del dueño

- [x] 3.1 Crear `lib/store/coupons/actions.ts` (`'use server'`) con `saveCoupon` (create/update) reusando `requireOwnerStore()` + `createAdminClient()` + Zod + `.eq('store_id', store.id)` + `revalidatePath('/dashboard','layout')`. Normalizar el código y mapear el error de unicidad a un mensaje claro.
- [x] 3.2 Agregar `deleteCoupon(couponId)` con doble filtro de tenancy `.eq('id', couponId).eq('store_id', store.id)`.
- [x] 3.3 Agregar `toggleCoupon(couponId, isActive)` con el mismo patrón de tenancy.

## 4. Server Action pública de validación

- [x] 4.1 Crear `validateCoupon({ storeId, code, cartTotal })` (anon): busca el cupón por `store_id` + código normalizado con `createAdminClient()`, valida existencia, `is_active`, no vencido (helper 2.2), mínimo de compra y límite de usos.
- [x] 4.2 Calcular el descuento server-side (helper 2.2) y devolver `{ ok: true, discount, finalTotal, coupon: { code, discountType, discountValue } }` o `{ error }` con mensaje específico por caso (inexistente/inactivo, vencido, mínimo, agotado).

## 5. Dashboard — sección Cupones

- [x] 5.1 Registrar `coupons` en `VALID_SECTIONS` y `SECTION_TITLES` de `app/dashboard/[section]/page.tsx`; precargar los cupones del store y renderizar `{section === 'coupons' && <CouponsPanel .../>}`.
- [x] 5.2 Agregar el item `coupons` a `NAV_ITEMS` en `app/dashboard/components/Sidebar.tsx` con label "Cupones" e icono `lucide-react` (`Ticket`/`BadgePercent`).
- [x] 5.3 Crear `app/dashboard/components/CouponsPanel.tsx` (`'use client'`) con la lista de cupones (estado activo/vencido/agotado/usos) y acciones crear/editar/borrar/activar-desactivar llamando a las actions de la tarea 3.
- [x] 5.4 Formulario modal de cupón (estilo `ProductModal`): código, toggle tipo percent/fixed, valor, vencimiento (date picker opcional — vacío = no expira), mínimo opcional, límite de usos opcional, activo. Validación de UI alineada con el Zod schema.

## 6. Storefront — aplicar cupón en el carrito

- [x] 6.1 Extender `app/[slug]/CartContext.tsx`: estado `appliedCoupon`, acciones `APPLY_COUPON`/`REMOVE_COUPON`, persistencia en `localStorage` (misma clave), y exponer `discountAmount` y `finalTotal` derivados.
- [x] 6.2 Corregir el cálculo de `totalPrice` para usar `variantPrice ?? price` (fix del bug existente, alinear con `handleWhatsApp`).
- [x] 6.3 En el carrito de `app/[slug]/StoreClient.tsx`, agregar input + botón "Aplicar" que llama a `validateCoupon` (server), muestra error/éxito, aplica el cupón (reemplazando el anterior) y permite quitarlo. Mostrar línea de descuento y total final en el resumen.
- [x] 6.4 En `handleWhatsApp()`, si hay cupón aplicado: agregar al mensaje la línea con código + descuento y el total final, y pasar `{ coupon_code, discount_amount }` a `createPendingOrder`.

## 7. Pedido pendiente

- [x] 7.1 Extender `createPendingOrder` en `lib/store/orders/actions.ts` para aceptar opcionalmente `{ coupon_code, discount_amount }` y persistirlos en el pedido (según lo decidido en 1.3).
- [x] 7.2 Incrementar `uses_count` del cupón al crear el pedido (best-effort; no bloquea la creación si falla).

## 8. Verificación

- [x] 8.1 Verificar build/typecheck del proyecto. → `tsc --noEmit` limpio; `next build` exitoso.
- [ ] 8.2 Probar el flujo del dueño: crear, editar, borrar, activar/desactivar; unicidad de código; validación de valor (percent ≤ 100, valor > 0).
- [ ] 8.3 Probar el flujo del cliente: aplicar cupón válido (percent y fixed), cupón sin vencimiento (nunca expira), cupón inexistente/inactivo, vencido (incluyendo el caso "último día válido en AR"), por debajo del mínimo, límite de usos alcanzado, fixed mayor al total (total final 0), reemplazo de cupón.
- [ ] 8.4 Verificar el mensaje de WhatsApp (línea de cupón + total final) y el registro del cupón + incremento de `uses_count` en el pedido pendiente.
- [ ] 8.5 Verificar el fix de `totalPrice` con un item con variante de precio distinto (total del carrito == total del WhatsApp).
