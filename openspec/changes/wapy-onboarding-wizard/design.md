## Context

Fase 3 cerró el loop administrativo: superadmin invita, owner se registra y aterriza en `/onboarding` (placeholder). Hoy ese placeholder es la pared del producto — el owner no puede hacer nada. Esta fase quita esa pared y entrega el flow completo hasta tener una tienda publicada (en draft hasta que llegue Fase 6, que migra el storefront público desde `lib/stores.ts` hardcodeado a leer de DB).

La constraint clave del diseño visual: **todas las tiendas comparten el mismo look base** (decisión del usuario). El único toque personal es el logo + un color de acento (paleta de 6). Esto simplifica masivamente el wizard (no tenemos que decidir layouts, fonts, themes) y garantiza que el storefront final sea coherente sin que el owner tenga que diseñar.

## Goals / Non-Goals

**Goals**

- Owner logueado entra a `/onboarding`, completa 7 pasos a su ritmo, y termina con su tienda `status='published'`.
- Cada paso autosavea — el owner puede cerrar el browser y volver. Resume en el paso que dejó.
- Validación cliente (UX inmediata) + servidor (defensa real) en cada paso.
- Slug uniqueness check en tiempo real para evitar frustración al submit.
- Imágenes uploadeadas a Supabase Storage con preview + delete.
- Secciones y productos reordenables (drag&drop).
- Al publicar, redirect a `/dashboard` (que en Fase 5 va a ser real, en Fase 4 sigue como placeholder mostrando "Publicado en wapy.com.ar/{slug}").

**Non-Goals**

- Edición de la tienda después de publicada → Fase 5 (`wapy-owner-dashboard`).
- Custom color picker, fonts, layouts → fuera de scope MVP.
- Bulk import de productos (CSV) → futuro.
- Variantes de producto (talla, color) → futuro.
- Preview funcional de la tienda durante el wizard que use el render real del storefront → Fase 6 deja el storefront real. En Fase 4 mostramos un mock interno en step Review.
- Stock decrementing automático al recibir pedido → no aplica, los pedidos van por WhatsApp.

## Decisions

### 1. URLs por paso: `/onboarding/[step]`, con redirect smart desde `/onboarding`

Cada paso vive en su propia URL: `/onboarding/basics`, `/onboarding/look`, etc. Beneficios:

- Refresh-resistant (estás en step "products" → F5 → seguís en "products").
- Shareable internamente para debug ("dame el screenshot de tu /onboarding/sections").
- History del browser funciona naturalmente (back va al paso anterior).

`/onboarding` (sin `[step]`) es un Server Component que:
1. Lee `stores` del owner via admin client.
2. Si no existe → redirect a `/onboarding/basics`.
3. Si existe y `status='draft'` → redirect a `/onboarding/{stepNameFor(onboarding_step)}`.
4. Si `status='published'` → redirect a `/dashboard`.
5. Si `status='paused'` → redirect a `/dashboard` también (Fase 5 maneja).

`/onboarding/[step]` también valida en server-side: si el owner intenta entrar a un step más adelante del que tiene completado, redirect al step correcto. Esto bloquea "salto" mientras permite "volver".

### 2. Step state machine: 7 valores explícitos

`stores.onboarding_step` es un `int` (0-7). Mapping:

| step value | URL slug | Meaning |
|---|---|---|
| 0 | basics | nada hecho aún (sin row de stores) |
| 1 | look | basics completo (row creada) |
| 2 | sections | look completo |
| 3 | products | secciones completas |
| 4 | whatsapp | productos completos |
| 5 | review | whatsapp completo |
| 6 | review | listo para publicar (todo válido) |
| 7 | — | publicado (status=published) |

Helper `lib/onboarding/state.ts` exporta:
- `getStoreState(userId)` → `{ store: Store | null, currentStep: StepName, canPublish: boolean }`
- `nextStep(currentStep)` → siguiente en el orden lineal
- `validateForStep(store, step)` → boolean si todo lo necesario para ese step está completo

### 3. Step 1 crea el row de stores; pasos siguientes UPDATE

Step `basics` es especial: es el único que hace INSERT en `stores`. Devuelve el `store_id` para los siguientes pasos. Todos los demás pasos hacen UPDATE.

**Edge case**: si el owner abandona en step basics sin submitir, no hay store row. Cuando vuelve, va a basics y empieza limpio. ✓

**Edge case**: si el owner submitee basics y abandona después, hay store row con `status='draft'` y `onboarding_step=1`. Cuando vuelve, va a `look`. ✓

### 4. Autosave: explícito al click "Siguiente", no debounced

Decidimos NO autosavear cada keystroke. Razones:
- Más simple (sin debounce, sin estado de "saving").
- Si el usuario cambia de opinión, no se pisan datos en DB hasta que confirme.
- Al click "Siguiente" se valida + save + advance. Si la red falla, el botón muestra error y no avanza.

**Excepción**: imágenes se uploadean inmediatamente al drop/seleccionar (porque son blobs grandes, no podemos guardarlas en memoria mientras llena el form). Cada upload es atómico: éxito → URL persistida en `stores.logo_url` o `products.image_urls[]`.

### 5. Slug uniqueness check: server action debounced 300ms

Cliente: input slug con `onChange` handler que: lower-cases, validates regex local, después de 300ms sin tipear nuevo, llama server action `checkSlugAvailable(slug)`.

Server action `checkSlugAvailable(slug)` (no requiere session ya que es check público):
```ts
async function checkSlugAvailable(slug: string): Promise<{ available: boolean, reason?: 'invalid' | 'reserved' | 'taken' }>
```

Valida:
1. Regex match `^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$` → si no, `{ available: false, reason: 'invalid' }`.
2. En `reserved_slugs` → si sí, `{ available: false, reason: 'reserved' }`.
3. En `stores` (excluyendo el store del propio owner si está editando) → si sí, `{ available: false, reason: 'taken' }`.
4. Si pasa todo → `{ available: true }`.

UI muestra ícono check verde / X roja al lado del input + mensaje (Slug libre / Inválido / Reservado / Ya en uso).

### 6. Logo upload: `store-logos/{store_id}/logo.{ext}` con replace

Single logo por store. Upload sobrescribe el existente. Component `ImageUpload` con react-dropzone:
- Acepta png/jpg/webp/svg, máx 2MB.
- Preview inmediato (URL.createObjectURL) mientras sube.
- Al éxito, actualiza `stores.logo_url` con la public URL del bucket.
- Botón "Eliminar" borra del bucket + setea `logo_url=NULL`.

### 7. Product images: hasta 5 por producto, orden = upload order

Component multi-image en form de producto:
- Hasta 5 imágenes. Botón "Agregar imagen" abre file picker.
- Cada upload va a `product-images/{store_id}/{uuid}.{ext}`.
- URLs se appenddean a `products.image_urls[]` en el orden que se uploadean.
- Botón X al hover de cada imagen la borra (del bucket + del array).
- Reorden via drag&drop → Fase 5 (no MVP).

### 8. Secciones: drag-sortable, mínimo 1 para avanzar

Component `SortableList` con @dnd-kit:
- Cada item = card con name + slug auto-derived (lower + dashes) + delete button.
- Botón "Agregar sección" en el bottom.
- Reorden update `sections.position` en batch al finalizar drag.
- Validation: al click "Siguiente", debe haber ≥1 sección.

### 9. Productos: misma estructura que secciones + form modal

Lista de productos drag-sortable. Botón "Agregar producto" abre un modal/sheet con form completo:
- Name, description, price (input mask para ARS), stock (opcional, número), section (select de las existentes), images (multi-upload).
- Validation: precio ≥ 0, name no vacío, section debe existir.
- Click "Guardar" cierra modal y appendea al listado.

Click en card de producto existente → mismo modal con datos cargados, en modo edit.

Validation paso productos: ≥1 producto creado.

### 10. WhatsApp number: input con máscara + validación E.164

Input que arranca con `+54 9 ` prefilled (Argentina default). Permite editar pero valida formato E.164:
- Regex: `^\+[1-9]\d{6,14}$` (string, sin espacios al guardar).
- UI con máscara visual: `+54 9 11 1234 5678`.
- Preview de link: muestra `wa.me/5491112345678` para que confirme visualmente.

Guardado en `stores.whatsapp_number` como E.164 sin espacios.

### 11. Step Review: todo read-only + edit shortcuts

Pantalla que muestra:
- Card "Datos de tienda" → name, slug, description. Botón "Editar" → `/onboarding/basics`.
- Card "Look" → logo + color de acento muestra. Botón "Editar" → `/onboarding/look`.
- Card "Secciones" → lista. Botón "Editar" → `/onboarding/sections`.
- Card "Productos" → lista con thumbnails. Botón "Editar" → `/onboarding/products`.
- Card "WhatsApp" → número formatado. Botón "Editar" → `/onboarding/whatsapp`.

Abajo: botón grande "Publicar mi tienda" + link disabled "Preview real" (texto "disponible próximamente" porque el storefront real es Fase 6).

### 12. Publish action: setea status + redirect

Server action `publishStore()`:
1. `requireOwner()` guard (auth user).
2. Lee la store del owner.
3. Re-valida que `status='draft'` y que todos los pre-requisitos están (slug válido, ≥1 sección, ≥1 producto activo, whatsapp_number presente). Si falla, devuelve error.
4. UPDATE `stores SET status='published', published_at=NOW(), onboarding_step=7 WHERE id=...`.
5. Redirect a `/dashboard`.

`/dashboard` page placeholder muestra:
- "🎉 Tu tienda está publicada"
- Card con link a "https://wapy.com.ar/{slug}" (anchor, even though Fase 6 hace que ese link funcione, en Fase 4 todavía no — pero el link queda preparado).
- Botón "Editar tienda" disabled con texto "Próximamente en Fase 5".
- Logout.

### 13. Validación: zod schemas compartidos cliente + server

`lib/onboarding/schemas.ts` exporta un schema por step:
- `basicsSchema`: name (1-80 chars), slug (regex), description (optional, max 280).
- `lookSchema`: accent_color (enum de 6 hex literales), logo_url (optional URL).
- `sectionsSchema`: array de sections, min 1, each name 1-40.
- `productsSchema`: array of products, each with name/price/section_id/etc. Min 1.
- `whatsappSchema`: phone E.164 regex.

Cliente usa `react-hook-form` + `zodResolver`. Server action re-parsea el mismo schema antes de DB. Si re-parse falla, throw → cliente muestra error.

### 14. Errores: inline por field cuando aplique, banner cuando es global

- Field-level: error rojo bajo el input (ej. "Slug ya en uso").
- Global error (server returned 500 / network issue): banner arriba del form, persistente hasta nuevo submit.
- Success en autosave: toast pequeño abajo "Guardado" + automaticamente avanza.

### 15. Cleanup al borrar producto/sección

Al borrar un producto con imágenes:
- DELETE row en `products` (cascade no aplica acá porque no hay FK que dependa).
- Borrar las imágenes del bucket: para cada URL en `image_urls`, extraer el path y `supabase.storage.from('product-images').remove([path])`.
- Si la deletion del storage falla, log + continúa. Files huérfanos en storage son aceptables (cleanup job futuro).

Al borrar una sección:
- Los productos con ese `section_id` se NULL-eate via FK ON DELETE SET NULL (del schema de Fase 1).
- Los productos quedan en "sin sección". El wizard muestra warning si hay productos sin sección al final.

## Risks / Trade-offs

- **Risk**: Wizard largo, el owner puede abandonar antes de publicar. Quedan stores en `status='draft'` ocupando slugs. → **Mitigación**: documentamos en design. Cleanup job futuro (Fase post-MVP) puede expirar drafts > 30 días sin actividad. El slug se libera al borrar la row.
- **Risk**: Upload concurrente puede dejar files huérfanos si el user navega antes de que termine el upload. → **Mitigación**: upload async, UI muestra spinner per-image. El owner ve qué está pendiente.
- **Risk**: El check de slug en tiempo real puede ser racy: dos owners eligen el mismo slug al mismo tiempo. → **Mitigación**: la UNIQUE constraint en `stores.slug` es la última defensa; el segundo en submitear ve el error al "Siguiente" desde basics.
- **Risk**: `validateForStep` puede divergir del state real si la DB cambia entre paso 5 y publish. → **Mitigación**: el publish action re-valida todo desde DB antes de UPDATE.
- **Risk**: Image storage cost balloons si owners suben muchas imágenes grandes. → **Mitigación**: max 2MB por imagen, max 5 imágenes por producto, max 1 logo por store. Storage Pro = 100GB → soporta ~10k stores antes de preocuparse.
- **Trade-off**: Sin custom color/font → estética uniforme = control de marca de plataforma. Algunos owners van a querer más libertad. Mitigación: paleta de 6 colores curados cubre ~80% de marcas pequeñas.
- **Trade-off**: Sin preview funcional real durante wizard → owner publica "a ciegas" (con un mock interno). Aceptable porque hasta Fase 6 el storefront real no existe.
- **Trade-off**: Step state machine en `int` (vs enum) → más simple para incrementar pero menos type-safe. Aceptable con helper `stepNameFor()` que mapea int → name.

## Migration Plan

Sin migración SQL. Schema existente cubre todo:
- `stores.theme jsonb` recibe `{ accent_color: "#hex" }`.
- `stores.onboarding_step int` se usa como puntero al paso actual.
- `stores.logo_url`, `stores.whatsapp_number`, `stores.published_at` ya son nullable y se llenan en sus pasos.
- `sections` y `products` se llenan en pasos 3 y 4.

**Smoke test post-implementación** (local primero):
1. Logueate como un owner test (creá nuevo invite desde `/admin`, completá el signup).
2. Andá a `/onboarding`. Debería redirect a `/onboarding/basics`.
3. Completá basics con name "Tienda Test" + slug "tienda-test" + descripción. Verifica check de slug en tiempo real.
4. Avanza por look (subí un logo, elegí color), sections (al menos 1), products (al menos 1 con foto), whatsapp.
5. En review, verifica que todos los datos aparecen. Probá "Editar" en alguna sección → vuelve a ese step.
6. Click "Publicar". Redirect a `/dashboard` con mensaje de éxito.
7. Cerrar browser, re-entrar, login. `/onboarding` debe redirect a `/dashboard` (ya publicada).
8. Crear otro owner test, hacer onboarding pero abandonar en step productos. Cerrar browser. Re-loguear. Debe volver al step productos.

## Open Questions

- **¿Permitimos "saltar" un paso? Por ejemplo, "agregar productos más tarde"?** Recomendación: NO en Fase 4. Onboarding completo o nada. El owner puede editar después (Fase 5).
- **¿El stepper visible debe ser sidebar (desktop) y top bar (mobile)?** Recomendación: SÍ — responsive es mandatory. Diseño usa Tailwind breakpoints.
- **¿Mostrar precio en input con/sin separador de miles?** Recomendación: input acepta dígitos + display visual con miles (`$ 12.500`). Persistido como `price_cents` (entero, ARS minor unit).
