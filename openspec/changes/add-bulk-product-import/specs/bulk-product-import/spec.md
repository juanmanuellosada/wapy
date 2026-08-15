## ADDED Requirements

### Requirement: Alta masiva de productos desde un archivo ZIP de fotos
El sistema SHALL permitir al dueño de una tienda cargar un archivo `.zip` con fotos y crear, a partir de él, un producto por cada foto válida contenida en el ZIP. Cada producto creado SHALL tomar su nombre del nombre del archivo de la foto y SHALL quedar con la foto como única imagen del producto.

#### Scenario: Import exitoso de un ZIP con varias fotos
- **WHEN** el dueño de una tienda con plan Pro carga un ZIP que contiene 12 fotos válidas
- **THEN** el sistema crea 12 productos en esa tienda, cada uno con la imagen correspondiente ya subida y asociada, y muestra un resumen indicando que se crearon 12 productos

#### Scenario: ZIP sin ninguna foto válida
- **WHEN** el dueño carga un ZIP que no contiene ningún archivo con extensión de imagen soportada
- **THEN** el sistema no crea ningún producto e informa que el ZIP no contiene fotos válidas

#### Scenario: El archivo cargado no es un ZIP
- **WHEN** el dueño intenta cargar un archivo que no es un `.zip` o cuyo contenido no puede descomprimirse
- **THEN** el sistema rechaza el archivo con un mensaje explicativo y no crea ningún producto

### Requirement: Valores por defecto de los productos creados por import
El sistema SHALL crear cada producto del import sin precio promocional, sin stock definido, sin descripción, y en estado **borrador** (`is_active = false`). En ausencia de valores comunes elegidos por el dueño, el precio SHALL ser cero (`price_cents = 0`) y la sección SHALL quedar sin asignar. El sistema SHALL asignar a los productos creados posiciones consecutivas ubicadas después del último producto existente de la tienda, preservando el orden de las fotos dentro del ZIP.

#### Scenario: Producto importado nace en borrador y a precio cero
- **WHEN** se crea un producto a partir de una foto del ZIP sin elegir valores comunes
- **THEN** ese producto tiene precio 0, no tiene precio promocional, no tiene sección ni stock, y queda inactivo

#### Scenario: Los productos importados no se muestran en la tienda pública
- **WHEN** un visitante abre la tienda pública inmediatamente después de un import
- **THEN** no ve ninguno de los productos recién importados, porque están en borrador

#### Scenario: Los productos importados se agregan al final del catálogo
- **WHEN** una tienda con productos existentes recibe un import de 5 fotos
- **THEN** los 5 productos nuevos quedan ubicados después de los productos preexistentes, en el mismo orden en que las fotos aparecen en el ZIP

### Requirement: Categoría y precio comunes para todo el import
El sistema SHALL permitir al dueño elegir, en la misma pantalla del import y de forma opcional, una sección y un precio que se apliquen a **todos** los productos generados por ese ZIP. El sistema SHALL verificar en el servidor que la sección elegida pertenece a la tienda del dueño, rechazando el import completo si no es así. El precio elegido SHALL ser un entero no negativo. Elegir un precio NO SHALL publicar los productos: siguen creándose en borrador.

#### Scenario: Import con categoría común
- **WHEN** el dueño elige la sección "Remeras" antes de importar un ZIP de 30 fotos
- **THEN** los 30 productos creados quedan asignados a la sección "Remeras"

#### Scenario: Import con precio común
- **WHEN** el dueño carga un precio de 25.000 antes de importar un ZIP de 30 fotos
- **THEN** los 30 productos creados quedan con ese precio en lugar de 0

#### Scenario: Sin valores comunes elegidos
- **WHEN** el dueño importa sin elegir sección ni precio
- **THEN** los productos se crean sin sección y con precio 0

#### Scenario: Los productos con precio común siguen en borrador
- **WHEN** el dueño importa eligiendo un precio común mayor a cero
- **THEN** los productos creados quedan igualmente inactivos, y publicarlos sigue siendo una acción aparte

#### Scenario: Sección que no pertenece a la tienda
- **WHEN** se invoca el import indicando una sección que pertenece a otra tienda
- **THEN** el servidor rechaza la operación completa y no crea ningún producto

### Requirement: Derivación del nombre del producto desde el nombre del archivo
El sistema SHALL derivar el nombre de cada producto a partir del nombre del archivo de su foto, ignorando la ruta de carpetas: SHALL quitar la extensión, reemplazar guiones y guiones bajos por espacios, colapsar espacios consecutivos, recortar espacios de los extremos, poner en mayúscula la primera letra y truncar el resultado a 120 caracteres. Si el nombre derivado queda vacío, el sistema SHALL usar `"Producto"`.

#### Scenario: Nombre con guiones
- **WHEN** el ZIP contiene un archivo llamado `remera-negra.jpg`
- **THEN** el producto creado se llama `Remera negra`

#### Scenario: Nombre con guiones bajos
- **WHEN** el ZIP contiene un archivo llamado `campera_jean.png`
- **THEN** el producto creado se llama `Campera jean`

#### Scenario: Nombre que ya viene legible
- **WHEN** el ZIP contiene un archivo llamado `Buzo Oversize 01.jpg`
- **THEN** el producto creado se llama `Buzo Oversize 01`, sin alterar las mayúsculas existentes

#### Scenario: Archivo dentro de una subcarpeta
- **WHEN** el ZIP contiene un archivo en la ruta `Remeras/remera-blanca.jpg`
- **THEN** el producto creado se llama `Remera blanca` y la carpeta no afecta al nombre ni asigna sección

### Requirement: Deduplicación de nombres repetidos dentro del mismo import
El sistema SHALL detectar, dentro de un mismo import, nombres derivados que coincidan sin distinguir mayúsculas de minúsculas, y SHALL diferenciarlos agregando un sufijo numérico incremental a partir del segundo. El sistema NO SHALL deduplicar contra productos preexistentes de la tienda.

#### Scenario: Dos archivos que derivan el mismo nombre
- **WHEN** el ZIP contiene `remera-negra.jpg` y `Remera_Negra.png`
- **THEN** el primer producto se llama `Remera negra` y el segundo `Remera negra 2`

#### Scenario: El nombre ya existe en el catálogo
- **WHEN** el ZIP contiene `remera-negra.jpg` y la tienda ya tiene un producto llamado `Remera negra`
- **THEN** el producto se crea igualmente con el nombre `Remera negra`, sin sufijo y sin error

### Requirement: Filtrado de entradas del ZIP
El sistema SHALL procesar únicamente las entradas del ZIP cuya extensión sea `.jpg`, `.jpeg`, `.png` o `.webp`. El sistema SHALL ignorar sin reportarlas como error las entradas de directorio, las de tamaño cero, los archivos ocultos (nombre iniciado en punto), las rutas de metadatos del sistema operativo (`__MACOSX/`, `.DS_Store`, `Thumbs.db`) y cualquier archivo con otra extensión.

#### Scenario: ZIP creado en macOS
- **WHEN** el dueño carga un ZIP que contiene 10 fotos más una carpeta `__MACOSX/` con entradas espejo y un `.DS_Store`
- **THEN** el sistema crea exactamente 10 productos y no reporta errores por las entradas de metadatos

#### Scenario: ZIP con archivos mezclados
- **WHEN** el ZIP contiene 8 fotos válidas, un `precios.xlsx` y un `notas.txt`
- **THEN** el sistema crea 8 productos e ignora los archivos no soportados sin contarlos como fallos

### Requirement: Límites de tamaño y cantidad del import
El sistema SHALL rechazar, antes de procesarlo, un ZIP que supere los 60 MB, indicando el tope y sugiriendo dividirlo. El sistema SHALL rechazar un ZIP que contenga más de 100 fotos válidas, informando cuántas trae y cuál es el máximo, sin crear ningún producto ni truncar el lote. Cada foto individual SHALL respetar los límites vigentes de imagen de producto (25 MB de archivo original y 5 MB una vez comprimido).

#### Scenario: ZIP demasiado pesado
- **WHEN** el dueño intenta cargar un ZIP de 85 MB
- **THEN** el sistema lo rechaza antes de descomprimirlo, informa el límite de 60 MB y no crea ningún producto

#### Scenario: ZIP con demasiadas fotos
- **WHEN** el dueño carga un ZIP con 140 fotos válidas
- **THEN** el sistema rechaza el import informando que trae 140 fotos y que el máximo por ZIP es 100, y no crea ningún producto

#### Scenario: Una foto individual excede el peso permitido
- **WHEN** una de las fotos del ZIP sigue superando los 5 MB después de comprimirse
- **THEN** esa foto se marca como fallida con su motivo y el resto del import continúa

### Requirement: Progreso visible y tolerancia a fallos parciales
El sistema SHALL mostrar el avance del import indicando cuántas fotos se procesaron sobre el total. Ante el fallo de una o más fotos, el sistema NO SHALL abortar el import: SHALL crear los productos correspondientes a las fotos que se subieron correctamente y SHALL presentar al final un resumen con la cantidad de productos creados y el detalle de cada foto fallida con su motivo, ofreciendo reintentar únicamente las fallidas.

#### Scenario: Import con fallos parciales
- **WHEN** de 40 fotos del ZIP, 37 se suben correctamente y 3 fallan
- **THEN** el sistema crea 37 productos y muestra un resumen con esos 37 más el nombre y motivo de las 3 fotos fallidas

#### Scenario: Reintento de las fotos fallidas
- **WHEN** el dueño elige reintentar después de un import con fallos parciales
- **THEN** el sistema procesa solamente las fotos que habían fallado, sin volver a subir ni duplicar las que ya generaron producto

#### Scenario: Fallo al crear los productos con las fotos ya subidas
- **WHEN** todas las fotos se suben correctamente pero la creación de los productos falla
- **THEN** el sistema informa el error y permite reintentar la creación reutilizando las fotos ya subidas, sin volver a subirlas

### Requirement: El alta masiva es exclusiva del plan Pro
El sistema SHALL habilitar el alta masiva por ZIP únicamente a las tiendas con plan Pro, mediante un límite de plan `allowBulkProducts`. La validación SHALL realizarse en el servidor leyendo el plan de la tienda desde la base de datos, y SHALL rechazar la creación en lote de cualquier tienda cuyo plan no la incluya, con independencia de lo que envíe el cliente. La interfaz SHALL ofrecer a los planes que no la incluyen un llamado a mejorar el plan en lugar del acceso a la funcionalidad.

#### Scenario: Tienda con plan Pro
- **WHEN** el dueño de una tienda Pro abre el dashboard de productos
- **THEN** ve disponible la opción de alta masiva por ZIP

#### Scenario: Tienda con plan inicial o medio
- **WHEN** el dueño de una tienda de plan inicial o medio abre el dashboard de productos
- **THEN** no puede usar el alta masiva y ve una invitación a pasarse a Pro

#### Scenario: Intento de creación en lote desde un plan sin la funcionalidad
- **WHEN** se invoca la creación masiva de productos para una tienda cuyo plan no incluye `allowBulkProducts`
- **THEN** el servidor rechaza la operación con un mensaje de plan insuficiente y no crea ningún producto

### Requirement: El import respeta el límite de productos del plan
El sistema SHALL verificar, en el servidor y antes de crear nada, que la cantidad actual de productos de la tienda más la cantidad de productos a crear no supere el máximo de productos del plan. Si el lote no entra completo, el sistema SHALL rechazarlo por entero e informar cuántos lugares quedan disponibles, en lugar de crear una parte.

#### Scenario: El lote entra dentro del límite
- **WHEN** una tienda con límite ilimitado de productos importa 60 fotos
- **THEN** se crean los 60 productos

#### Scenario: El lote excede el límite del plan
- **WHEN** una tienda con 45 productos y un máximo de 50 intenta importar 12 fotos
- **THEN** el sistema rechaza el import completo e informa que solo quedan 5 lugares disponibles, sin crear ningún producto

### Requirement: Solo el dueño puede importar en su propia tienda
El sistema SHALL exigir sesión iniciada y SHALL verificar en el servidor que la tienda destino del import pertenece al usuario autenticado, antes de subir imágenes o crear productos.

#### Scenario: Usuario sin sesión
- **WHEN** se intenta un import sin sesión iniciada
- **THEN** el sistema redirige al login y no crea ningún producto

#### Scenario: Import contra una tienda ajena
- **WHEN** un usuario autenticado invoca la creación masiva indicando una tienda de la que no es dueño
- **THEN** el servidor rechaza la operación y no crea ningún producto
