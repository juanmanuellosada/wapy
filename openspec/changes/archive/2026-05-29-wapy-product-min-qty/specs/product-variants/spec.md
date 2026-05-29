## ADDED Requirements

### Requirement: `min_quantity` y `qty_step` aplican a nivel producto cuando hay variantes

Cuando un producto tiene variantes, los campos `min_quantity` y `qty_step` definidos en el producto SHALL aplicarse al total agregado del producto en el carrito (suma de cantidades de todas sus variantes), no por variante individual. El modelo de `product_variants` NO SHALL recibir columnas `min_quantity` ni `qty_step` en este change.

#### Scenario: Mezcla de variantes contribuye al mínimo del producto

- **WHEN** un producto "Empanada" tiene `min_quantity=12` y dos variantes activas (carne, pollo); el carrito tiene 7 unidades de carne y 5 de pollo
- **THEN** la suma agregada por producto es 12 y satisface el mínimo

#### Scenario: Una sola variante por debajo del mínimo bloquea si es la única

- **WHEN** un producto tiene `min_quantity=12` y el cliente sólo agrega 6 unidades de una variante
- **THEN** la suma agregada es 6, viola el mínimo, y el checkout devuelve `qty_violation`

#### Scenario: Variantes no tienen propias columnas de min/step

- **WHEN** se ejecuta `\d product_variants` después de aplicar el change
- **THEN** la tabla NO tiene columnas `min_quantity` ni `qty_step` (las reglas viven sólo en `products`)
