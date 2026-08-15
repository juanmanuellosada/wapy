## Why

Cargar un catálogo real en Wapy hoy es de a un producto por vez: abrir el modal, escribir el nombre, subir la foto, poner el precio, guardar, repetir. Para un dueño que llega con 40, 80 o 200 fotos de productos, ese onboarding es la principal fricción para migrar su negocio a la plataforma — y la razón más común de abandonar el trial con la tienda vacía.

La foto es el único activo que el dueño ya tiene ordenado (una carpeta en el celular o la compu, con los archivos nombrados como el producto). Aprovechar eso: **subir un ZIP de fotos y que salgan N productos borrador de una**, y después completar precios y datos en una grilla, convierte horas de carga en minutos. Se ofrece solo en el plan Pro, donde el catálogo es ilimitado y el volumen justifica la herramienta.

## What Changes

- **Nueva capacidad de alta masiva por ZIP (solo plan Pro).** El dueño arrastra un `.zip` con fotos al dashboard de productos; el sistema descomprime, valida, sube cada imagen y crea un producto por foto:
  - **nombre** = nombre del archivo sanitizado (sin extensión, guiones/underscores → espacios, espacios colapsados, primera letra en mayúscula, truncado a un largo razonable);
  - **precio** = `0`, sin promo, sin stock (ilimitado), sin sección;
  - **estado** = **borrador** (`is_active = false`), para que no se publiquen productos a $0 en la tienda;
  - **imagen** = la foto del ZIP, pasada por la misma pipeline de optimización a WebP que ya usa el alta individual.
- **Categoría y precio comunes opcionales en el propio import.** En la pantalla del import el dueño puede elegir una sección y un precio que se apliquen a todos los productos del ZIP, para no tener que corregirlos uno por uno después. Cargar un precio no publica nada: los productos siguen naciendo en borrador.
- **Descompresión en el navegador.** El ZIP nunca viaja como cuerpo de una server action: se descomprime client-side y se suben las fotos de a una reusando la infraestructura de upload existente. Esto esquiva el `bodySizeLimit` de 10 MB y reusa `uploadProductImageAction` sin tocarla.
- **Tolerancia a fallos parciales.** Si algunas fotos fallan (corruptas, formato no soportado, error de red), el import **no se aborta**: se crean los productos de las fotos que sí subieron y se reporta el detalle de las que fallaron, con opción de reintentar solo esas.
- **Nueva grilla de edición masiva de productos (solo plan Pro).** Una vista tabular del catálogo donde el dueño edita en línea **nombre, descripción, precio, precio promocional, sección, stock y activo/inactivo**, con selección múltiple para aplicar en lote sobre los seleccionados (precio, sección, stock, publicar/despublicar). Guardado explícito de los cambios pendientes, con validación equivalente a la del formulario individual.
- **Nuevo flag de plan `allowBulkProducts`** en `PLAN_LIMITS` (`inicial: false`, `medio: false`, `pro: true`), validado en el servidor como fuente de verdad y usado en la UI para mostrar la entrada o el upsell a Pro.
- **El límite de productos del plan se valida contra el lote completo** (`productos actuales + productos a crear ≤ maxProducts`), no de a uno como hoy. En Pro es ilimitado, pero el guard existe por consistencia y para no confiar en el cliente.
- **Fila nueva en la tabla de planes de la landing**, marcando alta masiva + edición masiva como beneficio exclusivo de Pro.

## Capabilities

### New Capabilities
- `bulk-product-import`: alta masiva de productos a partir de un ZIP de fotos — descompresión y validación client-side, derivación del nombre desde el nombre de archivo, creación en borrador con precio 0 o con categoría y precio comunes elegidos por el dueño, tolerancia a fallos parciales, límites de tamaño/cantidad y gating por plan Pro.
- `bulk-product-editing`: grilla de edición masiva del catálogo — edición en línea de nombre, descripción, precio, promo, sección, stock y estado; selección múltiple con acciones en lote; guardado con validación server-side y gating por plan Pro.

### Modified Capabilities
<!-- Ninguna. No existe una spec previa de gestión de productos del dashboard cuyos requirements cambien; el gating por plan se agrega como requirement dentro de las capabilities nuevas. -->

## Impact

- **DB:** **sin migración.** Se reusan las columnas existentes de `products` (`name`, `price_cents = 0`, `image_urls`, `is_active = false`, `position`); no hace falta ninguna columna nueva ni relajar constraints (`price_cents >= 0` admite 0, `image_urls` con 1 elemento está dentro del `CHECK <= 20`).
- **Nueva dependencia:** una librería de descompresión ZIP para el browser (no hay ninguna en `package.json`).
- **Planes:** `lib/plans/limits.ts` (nuevo campo `allowBulkProducts` en `PlanLimits` y en las tres entradas de `PLAN_LIMITS`).
- **Server actions:** `lib/store/actions.ts` — nuevas acciones de creación en lote y de guardado en lote de ediciones, siguiendo el patrón existente (`requireOwnerStore()`, return `{ ok: true; ... } | { error: string }`, `revalidatePath('/dashboard','layout')`).
- **Upload:** `lib/onboarding/upload-actions.ts` se reusa **sin modificar**; la orquestación con concurrencia acotada y progreso es nueva y vive en el cliente.
- **UI dashboard:** `app/dashboard/[section]/page.tsx` (pasar el nuevo límite como prop), `app/dashboard/components/ProductsPanel.tsx` (entrada al import y a la grilla, o upsell), más los componentes nuevos de import y de grilla.
- **Landing:** `app/components/Pricing.tsx` (fila comparativa de planes).
- **Fuera de alcance:** import de precios/stock/categorías desde CSV o desde el nombre del archivo; usar subcarpetas del ZIP como secciones; agrupar varias fotos en un mismo producto; creación de variantes en el import; deshacer un import completo; procesamiento en background o por cola (todo el flujo es síncrono, con el navegador abierto).
