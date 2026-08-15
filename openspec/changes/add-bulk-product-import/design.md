## Context

Hoy el alta de productos es exclusivamente unitaria: `ProductModal` (react-hook-form + zod) → `uploadProductImageAction` por cada foto → `saveStoreProduct` por cada producto. `ProductsPanel` muestra una lista agrupada por sección, reordenable con dnd-kit, sin ninguna forma de edición tabular.

Restricciones del entorno que condicionan el diseño:

- **`next.config.ts` fija `experimental.serverActions.bodySizeLimit: '10mb'`.** Un ZIP con 50–150 fotos de celular supera eso sin esfuerzo. Subirlo entero a una server action no es viable sin cambiar esa configuración global (que aplicaría a *todas* las actions).
- **Todo el proyecto es síncrono.** No hay cola, ni jobs, ni `trigger.dev`/`inngest`. Los únicos procesos diferidos son dos Vercel Cron. Introducir infraestructura de background jobs para esta feature sería desproporcionado.
- **Vercel Functions tienen tope de duración.** Procesar 150 imágenes con `sharp` dentro de una sola invocación es un riesgo de timeout real.
- **La pipeline de imágenes ya existe y funciona**: `compressImage` en el browser (25 MB máx. origen → 1 MB objetivo, 1600 px, web worker) y `uploadProductImageAction` en el server (valida ≤ 5 MB y MIME, optimiza con `sharp` a WebP q80 1600 px, sube a `product-images/{storeId}/{uuid}.webp` con admin client tras verificar ownership).
- **El dashboard es mobile-first** y la UI es Tailwind v4 escrita a mano: no hay `@tanstack/react-table`, ni shadcn, ni Radix. Cualquier "grilla" hay que construirla, y tiene que funcionar en un teléfono.
- **`products.name` está validado a máx. 120 caracteres** en el form; `description` a 500. `price_cents >= 0` admite 0. `image_urls` es `text[]` con `CHECK <= 20`.

## Goals / Non-Goals

**Goals:**

- Que un dueño de plan Pro pase de "carpeta con 80 fotos" a "80 productos borrador en el catálogo" en un flujo de una sola pantalla, sin tocar la DB ni pedir un CSV.
- Reusar la pipeline de imágenes existente **sin modificarla**, y sin tocar `bodySizeLimit`.
- Que un fallo parcial (fotos corruptas, red inestable) no tire abajo el import entero.
- Que completar los datos después del import (precios, sobre todo) sea rápido: una grilla, no 80 modales.
- Gating por plan con el servidor como fuente de verdad, siguiendo el patrón de `allowVariants`.

**Non-Goals:**

- Import desde CSV/Excel, o metadatos codificados en el nombre del archivo (precio, SKU) o en subcarpetas (secciones). El nombre del archivo se usa **solo** como nombre del producto.
- Agrupar varias fotos en un mismo producto (una foto = un producto).
- Crear variantes, secciones o categorías durante el import.
- Deshacer/rollback de un import completo como operación atómica.
- Procesamiento en background: el import corre con la pestaña abierta.
- Que la grilla de edición masiva reemplace a `ProductModal`. Convive con él; el modal sigue siendo el lugar para imágenes, variantes, `min_quantity` y `qty_step`.

## Decisions

### Decisión 1: Descomprimir el ZIP en el navegador, no en el servidor

El ZIP se lee con `File.arrayBuffer()` y se descomprime **client-side**. Cada entrada de imagen válida se convierte en un `File` (con el MIME derivado de la extensión, porque las entradas de ZIP no llevan MIME) y entra en la pipeline existente: `compressImage()` → `uploadProductImageAction()`.

**Por qué:** es la única opción que respeta las tres restricciones a la vez. El cuerpo que viaja al servidor es una imagen ya comprimida (~≤ 1 MB), muy por debajo del límite de 10 MB; cada upload es su propia invocación, así que no hay riesgo de timeout acumulado; y no se toca ni `next.config.ts` ni `uploadProductImageAction`. Además el usuario ve progreso real por foto, y el trabajo de descompresión y compresión se paga en la máquina del cliente, no en Vercel.

**Alternativas consideradas:**

- *Subir el ZIP como FormData a una server action y descomprimir con `sharp`/`fflate` en Node.* Requiere subir `bodySizeLimit` globalmente (afecta la superficie de ataque de todas las actions) y concentra N descompresiones + N `sharp` en una sola invocación: timeout casi asegurado con catálogos grandes. Descartada.
- *Subir el ZIP directo a Supabase Storage desde el browser (bucket temporal privado) y que el servidor lo procese desde ahí.* Esquiva el `bodySizeLimit` pero mantiene el problema del timeout, y suma un bucket nuevo, políticas de acceso, y un cron de limpieza de ZIPs huérfanos. Complejidad desproporcionada. Descartada.
- *Route handler dedicado con streaming en vez de server action.* Los route handlers aceptan cuerpos grandes, pero seguimos con el procesamiento pesado del lado del servidor y sin progreso granular. Descartada.

**Librería:** `fflate` para la descompresión. Es la más liviana del ecosistema (~8 kB comprimida), funciona en browser sin polyfills, expone descompresión sincrónica y asincrónica sobre `Uint8Array`, y no arrastra dependencias. Alternativa evaluada: `jszip` — API más cómoda pero ~3× más pesada y con un modelo de objetos innecesario para "listar entradas y sacar bytes". El bundle se carga con **import dinámico** dentro del componente de import, para no penalizar el peso del dashboard de quienes nunca usan la feature.

### Decisión 2: Límites concretos del import

- **Tamaño máximo del ZIP: 60 MB.** Por encima de eso, descomprimir en memoria en un teléfono de gama media es riesgoso. Se valida antes de leer el archivo, con mensaje claro sugiriendo partirlo en varios ZIPs.
- **Máximo de fotos procesadas por ZIP: 150.** Si el ZIP contiene más entradas válidas, se rechaza el import indicando cuántas trae y el tope, en vez de truncar silenciosamente (truncar sería sorpresa desagradable: el dueño creería que cargó todo).
- **Formatos aceptados: `.jpg`, `.jpeg`, `.png`, `.webp`**, en coincidencia con `validateProductImageFile`. Cualquier otra extensión se ignora sin contarla como error.
- **Entradas ignoradas silenciosamente:** directorios, `__MACOSX/`, `.DS_Store`, `Thumbs.db`, archivos ocultos (nombre que arranca con `.`) y entradas de tamaño 0.
- **Por foto** rigen los límites ya existentes: 25 MB de origen (`MAX_ORIGINAL_BYTES`) y 5 MB tras comprimir (`MAX_FINAL_BYTES`).

**Por qué esos números:** 60 MB / 150 fotos cubre con margen el caso real de un catálogo de indumentaria o gastronomía fotografiado con celular (fotos de 2–5 MB, que tras `compressImage` bajan a ~0.5–1 MB). Son topes de UX, no de seguridad: el guard real de abuso es el gating de plan y el límite de productos, validados en el servidor.

### Decisión 3: Subida con concurrencia acotada a 3, y fallos parciales tolerados

Las fotos se procesan con un pool de **3 uploads simultáneos**. Uno por uno es innecesariamente lento con 80 fotos; sin límite, se saturan las conexiones del browser y la memoria (cada `compressImage` levanta un web worker) y aumenta la tasa de fallos en redes móviles.

El resultado de cada foto se acumula en una de dos listas: **subidas OK** (con su URL pública) y **fallidas** (con nombre de archivo y motivo). Al terminar la fase de subida:

1. Se llama a la acción de creación en lote **solo con las fotos que subieron bien**.
2. Se muestra un resumen: cuántos productos se crearon y, si hubo fallos, la lista de archivos con su motivo y un botón para **reintentar solo esos**.

**Por qué:** abortar todo por 3 fotos corruptas de 80 sería hostil, y ya habría fotos huérfanas subidas al bucket de todos modos. Se prefiere avanzar y reportar. El costo aceptado es que un import puede quedar incompleto y requerir una segunda pasada — explícita y visible, no silenciosa.

### Decisión 4: Derivación del nombre y deduplicación

Del nombre de archivo (sin la ruta de carpetas): quitar la extensión → reemplazar `-` y `_` por espacios → colapsar espacios múltiples → recortar extremos → capitalizar la primera letra → truncar a **120 caracteres** (el máximo que valida el form individual). Si el resultado queda vacío, se usa `"Producto"`.

**Deduplicación:** si dos archivos del mismo ZIP derivan el mismo nombre, se sufija ` 2`, ` 3`, etc. al segundo y siguientes. La comparación es case-insensitive. **No se deduplica contra productos ya existentes en la tienda**: un dueño puede legítimamente querer dos productos con el mismo nombre, y bloquear ahí generaría fricción sin beneficio.

**Por qué capitalizar solo la primera letra y no title-case:** title-case rompe nombres correctos (`"Remera de algodón"` → `"Remera De Algodón"`). La transformación mínima es la que menos corrige de más.

### Decisión 5: Productos en borrador con precio 0, y la grilla como paso siguiente natural

Los productos se crean con `is_active = false`, `price_cents = 0`, `promo_price_cents = null`, `stock = null`, `section_id = null`, `description = null`, `min_quantity = 1`, `qty_step = 1`, `image_urls = [url]`, y `position` incremental arrancando en el `position` máximo actual + 1.

Al terminar el import, la UI ofrece ir directamente a la grilla de edición masiva para completar precios y publicar. Es la continuación obvia del flujo: sin ella, el dueño queda con 80 borradores y ninguna forma rápida de completarlos.

**Por qué borrador:** publicar productos a $0 en una tienda real es un riesgo comercial concreto (alguien puede pedirlos). El borrador hace que el import sea seguro por defecto y convierte "publicar" en un acto deliberado.

### Decisión 5-bis: Categoría y precio comunes se eligen en el import, no solo en la grilla

La pantalla de import ofrece dos campos opcionales — sección y precio — que se aplican a todo el lote. La acción de creación en lote los recibe como *defaults* del lote (no repetidos por ítem), y valida en el servidor que la sección pertenezca a la tienda del dueño, rechazando el import entero si no.

**Por qué:** el caso real más común es un ZIP homogéneo ("estas 60 fotos son todas remeras y valen lo mismo"). Obligar a importar, entrar a la grilla, seleccionar todo y recién ahí aplicar sección y precio, es un rodeo de cuatro pasos para algo que el dueño ya sabía antes de arrastrar el archivo. La grilla sigue siendo necesaria para el caso heterogéneo y para corregir después; esto solo evita el trabajo obvio.

**Por qué cargar un precio no publica:** publicar sigue siendo un acto deliberado. El dueño todavía no vio los nombres derivados de los archivos, que es justo lo que más suele necesitar corrección. Un checkbox de "publicar al importar" habilitaría publicar productos llamados "IMG 2043" sin haberlos mirado.

### Decisión 6: La grilla opera sobre todo el catálogo, no solo sobre lo recién importado

La grilla es una vista del catálogo completo de la tienda, con un **filtro rápido para ver solo los borradores** (que es el estado en el que quedan los recién importados). No se guarda ninguna noción de "lote de import" en la DB.

**Por qué:** una grilla acotada al último import requeriría persistir un `import_batch_id` (migración nueva) y sería inútil apenas el dueño recarga o vuelve otro día. Una grilla del catálogo con filtro de borradores cubre el caso post-import **y** el caso "quiero actualizar todos mis precios en enero", que es igual de valioso y no cuesta nada más.

**Forma de la UI:** modo pantalla completa dentro de la sección de productos del dashboard (no un modal, no una ruta nueva). En desktop se ve como tabla con columnas; **en mobile colapsa a tarjetas apiladas**, una por producto, con los campos como inputs etiquetados — no se intenta hacer scroll horizontal de una tabla en un teléfono. La selección múltiple usa checkbox por fila/tarjeta más una barra de acciones que aparece al haber selección.

**Guardado:** los cambios se acumulan en estado local (fila marcada como "sucia") y se persisten con un botón **"Guardar cambios"** explícito que envía solo las filas modificadas en una única acción en lote. No hay autosave por campo: con 80 filas generaría una tormenta de requests y haría imposible cancelar un error.

### Decisión 7: Gating con un único flag `allowBulkProducts`

Se agrega `allowBulkProducts: boolean` a `PlanLimits` (`inicial: false`, `medio: false`, `pro: true`), siguiendo exactamente el patrón de `allowVariants`.

Un solo flag cubre **import y grilla**: se conciben, se venden y se envían como una sola capacidad de Pro ("gestión masiva de catálogo"). Dos flags separados serían configuración sin ningún caso de uso que la justifique.

La validación vive en el servidor, en cada acción nueva, leyendo `stores.plan` de la DB — nunca confiando en un valor recibido del cliente. La UI usa el mismo flag, pasado como prop desde el server component, solo para decidir entre mostrar la entrada o el upsell a Pro.

### Decisión 8: Validación del límite de productos contra el lote completo

Hoy `saveStoreProduct` valida `count >= maxProducts` de a un producto. La acción de creación en lote valida **`count + items.length <= maxProducts`** y rechaza el lote entero si no entra, informando cuántos lugares quedan.

En Pro `maxProducts` es `Infinity`, así que en la práctica nunca dispara. Se implementa igual: la acción no debe asumir que solo la llamará un plan Pro, y si mañana la feature se habilita en `medio` el guard ya está bien puesto.

**Por qué rechazar el lote completo en vez de crear los primeros N que entren:** crear parcialmente sin que el usuario lo pidiera deja un estado confuso (fotos ya subidas, productos a medias). Rechazar con un mensaje claro es predecible.

### Decisión 9: Sin migración de base de datos

El esquema actual de `products` cubre todo el caso: `price_cents >= 0` admite `0`, `is_active` es un booleano seteable en el insert, `image_urls` con un elemento está dentro del `CHECK <= 20`, y `section_id`/`stock`/`description` son nullables. No hace falta ni columna nueva ni relajar constraints. La feature es 100% de aplicación.

## Risks / Trade-offs

- **[El import depende de la pestaña abierta]** → Con 150 fotos en 4G el proceso puede tardar varios minutos; si el usuario cierra la pestaña, quedan productos creados a medias y fotos huérfanas en el bucket. Mitigación: mostrar progreso explícito con contador ("subiendo 34 de 80"), advertir de no cerrar la pestaña mientras corre, y crear los productos en una sola llamada al final para que el estado en DB sea todo-o-nada respecto de esa llamada. Se acepta el riesgo residual de fotos huérfanas en Storage: no rompen nada y el costo de almacenamiento es marginal.

- **[Descomprimir en memoria en mobile]** → Un ZIP de 60 MB más las imágenes descomprimidas puede tensionar un teléfono de gama baja y hacer que el navegador mate la pestaña. Mitigación: tope de 60 MB, procesar las entradas de a una liberando la referencia tras subirla (no materializar los 150 `File` a la vez), y reusar `compressImage` que ya trabaja en web worker.

- **[Fotos subidas sin producto asociado]** → Si la acción de creación en lote falla después de subir las 80 fotos, quedan 80 objetos huérfanos en `product-images/{storeId}/`. Mitigación: la acción de creación es una única llamada corta (solo un insert en lote, sin trabajo pesado), así que la ventana de fallo es chica; ante error se muestra un mensaje con opción de reintentar la creación reusando las URLs ya subidas, sin volver a subir nada.

- **[Nombres derivados de archivos poco descriptivos]** → Un ZIP con `IMG_2043.jpg`, `IMG_2044.jpg` produce productos llamados "IMG 2043". Mitigación: es exactamente el caso que la grilla de edición masiva resuelve (renombrar en línea, sin abrir 80 modales), y el estado borrador impide que esos nombres lleguen a la tienda. Se comunica en la UI del import que el nombre sale del archivo, para que el dueño renombre antes de comprimir si le conviene.

- **[Una grilla propia sin librería de tablas]** → Sin `@tanstack/react-table` hay que resolver a mano selección, edición en línea y estado sucio, con el riesgo de re-renders costosos con 200+ filas. Mitigación: el estado se mantiene plano e indexado por `id`, cada fila es un componente memoizado, y no se implementan ordenamiento ni paginación en esta iteración (el filtro por borradores/búsqueda alcanza). Se evita sumar una dependencia grande a un bundle que hoy no tiene ninguna.

- **[Divergencia de validación entre la grilla y `ProductModal`]** → La grilla edita los mismos campos que el modal; si las reglas se duplican, pueden desincronizarse (sobre todo la de promo < precio regular). Mitigación: extraer las reglas compartidas a un módulo reutilizable y validarlas también en el servidor dentro de la acción de guardado en lote, que es la fuente de verdad real.

- **[`revalidatePath` con lotes grandes]** → Crear u actualizar 80 productos dispara una revalidación del layout del dashboard; con catálogos grandes la recarga puede sentirse pesada. Mitigación: una sola revalidación al final de cada acción en lote, nunca una por producto (que es el antipatrón que ya existe en el reordenamiento actual de `ProductsPanel`).

## Migration Plan

Feature puramente aditiva, sin migración de esquema ni cambio de comportamiento existente:

1. Agregar `allowBulkProducts` a `PlanLimits` con `false` en `inicial` y `medio`, `true` en `pro`. Al ser un campo nuevo con default explícito por plan, ningún flujo actual cambia.
2. Sumar la dependencia de descompresión y las acciones nuevas en `lib/store/actions.ts` (sin tocar `saveStoreProduct`).
3. Montar la UI detrás del flag: para `inicial`/`medio` solo aparece el upsell a Pro; el dashboard de esos planes queda idéntico al de hoy salvo por ese CTA.
4. Actualizar la tabla de planes de la landing.

**Rollback:** poner `allowBulkProducts: false` en los tres planes deja la feature inaccesible sin revertir código ni tocar datos. Los productos ya creados por imports previos son productos normales e indistinguibles de los cargados a mano.

## Open Questions

- **¿Conviene además una acción de "publicar todos los borradores con precio > 0"?** Sería el cierre natural del flujo (importar → completar precios → publicar todo lo que quedó listo). Queda fuera de esta iteración; las acciones en lote de la grilla ya permiten hacerlo con selección manual.
- **¿Hace falta un límite de imports por día o por hora?** Con el gating de Pro y el límite de 150 fotos por ZIP el riesgo de abuso es bajo. Se difiere hasta ver uso real.
