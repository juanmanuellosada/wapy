## Why

Hoy `/onboarding` muestra "Pronto vas a poder armar tu tienda acá". Cualquier mail invitado que se registra cae ahí y no puede hacer nada — el sistema admite signups pero no produce tiendas. Esta fase entrega el camino completo desde "soy un nuevo owner logueado" hasta "mi tienda está publicada en wapy.com.ar/{mi-slug} y recibe pedidos por WhatsApp". Es la fase que hace que Wapy sea un producto, no una infraestructura.

## What Changes

- **Wizard multi-paso** en `/onboarding/[step]` (URLs por paso, refresh-resistant): `basics` → `look` → `sections` → `products` → `whatsapp` → `review` → `publish`.
- **Stepper visible** con back/next, validación cliente + servidor por paso, navegación libre solo hacia pasos ya completados.
- **Autosave por paso**: cada "Siguiente" persiste a Supabase y actualiza `stores.onboarding_step`. El owner puede cerrar y volver — entra en el paso donde dejó.
- **Step 1 (basics) crea el row de `stores`** con `status='draft'`. Pasos siguientes usan el `store_id` resultante. Si el owner ya tiene una `stores` row con `status='draft'`, resumimos; si tiene una con `status='published'`, redirect a `/dashboard` (en Fase 5).
- **Slug uniqueness check en tiempo real** (debounced ~300ms): server action verifica que el slug esté libre + no esté en `reserved_slugs` + matche el regex. Feedback visual verde/rojo en el input.
- **Logo upload a Supabase Storage** (`store-logos/{store_id}/logo.{ext}`) con drag&drop + click.
- **Color de acento único configurable** (paleta de 6 colores curados — sin custom color picker). El resto del look es default compartido por todas las tiendas. Persistido en `stores.theme` como `{ accent_color: "#hex" }`.
- **Secciones**: agregar/editar/borrar/reordenar (drag) secciones. Mínimo 1 sección para avanzar al paso productos.
- **Productos**: agregar/editar/borrar/reordenar. Form con nombre, descripción, precio (en ARS), stock (opcional), sección, hasta 5 imágenes (upload a `product-images/{store_id}/{uuid}.{ext}`). Mínimo 1 producto para publicar.
- **WhatsApp number**: input con validación E.164 (default `+54 9 ` para Argentina), preview de `wa.me/...` link.
- **Revisión**: pantalla read-only con preview de todos los datos antes de publicar. Botón "Editar" por sección que vuelve al paso correspondiente.
- **Publicar**: server action setea `stores.status='published'`, `stores.published_at=NOW()`, `stores.onboarding_step=7`. Redirect a `/dashboard` (placeholder de Fase 5 por ahora — mostrará "Tu tienda está publicada en wapy.com.ar/{slug}" + link).
- **`/onboarding` (sin step)** redirige al paso correspondiente según `stores.onboarding_step`. Si no hay store row, va a `basics`. Si la store está published, va a `/dashboard`.

## Capabilities

### New Capabilities
- `onboarding-wizard`: el flow completo de 7 pasos con navegación, autosave, validación per-step.
- `store-publish`: la transición de `status='draft'` a `status='published'`, incluyendo enforcement de pre-requisitos (slug válido + ≥1 sección + ≥1 producto + WhatsApp).
- `image-upload`: integración con Supabase Storage para logos y product images (drag&drop, preview, delete, max sizes).

### Modified Capabilities
- `session-routing`: el middleware ahora también enruta `/onboarding` a `/onboarding/[step]` según `stores.onboarding_step`. Si el user logueado ya tiene una store published, `/onboarding` redirige a `/dashboard` (que sigue siendo placeholder en Fase 4 hasta Fase 5).

## Impact

- **Nuevas deps**: `react-dropzone` (drag&drop upload), `@dnd-kit/core` + `@dnd-kit/sortable` (reordenar secciones/productos). Tiny libraries, ambas estándar.
- **Nuevo código** (mucho):
  - `lib/onboarding/{schemas,actions,storage}.ts` — zod schemas por step, server actions, helpers de Storage.
  - `lib/onboarding/state.ts` — helpers para leer `stores` actual del owner + decidir paso a renderizar.
  - `app/onboarding/[step]/page.tsx` — router que despacha al componente de step correspondiente.
  - `app/onboarding/page.tsx` — server component que redirige a `/onboarding/[appropriate-step]`.
  - `app/onboarding/components/Stepper.tsx` — sidebar/top con progreso.
  - `app/onboarding/components/StepBasics.tsx`, `StepLook.tsx`, `StepSections.tsx`, `StepProducts.tsx`, `StepWhatsapp.tsx`, `StepReview.tsx`.
  - `app/onboarding/components/ImageUpload.tsx` — drag&drop reusable.
  - `app/onboarding/components/SortableList.tsx` — wrapper de @dnd-kit para secciones/productos.
- **DB**: sin migraciones. Schema actual es suficiente. La columna `stores.theme jsonb` recibe `{ accent_color }`.
- **Storage**: usa los buckets ya creados. Policies son correctas.
- **Modificación en `proxy.ts`**: `/onboarding` se vuelve un path "smart" que el middleware no toca, pero `/onboarding/[step]` sí (autenticación). Update mínimo.
- **Sin cambios** en `lib/admin/`, en pages de auth, ni en la landing.

## Out of scope (defer a fases posteriores)
- Edición post-publicación → Fase 5 (`wapy-owner-dashboard`).
- Custom color picker / fonts / templates → futuro.
- Importación bulk de productos (CSV) → futuro.
- Múltiples imágenes con reorden por producto → mostramos hasta 5 con orden de upload; reorden en Fase 5.
- Variantes de producto (tallas, colores) → futuro.
- Stock tracking real (decrementar al comprar) → no aplica, los pedidos van por WhatsApp, no hay "compra" online.
- Preview de la tienda real durante el wizard → en step `review` mostramos un mock interno; full preview sale post-publicación cuando Fase 6 migre el storefront.
