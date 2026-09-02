## ADDED Requirements

### Requirement: Cada sección ordena sus productos según su modo configurado

La tienda pública SHALL renderizar los productos de cada sección según el modo de orden efectivo de esa sección, resuelto como `sections.sort_mode ?? stores.default_product_sort`.

Los modos soportados SHALL ser exactamente: `manual` (por `products.position` ascendente, el comportamiento previo a este change), `price_asc`, `price_desc`, `name_asc`, `newest` y `best_selling`.

Un `sort_mode` nulo SHALL significar "heredar el default de la tienda", que es distinto de `'manual'`: una sección en NULL cambia cuando cambia el default, una sección en `'manual'` no.

Una subsección SHALL resolver su modo con la misma regla que una sección de primer nivel, heredando del default de la tienda y NOT de su sección madre.

Un valor de `sort_mode` o de `default_product_sort` que no pertenezca al conjunto soportado SHALL tratarse como `manual`, sin romper el renderizado del catálogo.

El orden SHALL resolverse en el servidor, de modo que el HTML inicial ya salga ordenado y no haya reordenamiento visible después de la hidratación.

#### Scenario: Sección en precio ascendente

- **WHEN** una sección tiene `sort_mode = 'price_asc'` y contiene productos de $5.000, $1.200 y $3.400
- **THEN** la tienda los muestra en el orden $1.200, $3.400, $5.000, sin importar su `position`

#### Scenario: Herencia del default de tienda

- **WHEN** la tienda tiene `default_product_sort = 'name_asc'` y una sección tiene `sort_mode = NULL`
- **THEN** esa sección se muestra en orden alfabético

#### Scenario: Manual explícito no hereda

- **WHEN** la tienda tiene `default_product_sort = 'price_asc'` y una sección tiene `sort_mode = 'manual'`
- **THEN** esa sección conserva el orden arrastrado por la dueña, y el resto de las secciones en NULL pasan a precio ascendente

#### Scenario: Sin configurar nada, el orden es el de siempre

- **WHEN** una tienda existente no tiene ninguna sección con `sort_mode` y su `default_product_sort` está en el valor por defecto
- **THEN** el orden de todas sus secciones es por `position` ascendente, idéntico al anterior a este change

### Requirement: El orden por precio usa el precio efectivo que muestra la card

Los modos `price_asc` y `price_desc` SHALL ordenar por el precio efectivo del producto — el precio promocional cuando hay una promo válida, y el precio de lista cuando no — resuelto con el mismo helper que alimenta la vista (`resolveEffectivePrice`).

El criterio SHALL ser el precio que la card muestra en su estado inicial, a nivel producto. El orden SHALL NOT usar el mínimo entre precios de variantes ni los tramos por cantidad, cuyo valor depende de cuántas unidades lleve cada comprador.

#### Scenario: Producto con promo se ordena por el precio con promo

- **WHEN** una sección en `price_asc` contiene un producto de $5.000 con promo a $900 y otro de $1.500 sin promo
- **THEN** el producto con promo aparece primero, coincidiendo con el precio que se lee en su card

### Requirement: Los productos sin stock pueden mostrarse al final de cada sección

Cuando `stores.out_of_stock_last` es verdadero, la tienda SHALL mostrar en cada sección primero los productos disponibles y después los sin stock, aplicando **el mismo** modo de orden dentro de cada uno de los dos bloques.

La preferencia SHALL ser ortogonal al modo de orden: SHALL combinarse con los seis modos, incluido `manual`. Con la preferencia desactivada, el orden SHALL ser el que produce el modo por sí solo.

La disponibilidad SHALL determinarse con el mismo criterio que el filtro "Solo con stock": un producto simple está disponible si su stock es nulo (sin control de stock) o mayor a cero; un producto con variantes está disponible si al menos una de sus variantes lo está.

#### Scenario: Agotados al final combinado con precio ascendente

- **WHEN** una sección en `price_asc` con `out_of_stock_last` activo contiene un producto de $800 agotado y productos de $2.000 y $1.000 con stock
- **THEN** el orden es $1.000, $2.000, y el de $800 último

#### Scenario: Producto con todas sus variantes agotadas

- **WHEN** un producto tiene variantes y ninguna tiene stock disponible
- **THEN** se ordena junto a los productos sin stock, aunque su `stock` a nivel producto sea nulo

### Requirement: El orden por más vendidos usa la misma ventana que la fila de destacados

El modo `best_selling` SHALL ordenar por unidades vendidas en los últimos 30 días, reusando la RPC `storefront_top_sellers` que ya alimenta la sección "Lo más pedido".

Los productos sin ventas en la ventana SHALL ubicarse después de todos los que sí vendieron, entre sí en orden manual.

El storefront SHALL resolver el ranking con **una sola** llamada a la RPC por request, compartida entre el orden de las secciones y la fila de destacados.

#### Scenario: Producto sin ventas en la ventana

- **WHEN** una sección en `best_selling` contiene dos productos con ventas y uno recién creado sin ninguna
- **THEN** los dos con ventas aparecen primero ordenados por unidades vendidas, y el nuevo al final

### Requirement: El orden entre productos empatados es estable

Todos los modos SHALL desempatar por `position` ascendente y, ante igual `position`, por `id`. Dos renderizados consecutivos del mismo catálogo sin cambios de datos SHALL producir exactamente el mismo orden.

#### Scenario: Dos productos al mismo precio

- **WHEN** una sección en `price_asc` contiene dos productos de $1.000 con `position` 3 y 7
- **THEN** aparece primero el de `position` 3, y ese orden se mantiene en cada carga de la página
