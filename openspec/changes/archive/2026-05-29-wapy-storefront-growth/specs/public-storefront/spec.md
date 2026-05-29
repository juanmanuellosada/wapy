## ADDED Requirements

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
