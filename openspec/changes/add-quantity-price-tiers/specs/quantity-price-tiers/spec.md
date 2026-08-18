# quantity-price-tiers

## ADDED Requirements

### Requirement: Configuración de tramos por cantidad
El dueño SHALL poder configurar por producto una lista ilimitada de tramos, cada uno con una cantidad
mínima (entero >= 2) y un precio unitario en centavos (entero >= 0). Un producto sin tramos SHALL
comportarse exactamente como hoy.

#### Scenario: Cargar un tramo
- **WHEN** el dueño guarda un producto de $1000 con un tramo "desde 3 unidades → $933,33 c/u"
- **THEN** el tramo queda persistido en `product_price_tiers` y la ficha pública lo anuncia

#### Scenario: Cantidades mínimas duplicadas
- **WHEN** el dueño intenta guardar dos tramos con la misma cantidad mínima
- **THEN** el guardado SHALL fallar con un error de validación

#### Scenario: Tramo que no abarata
- **WHEN** el dueño carga un tramo de mayor cantidad con un precio unitario mayor o igual al del tramo anterior
- **THEN** el guardado SHALL fallar con un error de validación

### Requirement: Resolución del precio unitario
El sistema SHALL elegir el tramo de mayor `min_quantity` menor o igual a la cantidad, aplicar su precio
unitario a todas las unidades de la línea, y cobrar el menor entre ese precio y el precio efectivo actual
(promo o regular).

#### Scenario: Cantidad por debajo del primer tramo
- **WHEN** el comprador lleva 2 unidades de un producto de $1000 con tramo desde 3
- **THEN** el precio unitario SHALL ser $1000

#### Scenario: Cantidad entre dos tramos
- **GIVEN** tramos "3 → $933,33" y "6 → $880"
- **WHEN** el comprador lleva 5 unidades
- **THEN** las 5 unidades SHALL cobrarse a $933,33

#### Scenario: La promo es más barata que el tramo
- **GIVEN** un producto de $1000 con promo a $850 y un tramo "3 → $900"
- **WHEN** el comprador lleva 3 unidades
- **THEN** el precio unitario SHALL ser $850 y la ficha NO SHALL anunciar que el tramo está activo

### Requirement: Cantidad agregada por producto en productos con variantes
Para un producto con variantes, la cantidad que activa el tramo SHALL ser la suma de todas las líneas del
carrito de ese producto. El precio del tramo SHALL aplicarse a cada variante como el mismo ratio
(`unit_price_cents / product.price_cents`) sobre el precio regular de esa variante.

#### Scenario: Tres variantes distintas activan el tramo
- **GIVEN** una remera de $1000 con tramo "3 → $900" y una variante XL con `price_override` $1200
- **WHEN** el comprador lleva 2 talles M y 1 XL
- **THEN** las M SHALL cobrarse a $900 c/u y la XL a $1080, y el total SHALL ser $2.880

### Requirement: El tramo se cobra por Mercado Pago y por WhatsApp
`createPendingOrder` SHALL recalcular el precio con tramo server-side desde la base, ignorando cualquier
precio enviado por el cliente, y ese precio SHALL quedar congelado en el snapshot de la orden.

#### Scenario: El cliente manda un precio manipulado
- **WHEN** el carrito envía un precio unitario distinto al que resuelve la base
- **THEN** la orden SHALL crearse con el precio calculado server-side

### Requirement: Display de tramos en el storefront
La ficha del producto SHALL mostrar los tramos disponibles con su precio unitario y su porcentaje de
ahorro, y el carrito SHALL mostrar el precio unitario ya con el tramo aplicado.

#### Scenario: Ficha de un producto con tramos
- **WHEN** el comprador abre un producto de $1000 con tramos "3 → $933,33" y "6 → $880"
- **THEN** la ficha SHALL listar ambos tramos con su ahorro porcentual

#### Scenario: El carrito alcanza un tramo
- **WHEN** el comprador sube la cantidad de 2 a 3 en el carrito
- **THEN** el unitario de esa línea SHALL bajar a $933,33 y el total SHALL recalcularse

### Requirement: Carga masiva de tramos
Desde la edición masiva el dueño SHALL poder aplicar a los productos seleccionados un tramo expresado como
porcentaje de descuento desde una cantidad mínima, y SHALL poder quitar los tramos de la selección.

#### Scenario: Aplicar -10% desde 3 a una selección
- **WHEN** el dueño selecciona un producto de $1000 y otro de $2500 y aplica "-10% desde 3"
- **THEN** el primero SHALL quedar con un tramo "3 → $900" y el segundo con "3 → $2250"
