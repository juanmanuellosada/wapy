# product-multibuy-offers

## ADDED Requirements

### Requirement: Configuración de oferta NxM por producto
El dueño SHALL poder configurar por producto una oferta "llevás N, pagás M" con N entero >= 2 y M entero
tal que 1 <= M < N, o dejarlo sin oferta. La oferta SHALL aplicar a todas las variantes del producto.
Un producto sin oferta SHALL comportarse exactamente como hoy.

#### Scenario: Elegir un preset
- **WHEN** el dueño elige "2x1" en la sección de ofertas y guarda
- **THEN** el producto queda con N=2, M=1 y la ficha pública muestra el badge "2x1"

#### Scenario: Combinación inválida
- **WHEN** el dueño intenta guardar una oferta personalizada con M >= N o N < 2
- **THEN** el guardado se rechaza con un error de validación y el producto no cambia

#### Scenario: Guardar sin mandar la oferta
- **WHEN** un flujo que no administra ofertas (p. ej. el wizard de onboarding) guarda el producto
- **THEN** la oferta existente se conserva

### Requirement: Cálculo de la oferta NxM
Con Q unidades del producto en el carrito (sumando todas sus variantes), el sistema SHALL bonificar
floor(Q / N) × (N − M) unidades, eligiendo las de menor precio regular, y cobrar el resto a precio regular.

#### Scenario: Sobrantes a precio normal
- **WHEN** un producto de $1000 con 2x1 se lleva 3 veces
- **THEN** el total del producto es $2000

#### Scenario: Variantes de precio distinto
- **WHEN** un producto con 2x1 se lleva en 1 talle S de $1000 y 1 talle XL de $1200
- **THEN** se bonifica la S y el total del producto es $1200

#### Scenario: Cantidad insuficiente
- **WHEN** un producto con 3x2 se lleva 2 veces
- **THEN** no se aplica descuento NxM

### Requirement: Gana el más barato, sin acumular
Por cada producto el sistema SHALL calcular el total con promo y/o tramos (regla vigente) y el total con
NxM sobre precio regular, y SHALL cobrar el menor. Los descuentos NUNCA SHALL acumularse. En empate SHALL
aplicarse el cálculo con promo/tramos.

#### Scenario: El NxM gana a la promo
- **WHEN** un producto regular $1000 con promo $900 y 2x1 se lleva 2 veces
- **THEN** el total es $1000 (NxM) y no $1800 ni $900

#### Scenario: La promo gana al NxM
- **WHEN** un producto regular $1000 con promo $400 y 2x1 se lleva 2 veces
- **THEN** el total es $800 (promo) y la línea no muestra la etiqueta "2x1"

### Requirement: Cobro server-side y snapshot inmutable
El precio cobrado SHALL calcularse en el servidor al crear la orden, para Mercado Pago y WhatsApp, sin
confiar en precios del cliente. Cada ítem de la orden SHALL guardar su descuento NxM y la etiqueta de la
oferta aplicada, y esos valores NO SHALL cambiar si luego se edita la oferta del producto. El cupón SHALL
aplicarse sobre el total ya descontado por NxM.

#### Scenario: Orden por Mercado Pago con 2x1
- **WHEN** se crea una orden MP con 2 unidades de un producto $1000 en 2x1
- **THEN** la suma de `mp_items` es $1000 y el ítem de la orden guarda `discount_cents = 100000` y `offer_label = "2x1"`

#### Scenario: Edición posterior de la oferta
- **WHEN** el dueño quita el 2x1 después de que se creó una orden que lo usó
- **THEN** la orden conserva su total, su descuento y su etiqueta

#### Scenario: Métricas y márgenes
- **WHEN** el panel calcula ingresos o ganancia de una orden con descuento NxM
- **THEN** usa el neto de cada línea (`unit_price × quantity − discount`)

### Requirement: Exhibición en el storefront
La tienda pública SHALL mostrar un badge con la oferta (p. ej. "2x1") en la card y en el modal de cada
producto con oferta, y SHALL mostrar un banner en la parte superior cuando haya al menos un producto activo
con oferta NxM, listando las ofertas distintas y permitiendo filtrar el catálogo a esos productos. El
banner NO SHALL mostrarse si la tienda está en construcción o no tiene productos con oferta.

#### Scenario: Tienda con ofertas
- **WHEN** una tienda tiene productos activos con 2x1 y con 3x2
- **THEN** el banner anuncia "2x1 y 3x2" y "Ver promos" deja visibles solo esos productos

#### Scenario: Tienda sin ofertas
- **WHEN** ningún producto activo tiene oferta NxM
- **THEN** no se muestra el banner

### Requirement: Carrito coherente con el cobro
El carrito SHALL calcular sus líneas con el mismo helper que usa el servidor y SHALL mostrar el descuento
NxM aplicado por línea; el mensaje de WhatsApp SHALL incluir ese descuento.

#### Scenario: Descuento visible en el carrito
- **WHEN** el comprador agrega 2 unidades de un producto $1000 en 2x1
- **THEN** el carrito muestra "2x1 · −$1000" y un total de $1000, igual al que cobra el servidor
