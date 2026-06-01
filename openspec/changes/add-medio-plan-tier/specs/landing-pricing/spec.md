## ADDED Requirements

### Requirement: Tres cards de planes en la landing
El sistema SHALL mostrar en la sección de precios de la landing tres cards, una por plan (`inicial`, `medio`, `pro`), cada una con su nombre, precio mensual formateado, mención del trial de 14 días sin tarjeta, un resumen de features y un CTA. El orden SHALL ser inicial → medio → pro.

#### Scenario: Se renderizan tres planes
- **WHEN** un visitante abre la sección de precios de la landing
- **THEN** ve tres cards en el orden inicial ($7.000), medio ($9.000), pro ($18.000), cada una con su CTA y la leyenda de 14 días gratis sin tarjeta

#### Scenario: Card de inicial refleja sus límites
- **WHEN** un visitante mira la card del plan `inicial`
- **THEN** ve que incluye hasta 20 productos, 1 sección, 1 imagen por producto y que no incluye variantes

### Requirement: Comparador de planes
El sistema SHALL mostrar, debajo de las cards de precios, una tabla comparadora con una columna por plan y una fila por feature, indicando para cada plan el valor o si la feature está incluida (tilde) o no (cruz). El comparador SHALL cubrir al menos: cantidad de productos, cantidad de secciones, imágenes por producto, variantes, y trial de 14 días.

#### Scenario: Tabla comparadora con valores por plan
- **WHEN** un visitante abre el comparador de planes
- **THEN** ve una fila "Productos" con 20 / 50 / ilimitado, una fila "Secciones" con 1 / 3 / ilimitado, una fila "Imágenes por producto" con 1 / ilimitado / ilimitado, una fila "Variantes" con cruz / tilde / tilde, y una fila "Prueba gratis 14 días" con tilde en los tres planes

#### Scenario: Variantes marcadas como no incluidas en inicial
- **WHEN** un visitante mira la fila "Variantes" del comparador
- **THEN** la celda del plan `inicial` muestra una cruz y las de `medio` y `pro` muestran un tilde
