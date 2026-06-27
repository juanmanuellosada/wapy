## Context

Wapy es un SaaS multi-tienda en Next.js (App Router) + Supabase. Hoy:

- Resend está cableado en `lib/resend.ts` (`sendInviteEmail`, HTML inline) y, duplicado, dentro de `lib/leads/actions.ts` (`sendNewLeadEmail`, su propio `new Resend(...)`).
- Los emails de auth los manda **Supabase con sus plantillas por defecto**: `forgotPasswordAction` → `resetPasswordForEmail(email, { redirectTo: ${APP_URL}/reset-password })`; `signupAction` → `signUp({ email, password })`. `supabase/config.toml` no tiene sección de email.
- La recuperación de contraseña se resuelve **client-side** en `app/(auth)/reset-password/page.tsx`: crea un client de browser y escucha el evento `PASSWORD_RECOVERY` con el `access_token` que llega en el **hash** de la URL (flujo implícito). **No existe** ninguna ruta `/auth/confirm` ni intercambio PKCE (`exchangeCodeForSession`).
- From-address único: `Wapy <hola@wapy.com.ar>`. `RESEND_API_KEY` ya está en `.env.local.example`.

Decisiones de producto ya tomadas con el usuario: **Send Email Auth Hook** (no SMTP), plantillas con **react-email**, alcance **solo auth + base** (sin order/subscription emails por ahora).

## Goals / Non-Goals

**Goals:**
- Que recovery y confirmación de signup salgan con plantillas de marca Wapy vía Resend, sin romper el flujo actual de `reset-password`.
- Centralizar todo el envío de email en un módulo `lib/email` con un único cliente Resend y plantillas react-email reutilizables.
- Migrar invite de whitelist y notificación de lead al nuevo sistema, eliminando el cliente Resend duplicado.
- Dejar la base lista para sumar emails transaccionales (orden, suscripción) sin re-arquitectura.

**Non-Goals:**
- Welcome email, confirmaciones/recibos de orden, notificación de nueva orden, recibos de MercadoPago, lifecycle de suscripción/trial.
- Cambiar el flujo de `reset-password` a PKCE / agregar `/auth/confirm`.
- Internacionalización de los mails (solo español).
- Migrar el envío a una Edge Function de Supabase (se hace desde la app Next.js).

## Decisions

### 1. El hook apunta a un route handler de Next.js, no a una Edge Function de Supabase
La doc oficial usa una Edge Function en Deno, pero el Send Email Hook acepta **cualquier endpoint HTTPS**. Implementamos `app/api/auth/send-email/route.ts` (runtime Node) para mantener plantillas, cliente Resend y lógica en un solo repo y un solo stack (TS/React), evitando el toolchain de Deno y `supabase secrets set`.
- **Alternativa descartada**: Edge Function Deno → divide el código en dos runtimes y duplica la config de secrets/deploy. No vale la pena para este alcance.
- **Trade-off**: el endpoint debe estar accesible públicamente (lo está, es Vercel) y la latencia del envío suma al flujo de auth; aceptable.

### 2. Verificación de firma con `standardwebhooks`
Supabase firma el payload con el estándar Standard Webhooks. El endpoint lee el body **crudo** (`await req.text()`), construye `new Webhook(secret)` con `SEND_EMAIL_HOOK_SECRET` (quitando el prefijo `v1,whsec_`) y llama `wh.verify(payload, headers)`. Si falla, responde `401` con `{ error: { http_code, message } }` (formato que Supabase espera). En éxito, responde `200` con `{}`.
- Payload tipado: `{ user: { email }, email_data: { token, token_hash, redirect_to, email_action_type, site_url, token_new, token_hash_new } }`.

### 3. Construcción del link y compatibilidad con el flujo actual
El email **no** usa `token_hash` contra una ruta propia; arma el link al verificador nativo de Supabase para no tener que crear `/auth/confirm`:

```
${SUPABASE_URL}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${redirect_to}
```

`/auth/v1/verify` valida el token y redirige a `redirect_to` con la sesión en el **hash** (flujo implícito) — exactamente lo que `app/(auth)/reset-password/page.tsx` ya espera (`PASSWORD_RECOVERY` + `access_token` en el hash). Para recovery, `redirect_to` será `${APP_URL}/reset-password` (lo sigue fijando `forgotPasswordAction`). Para signup confirmation, `redirect_to` será el `site_url` / home.
- **Alternativa descartada**: usar `token_hash` + nueva ruta `/auth/confirm` con `verifyOtp` (PKCE). Más robusto a futuro pero obliga a reescribir `reset-password`. Fuera de alcance.

### 4. Dispatch por `email_action_type`
El endpoint mapea `email_action_type` → plantilla + subject:
- `recovery` → `PasswordReset`, "Restablecé tu contraseña de Wapy".
- `signup` (y `email`/confirmación) → `ConfirmSignup`, "Confirmá tu cuenta de Wapy".
- Tipos no contemplados (`magiclink`, `email_change`, `invite` nativo) → fallback genérico de confirmación, log a Sentry. No deberían dispararse hoy (el invite es propio, no `inviteUserByEmail`).

### 5. Módulo `lib/email` con cliente único + render react-email
`lib/email/client.ts` exporta el cliente Resend lazy (throw claro si falta `RESEND_API_KEY`) y un `sendEmail({ to, subject, react, replyTo?, headers? })` que hace `render(react)` (de `@react-email/render`) y `resend.emails.send` con `from` fijo y header `List-Unsubscribe`. Helpers de dominio en `lib/email/index.ts`: `sendInviteEmail`, `sendNewLeadEmail`, `sendPasswordResetEmail`, `sendConfirmSignupEmail`. `lib/resend.ts` se elimina; los imports (`lib/admin/actions.ts`, `lib/leads/actions.ts`) se reapuntan.
- Plantillas en `emails/`: `_components/Layout.tsx` (header con logo/paleta, footer, wrapper), y `PasswordReset.tsx`, `ConfirmSignup.tsx`, `Invite.tsx`, `NewLeadNotification.tsx`. Script `email:dev` (`email dev`) para preview local.

### 6. Config local del hook en `supabase/config.toml`
Se agrega la sección para que el hook funcione en `supabase start` local apuntando al endpoint de la app:
```
[auth.hook.send_email]
enabled = true
uri = "http://host.docker.internal:3000/api/auth/send-email"
secret = "env(SEND_EMAIL_HOOK_SECRET)"
```
En producción el hook se configura en el dashboard (URL del deploy + secret generado). Documentado como tarea manual.

## Risks / Trade-offs

- **El hook mal configurado bloquea TODOS los emails de auth** → Mitigación: el endpoint loguea a Sentry y devuelve el error en el formato esperado; documentar verificación post-deploy (probar "olvidé contraseña" en prod). Mientras el hook esté deshabilitado, Supabase sigue mandando el mail default (degradación, no caída).
- **Dominio Resend no verificado** → los envíos fallan con 4xx. Mitigación: ya documentado como tarea previa; no es regresión (hoy ya aplica a invites).
- **El body debe leerse crudo para verificar la firma** → en route handlers de Next hay que usar `await req.text()` antes de parsear; un middleware o parser que consuma el body rompería la verificación. Mitigación: el handler lee `text()` directo.
- **Cambio de formato de link** → si el link no preserva `redirect_to` correctamente, `reset-password` no recibe la sesión. Mitigación: replicar exactamente el formato `/auth/v1/verify`; test manual del flujo completo.
- **Secret en dos lugares** (dashboard prod + env local) → riesgo de desincronización. Mitigación: documentar que el valor de `SEND_EMAIL_HOOK_SECRET` debe ser el mismo string generado por el dashboard.

## Migration Plan

1. Mergear código (deps + módulo + endpoint + plantillas + migración de imports). El endpoint existe pero el hook aún no está activado → sin efecto sobre prod.
2. Verificar dominio en Resend (si no estaba) y `RESEND_API_KEY` en Vercel.
3. En el dashboard de Supabase: crear "Send Email Hook" tipo HTTPS → URL `https://<prod>/api/auth/send-email`, generar secret.
4. Setear `SEND_EMAIL_HOOK_SECRET` en Vercel con el secret generado (`v1,whsec_...`).
5. Activar el hook. Probar "olvidé contraseña" y un signup nuevo en prod.
6. **Rollback**: desactivar el hook en el dashboard → Supabase vuelve a mandar sus emails default inmediatamente, sin redeploy.

## Open Questions

- ¿Subject/copys finales de cada mail? (placeholders razonables en español; ajustables sin cambiar arquitectura.)
- ¿Confirmación de email en signup está activada en el proyecto Supabase? Si "Confirm email" está OFF, el `signup` action no dispara mail; el hook igual queda listo para cuando se active.
