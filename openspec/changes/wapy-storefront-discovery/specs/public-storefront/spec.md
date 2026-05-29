## ADDED Requirements

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
