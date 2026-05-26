## ADDED Requirements

### Requirement: Producto puede definir tipos de opción y valores
El sistema SHALL permitir asociar a un producto entre 0 y N **tipos de opción** (ej. "Color", "Talle"), y a cada tipo entre 1 y N **valores** (ej. "Rojo", "Azul"). Un producto con 0 tipos de opción es un **producto simple** y mantiene el comportamiento previo a esta capability (precio, stock e imagen viven en el producto).

#### Scenario: Producto sin tipos de opción se comporta como simple
- **WHEN** un dueño crea un producto sin definir tipos de opción
- **THEN** el producto NO tiene variedades y su precio, stock e imagen vienen exclusivamente de la fila de `products`

#### Scenario: Tipo de opción único por nombre dentro del producto
- **WHEN** un dueño intenta crear dos tipos de opción con el mismo nombre (insensible a espacios en blanco al inicio/final) en el mismo producto
- **THEN** el sistema rechaza la operación con error de unicidad

#### Scenario: Tipo de opción debe tener al menos un valor
- **WHEN** un dueño guarda un producto con un tipo de opción sin valores
- **THEN** el sistema rechaza la operación e indica que el tipo de opción "X" necesita al menos un valor

#### Scenario: No se puede borrar el último valor de un tipo vía removeOptionValue
- **WHEN** un dueño intenta borrar el único valor restante de un tipo de opción
- **THEN** el sistema rechaza la operación con el error: "No se puede borrar el último valor de '{type_name}'. Si querés eliminar el tipo, usá 'Quitar tipo' en su lugar."

#### Scenario: Eliminar tipo entero con removeOptionType
- **WHEN** un dueño usa la acción "Quitar tipo" para borrar un tipo de opción
- **THEN** el sistema borra el tipo junto con sus valores y, para las variantes afectadas: las que aparecen en order_items históricos reciben soft-delete (deleted_at), las demás se borran vía cascade

#### Scenario: Nombre y valor con tope de longitud
- **WHEN** un dueño intenta guardar un nombre de tipo o valor de más de 32 caracteres
- **THEN** el sistema rechaza la operación con error de longitud máxima

### Requirement: Variedades se generan como matriz cartesiana
El sistema SHALL generar una variedad por cada combinación posible de valores de los tipos de opción del producto. Cada variedad SHALL ser única dentro del producto por su combinación de valores.

#### Scenario: Producto con 2 tipos genera matriz completa
- **WHEN** un dueño define `Color = [Rojo, Azul]` y `Talle = [M, L]` para un producto sin variedades previas
- **THEN** el sistema crea 4 variedades: `Rojo+M`, `Rojo+L`, `Azul+M`, `Azul+L`, con stock 0 y sin precio ni imagen override

#### Scenario: Agregar valor a tipo existente crea variedades nuevas sin tocar las existentes
- **WHEN** un producto ya tiene variedades `Rojo+M` y `Rojo+L` con stock 5 cada una, y el dueño agrega el valor `Azul`
- **THEN** el sistema crea `Azul+M` y `Azul+L` con stock 0 y las variedades `Rojo+M` y `Rojo+L` mantienen su stock 5

#### Scenario: Quitar valor archiva variedades en órdenes históricas
- **WHEN** un dueño quita el valor `Rojo` de un producto cuyas variedades `Rojo+M` y `Rojo+L` aparecen en `order_items` históricos
- **THEN** las variedades NO se borran físicamente, se marcan con `deleted_at` y dejan de aparecer en queries públicas, pero los `order_items` históricos siguen referenciándolas

#### Scenario: Quitar valor borra variedades sin órdenes
- **WHEN** un dueño quita el valor `Rojo` de un producto cuyas variedades `Rojo+M` y `Rojo+L` NO aparecen en ningún `order_items`
- **THEN** las variedades se borran físicamente vía cascade

#### Scenario: Agregar nuevo tipo de opción a producto con variedades está bloqueado
- **WHEN** un producto ya tiene variedades y el dueño intenta agregar un nuevo tipo de opción
- **THEN** el sistema rechaza la operación e indica que debe borrar las variedades existentes antes de cambiar la dimensionalidad

#### Scenario: Cap de variedades por producto
- **WHEN** un dueño intenta generar una matriz que excedería 25 variedades en un mismo producto
- **THEN** el sistema rechaza la operación con error de tope

### Requirement: Stock por variedad
El sistema SHALL mantener un campo de stock por cada variedad. El campo `stock` puede ser un entero ≥ 0 (tracking activo) o `null` (sin tracking = stock infinito, alineado con `products.stock = null`). Cuando un producto tiene variedades, el campo `products.stock` deja de ser fuente de verdad y NO se usa en validación ni descuento.

#### Scenario: Stock de variedad nunca negativo
- **WHEN** una operación intenta dejar el stock de una variedad por debajo de 0
- **THEN** el sistema rechaza la operación con error de constraint

#### Scenario: Variedad con stock=null se comporta como stock infinito
- **WHEN** una variedad tiene `stock = null`
- **THEN** el storefront NO muestra "Sin stock" y el botón "Agregar" queda habilitado; al confirmar el pedido NO se descuenta stock para esa variedad

#### Scenario: Producto simple usa stock del producto
- **WHEN** un cliente compra un producto simple (sin variedades)
- **THEN** el descuento de stock opera sobre `products.stock`

#### Scenario: Producto con variedades usa stock de la variedad
- **WHEN** un cliente compra una variedad de un producto con variedades
- **THEN** el descuento de stock opera sobre `product_variants.stock` y `products.stock` queda intacto

### Requirement: Precio opcional por variedad
El sistema SHALL permitir que cada variedad sobreescriba el precio del producto. Si la variedad no define precio (campo nulo), SHALL heredar el precio del producto.

#### Scenario: Variedad sin precio hereda del producto
- **WHEN** un producto tiene precio 1000 y una variedad con `price_override = null`
- **THEN** el storefront muestra y el carrito agrega esa variedad a precio 1000

#### Scenario: Variedad con precio override usa su propio precio
- **WHEN** un producto tiene precio 1000 y una variedad con `price_override = 1500`
- **THEN** el storefront muestra y el carrito agrega esa variedad a precio 1500

#### Scenario: Precio override debe ser ≥ 0
- **WHEN** un dueño guarda un precio override negativo
- **THEN** el sistema rechaza la operación

### Requirement: Imagen opcional por variedad
El sistema SHALL permitir que cada variedad tenga su propia imagen en Storage. Si la variedad no define imagen, SHALL heredar la del producto. Las imágenes de variedad SHALL subirse vía Server Action + admin client (nunca desde el cliente).

#### Scenario: Variedad sin imagen muestra la del producto
- **WHEN** el cliente selecciona en el storefront una variedad cuyo `image_url` es null
- **THEN** la card muestra la imagen del producto

#### Scenario: Variedad con imagen propia la muestra al seleccionarla
- **WHEN** el cliente selecciona en el storefront una variedad cuyo `image_url` apunta a una imagen propia
- **THEN** la card muestra esa imagen reemplazando la del producto

#### Scenario: Subida de imagen de variedad solo vía server
- **WHEN** se carga una imagen de variedad
- **THEN** la subida ocurre dentro de una Server Action que usa el admin client de Supabase, nunca desde un componente cliente con la sesión del usuario

### Requirement: Storefront muestra selector inline en la card
El sistema SHALL renderizar la card del producto en el storefront con un selector inline por cada tipo de opción cuando el producto tenga variedades. Sin variedades, la card SHALL renderizar idéntica a un producto simple.

#### Scenario: Sin variedades, card sin selector
- **WHEN** un producto simple se renderiza en el grid del storefront
- **THEN** la card muestra imagen, nombre, precio y botón "Agregar" sin ningún selector

#### Scenario: Con variedades, card muestra un selector por tipo de opción
- **WHEN** un producto con tipos `Color` y `Talle` se renderiza en el grid
- **THEN** la card muestra dos selectores (uno por tipo) y refleja precio, imagen y stock de la variedad activa

#### Scenario: Combinaciones inexistentes se deshabilitan
- **WHEN** un producto tiene `Rojo+M` y `Rojo+L` pero no `Azul+M`, y el cliente tiene `Color = Azul` seleccionado
- **THEN** el valor `Talle = M` se renderiza deshabilitado para indicar que no existe esa combinación

#### Scenario: Stock 0 deshabilita "Agregar"
- **WHEN** la variedad activa tiene stock 0
- **THEN** el botón "Agregar" queda deshabilitado y se indica "Sin stock"

#### Scenario: Variedad con stock=null tiene botón habilitado y no muestra badge de stock
- **WHEN** la variedad activa tiene `stock = null`
- **THEN** el botón "Agregar" queda habilitado, no se muestra badge "Sin stock" ni "Quedan N"

#### Scenario: Sin selección no se puede agregar al carrito
- **WHEN** un producto tiene variedades y el cliente no ha completado la selección de todos los tipos de opción
- **THEN** el botón "Agregar" queda deshabilitado hasta que la selección esté completa


### Requirement: Carrito y checkout operan sobre variedad cuando aplica
El sistema SHALL registrar `variant_id` en cada `order_item` cuando el producto tenga variedades. La validación y el descuento de stock al confirmar pedido SHALL ser atómicos por línea y operar sobre `product_variants.stock` o `products.stock` según corresponda. Cuando `product_variants.stock` es `null` (sin tracking), NO se valida ni descuenta stock para esa línea.

#### Scenario: Línea de carrito de producto simple
- **WHEN** un cliente agrega al carrito un producto simple
- **THEN** el `order_item` resultante tiene `product_id` y `variant_id = null`

#### Scenario: Línea de carrito de producto con variedades
- **WHEN** un cliente agrega al carrito una variedad de un producto con variedades
- **THEN** el `order_item` resultante tiene `product_id` y `variant_id` poblado con la variedad elegida

#### Scenario: Descuento atómico de stock por variedad
- **WHEN** al confirmar un pedido se intenta descontar 3 unidades de una variedad con stock 2
- **THEN** la transacción completa hace rollback, no se modifica ningún stock y el pedido NO se crea

#### Scenario: Snapshot de precio y etiqueta en order_item
- **WHEN** se crea un `order_item` para una variedad con precio 1500 y combinación `Rojo+M`
- **THEN** el `order_item` guarda `price_at_purchase = 1500` y `variant_label = "Rojo / M"` (formato configurable), y si después se cambia el precio o se renombra la variedad, el pedido histórico mantiene el snapshot

### Requirement: Dashboard permite CRUD de variedades en el form de producto
El sistema SHALL incluir en el form de alta/edición de producto del dashboard una sección "Variedades" que permita definir tipos de opción y valores, generar la matriz de variedades, y editar stock, precio opcional e imagen opcional por fila.

#### Scenario: Form de producto simple sin sección de variedades activa
- **WHEN** un dueño abre el form de un producto y no define tipos de opción
- **THEN** la sección "Variedades" muestra solo un CTA "Agregar tipo de opción" y los campos de precio/stock/imagen del producto siguen activos

#### Scenario: Definir tipos genera matriz editable
- **WHEN** un dueño define `Color = [Rojo, Azul]` y `Talle = [M, L]` y guarda
- **THEN** el form muestra una tabla con 4 filas (una por variedad) con inputs de stock (default 0), precio opcional (placeholder = precio del producto) e imagen opcional

#### Scenario: Stock del producto se esconde cuando hay variedades
- **WHEN** un producto tiene al menos una variedad
- **THEN** el input de stock del producto se oculta en el form y se reemplaza por un resumen del stock agregado de las variedades (lectura)

### Requirement: Duplicar producto duplica sus variedades
El sistema SHALL extender la acción de duplicación de producto para clonar también sus tipos de opción, valores y variedades. El stock, precio override e imagen de cada variedad duplicada SHALL ser idéntico al de la variedad original.

#### Scenario: Duplicar producto simple no genera variedades
- **WHEN** un dueño duplica un producto simple
- **THEN** el duplicado es también simple, sin tipos de opción ni variedades

#### Scenario: Duplicar producto con variedades clona la estructura preservando stock y overrides
- **WHEN** un dueño duplica un producto con `Color = [Rojo, Azul]`, `Talle = [M, L]` y stock/precio override variado en cada variedad
- **THEN** el duplicado tiene los mismos tipos de opción y valores (con nuevos ids), las 4 variedades correspondientes, y cada variedad duplicada conserva exactamente el `stock` y el `price_override` de su original

#### Scenario: Duplicación reutiliza URLs de imágenes de variedad
- **WHEN** un dueño duplica un producto cuyas variedades tienen imágenes propias
- **THEN** las variedades del duplicado referencian las mismas URLs en Storage (sin copia física de archivo) hasta que el dueño edite y suba una nueva

### Requirement: Export CSV refleja variedades
El sistema SHALL extender el export CSV del dashboard para incluir una fila por cada variedad cuando el producto tenga variedades. Los productos simples SHALL seguir exportándose como una sola fila.

#### Scenario: Producto simple es una fila
- **WHEN** un dueño exporta el CSV de su catálogo y un producto X es simple
- **THEN** el CSV tiene una sola fila para X con su precio, stock e imagen

#### Scenario: Producto con variedades exporta filas hijas
- **WHEN** un dueño exporta el CSV de su catálogo y un producto Y tiene 4 variedades
- **THEN** el CSV incluye 4 filas para Y, una por variedad, con la combinación de valores (ej. "Rojo / M") y el stock/precio efectivo de la variedad

### Requirement: RLS preserva visibilidad pública y escritura del dueño
El sistema SHALL aplicar a las tablas nuevas (`product_option_types`, `product_option_values`, `product_variants`, `product_variant_option_values`) las mismas reglas de visibilidad pública (storefront) y escritura por dueño que rigen para `products`.

#### Scenario: Visitante anónimo lee variedades de tienda pública
- **WHEN** un visitante sin sesión consulta el storefront `/[slug]` de una tienda pública con productos publicados
- **THEN** las variedades de esos productos son legibles

#### Scenario: Visitante anónimo NO lee variedades de tienda privada
- **WHEN** un visitante sin sesión intenta leer variedades de productos de una tienda no pública
- **THEN** la consulta retorna 0 filas

#### Scenario: Dueño puede modificar variedades de sus productos
- **WHEN** el dueño autenticado de una tienda crea, edita o borra variedades de un producto de su tienda
- **THEN** la operación se permite

#### Scenario: Usuario NO dueño no puede modificar variedades de tienda ajena
- **WHEN** un usuario autenticado distinto del dueño intenta modificar variedades de un producto de otra tienda
- **THEN** la operación se rechaza por RLS
