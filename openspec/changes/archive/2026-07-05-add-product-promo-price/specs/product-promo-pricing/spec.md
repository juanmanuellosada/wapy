## ADDED Requirements

### Requirement: Precio promocional opcional por producto y por variante
El sistema SHALL permitir cargar un precio promocional opcional, en centavos, a nivel producto (`products.promo_price_cents`) y a nivel variante (`product_variants.promo_price_override`). Un valor nulo SHALL significar "sin promo". El precio promocional SHALL ser ≥ 0 y estrictamente menor al precio regular correspondiente; el sistema SHALL rechazar en el servidor cualquier promo que no cumpla esa condición.

#### Scenario: Cargar promo a nivel producto
- **WHEN** el dueño guarda un producto (sin variantes) con un precio promocional menor al precio base
- **THEN** el producto queda con `promo_price_cents` seteado y se considera "en promo"

#### Scenario: Cargar promo por variante
- **WHEN** el dueño guarda una variante con un precio promocional menor a su precio regular (`price_override ?? price_cents del producto`)
- **THEN** esa variante queda con `promo_price_override` seteado y se considera "en promo", de forma independiente de las demás variantes

#### Scenario: Quitar la promo
- **WHEN** el dueño deja vacío el precio promocional de un producto o variante
- **THEN** el campo vuelve a nulo y el ítem deja de estar en promo (se cobra el precio regular)

#### Scenario: Promo inválido es rechazado
- **WHEN** el dueño intenta guardar un precio promocional mayor o igual al precio regular, o negativo
- **THEN** el servidor rechaza la operación y no persiste el valor

### Requirement: Resolución del precio efectivo
El sistema SHALL derivar, para cada ítem (producto y variante opcional), un precio efectivo mediante una regla única: el precio regular SHALL ser `variante.price_override ?? producto.price_cents`; el promo candidato SHALL ser `variante.promo_price_override` cuando hay variante, o `producto.promo_price_cents` cuando no la hay; el ítem SHALL estar "en promo" únicamente si el promo candidato no es nulo y es menor al precio regular; y el precio efectivo SHALL ser el promo cuando está en promo, o el precio regular en caso contrario.

#### Scenario: Producto sin variante en promo
- **WHEN** un producto sin variante tiene `promo_price_cents` menor a `price_cents`
- **THEN** su precio efectivo es `promo_price_cents`

#### Scenario: Variante con promo propio
- **WHEN** se elige una variante con `promo_price_override` menor a su precio regular
- **THEN** el precio efectivo del ítem es ese `promo_price_override`, sin importar el promo del producto

#### Scenario: Sin promo cae al precio regular
- **WHEN** un ítem no tiene promo candidato, o el promo no es menor al precio regular
- **THEN** el precio efectivo es el precio regular

### Requirement: El precio promocional es lo que se cobra
El sistema SHALL cobrar el precio efectivo (con promo aplicado cuando corresponde) en ambos canales de checkout —Mercado Pago y WhatsApp—, recalculando siempre server-side y sin confiar en precios enviados por el cliente. La orden SHALL congelar el precio efectivo cobrado en el snapshot de cada ítem.

#### Scenario: Cobro por Mercado Pago con promo
- **WHEN** se genera la preferencia de MP para un ítem en promo
- **THEN** el `unit_price` del ítem es el precio efectivo con promo, y el total refleja ese precio

#### Scenario: Total por WhatsApp con promo
- **WHEN** se arma el pedido por WhatsApp con un ítem en promo
- **THEN** el precio del ítem y el total usan el precio efectivo con promo

#### Scenario: Snapshot congela el promo cobrado
- **WHEN** se crea la orden de un ítem en promo
- **THEN** `order_items.unit_price_cents` / `price_at_purchase` guardan el precio efectivo con promo, aunque luego cambie o se quite la promo del producto

### Requirement: Display de original tachado + promo en el storefront
El sistema SHALL mostrar en la tienda pública, cuando un ítem está en promo, el precio regular tachado junto al precio promocional destacado; y cuando no está en promo, solo el precio efectivo. El display SHALL respetar la variante activa seleccionada en la card/modal.

#### Scenario: Card de producto en promo
- **WHEN** el visitante ve la card de un producto en promo
- **THEN** ve el precio regular tachado y el precio promocional destacado

#### Scenario: Modal respeta la variante activa
- **WHEN** el visitante selecciona una variante en promo dentro del modal
- **THEN** el precio mostrado pasa a original tachado + promo de esa variante; si elige una variante sin promo, se muestra solo su precio regular

#### Scenario: Producto sin promo
- **WHEN** el ítem no está en promo
- **THEN** se muestra un único precio (el regular), sin tachado
