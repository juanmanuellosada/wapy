## ADDED Requirements

### Requirement: Grilla de edición masiva del catálogo
El sistema SHALL ofrecer al dueño una vista tabular de los productos de su tienda que permita editarlos en línea, sin abrir el formulario individual de cada producto. La grilla SHALL permitir editar por fila el nombre, la descripción, el precio, el precio promocional, la sección, el stock y el estado activo/inactivo de cada producto. La grilla NO SHALL editar imágenes, variedades, cantidad mínima ni múltiplo de venta: esos campos siguen gestionándose desde el formulario individual del producto.

#### Scenario: Editar el precio de varios productos en línea
- **WHEN** el dueño abre la grilla y escribe un precio en tres filas distintas
- **THEN** las tres filas quedan marcadas como modificadas y muestran el nuevo precio, sin abrir ningún formulario adicional

#### Scenario: Campos no editables desde la grilla
- **WHEN** el dueño necesita cambiar la imagen o las variedades de un producto desde la grilla
- **THEN** la grilla le ofrece abrir el formulario individual de ese producto en lugar de editar esos campos en línea

#### Scenario: La grilla muestra todo el catálogo
- **WHEN** el dueño abre la grilla
- **THEN** ve todos los productos de su tienda, no solamente los del último import

### Requirement: Filtro y búsqueda dentro de la grilla
El sistema SHALL permitir filtrar la grilla para ver únicamente los productos en borrador y SHALL permitir buscar productos por nombre. Los filtros SHALL afectar solo qué filas se muestran y NO SHALL descartar los cambios pendientes de las filas ocultas.

#### Scenario: Filtrar borradores después de un import
- **WHEN** el dueño llega a la grilla desde un import recién finalizado y activa el filtro de borradores
- **THEN** ve solamente los productos inactivos, entre ellos los recién importados

#### Scenario: Los cambios sobreviven al filtro
- **WHEN** el dueño modifica una fila y luego aplica un filtro que la oculta
- **THEN** el cambio sigue pendiente y se guarda al confirmar los cambios

### Requirement: Selección múltiple y acciones en lote
El sistema SHALL permitir seleccionar varias filas de la grilla, incluida una acción para seleccionar todas las filas visibles, y SHALL ofrecer sobre la selección acciones que apliquen un mismo valor a todos los productos seleccionados: asignar precio, asignar sección, asignar stock, y publicar o despublicar.

#### Scenario: Asignar un precio a varios productos
- **WHEN** el dueño selecciona 10 productos y aplica un precio en lote
- **THEN** las 10 filas quedan con ese precio y marcadas como modificadas

#### Scenario: Publicar en lote
- **WHEN** el dueño selecciona productos en borrador y aplica la acción de publicar
- **THEN** esas filas quedan marcadas como activas y pendientes de guardar

#### Scenario: Asignar sección en lote
- **WHEN** el dueño selecciona varios productos y elige una sección para aplicar
- **THEN** todos los seleccionados quedan asignados a esa sección

#### Scenario: Sin selección no hay acciones en lote
- **WHEN** no hay ninguna fila seleccionada
- **THEN** las acciones en lote no están disponibles

### Requirement: Borrado masivo de productos desde la grilla
El sistema SHALL permitir borrar en lote los productos seleccionados en la grilla de edición masiva. El borrado SHALL requerir confirmación explícita del dueño antes de ejecutarse y SHALL indicar en el mensaje de confirmación cuántos productos se van a eliminar y que la acción no se puede deshacer. El sistema SHALL verificar en el servidor que todos los productos incluidos en el borrado en lote pertenecen a la tienda del usuario autenticado, rechazando la operación completa sin borrar nada si alguno no le pertenece. Al completarse el borrado, las filas eliminadas SHALL dejar de mostrarse en la grilla y SHALL dejar de contar como cambios pendientes sin guardar.

#### Scenario: Borrado exitoso de varios productos
- **WHEN** el dueño selecciona 5 productos y confirma el borrado
- **THEN** los 5 productos se eliminan, dejan de aparecer en la grilla y el sistema confirma cuántos se borraron

#### Scenario: La confirmación es obligatoria
- **WHEN** el dueño hace clic en "Eliminar" con productos seleccionados
- **THEN** el sistema no borra nada hasta que el dueño confirme la acción en el diálogo de confirmación

#### Scenario: Cancelar la confirmación no borra nada
- **WHEN** el dueño abre el diálogo de confirmación de borrado y lo cancela
- **THEN** ningún producto se elimina y la selección se mantiene intacta

#### Scenario: Producto de otra tienda en el borrado en lote
- **WHEN** un borrado en lote incluye el identificador de un producto que no pertenece a la tienda del usuario
- **THEN** el servidor rechaza la operación completa y no borra ningún producto

#### Scenario: Las filas borradas no cuentan como cambios pendientes
- **WHEN** el dueño tenía cambios sin guardar en productos que luego borra en lote
- **THEN** tras el borrado esos productos ya no figuran en el contador de cambios sin guardar de la grilla

### Requirement: Guardado explícito de los cambios pendientes
El sistema SHALL acumular las ediciones en la interfaz y persistirlas únicamente cuando el dueño confirma el guardado, enviando en una sola operación solamente los productos modificados. El sistema SHALL indicar de forma visible cuántos productos tienen cambios sin guardar, SHALL permitir descartarlos, y SHALL advertir antes de abandonar la grilla con cambios pendientes. El sistema NO SHALL guardar automáticamente cada campo al editarlo.

#### Scenario: Guardar los cambios acumulados
- **WHEN** el dueño modificó 15 productos y confirma el guardado
- **THEN** el sistema persiste esos 15 productos en una sola operación y la grilla deja de mostrar cambios pendientes

#### Scenario: Solo se envían las filas modificadas
- **WHEN** el dueño modifica 3 productos de un catálogo de 200 y guarda
- **THEN** la operación de guardado incluye únicamente esos 3 productos

#### Scenario: Descartar cambios
- **WHEN** el dueño elige descartar los cambios pendientes
- **THEN** la grilla vuelve a mostrar los valores almacenados y no se modifica ningún producto

#### Scenario: Aviso al salir con cambios sin guardar
- **WHEN** el dueño intenta salir de la grilla con cambios pendientes
- **THEN** el sistema le advierte que perderá esos cambios y le pide confirmación

### Requirement: Validación de los datos editados en la grilla
El sistema SHALL aplicar a los campos editados en la grilla las mismas reglas de validación que rigen en el formulario individual de producto: nombre obligatorio de hasta 120 caracteres, descripción de hasta 500 caracteres, precio entero no negativo, stock entero no negativo o vacío para stock ilimitado, y precio promocional —cuando se carga— no negativo y estrictamente menor al precio regular. El sistema SHALL señalar en la fila correspondiente los valores inválidos, SHALL impedir el guardado mientras existan, y SHALL revalidar en el servidor rechazando cualquier operación que no cumpla las reglas.

#### Scenario: Nombre vacío
- **WHEN** el dueño borra el nombre de una fila e intenta guardar
- **THEN** el sistema marca esa fila como inválida, indica el error y no guarda ningún cambio

#### Scenario: Promo mayor o igual al precio regular
- **WHEN** el dueño carga en una fila un precio promocional mayor o igual al precio regular
- **THEN** el sistema marca la fila como inválida y bloquea el guardado hasta corregirla

#### Scenario: Stock vacío significa ilimitado
- **WHEN** el dueño deja vacío el stock de una fila y guarda
- **THEN** ese producto queda sin límite de stock

#### Scenario: El servidor rechaza datos inválidos
- **WHEN** llega al servidor una operación de guardado en lote con un precio negativo o un promo no menor al precio regular
- **THEN** el servidor rechaza la operación completa y no modifica ningún producto

### Requirement: Guardado en lote atómico y con resultado informado
El sistema SHALL aplicar el guardado en lote de manera que, si alguno de los productos enviados no puede actualizarse, no queden cambios aplicados a medias sin que el dueño lo sepa. El sistema SHALL informar el resultado del guardado indicando cuántos productos se actualizaron o, ante un fallo, qué ocurrió, dejando los cambios pendientes disponibles para reintentar.

#### Scenario: Guardado exitoso
- **WHEN** el guardado en lote de 15 productos se completa correctamente
- **THEN** el sistema confirma que se actualizaron 15 productos y el catálogo refleja los nuevos valores

#### Scenario: Fallo durante el guardado
- **WHEN** el guardado en lote falla
- **THEN** el sistema informa el error, mantiene los cambios pendientes en la grilla y permite reintentar

### Requirement: La edición masiva es exclusiva del plan Pro
El sistema SHALL habilitar la grilla de edición masiva únicamente a las tiendas con plan Pro, usando el mismo límite de plan `allowBulkProducts` que gobierna el alta masiva. La validación SHALL realizarse en el servidor leyendo el plan de la tienda desde la base de datos, rechazando el guardado en lote de cualquier tienda cuyo plan no lo incluya. La interfaz SHALL ofrecer a los demás planes un llamado a mejorar el plan en lugar del acceso a la grilla.

#### Scenario: Tienda con plan Pro
- **WHEN** el dueño de una tienda Pro abre el dashboard de productos
- **THEN** puede acceder a la grilla de edición masiva

#### Scenario: Tienda con plan inicial o medio
- **WHEN** el dueño de una tienda de plan inicial o medio abre el dashboard de productos
- **THEN** no puede acceder a la grilla y ve una invitación a pasarse a Pro

#### Scenario: Intento de guardado en lote desde un plan sin la funcionalidad
- **WHEN** se invoca el guardado en lote para una tienda cuyo plan no incluye `allowBulkProducts`
- **THEN** el servidor rechaza la operación y no modifica ningún producto

### Requirement: Solo el dueño puede editar masivamente su propia tienda
El sistema SHALL exigir sesión iniciada y SHALL verificar en el servidor que todos los productos incluidos en un guardado en lote pertenecen a la tienda del usuario autenticado, descartando la operación si alguno no le pertenece.

#### Scenario: Usuario sin sesión
- **WHEN** se intenta un guardado en lote sin sesión iniciada
- **THEN** el sistema redirige al login y no modifica ningún producto

#### Scenario: Producto de otra tienda en el lote
- **WHEN** un guardado en lote incluye el identificador de un producto que no pertenece a la tienda del usuario
- **THEN** el servidor rechaza la operación completa y no modifica ningún producto

### Requirement: La grilla es usable en teléfono
El sistema SHALL presentar la edición masiva de forma utilizable en pantallas de teléfono, adaptando la disposición tabular a un formato apilado por producto con los campos etiquetados, sin depender de desplazamiento horizontal para acceder a las columnas.

#### Scenario: Edición desde un teléfono
- **WHEN** el dueño abre la grilla desde un teléfono
- **THEN** ve cada producto como un bloque con sus campos etiquetados y puede editarlos, seleccionarlos y guardarlos sin desplazamiento horizontal
