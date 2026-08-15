## 1. Base: plan, dependencia y helpers puros

- [x] 1.1 Agregar `allowBulkProducts: boolean` a `PlanLimits` en `lib/plans/limits.ts` y setearlo en `PLAN_LIMITS` (`inicial: false`, `medio: false`, `pro: true`)
- [x] 1.2 Instalar `fflate` como dependencia de producción y verificar que `npm run build` sigue pasando
- [x] 1.3 Crear `lib/store/bulk-import/filename.ts` con `deriveProductName(filename)` (quitar ruta y extensión, `-`/`_` → espacio, colapsar espacios, trim, capitalizar primera letra, truncar a 120, fallback `"Producto"`) y `dedupeNames(names)` (sufijo ` 2`, ` 3`… case-insensitive, solo dentro del lote)
- [x] 1.4 Crear `lib/store/bulk-import/zip.ts` con las constantes `MAX_ZIP_BYTES = 60MB`, `MAX_PHOTOS_PER_ZIP = 100`, extensiones aceptadas (`.jpg`, `.jpeg`, `.png`, `.webp`) y el predicado de entradas ignorables (directorios, tamaño 0, ocultos, `__MACOSX/`, `.DS_Store`, `Thumbs.db`)
- [x] 1.5 Agregar tests de vitest para `deriveProductName` y `dedupeNames` cubriendo los escenarios de la spec (`remera-negra.jpg`, `campera_jean.png`, `Buzo Oversize 01.jpg`, `Remeras/remera-blanca.jpg`, nombre vacío, colisión case-insensitive)
- [x] 1.6 Extraer a `lib/store/product-validation.ts` las reglas compartidas de producto (nombre ≤120 obligatorio, descripción ≤500, precio entero ≥0, stock entero ≥0 o nulo, promo ≥0 y < precio regular) reutilizables desde la grilla y desde el servidor

## 2. Server actions

- [x] 2.1 En `lib/store/actions.ts`, agregar `bulkCreateProducts(items: { name: string; imageUrl: string }[])`: `requireOwnerStore()`, gate `allowBulkProducts` leyendo `stores.plan` de la DB, validación `count actual + items.length <= maxProducts` (rechazo del lote completo informando lugares disponibles), tope de 100 ítems, insert en lote con `price_cents: 0`, `is_active: false`, `section_id: null`, `stock: null`, `description: null`, `image_urls: [imageUrl]` y `position` incremental desde el máximo actual + 1
- [x] 2.2 Cerrar `bulkCreateProducts` con un único `revalidatePath('/dashboard', 'layout')` y el return discriminado del proyecto (`{ ok: true; created: number } | { error: string }`)
- [x] 2.3 En `lib/store/actions.ts`, agregar `bulkUpdateProducts(rows)` para el guardado de la grilla: `requireOwnerStore()`, gate `allowBulkProducts`, verificación de que **todos** los `id` recibidos pertenecen a la tienda del usuario (rechazo total si alguno no), validación server-side con `lib/store/product-validation.ts` sobre cada fila, y actualización de los campos editables (`name`, `description`, `price_cents`, `promo_price_cents`, `section_id`, `stock`, `is_active`)
- [x] 2.4 Hacer que `bulkUpdateProducts` no deje cambios aplicados a medias sin informar: validar todo el lote antes de escribir, y ante fallo de escritura devolver error sin marcar éxito parcial; cerrar con un único `revalidatePath`
- [x] 2.5 Agregar tests de vitest de las reglas de validación compartidas usadas por ambas acciones (límite de lote, promo inválido, stock negativo, nombre vacío)
- [x] 2.6 Aceptar en `bulkCreateProducts` defaults opcionales de sección y precio a nivel lote, validando que la sección pertenezca a la tienda

## 3. Flujo de import en el cliente

- [x] 3.1 Crear `app/dashboard/components/BulkImportModal.tsx` con dropzone de un único archivo `.zip` (reusando `react-dropzone` como en `ImageUpload.tsx`) y validación previa de tamaño ≤ 60 MB
- [x] 3.2 Implementar la descompresión con import dinámico de `fflate`, filtrando entradas según `lib/store/bulk-import/zip.ts` y rechazando el ZIP entero si supera las 100 fotos válidas (informando cuántas trae) o si no contiene ninguna
- [x] 3.3 Convertir cada entrada a `File` derivando el MIME desde la extensión, y procesarlas con un pool de concurrencia 3: `compressImage()` → `uploadProductImageAction()`, liberando la referencia de cada entrada tras subirla
- [x] 3.4 Mostrar progreso "procesando N de M", advertencia de no cerrar la pestaña, y acumular resultados en listas de éxitos (con URL) y fallos (archivo + motivo)
- [x] 3.5 Al terminar la subida, derivar y deduplicar los nombres y llamar a `bulkCreateProducts` solo con las fotos exitosas
- [x] 3.6 Pantalla de resumen: cantidad de productos creados, detalle de fotos fallidas con motivo, botón para reintentar **solo** las fallidas, y botón para reintentar la creación reusando las URLs ya subidas si falló únicamente `bulkCreateProducts`
- [x] 3.7 Ofrecer en el resumen el acceso directo a la grilla de edición masiva filtrada por borradores
- [x] 3.8 Antes de procesar el ZIP, ofrecer dos campos opcionales aplicados a todo el lote: sección (con el `Select` existente, poblado por props) y precio (mismo formato/parseo que `ProductModal`), enviados como `defaults` a `bulkCreateProducts`; dejar claro en el copy que cargar un precio no publica los productos

## 4. Grilla de edición masiva

- [x] 4.1 Crear `app/dashboard/components/BulkEditGrid.tsx` como modo pantalla completa dentro de la sección de productos, con estado plano indexado por `id` y marca de fila sucia
- [x] 4.2 Implementar las columnas editables por fila: nombre, descripción, precio, precio promocional, sección (`Select` existente), stock y activo/inactivo
- [x] 4.3 Implementar el layout responsive: tabla con columnas en desktop, tarjetas apiladas con campos etiquetados en mobile, sin scroll horizontal
- [x] 4.4 Implementar filtro de "solo borradores" y búsqueda por nombre, sin descartar cambios pendientes de filas ocultas
- [x] 4.5 Implementar selección múltiple (checkbox por fila + seleccionar todas las visibles) y barra de acciones en lote: asignar precio, asignar sección, asignar stock, publicar/despublicar
- [x] 4.6 Implementar validación en línea con `lib/store/product-validation.ts`, marcando filas inválidas y bloqueando el guardado mientras existan
- [x] 4.7 Implementar el guardado explícito: contador de cambios sin guardar, botón "Guardar cambios" que envía solo las filas sucias a `bulkUpdateProducts`, opción de descartar, y confirmación al intentar salir con cambios pendientes
- [x] 4.8 Memoizar las filas y verificar que la grilla se mantiene fluida con ~200 productos
- [x] 4.9 Ofrecer desde cada fila la apertura del `ProductModal` existente para imágenes, variedades, cantidad mínima y múltiplo de venta

## 5. Integración en el dashboard y gating de UI

- [x] 5.1 En `app/dashboard/[section]/page.tsx`, obtener `allowBulkProducts` de `getPlanLimits` y pasarlo como prop a `ProductsPanel`
- [x] 5.2 En `app/dashboard/components/ProductsPanel.tsx`, agregar los accesos a "Importar ZIP de fotos" y "Edición masiva" cuando `allowBulkProducts` es `true`
- [x] 5.3 Mostrar el upsell a Pro en lugar de los accesos cuando `allowBulkProducts` es `false`, siguiendo el patrón de upsell existente del panel
- [x] 5.4 Verificar que el dashboard de los planes `inicial` y `medio` queda idéntico al actual salvo por ese CTA

## 6. Landing y cierre

- [x] 6.1 Agregar en `app/components/Pricing.tsx` la fila comparativa de alta masiva + edición masiva, marcada solo para Pro
- [x] 6.2 Verificar los textos en español rioplatense (voseo) y el uso de `toast` de `@/lib/toast` para los avisos, con `serverError` en bloque `role="alert"` para los errores de formulario
- [ ] 6.3 Prueba manual end-to-end en Pro: ZIP de macOS con `__MACOSX/` y archivos mezclados → import → productos en borrador a $0 → grilla → precios + sección + publicar en lote → guardar → verificar en la tienda pública
- [ ] 6.4 Prueba manual de rechazo: ZIP > 60 MB, ZIP con > 100 fotos, ZIP sin imágenes válidas, y acceso desde una tienda de plan `medio`
- [x] 6.5 Correr `npx vitest run` y `npm run build`, y confirmar que no hizo falta ninguna migración de esquema
