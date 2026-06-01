## ADDED Requirements

### Requirement: Cuotas por plan
El sistema SHALL definir, para cada plan, cuotas de `maxProducts`, `maxSections`, `maxImagesPerProduct` y `allowVariants` según la siguiente matriz: `inicial` = 20 productos, 1 sección, 1 imagen por producto, sin variantes; `medio` = 50 productos, 3 secciones, imágenes sin límite, con variantes; `pro` = productos sin límite, secciones sin límite, imágenes sin límite, con variantes. "Sin límite" SHALL representarse de forma que las validaciones lo traten como ilimitado (p. ej. `Infinity`).

#### Scenario: Matriz de cuotas por plan
- **WHEN** el sistema consulta las cuotas del plan `inicial`
- **THEN** obtiene `maxProducts = 20`, `maxSections = 1`, `maxImagesPerProduct = 1`, `allowVariants = false`

#### Scenario: Medio y pro habilitan variantes
- **WHEN** el sistema consulta `allowVariants` de `medio` y de `pro`
- **THEN** ambos devuelven `true`

### Requirement: Enforcement de cuota de productos
El sistema SHALL impedir, en la server action de guardado de productos, crear un producto nuevo cuando la tienda ya alcanzó el `maxProducts` de su plan. La edición de productos existentes SHALL seguir permitida aunque la cantidad total exceda la cuota (caso downgrade).

#### Scenario: Inicial bloquea el producto 21
- **WHEN** una tienda en plan `inicial` con 20 productos intenta crear uno nuevo
- **THEN** la operación es rechazada con un error de límite de plan

#### Scenario: Edición permitida por encima de la cuota
- **WHEN** una tienda en `inicial` con 40 productos (tras downgrade) edita un producto existente
- **THEN** la edición se guarda correctamente

### Requirement: Enforcement de cuota de secciones
El sistema SHALL impedir guardar más secciones que el `maxSections` del plan de la tienda.

#### Scenario: Inicial limita a 1 sección
- **WHEN** una tienda en `inicial` intenta guardar 2 secciones
- **THEN** la operación es rechazada con un error de límite de plan

#### Scenario: Medio permite hasta 3 secciones
- **WHEN** una tienda en `medio` guarda 3 secciones
- **THEN** la operación se guarda correctamente

### Requirement: Enforcement de imágenes por producto según plan
El sistema SHALL limitar la cantidad de imágenes de un producto al `maxImagesPerProduct` del plan de la tienda, validándolo en la server action de guardado y reflejándolo en el uploader del dashboard. El límite de imágenes SHALL dejar de ser un tope global fijo en base de datos y pasar a derivarse del plan.

#### Scenario: Inicial acepta una sola imagen
- **WHEN** una tienda en `inicial` intenta guardar un producto con 2 imágenes
- **THEN** la operación es rechazada con un error de límite de plan

#### Scenario: Medio acepta múltiples imágenes
- **WHEN** una tienda en `medio` guarda un producto con 8 imágenes
- **THEN** la operación se guarda correctamente

#### Scenario: Uploader refleja el límite del plan
- **WHEN** el dueño de una tienda `inicial` ya subió 1 imagen a un producto
- **THEN** el uploader no le permite agregar una segunda imagen

### Requirement: Enforcement de variantes según plan
El sistema SHALL impedir crear tipos de opción o variantes de producto cuando el plan de la tienda tiene `allowVariants = false`. Las variantes ya existentes (p. ej. tras un downgrade) SHALL NOT eliminarse, pero el sistema SHALL bloquear agregar nuevas.

#### Scenario: Inicial no puede crear variantes
- **WHEN** una tienda en `inicial` intenta crear un tipo de opción o una variante
- **THEN** la operación es rechazada con un error de plan y la UI de variantes no está disponible

#### Scenario: Medio puede crear variantes
- **WHEN** una tienda en `medio` crea una variante
- **THEN** la operación se guarda correctamente

#### Scenario: Variantes existentes sobreviven al downgrade
- **WHEN** una tienda con variantes baja a `inicial`
- **THEN** las variantes existentes permanecen, pero no se pueden agregar nuevas
