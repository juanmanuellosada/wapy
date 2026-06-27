## Why

Los emails de autenticación de Supabase (recuperación de contraseña, confirmación de signup) llegan con las plantillas **genéricas de Supabase**, no con la marca Wapy. El usuario lo confirmó: al usar "olvidé la contraseña" recibió el mail por defecto de Supabase. Esto pasa porque `supabase/config.toml` no tiene configuración de email y los emails de auth nunca pasan por Resend, que hoy solo se usa para invites de whitelist y una notificación interna de leads. Además el envío vía Resend está fragmentado: hay un cliente en `lib/resend.ts` y otro cliente Resend duplicado dentro de `lib/leads/actions.ts`, con plantillas HTML inline difíciles de mantener.

## What Changes

- **Send Email Auth Hook de Supabase**: Supabase dejará de mandar sus propios emails de auth y llamará a un endpoint propio (`app/api/auth/send-email/route.ts`) que verifica la firma del hook y envía el mail vía Resend con HTML de marca. Cubre los `email_action_type` de recovery y signup (y deja preparado el camino para magic link / email change).
- **Plantillas con react-email**: nueva carpeta `emails/` con un `Layout` base compartido (paleta de marca `#16222E` / `#F5C84B`, `replyTo`, header `List-Unsubscribe`) y componentes por mail: `PasswordReset`, `ConfirmSignup`, `Invite` (migrado), `NewLeadNotification` (migrado). Preview local habilitado.
- **Módulo `lib/email` centralizado**: un único cliente Resend (lazy) y helpers de envío que renderizan los componentes react-email con `render()`. Reemplaza `lib/resend.ts`.
- **Migración de los flujos existentes**: el invite de whitelist y la notificación de nuevo lead pasan al nuevo sistema; se elimina el cliente Resend duplicado en `lib/leads/actions.ts`.
- **Config + docs**: nueva variable de entorno `SEND_EMAIL_HOOK_SECRET`, documentada en `.env.example` y `.env.local.example`; instrucciones para configurar el hook en el dashboard de Supabase.
- **Out of scope (fase futura)**: welcome email, confirmaciones de orden al comprador, notificación de nueva orden al dueño, recibos de MercadoPago y lifecycle de suscripción/trial. El módulo `lib/email` queda diseñado para absorberlos sin re-arquitectura.

## Capabilities

### New Capabilities
- `transactional-email`: Sistema centralizado de envío de emails transaccionales vía Resend con plantillas react-email — incluye el Send Email Hook de Supabase para emails de auth (recovery, confirmación de signup), el módulo `lib/email` con cliente único y los helpers de envío, y consolida los flujos existentes (invite de whitelist, notificación de lead). Sucede y reemplaza la capability `mail-transport` descrita en la change `wapy-infra-bootstrap`.

### Modified Capabilities
<!-- mail-transport vive como spec dentro de la change wapy-infra-bootstrap, no en openspec/specs/. No se modifica un spec vigente; transactional-email lo absorbe. -->

## Impact

- **Nuevo**: `app/api/auth/send-email/route.ts` (endpoint del hook), `emails/` (plantillas react-email + Layout), `lib/email/` (cliente + helpers).
- **Modificado**: `lib/auth/actions.ts` (forgotPassword/signup ahora dependen del hook, no de la plantilla default), `lib/admin/actions.ts` y `lib/leads/actions.ts` (usan el nuevo módulo; se borra el Resend duplicado), `supabase/config.toml` (config del hook para dev local), `.env.example` / `.env.local.example`, `package.json` (deps `@react-email/components`, `@react-email/render`, `standardwebhooks`; script de preview).
- **Eliminado**: `lib/resend.ts` (reemplazado por `lib/email/`).
- **Dependencias externas**: requiere configurar el "Send Email Hook" en el dashboard de Supabase (URL del endpoint + secret) — tarea manual documentada. `RESEND_API_KEY` ya existe. From-address sigue siendo `Wapy <hola@wapy.com.ar>`.
- **Compatibilidad de links**: el mail de recovery generará un link al endpoint `/auth/v1/verify` de Supabase con `redirect_to` apuntando a `/reset-password`, preservando el flujo client-side actual (`access_token` en el hash) sin necesidad de una nueva ruta `/auth/confirm`.
