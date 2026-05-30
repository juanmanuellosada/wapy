# public-storefront Specification

## Purpose
TBD - created by archiving change wapy-storefront-discovery. Update Purpose after archive.
## Requirements
### Requirement: Deep-link a producto via query param `?p=<id>`

El storefront SHALL aceptar el query param `p` en la URL `/[slug]?p=<product_id>`. Cuando llega una request con `p` que matchea el `id` de un producto activo del catálogo cargado, el sistema SHALL abrir el modal de detalle de ese producto durante el primer paint (sin flash de modal cerrado). Cuando `p` no matchea ningún producto activo, el sistema SHALL ignorar el parámetro silenciosamente y renderizar el catálogo normal.

#### Scenario: Deep-link válido abre el modal en el primer paint

- **WHEN** un visitante carga `/mi-tienda?p=abc-123` y el producto con id `abc-123` existe y está activo en la tienda `mi-tienda`
- **THEN** la página renderiza con el modal de detalle del producto `abc-123` ya abierto, sin transición visible desde un estado cerrado

#### Scenario: Deep-link a producto inexistente se ignora

- **WHEN** un visitante carga `/mi-tienda?p=zzz-no-existe`
- **THEN** la página renderiza el catálogo normal sin modal abierto y sin mensaje de error; el query param se mantiene en la URL hasta la primera interacción del usuario

#### Scenario: Deep-link a producto despublicado se ignora

- **WHEN** un visitante carga `/mi-tienda?p=abc-123` y el producto existe en la DB pero `is_active=false`
- **THEN** la página renderiza el catálogo normal sin modal abierto (el resolver ya excluye productos inactivos)

### Requirement: Abrir/cerrar modal sincroniza con la URL via replace

El storefront SHALL reflejar el estado del modal en el query param `p` usando `router.replace` (no `push`). Abrir un producto desde una card SHALL agregar/actualizar `?p=<id>`. Cerrar el modal SHALL remover el query param `p` de la URL (sin afectar otros params como filtros).

#### Scenario: Click en card actualiza la URL

- **WHEN** un visitante con la URL `/mi-tienda` clickea la imagen o nombre de la card del producto `abc-123`
- **THEN** la URL pasa a `/mi-tienda?p=abc-123` sin recargar la página y sin agregar entrada al historial del navegador

#### Scenario: Cerrar modal limpia el query param

- **WHEN** el visitante está en `/mi-tienda?q=remera&p=abc-123` y cierra el modal
- **THEN** la URL pasa a `/mi-tienda?q=remera` (el `?p` se remueve, los demás params se preservan)

#### Scenario: Cambiar a otro producto reemplaza el id en la URL

- **WHEN** el visitante tiene el modal del producto `abc-123` abierto y abre el modal de `xyz-789` (en este change no hay navegación directa entre modales, pero el comportamiento de `setModalProduct` aplica)
- **THEN** la URL pasa de `?p=abc-123` a `?p=xyz-789` sin agregar entrada al historial

### Requirement: Highlight + scroll a la card de fondo cuando se llega por deep-link

Cuando el storefront monta con un deep-link válido a producto, el sistema SHALL hacer scroll para que la card correspondiente en el grid quede visible bajo el modal y SHALL aplicar un highlight visual (ring con el accent color de la tienda) durante aproximadamente 2 segundos. Esto facilita que el visitante encuentre el producto al cerrar el modal.

#### Scenario: Scroll a la card al abrir desde deep-link

- **WHEN** un visitante carga `/mi-tienda?p=abc-123` y el producto está en una posición fuera del viewport inicial
- **THEN** antes de aplicar el highlight, el grid scrollea para que la card `#product-abc-123` quede centrada en la vista (`scrollIntoView({ block: "center" })`)

#### Scenario: Highlight visible al cerrar el modal

- **WHEN** el visitante cierra el modal abierto via deep-link
- **THEN** la card del producto muestra un ring con el accent color de la tienda durante ~2 segundos, luego vuelve al estado normal

#### Scenario: Highlight no se aplica al abrir manualmente desde una card

- **WHEN** el visitante ya está en la tienda y clickea una card normalmente
- **THEN** no se aplica highlight (el ring sólo aparece en el flujo de deep-link inicial)

### Requirement: Galería de imágenes en el modal de detalle

El modal de detalle de producto SHALL renderizar todas las imágenes de `product.image_urls` cuando hay más de una. Con una sola imagen, el render SHALL ser equivalente al actual. La navegación entre imágenes SHALL ser por swipe horizontal en mobile (CSS scroll-snap) y por thumbnails clicables o flechas en desktop. El índice de imagen activa NO SHALL persistir en la URL.

#### Scenario: Producto con múltiples imágenes muestra galería

- **WHEN** se abre el modal de un producto con `image_urls = ["img1.jpg", "img2.jpg", "img3.jpg"]`
- **THEN** el modal muestra la primera imagen y permite navegar a las otras dos (swipe en mobile, thumbnails/flechas en desktop)

#### Scenario: Producto con una sola imagen mantiene el render actual

- **WHEN** se abre el modal de un producto con `image_urls = ["img1.jpg"]`
- **THEN** el modal muestra esa imagen sin controles de galería (idéntico al comportamiento actual)

#### Scenario: Producto sin imágenes muestra placeholder

- **WHEN** se abre el modal de un producto con `image_urls = []` o `null`
- **THEN** el modal muestra el placeholder de imagen (mismo comportamiento que la card actual)

### Requirement: Slot reservado para productos relacionados en el modal

El componente `ProductModal` SHALL aceptar una prop opcional `relatedSlot?: React.ReactNode`. Cuando la prop no se provee o es `null`, el modal NO SHALL renderizar nada en ese espacio. Cuando se provee, el nodo SHALL renderizarse debajo del bloque de "Agregar al carrito".

#### Scenario: Sin slot, el modal queda visualmente idéntico al actual

- **WHEN** `StoreClient` abre el modal sin pasar `relatedSlot`
- **THEN** el modal renderiza imagen/galería, info, controles y nada más (sin huecos visibles ni separadores extras)

#### Scenario: Con slot, el nodo se renderiza al final

- **WHEN** `StoreClient` pasa un `relatedSlot` con contenido
- **THEN** el contenido aparece debajo del botón "Agregar al carrito", dentro del scroll del modal

### Requirement: Filtros de catálogo client-side con persistencia en URL

El storefront SHALL exponer filtros de catálogo persistidos en query params: rango de precio (`min`, `max`, en pesos), secciones (`sec=id1,id2,...`), y "sólo con stock" (`stock=1`). El input de texto existente SHALL persistir como `q=`. Los filtros SHALL aplicarse client-side sobre el set ya cargado, sin round-trips. Los valores en sus defaults (vacío, false, sin selección) NO SHALL aparecer en la URL.

#### Scenario: Aplicar filtro de precio actualiza la URL y el grid

- **WHEN** el visitante setea precio mínimo en `5000` y máximo en `10000`
- **THEN** la URL pasa a contener `?min=5000&max=10000` y el grid muestra sólo productos con precio (o variant price si tiene variantes) dentro del rango

#### Scenario: Seleccionar secciones filtra el catálogo

- **WHEN** el visitante selecciona las secciones con id `sec-a` y `sec-b`
- **THEN** la URL contiene `?sec=sec-a,sec-b` y el grid muestra sólo productos cuya `section_id` esté en esa lista

#### Scenario: "Sólo con stock" considera productos sin tracking como disponibles

- **WHEN** el visitante activa "Sólo con stock" y el catálogo tiene productos con `stock=0`, `stock=5`, `stock=null`
- **THEN** el grid muestra los de `stock=5` y `stock=null` pero oculta los de `stock=0`. Productos con variantes muestran si al menos una variante activa tiene stock disponible

#### Scenario: Filtros y deep-link a producto coexisten

- **WHEN** el visitante carga `/mi-tienda?sec=sec-a&p=abc-123` y el producto `abc-123` NO pertenece a `sec-a`
- **THEN** el modal del producto `abc-123` se abre igual (el deep-link prevalece para el modal); el grid de fondo respeta el filtro y NO muestra `abc-123`

#### Scenario: Defaults se omiten de la URL

- **WHEN** el visitante limpia todos los filtros desde "Limpiar"
- **THEN** la URL queda como `/mi-tienda` (sin `?stock=0`, sin `?min=`, sin `?sec=` vacíos)

#### Scenario: Cargar URL con filtros hidrata el estado al primer paint

- **WHEN** un visitante carga `/mi-tienda?q=remera&min=5000&sec=verano&stock=1`
- **THEN** el grid renderiza ya con los filtros aplicados desde el primer paint, sin flash de "todos los productos → filtrados"

### Requirement: UI de filtros responsive (pill row + drawer mobile)

El storefront SHALL exponer los controles de filtros de forma responsive. En desktop (≥1024px), los filtros activos SHALL mostrarse como pills sobre el grid, cada uno con un botón X para limpiarlo; un botón "Filtros" SHALL abrir un popover con los controles completos. En mobile (<1024px), un botón "Filtros" SHALL abrir un bottom-sheet con los controles; aplicar SHALL cerrar el sheet.

#### Scenario: Pills muestran sólo los filtros activos

- **WHEN** el visitante tiene `?q=remera&sec=verano` aplicados
- **THEN** se muestran dos pills: una "Buscar: remera" y otra "Sección: Verano", cada una con X. No se muestra una pill para "Precio" (no está aplicado)

#### Scenario: Mobile abre bottom-sheet

- **WHEN** un visitante en mobile clickea "Filtros"
- **THEN** se abre un bottom-sheet con los controles de búsqueda, precio, sección y stock; el fondo se oscurece y el body deja de scrollear

#### Scenario: Limpiar todos los filtros vuelve al estado base

- **WHEN** el visitante clickea "Limpiar todos" desde el popover o sheet
- **THEN** todos los filtros se resetean a sus defaults, la URL queda en `/mi-tienda` (sin query params de filtros) y el grid muestra todo el catálogo

### Requirement: Botón "Compartí tu pedido" en el carrito drawer

El carrito drawer SHALL exponer un botón "Compartí tu pedido" visible cuando hay al menos un item en el carrito. Click SHALL abrir el share-sheet nativo del SO (via `navigator.share`) cuando está disponible, y caer en `wa.me/?text=<mensaje>` (sin número destino) en su ausencia. El mensaje SHALL contener: nombre de la tienda, lista de items con cantidades y subtotal por línea, total del carrito, y un link a la tienda (`https://wapy.com.ar/<slug>`). El botón NO SHALL crear órdenes en DB ni modificar el estado del carrito.

#### Scenario: Mobile con navigator.share usa share-sheet nativo

- **WHEN** un visitante en mobile con `navigator.share` disponible clickea "Compartí tu pedido" con 2 items en el carrito
- **THEN** se abre el share-sheet del SO con el texto pre-armado; el carrito no cambia; no se inserta ningún registro en `orders`

#### Scenario: Desktop o mobile sin share API cae en wa.me

- **WHEN** un visitante en un browser sin `navigator.share` clickea "Compartí tu pedido"
- **THEN** se abre `https://wa.me/?text=<mensaje>` en una nueva pestaña (WhatsApp Web pide al usuario elegir contacto)

#### Scenario: Botón oculto con carrito vacío

- **WHEN** el carrito drawer se abre con `items.length === 0`
- **THEN** el botón "Compartí tu pedido" NO se renderiza (igual que el "Comprar" — ambos requieren items)

#### Scenario: Formato del mensaje

- **WHEN** el carrito tiene `[{name: "Remera", quantity: 2, price: 5000}, {name: "Gorra", quantity: 1, price: 3000}]` en la tienda "Mi Tienda" con slug "mi-tienda"
- **THEN** el mensaje contiene: el título "*Mirá lo que me voy a pedir en Mi Tienda!*", una línea por item con cantidad y subtotal en ARS, total $13.000, y el link `https://wapy.com.ar/mi-tienda`

### Requirement: Sección "Lo más pedido" en el storefront

El storefront SHALL renderizar una sección "Lo más pedido" en el catálogo cuando la tienda tiene al menos 3 productos con ventas en los últimos 30 días. La sección SHALL ubicarse después del hero y antes del primer bloque de secciones del catálogo. Las cards de top sellers SHALL usar el componente `ProductCardClient` existente (mismo comportamiento de carrito, modal, variantes).

#### Scenario: Tienda con ventas suficientes muestra el bloque

- **WHEN** una tienda tiene órdenes con status `confirmed` o `delivered` en los últimos 30 días que cubren al menos 3 productos activos distintos
- **THEN** el storefront renderiza la sección "Lo más pedido" con esos productos ordenados por unidades vendidas descendente, máximo 10

#### Scenario: Tienda nueva o sin ventas no muestra el bloque

- **WHEN** una tienda no tiene órdenes confirmadas o delivered en los últimos 30 días, o las que tiene cubren menos de 3 productos distintos
- **THEN** la sección "Lo más pedido" NO se renderiza; no se muestra título vacío ni placeholder

#### Scenario: Productos despublicados no aparecen aunque hayan sido vendidos

- **WHEN** un producto vendido en los últimos 30 días tiene `is_active=false` o fue eliminado
- **THEN** ese producto NO aparece en "Lo más pedido" (filtro post-RPC del lado cliente)

#### Scenario: Órdenes pendientes y canceladas no cuentan

- **WHEN** una tienda tiene únicamente órdenes con status `pending` o `cancelled` en los últimos 30 días
- **THEN** "Lo más pedido" NO se renderiza (sólo cuentan confirmed/delivered)

### Requirement: Productos relacionados (co-pedidos) en el modal de detalle

El modal de detalle de producto SHALL renderizar una sección "Quienes lo pidieron, también pidieron…" cuando el producto tiene al menos un producto co-pedido en órdenes confirmadas/delivered (mismas órdenes). La sección consume el `relatedSlot` de `ProductModal` y se ubica debajo del bloque "Agregar al carrito". Las mini-cards SHALL mostrar imagen, nombre y precio; click SHALL navegar al modal del producto relacionado (`setModalProduct` + URL replace).

#### Scenario: Producto con co-pedidos muestra relacionados

- **WHEN** se abre el modal de un producto que aparece en órdenes confirmadas junto a otros productos activos
- **THEN** la sección "Quienes lo pidieron, también pidieron…" se renderiza con hasta 6 mini-cards ordenadas por cantidad de co-pedidos descendente

#### Scenario: Producto sin historial de co-pedidos no muestra el bloque

- **WHEN** se abre el modal de un producto sin co-pedidos (producto nuevo o sólo vendido solo) o cuyos co-pedidos son productos despublicados
- **THEN** la sección NO se renderiza (el modal queda como sin slot)

#### Scenario: Click en relacionado navega al modal del relacionado

- **WHEN** el visitante tiene el modal de `A` abierto y clickea la mini-card de un relacionado `B`
- **THEN** el modal cambia a mostrar `B`, la URL pasa de `?p=A` a `?p=B` con `router.replace` (no añade entrada al historial), y se renderiza el bloque de relacionados de `B`

#### Scenario: Deep-link con producto activo precarga relacionados en SSR

- **WHEN** un visitante carga `/mi-tienda?p=abc-123` y `abc-123` tiene co-pedidos
- **THEN** los productos relacionados se renderizan en el primer paint (sin loading visible), porque el SSR llama la RPC y pasa los ids al cliente

#### Scenario: Productos relacionados despublicados se filtran en cliente

- **WHEN** la RPC devuelve productos co-pedidos pero alguno tiene `is_active=false` o no está en el catálogo cargado
- **THEN** esos productos NO aparecen en las mini-cards (filtro client-side post-respuesta)

### Requirement: RPCs Postgres expuestas a anon respetan tiendas publicadas

El sistema SHALL exponer las funciones `storefront_top_sellers(p_store_id uuid, p_days int, p_limit int)` y `storefront_co_purchased(p_product_id uuid, p_store_id uuid, p_limit int)` como SQL functions `STABLE` y `SECURITY DEFINER`, con `EXECUTE` granted a `anon` y `authenticated`. Las funciones SHALL validar que `p_store_id` corresponde a una tienda con `status='published'`. Si la tienda no está publicada o no existe, SHALL devolver un resultset vacío.

#### Scenario: RPC sobre tienda publicada devuelve datos

- **WHEN** se ejecuta `select * from storefront_top_sellers('<store_id_publicado>', 30, 10)` con anon
- **THEN** devuelve hasta 10 rows con `(product_id, units_sold)`

#### Scenario: RPC sobre tienda en draft o paused devuelve vacío

- **WHEN** se ejecuta `select * from storefront_top_sellers('<store_id_draft>', 30, 10)` con anon
- **THEN** devuelve 0 rows, sin error

#### Scenario: RPC sobre store_id inexistente devuelve vacío

- **WHEN** se ejecuta `select * from storefront_co_purchased('<prod>', '<store_id_inexistente>', 6)` con anon
- **THEN** devuelve 0 rows, sin error

#### Scenario: Co-purchased excluye el producto target

- **WHEN** se ejecuta `select * from storefront_co_purchased('<prod_A>', '<store>', 6)` y `prod_A` está vendido junto a `prod_B` y `prod_C`
- **THEN** el resultset incluye `prod_B` y `prod_C`, NO incluye `prod_A`

### Requirement: Productos exponen `min_quantity` y `qty_step` con defaults seguros

El schema `products` SHALL incluir las columnas `min_quantity int NOT NULL DEFAULT 1 CHECK (min_quantity >= 1)` y `qty_step int NOT NULL DEFAULT 1 CHECK (qty_step >= 1)`. El storefront SHALL leer estos valores y exponerlos en el `UIProduct` que se serializa al cliente. Productos creados antes de la migración SHALL recibir los defaults sin requerir backfill explícito.

#### Scenario: Migración aplica defaults a productos existentes

- **WHEN** se aplica la migración sobre una DB con productos preexistentes
- **THEN** todos los productos tienen `min_quantity=1` y `qty_step=1` sin requerir acción del dueño

#### Scenario: CHECK constraint rechaza valores inválidos

- **WHEN** se intenta insertar o actualizar un producto con `min_quantity=0` o `qty_step=-1`
- **THEN** Postgres rechaza la operación por el CHECK constraint

### Requirement: La card muestra sub-label cuando hay restricción de cantidad

El componente de card del storefront SHALL mostrar un sub-label compacto cuando `min_quantity > 1` o `qty_step > 1`. El texto SHALL ser: "Mín. N" si sólo el mínimo es > 1; "De a N" si sólo el paso es > 1; "Mín. N, de a M" si ambos. Para productos sin restricciones (1/1), NO SHALL renderizarse sub-label.

#### Scenario: Producto sin restricciones no muestra sub-label

- **WHEN** se renderiza una card de un producto con `min_quantity=1` y `qty_step=1`
- **THEN** no aparece sub-label de cantidad

#### Scenario: Empanadas por docena de a media docena

- **WHEN** se renderiza una card de un producto con `min_quantity=12` y `qty_step=6`
- **THEN** la card muestra "Mín. 12, de a 6" como sub-label

#### Scenario: Sólo step > 1

- **WHEN** se renderiza una card de un producto con `min_quantity=1` y `qty_step=6`
- **THEN** la card muestra "De a 6" como sub-label

### Requirement: "Agregar al carrito" desde la card respeta `min_quantity` y `qty_step`

Cuando el cliente clickea "Agregar" en una card, el sistema SHALL añadir al carrito la cantidad correcta según el estado actual: si el item no existe en el carrito, agrega `min_quantity`; si ya existe, suma `qty_step`. Esto SHALL aplicar también cuando se usa el botón "+" en cards con variantes (suma `qty_step` de la variante seleccionada al carrito del producto).

#### Scenario: Primer agregado de empanadas suma 12

- **WHEN** el carrito está vacío y el cliente clickea "Agregar" en la card de empanadas (min=12, step=6)
- **THEN** el carrito queda con 12 empanadas

#### Scenario: Agregado subsiguiente suma 6

- **WHEN** el cliente vuelve a clickear "Agregar" en la card de empanadas con 12 ya en el carrito
- **THEN** el carrito queda con 18 empanadas

#### Scenario: Producto sin restricciones se comporta como hoy

- **WHEN** el cliente clickea "Agregar" en un producto con min=1, step=1
- **THEN** suma 1 al carrito (comportamiento idéntico al actual)

### Requirement: Modal de detalle respeta `min_quantity` y `qty_step` en el selector

El modal de detalle SHALL iniciar el selector de cantidad en `min_quantity` cuando el item no existe en el carrito, o en `qty_step` cuando ya existe (lo que se sumaría). El botón "+" SHALL incrementar de a `qty_step`. El botón "-" NO SHALL permitir bajar a 0 ni a un valor que dejaría la suma de cantidades < `min_quantity`. Si la operación resultara inválida, el botón "Agregar" SHALL deshabilitarse con etiqueta clara.

#### Scenario: Modal de empanadas abre en 12 con carrito vacío

- **WHEN** se abre el modal del producto con min=12, step=6 y existingQty=0
- **THEN** el selector muestra 12; "+" lo lleva a 18, 24, …; "-" desde 12 lo deshabilita o deja en 12 (no baja a 6)

#### Scenario: Modal de empanadas abre en 6 con 12 ya en el carrito

- **WHEN** se abre el modal del producto con min=12, step=6 y existingQty=12
- **THEN** el selector inicial muestra 6 (qty_step); "+" lo lleva a 12; "-" desde 6 deshabilita o deja en 6

#### Scenario: Validación visible al intentar inválido

- **WHEN** el cliente fuerza qty=4 en un producto con step=6 (vía teclado o manipulación)
- **THEN** el botón "Agregar" se deshabilita y muestra un label/tooltip explicando la restricción

### Requirement: Carrito drawer respeta `qty_step` y transforma "-" en "Quitar" al llegar al floor

En el carrito drawer, los controles +/- por item SHALL usar `qty_step` como increment/decrement. Cuando restar dejaría la cantidad del item < `qty_step`, el botón "-" SHALL transformarse en "Quitar" (icono de basura o texto), removiendo el item del carrito si se clickea. Esto previene estados con cantidades inválidas.

#### Scenario: "+" suma 6 en producto con step=6

- **WHEN** el carrito tiene 12 empanadas (step=6) y el cliente clickea "+"
- **THEN** la cantidad pasa a 18

#### Scenario: "-" baja a 6 y al siguiente click "Quitar" remueve

- **WHEN** el carrito tiene 12 empanadas (step=6) y el cliente clickea "-"
- **THEN** la cantidad pasa a 6; el botón "-" se transforma en "Quitar"; el siguiente click remueve el item

### Requirement: Checkout bloquea si algún producto del carrito viola `min_quantity` o `qty_step`

Antes de cerrar la orden (`createPendingOrder`), el server SHALL agrupar los items por `product_id`, sumar quantities (incluyendo todas las variantes del mismo producto), y validar contra `min_quantity` y `qty_step` del producto. Si algún grupo falla, SHALL devolver `{ error: 'qty_violation', productId, productName, min, step }` y NO SHALL insertar la orden. El cliente SHALL mostrar un toast con el nombre del producto y la restricción.

#### Scenario: Suma de variantes satisface el mínimo

- **WHEN** el carrito tiene 6 empanadas de carne (variante A) + 6 de pollo (variante B) del mismo producto "Empanada" con min=12
- **THEN** la suma agregada por producto es 12 y la validación pasa; la orden se inserta

#### Scenario: Producto por debajo del mínimo bloquea el checkout

- **WHEN** el carrito tiene sólo 6 unidades de un producto con min=12
- **THEN** el server devuelve `qty_violation` con el nombre del producto y `min=12`; el cliente muestra toast; no se inserta orden

#### Scenario: Cantidad que no es múltiplo de step bloquea el checkout

- **WHEN** un cliente logra (por hackeo) enviar 13 unidades de un producto con step=6
- **THEN** el server devuelve `qty_violation` con `step=6`; no se inserta orden

#### Scenario: Producto sin restricciones no genera validaciones extras

- **WHEN** el carrito tiene productos con `min=1, step=1`
- **THEN** la validación pasa siempre que stock alcance; comportamiento idéntico al actual

### Requirement: Maintenance and Availability States
The storefront SHALL communicate non-published states clearly to visitors, and SHALL treat a store blocked for non-payment as unavailable even when its `status = 'published'`.

#### Scenario: Paused store
- **WHEN** a store has `status = 'paused'`
- **THEN** the public page renders a maintenance message instead of the catalog

#### Scenario: Store not found
- **WHEN** a slug does not resolve to any store
- **THEN** a not-found state is shown

#### Scenario: Draft store not public
- **WHEN** a store has `status = 'draft'`
- **THEN** the public page is not publicly accessible

#### Scenario: Store blocked for non-payment
- **WHEN** a store's subscription state is `blocked` (its `blocked_at` is set and it is not exempt)
- **THEN** the public page renders a maintenance/unavailable message instead of the catalog, regardless of its `status`

#### Scenario: Store within trial or active is public
- **WHEN** a published store's subscription state is `trial`, `active` or `exempt`
- **THEN** the public catalog is shown normally

