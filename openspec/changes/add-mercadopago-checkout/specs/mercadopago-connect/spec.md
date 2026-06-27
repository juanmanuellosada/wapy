## ADDED Requirements

### Requirement: Conexión de la cuenta de Mercado Pago del dueño vía OAuth
El dueño SHALL poder conectar su propia cuenta de Mercado Pago a su tienda mediante un flujo OAuth. Tras autorizar, el sistema SHALL obtener y persistir los tokens de acceso y refresh de la cuenta del dueño asociados a su tienda. La conexión SHALL ser 1:1 con la tienda.

#### Scenario: Inicio del flujo OAuth
- **WHEN** el dueño elige conectar Mercado Pago desde el dashboard
- **THEN** es redirigido al flujo de autorización de Mercado Pago con un `state` que identifica su tienda de forma verificable

#### Scenario: Callback exitoso persiste la conexión
- **WHEN** Mercado Pago redirige de vuelta con un código de autorización válido
- **THEN** el sistema intercambia el código por tokens y guarda la conexión asociada a la tienda, marcándola como conectada

#### Scenario: Callback con state inválido es rechazado
- **WHEN** el callback llega con un `state` ausente, alterado o no verificable
- **THEN** el sistema rechaza la conexión y no persiste tokens

#### Scenario: Solo el dueño conecta su tienda
- **WHEN** un usuario que no es el dueño intenta iniciar o completar la conexión de una tienda
- **THEN** la operación es rechazada

### Requirement: Almacenamiento cifrado de los tokens
El sistema SHALL almacenar los access y refresh tokens de Mercado Pago cifrados en reposo. Los tokens en claro NO SHALL exponerse al cliente ni devolverse desde Server Actions, y SHALL usarse únicamente en el servidor. La escritura de los registros de conexión SHALL estar restringida al proceso de servidor (service role).

#### Scenario: Tokens cifrados en reposo
- **WHEN** se persiste una conexión
- **THEN** los tokens se guardan cifrados y no en texto plano

#### Scenario: Tokens nunca llegan al cliente
- **WHEN** el dashboard consulta el estado de la conexión
- **THEN** recibe solo metadata (conectado/desconectado, identificador de cuenta) y nunca los tokens

#### Scenario: Cliente no puede escribir la conexión
- **WHEN** un rol cliente intenta insertar o modificar un registro de conexión
- **THEN** la escritura es rechazada

### Requirement: Refresh automático del token de acceso
Antes de usar el access token para crear preferencias o leer pagos, el sistema SHALL refrescarlo automáticamente si está vencido o próximo a vencer, usando el refresh token, y SHALL re-cifrar y persistir los tokens actualizados.

#### Scenario: Token vigente se usa directo
- **WHEN** se necesita el access token y aún es válido
- **THEN** se usa sin refrescar

#### Scenario: Token vencido se refresca
- **WHEN** se necesita el access token y está vencido o por vencer
- **THEN** el sistema lo refresca, re-cifra y persiste antes de usarlo

#### Scenario: Refresh fallido marca la conexión como revocada
- **WHEN** el refresh falla porque el dueño revocó el acceso desde Mercado Pago
- **THEN** la conexión se marca como revocada y el modo `mercadopago` deja de ser efectivo para esa tienda

### Requirement: Estado de la conexión y desconexión
El dashboard del dueño SHALL mostrar el estado de la conexión de Mercado Pago (conectada / no conectada / revocada) y SHALL permitir desconectar la cuenta. Al desconectar, la tienda SHALL dejar de operar en modo `mercadopago` hasta reconectar.

#### Scenario: Estado visible
- **WHEN** el dueño abre la configuración de pagos
- **THEN** ve si su cuenta de Mercado Pago está conectada

#### Scenario: Desconexión
- **WHEN** el dueño desconecta su cuenta
- **THEN** la conexión se marca como inactiva y el storefront deja de ofrecer pago online hasta reconectar
