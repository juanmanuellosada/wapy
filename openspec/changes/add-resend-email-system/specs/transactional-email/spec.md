## ADDED Requirements

### Requirement: Cliente Resend único y lazy en `lib/email`

El sistema SHALL exponer un único cliente Resend en `lib/email`, instanciado de forma lazy, usado por todos los flujos de email. Importar el módulo SHALL NOT fallar cuando `RESEND_API_KEY` no está seteada; el error SHALL lanzarse solo al invocar un envío. Todos los emails SHALL usar el from-address `Wapy <hola@wapy.com.ar>` e incluir el header `List-Unsubscribe`.

#### Scenario: Importar el módulo sin RESEND_API_KEY no rompe

- **WHEN** código de la app importa `lib/email` y `RESEND_API_KEY` no está seteada
- **THEN** el import tiene éxito y no se lanza ningún error

#### Scenario: Enviar sin RESEND_API_KEY lanza error claro

- **WHEN** se invoca un helper de envío y `RESEND_API_KEY` no está configurada
- **THEN** la llamada rechaza con un error que indica que `RESEND_API_KEY` no está configurada

#### Scenario: Todos los envíos usan el from-address de marca

- **WHEN** cualquier helper de `lib/email` envía un email con el cliente configurado
- **THEN** Resend se invoca con `from: 'Wapy <hola@wapy.com.ar>'` y con header `List-Unsubscribe`

#### Scenario: No queda código de envío Resend fuera del módulo

- **WHEN** se revisa el código del proyecto tras el cambio
- **THEN** no existe ninguna instanciación `new Resend(...)` fuera de `lib/email` y `lib/resend.ts` ya no existe

### Requirement: Plantillas de email con react-email y layout compartido

El sistema SHALL renderizar los emails a HTML usando componentes react-email bajo `emails/`, compartiendo un `Layout` base con la identidad de marca (paleta `#16222E` / `#F5C84B`, header y footer). El proyecto SHALL ofrecer un comando de preview local de las plantillas.

#### Scenario: Cada email se renderiza desde un componente react-email

- **WHEN** un helper de `lib/email` envía un email
- **THEN** el HTML proviene de renderizar (`render()`) un componente react-email, no de un template literal inline

#### Scenario: Preview local disponible

- **WHEN** un desarrollador corre el script de preview de emails
- **THEN** puede ver las plantillas (PasswordReset, ConfirmSignup, Invite, NewLeadNotification) en el navegador sin enviar mails reales

### Requirement: Send Email Hook reemplaza los emails de auth de Supabase

El sistema SHALL exponer un endpoint `app/api/auth/send-email/route.ts` que Supabase invoca como Send Email Hook para emails de auth, reemplazando las plantillas por defecto de Supabase. El endpoint SHALL verificar la firma Standard Webhooks del payload usando `SEND_EMAIL_HOOK_SECRET` antes de procesarlo. Las respuestas SHALL seguir el contrato del hook: `200` con `{}` en éxito, `401` con `{ error: { http_code, message } }` en fallo de verificación o envío.

#### Scenario: Firma válida dispara el envío vía Resend

- **WHEN** Supabase hace POST al endpoint con un payload correctamente firmado para un `email_action_type` soportado
- **THEN** el endpoint verifica la firma, envía el email correspondiente vía `lib/email` y responde `200` con cuerpo `{}`

#### Scenario: Firma inválida es rechazada

- **WHEN** llega un POST cuya firma no valida contra `SEND_EMAIL_HOOK_SECRET`
- **THEN** el endpoint NO envía ningún email y responde `401` con `{ error: { http_code, message } }`

#### Scenario: El body se lee crudo para verificar

- **WHEN** el endpoint procesa el request entrante
- **THEN** lee el cuerpo crudo (texto) para la verificación de firma antes de parsear el JSON

### Requirement: Email de recuperación de contraseña de marca

El sistema SHALL enviar, para `email_action_type = recovery`, un email con la plantilla `PasswordReset` de marca. El link de recuperación SHALL apuntar al verificador nativo de Supabase (`/auth/v1/verify`) preservando `redirect_to` hacia `/reset-password`, de modo que el flujo client-side existente (sesión en el hash) siga funcionando sin una nueva ruta `/auth/confirm`.

#### Scenario: Recovery envía la plantilla PasswordReset

- **WHEN** el hook recibe un payload válido con `email_action_type = recovery`
- **THEN** se envía a `user.email` el email renderizado desde `PasswordReset` con el link de recuperación

#### Scenario: El link preserva el redirect a reset-password

- **WHEN** se construye el link del email de recovery
- **THEN** el link usa `${SUPABASE_URL}/auth/v1/verify` con `token=token_hash`, `type=recovery` y `redirect_to` apuntando a `/reset-password`

#### Scenario: Clic en el link deja iniciar la sesión de recuperación

- **WHEN** el usuario abre el link del email de recovery
- **THEN** es redirigido a `/reset-password` con la sesión de recuperación disponible (evento `PASSWORD_RECOVERY`) y puede setear una nueva contraseña

### Requirement: Email de confirmación de signup de marca

El sistema SHALL enviar, para el `email_action_type` de confirmación de signup, un email con la plantilla `ConfirmSignup` de marca, con un link de confirmación al verificador nativo de Supabase que respeta `redirect_to`.

#### Scenario: Signup envía la plantilla ConfirmSignup

- **WHEN** el hook recibe un payload válido con el `email_action_type` de confirmación de signup
- **THEN** se envía a `user.email` el email renderizado desde `ConfirmSignup` con el link de confirmación

#### Scenario: Tipo de acción no soportado tiene fallback seguro

- **WHEN** el hook recibe un `email_action_type` no contemplado explícitamente
- **THEN** envía un email de confirmación genérico y registra el evento (Sentry) sin romper el flujo de auth

### Requirement: Invite de whitelist migrado al módulo centralizado

El sistema SHALL enviar el invite de whitelist mediante un helper de `lib/email` que renderiza la plantilla `Invite` (react-email), conservando el link a `{NEXT_PUBLIC_APP_URL}/signup?token={token}`. Los call sites existentes (`addWhitelistEntry`, `reinviteEntry`, `approveLead`) SHALL usar ese helper.

#### Scenario: Invite se envía con la plantilla react-email

- **WHEN** se aprueba/agrega una entrada de whitelist o se reenvía una invitación
- **THEN** se envía el email de invite renderizado desde `Invite` con el from-address de marca y el link `/signup?token=...`

### Requirement: Notificación interna de nuevo lead migrada y sin cliente duplicado

El sistema SHALL enviar la notificación interna de nuevo lead mediante un helper de `lib/email` que renderiza la plantilla `NewLeadNotification`, eliminando la instancia Resend duplicada de `lib/leads/actions.ts`. El fallo de envío SHALL seguir siendo no bloqueante (capturado y reportado a Sentry).

#### Scenario: Lead notification usa el módulo centralizado

- **WHEN** se crea un lead desde el formulario público
- **THEN** la notificación interna se envía vía `lib/email` (plantilla `NewLeadNotification`) y `lib/leads/actions.ts` no contiene ninguna instanciación propia de Resend

#### Scenario: Fallo de envío no rompe la creación del lead

- **WHEN** el envío de la notificación de lead falla
- **THEN** el error se captura y reporta a Sentry, y la creación del lead se completa igualmente
