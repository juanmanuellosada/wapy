## Why

Las tiendas Wapy no tienen forma de ofrecer promociones por código. Los cupones de descuento son una herramienta básica de marketing que los dueños esperan: permiten correr campañas (lanzamientos, fechas especiales, recuperación de clientes) sin bajar el precio de lista. Hoy no existe ningún mecanismo para aplicar un descuento al total de una compra.

## What Changes

- **Nueva sección "Cupones" en el dashboard del dueño**: CRUD completo (crear, editar, borrar, activar/desactivar) de cupones de su tienda.
- **Modelo de cupón**: código único por tienda, tipo de descuento (porcentaje **o** monto fijo), valor y flag activo/inactivo. Campos opcionales: fecha de vencimiento (si no la tiene, el cupón no expira; válida hasta el fin del día en hora Argentina), monto mínimo de compra y límite total de usos.
- **Aplicación de cupón en el storefront**: input en el carrito (antes de "Pedir por WhatsApp") para escribir y aplicar un código. **Un solo cupón por compra** (aplicar uno reemplaza al anterior).
- **Validación server-side** del cupón vía Server Action: existe, está activo, no está vencido, cumple el mínimo de compra y no superó el límite de usos. El cliente nunca decide el descuento.
- **Descuento reflejado en el checkout**: el total del carrito muestra el descuento aplicado; el mensaje de WhatsApp incluye una línea con el cupón y el descuento, más el total final; el código aplicado se registra en el pedido pendiente (`createPendingOrder`) y suma al contador de usos.
- **Fix incidental**: el cálculo de `totalPrice` en el carrito ignora `variantPrice` (usa siempre `price`), divergiendo del total del mensaje de WhatsApp. Se corrige en el mismo cambio porque se toca el cálculo del total.

## Capabilities

### New Capabilities
- `discount-coupons`: Gestión de cupones por parte del dueño de la tienda (modelo de datos, CRUD en el dashboard, tenancy/RLS) y aplicación de cupones por parte del cliente en el carrito del storefront (validación server-side, cálculo del descuento sobre el total, reflejo en el mensaje de WhatsApp y registro en el pedido).

### Modified Capabilities
<!-- No existen specs previas en openspec/specs/ (proyecto recién inicializado en OpenSpec); el comportamiento del carrito/checkout y del dashboard no está formalizado como capability. No hay deltas. -->

## Impact

- **Base de datos**: nueva migración `supabase/migrations/030_coupons.sql` — tabla `coupons` (FK `store_id` con `ON DELETE CASCADE`, `UNIQUE(store_id, code)`, contador de usos) + políticas RLS espejando el patrón de `sections` (owner CRUD, select público acotado, superadmin). Tipos generados en `lib/supabase/types.ts`.
- **Server Actions**: nuevas acciones de dueño `saveCoupon` / `deleteCoupon` / `toggleCoupon` (reusan `requireOwnerStore()` + Zod + tenancy manual `.eq('store_id', store.id)` + `revalidatePath`), y una acción pública `validateCoupon` (anon, valida por `store_id` + `code`). Modificación de `createPendingOrder` en `lib/store/orders/actions.ts` para aceptar y registrar el cupón aplicado e incrementar el uso.
- **Dashboard**: `app/dashboard/[section]/page.tsx` (registrar `coupons` en `VALID_SECTIONS`/`SECTION_TITLES`, precargar cupones, renderizar panel), `app/dashboard/components/Sidebar.tsx` (`NAV_ITEMS`), nuevo `app/dashboard/components/CouponsPanel.tsx`.
- **Storefront / carrito**: `app/[slug]/CartContext.tsx` (estado del cupón aplicado, descuento y total final; fix `price` vs `variantPrice`) y `app/[slug]/StoreClient.tsx` (`handleWhatsApp()` y UI del carrito: input de cupón, línea de descuento, total final, pasar el código a `createPendingOrder`).
- **Tipos compartidos**: `lib/onboarding/state.ts` u otro módulo de tipos para exponer el tipo `Coupon`.
- Sin breaking changes. Las tiendas sin cupones funcionan exactamente igual que hoy.
