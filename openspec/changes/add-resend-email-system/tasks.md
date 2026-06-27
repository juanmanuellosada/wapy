## 1. Dependencias y config

- [x] 1.1 Agregar dependencias: `@react-email/components`, `@react-email/render`, `standardwebhooks` (mantener `resend`)
- [x] 1.2 Agregar script `email:dev` (preview de react-email) a `package.json`
- [x] 1.3 Documentar `SEND_EMAIL_HOOK_SECRET` (y confirmar `RESEND_API_KEY`, `NEXT_PUBLIC_APP_URL`) en `.env.example` y `.env.local.example`
- [x] 1.4 Agregar sección `[auth.hook.send_email]` a `supabase/config.toml` (uri al endpoint local, secret via env) para dev local

## 2. Plantillas react-email

- [x] 2.1 Crear `emails/_components/Layout.tsx` con identidad de marca (paleta `#16222E`/`#F5C84B`, header/footer) reutilizable
- [x] 2.2 Crear `emails/PasswordReset.tsx` (recibe url de recuperación)
- [x] 2.3 Crear `emails/ConfirmSignup.tsx` (recibe url de confirmación)
- [x] 2.4 Crear `emails/Invite.tsx` migrando el HTML actual de invite (recibe inviteUrl)
- [x] 2.5 Crear `emails/NewLeadNotification.tsx` migrando el HTML actual de notificación de lead

## 3. Módulo `lib/email`

- [x] 3.1 Crear `lib/email/client.ts`: cliente Resend lazy + `sendEmail({ to, subject, react, replyTo?, headers? })` con from fijo y `List-Unsubscribe`; error claro si falta `RESEND_API_KEY`
- [x] 3.2 Crear `lib/email/index.ts` con helpers: `sendInviteEmail`, `sendNewLeadEmail`, `sendPasswordResetEmail`, `sendConfirmSignupEmail`
- [x] 3.3 Eliminar `lib/resend.ts`

## 4. Send Email Hook endpoint

- [x] 4.1 Crear `app/api/auth/send-email/route.ts`: leer body crudo (`req.text()`), verificar firma con `standardwebhooks` y `SEND_EMAIL_HOOK_SECRET` (quitar prefijo `v1,whsec_`)
- [x] 4.2 Tipar el payload (`user.email`, `email_data: { token, token_hash, redirect_to, email_action_type, ... }`) y construir el link `${SUPABASE_URL}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${redirect_to}`
- [x] 4.3 Dispatch por `email_action_type`: `recovery` → `sendPasswordResetEmail`; signup/confirmación → `sendConfirmSignupEmail`; fallback genérico + log a Sentry para tipos no contemplados
- [x] 4.4 Respuestas del contrato del hook: `200 {}` en éxito; `401 { error: { http_code, message } }` en fallo de verificación/envío

## 5. Migración de call sites existentes

- [x] 5.1 Reapuntar `lib/admin/actions.ts` (`addWhitelistEntry`, `reinviteEntry`) a `sendInviteEmail` de `lib/email`
- [x] 5.2 Reapuntar `lib/leads/actions.ts`: `approveLead` usa el nuevo `sendInviteEmail`; reemplazar `sendNewLeadEmail` por el helper de `lib/email` y eliminar el `new Resend(...)` duplicado (mantener fallo no bloqueante a Sentry)

## 6. Verificación

- [x] 6.1 Build/typecheck OK y preview local (`email:dev`) renderiza las 4 plantillas
- [x] 6.2 Probar localmente el endpoint del hook (firma válida → envío; firma inválida → 401)
- [ ] 6.3 Documentar pasos manuales de activación en prod (dashboard Supabase: crear hook HTTPS + secret; setear `SEND_EMAIL_HOOK_SECRET` en Vercel; verificar dominio Resend) y validar flujo de "olvidé contraseña" + signup
