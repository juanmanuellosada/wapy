## ADDED Requirements

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
