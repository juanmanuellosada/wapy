## ADDED Requirements

### Requirement: La dueña elige el orden de cada sección

El panel de secciones SHALL ofrecer, en cada sección y subsección, un selector con los seis modos de orden y una opción adicional que representa la herencia del default de la tienda.

La opción de herencia SHALL nombrar el modo que se está heredando (por ejemplo "Como en la tienda (Precio: menor a mayor)"), de modo que el efecto de elegirla se lea sin salir de la pantalla.

El guardado SHALL persistir el valor nulo tal cual para la opción de herencia: SHALL NOT convertirlo en `'manual'`, porque eso desengancharía la sección de futuros cambios del default.

#### Scenario: Elegir orden alfabético para una sección

- **WHEN** la dueña elige "Nombre A-Z" en la sección "Accesorios" y guarda
- **THEN** `sections.sort_mode` de esa sección queda en `'name_asc'` y la tienda pública muestra esa sección ordenada alfabéticamente

#### Scenario: Volver a heredar

- **WHEN** la dueña elige la opción "Como en la tienda" en una sección que tenía un modo propio
- **THEN** `sections.sort_mode` vuelve a NULL y la sección pasa a seguir el default de la tienda

### Requirement: La tienda tiene un orden por defecto y una preferencia de stock

La configuración de la tienda SHALL incluir un orden de productos por defecto (`stores.default_product_sort`) y un interruptor "Mostrar los productos sin stock al final" (`stores.out_of_stock_last`).

El default SHALL aplicarse únicamente a las secciones que están en modo heredado, y la UI SHALL decirlo explícitamente para que un cambio de default no sorprenda a quien tiene secciones curadas a mano.

El interruptor de stock SHALL aplicarse a todas las secciones sin excepción, porque no compite con el modo de orden sino que lo complementa.

Ambas preferencias SHALL escribirse mediante una acción de servidor que verifique la propiedad de la tienda y valide los valores contra el conjunto soportado.

#### Scenario: Cambiar el default con una sección curada

- **WHEN** la tienda tiene 5 secciones en modo heredado y una en `'manual'`, y la dueña cambia el default a "Precio: menor a mayor"
- **THEN** las 5 pasan a precio ascendente y la sexta conserva su orden arrastrado

#### Scenario: Valor inválido rechazado en el servidor

- **WHEN** se invoca la acción con un modo que no pertenece al conjunto soportado
- **THEN** la acción devuelve un error, SHALL NOT escribir la tienda, y el catálogo público no se ve afectado

### Requirement: El arrastre manual solo está disponible cuando la sección está en modo manual

El panel de productos SHALL resolver el modo efectivo de cada grupo de sección y SHALL habilitar el arrastre únicamente cuando ese modo es `manual`.

Cuando el modo es automático, el grupo SHALL renderizarse sin el control de arrastre y SHALL indicar en qué orden se está mostrando y desde dónde se cambia. Permitir el arrastre en ese caso guardaría una posición que la tienda ignora, y la acción parecería funcionar sin efecto observable.

El `position` de los productos SHALL conservarse intacto mientras la sección está en modo automático, de modo que volver a manual restituya el orden que la dueña había armado.

#### Scenario: Sección automática no se puede arrastrar

- **WHEN** la dueña abre el panel de productos y una sección está en "Precio: menor a mayor"
- **THEN** los productos de esa sección se listan sin el control de arrastre, con una indicación del orden vigente

#### Scenario: Volver a manual recupera el orden armado

- **WHEN** una sección con un orden manual armado a mano se pasa a un modo automático y más tarde se devuelve a manual
- **THEN** los productos vuelven a mostrarse en el orden que tenían antes del cambio
