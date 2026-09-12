## ADDED Requirements

### Requirement: Costo opcional por producto
El sistema SHALL permitir que el dueño cargue un precio de costo por producto, expresado en centavos enteros y mayor o igual a cero. El campo MUST ser siempre opcional: un producto sin costo cargado es un producto válido y no MUST producir advertencias, bloqueos ni campos obligatorios en ningún formulario.

#### Scenario: Cargar el costo de un producto
- **WHEN** el dueño edita un producto de una tienda Pro y carga un costo de $500
- **THEN** el producto queda guardado con `cost_cents = 50000` y el resto de sus campos sin cambios

#### Scenario: Guardar un producto sin tocar el costo
- **WHEN** el dueño guarda un producto existente sin haber cargado nunca un costo
- **THEN** el producto se guarda con `cost_cents` en `NULL` y sin ningún error de validación

#### Scenario: Costo cero es un valor válido
- **WHEN** el dueño carga un costo de $0 en un producto que recibe como muestra gratuita
- **THEN** el sistema guarda `cost_cents = 0` y lo trata como un costo cargado, no como ausencia de dato

#### Scenario: Costo negativo rechazado
- **WHEN** el dueño intenta guardar un costo negativo
- **THEN** el sistema rechaza el guardado con un mensaje de validación y no modifica el producto

### Requirement: Herencia del costo en variantes
El sistema SHALL resolver el costo efectivo de una variante como su `cost_override` cuando lo tenga cargado, y como el `cost_cents` del producto padre en caso contrario. Cuando ni la variante ni el producto tienen costo, el costo efectivo MUST ser ausente (`null`), nunca cero.

#### Scenario: La variante hereda el costo del producto
- **WHEN** un producto tiene `cost_cents = 50000` y una variante sin `cost_override`
- **THEN** el costo efectivo de esa variante es `50000`

#### Scenario: La variante pisa el costo del producto
- **WHEN** un producto tiene `cost_cents = 50000` y una variante con `cost_override = 65000`
- **THEN** el costo efectivo de esa variante es `65000`

#### Scenario: Sin costo en ningún nivel
- **WHEN** un producto sin `cost_cents` tiene una variante sin `cost_override`
- **THEN** el costo efectivo de esa variante es ausente, y no se lo interpreta como cero

### Requirement: Snapshot del costo al crear el pedido
Al crear un pedido, el sistema SHALL guardar en cada línea el costo efectivo vigente en ese momento para el producto o variante comprado. El cálculo de ganancia de un pedido SHALL usar siempre ese valor congelado y MUST NOT leer el costo actual del producto. Cuando no hay costo efectivo al momento de la compra, la línea MUST quedar con el costo ausente.

#### Scenario: Se congela el costo vigente
- **WHEN** se crea un pedido con 2 unidades de un producto cuyo costo efectivo es $500
- **THEN** la línea del pedido queda con `cost_at_purchase = 50000` y `quantity = 2`

#### Scenario: Cambiar el costo no altera el historial
- **WHEN** un producto vendido con costo $500 pasa a costar $700 y se consultan las métricas del período anterior
- **THEN** la ganancia de ese pedido se sigue calculando con $500 por unidad

#### Scenario: Producto sin costo al momento de la compra
- **WHEN** se crea un pedido con un producto que no tiene costo cargado
- **THEN** la línea queda con `cost_at_purchase` ausente y el pedido se crea normalmente

#### Scenario: El snapshot se guarda para cualquier plan
- **WHEN** se crea un pedido en una tienda de plan Inicial cuyo producto tiene costo cargado
- **THEN** la línea igual guarda `cost_at_purchase`, aunque la tienda no pueda ver las métricas de margen

#### Scenario: Borrar el producto no borra el margen histórico
- **WHEN** se elimina un producto que tenía pedidos con costo congelado
- **THEN** las líneas de esos pedidos conservan su `cost_at_purchase` y la ganancia histórica no cambia

### Requirement: Métricas de costo, ganancia y margen
El sistema SHALL exponer en las métricas del dashboard el costo total, la ganancia y el margen porcentual del período, calculados **exclusivamente sobre las líneas de pedido que tienen costo congelado**, tomando como ingreso de esas líneas el precio efectivamente cobrado. El KPI de ingresos existente MUST seguir calculándose como hasta ahora y MUST NOT cambiar de valor.

#### Scenario: Ganancia con costo completo
- **WHEN** el período tiene un único pedido confirmado de 2 unidades a $1000 con costo congelado de $600 por unidad
- **THEN** las métricas informan costo $1200, ganancia $800 y margen 40%

#### Scenario: La ganancia ignora las líneas sin costo
- **WHEN** el período tiene una línea de $1000 con costo $600 y otra de $1000 sin costo cargado
- **THEN** la ganancia informada es $400 y no $1400, porque la línea sin costo no participa del cálculo

#### Scenario: Solo cuentan los pedidos confirmados o entregados
- **WHEN** el período incluye pedidos `pending` y `cancelled` con costo congelado
- **THEN** esos pedidos no aportan ni a costo ni a ganancia, igual que no aportan a los ingresos

#### Scenario: Los pedidos borrados no cuentan
- **WHEN** un pedido con costo congelado fue borrado
- **THEN** no aporta a costo, ganancia ni cobertura

#### Scenario: El ingreso total no se ve afectado
- **WHEN** se agregan costos a productos ya vendidos
- **THEN** el KPI de ingresos del período sigue mostrando exactamente el mismo valor que antes

### Requirement: Cobertura del dato de costo
El sistema SHALL calcular y exponer qué porcentaje de la facturación del período proviene de líneas con costo congelado, y SHALL mostrar ese porcentaje junto a la ganancia. Cuando la cobertura es cero, la interfaz MUST NOT mostrar las tarjetas de costo, ganancia ni margen.

#### Scenario: Cobertura parcial visible
- **WHEN** el 70% de la facturación del período corresponde a líneas con costo congelado
- **THEN** las métricas informan una cobertura del 70% y la interfaz la muestra junto a la ganancia

#### Scenario: Sin ningún costo cargado
- **WHEN** ninguna línea del período tiene costo congelado
- **THEN** la cobertura es cero y la pantalla de métricas se ve igual que antes de existir esta funcionalidad

#### Scenario: La cobertura se mide sobre facturación
- **WHEN** hay costo cargado en muchos productos de bajo volumen pero no en el producto que concentra la mitad de la facturación
- **THEN** la cobertura informada refleja esa mitad faltante y no la proporción de productos

### Requirement: El costo no se expone públicamente
El sistema MUST NOT incluir ningún dato de costo en las respuestas, payloads o vistas accesibles a la tienda pública, ni en los datos enviados a la pasarela de pago. El costo SHALL ser visible únicamente para el dueño autenticado de la tienda y para el superadministrador.

#### Scenario: El payload de la tienda pública no trae costo
- **WHEN** un visitante anónimo carga una tienda publicada cuyos productos tienen costo cargado
- **THEN** ningún dato de costo aparece en la respuesta que recibe el navegador

#### Scenario: El costo no viaja a la pasarela de pago
- **WHEN** se genera un pago con productos que tienen costo cargado
- **THEN** los ítems enviados a la pasarela contienen precio pero ningún campo de costo

#### Scenario: Otro dueño no puede leer el costo ajeno
- **WHEN** el dueño de una tienda consulta productos de otra tienda
- **THEN** la consulta no devuelve datos, igual que hoy

### Requirement: La carga y las métricas de costo son exclusivas del plan Pro
El sistema SHALL habilitar la carga de costo y la visualización de las métricas de margen únicamente a las tiendas del plan Pro, verificándolo en el servidor. Los planes Inicial y Medio MUST NOT ver campos de costo en los formularios ni tarjetas de margen en las métricas.

#### Scenario: Tienda Pro ve los campos
- **WHEN** el dueño de una tienda Pro abre el formulario de un producto
- **THEN** ve el campo de costo junto al de precio

#### Scenario: Tienda Inicial no ve los campos
- **WHEN** el dueño de una tienda Inicial abre el formulario de un producto
- **THEN** no ve ningún campo de costo, y sus métricas no muestran tarjetas de margen

#### Scenario: La verificación es del lado del servidor
- **WHEN** una tienda que no es Pro envía un costo directamente a la acción de guardado
- **THEN** el servidor rechaza el cambio de costo en lugar de confiar en la interfaz

#### Scenario: Bajar de plan conserva los datos
- **WHEN** una tienda Pro con costos cargados pasa al plan Medio
- **THEN** los costos y los snapshots se conservan intactos y vuelven a estar visibles si recupera el plan Pro

### Requirement: Compatibilidad con las tiendas existentes
El sistema MUST preservar el comportamiento actual para toda tienda que no cargue costos. La migración MUST ser aditiva, sin backfill y sin valores por defecto distintos de la ausencia de dato.

#### Scenario: Catálogo existente intacto
- **WHEN** se despliega la funcionalidad sobre una tienda con productos, variantes y tramos ya cargados
- **THEN** ningún precio, promo, tramo ni pedido cambia de valor, y todos los costos quedan ausentes

#### Scenario: Los pedidos anteriores quedan sin costo
- **WHEN** se consultan métricas de un período previo al despliegue
- **THEN** la cobertura es cero, no se muestran tarjetas de margen y los ingresos son los mismos de siempre

### Requirement: Costo y margen en la exportación de pedidos
La exportación de pedidos SHALL incluir, para las tiendas del plan Pro, el costo, la ganancia y el margen de cada pedido, calculados sobre las líneas de ese pedido que tengan costo congelado. Las columnas nuevas MUST ubicarse al final del archivo, después de las columnas existentes, y MUST NOT alterar el orden ni el contenido de estas.

#### Scenario: Exportación con costo cargado
- **WHEN** el dueño de una tienda Pro exporta pedidos que tienen costo congelado
- **THEN** el archivo incluye el costo, la ganancia y el margen de cada pedido en columnas agregadas al final

#### Scenario: Pedido sin costo exporta celdas vacías
- **WHEN** un pedido exportado no tiene costo congelado en ninguna línea
- **THEN** sus celdas de costo, ganancia y margen quedan vacías y no en cero

#### Scenario: Las columnas existentes no se alteran
- **WHEN** se compara una exportación nueva con una anterior de los mismos pedidos
- **THEN** las columnas previas conservan su orden, su encabezado y sus valores

#### Scenario: Tienda sin plan Pro
- **WHEN** el dueño de una tienda Inicial o Medio exporta pedidos
- **THEN** el archivo no incluye ninguna columna de costo, ganancia ni margen

### Requirement: Margen visible en el detalle del pedido
El detalle de un pedido SHALL mostrar, para las tiendas del plan Pro, el costo, la ganancia y el margen de ese pedido, calculados sobre sus líneas con costo congelado. Cuando el pedido no tiene ninguna línea con costo, el detalle MUST NOT mostrar valores en cero.

#### Scenario: Pedido con costo congelado
- **WHEN** el dueño de una tienda Pro abre el detalle de un pedido cuyas líneas tienen costo
- **THEN** ve el costo, la ganancia y el margen de ese pedido

#### Scenario: Pedido sin costo congelado
- **WHEN** el dueño abre el detalle de un pedido sin costo en ninguna línea
- **THEN** no se muestran cifras de margen en cero, sino que la sección no aparece

#### Scenario: Tienda sin plan Pro
- **WHEN** el dueño de una tienda Inicial o Medio abre el detalle de un pedido
- **THEN** no ve ninguna cifra de costo ni de margen
