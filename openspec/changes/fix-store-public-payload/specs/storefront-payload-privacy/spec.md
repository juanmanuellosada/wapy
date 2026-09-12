## ADDED Requirements

### Requirement: La tienda pública solo expone datos de presentación
El sistema MUST NOT incluir en el contenido que recibe el navegador de un visitante de la tienda pública ningún dato interno de negocio de esa tienda. En particular MUST NOT exponerse el plan contratado, el contador acumulado de pedidos, el identificador ni el estado de la suscripción de pago, las fechas de prueba, bloqueo o cambio de estado de suscripción, la exención de pago y su motivo, el identificador del dueño, ni la configuración interna del ciclo de vida de pedidos. El sistema SHALL exponer únicamente los datos necesarios para mostrar la tienda: su identificador, nombre, slug, descripción, logo, tema, redes sociales, número de contacto, modo de checkout y preferencias de orden del catálogo.

#### Scenario: Una tienda publicada no filtra datos internos
- **WHEN** un visitante anónimo abre una tienda publicada
- **THEN** el contenido que recibe su navegador no contiene el plan, el contador de pedidos, ni ningún dato de la suscripción de pago de esa tienda

#### Scenario: La página de mantenimiento tampoco los filtra
- **WHEN** un visitante abre una tienda que está mostrando la pantalla de mantenimiento
- **THEN** el contenido que recibe no contiene datos internos de negocio, aunque la decisión de mostrar mantenimiento se haya tomado a partir de ellos

#### Scenario: La tienda se ve igual que antes
- **WHEN** un visitante abre una tienda publicada
- **THEN** ve el mismo nombre, logo, tema, descripción, redes y catálogo que veía antes del cambio

### Requirement: La decisión de disponibilidad se toma en el servidor
El sistema SHALL seguir evaluando el estado de suscripción de la tienda para decidir si se muestra publicada o en mantenimiento, y esa evaluación MUST ocurrir del lado del servidor, sin que los datos que la sustentan crucen al cliente.

#### Scenario: Tienda bloqueada
- **WHEN** una tienda con la suscripción bloqueada recibe una visita
- **THEN** se muestra la pantalla de mantenimiento y los datos de su suscripción no llegan al navegador

#### Scenario: Tienda en período de prueba
- **WHEN** una tienda dentro de su período de prueba recibe una visita
- **THEN** se muestra normalmente y la fecha de fin de prueba no llega al navegador

### Requirement: El límite de exposición está expresado en el tipo
El conjunto de datos de la tienda que puede cruzar al cliente SHALL estar definido de forma explícita en el código, de manera que una columna agregada en el futuro quede excluida por omisión y deba incorporarse deliberadamente para exponerse.

#### Scenario: Se agrega una columna interna al esquema
- **WHEN** se agrega a la tienda una columna nueva de uso interno
- **THEN** no aparece en el contenido público sin que nadie la haya agregado explícitamente al conjunto expuesto

#### Scenario: Se intenta leer en el cliente un campo no expuesto
- **WHEN** un componente de la tienda pública intenta leer un campo interno de la tienda
- **THEN** el proyecto no compila
