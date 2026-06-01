## ADDED Requirements

### Requirement: Variantes condicionadas al plan
El sistema SHALL habilitar la creación y edición de variantes de producto únicamente para tiendas en planes que permitan variantes (`medio` y `pro`). En el plan `inicial` (`allowVariants = false`) el sistema SHALL bloquear la creación de tipos de opción y variantes y SHALL ocultar/deshabilitar la UI de variantes en el dashboard. Las reglas existentes de variantes (agregado de `min_quantity`/`qty_step` a nivel producto) SHALL seguir aplicando sin cambios para los planes que sí permiten variantes.

#### Scenario: Plan inicial sin variantes
- **WHEN** el dueño de una tienda en `inicial` abre el editor de un producto
- **THEN** no ve la opción de agregar variantes y cualquier intento de crear una variante vía server action es rechazado

#### Scenario: Plan medio mantiene reglas de variantes
- **WHEN** el dueño de una tienda en `medio` crea variantes para un producto con `min_quantity = 12`
- **THEN** las variantes se crean y el mínimo agregado por producto sigue aplicando como hasta ahora
