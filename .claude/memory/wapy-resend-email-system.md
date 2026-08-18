---
name: wapy-resend-email-system
description: Auth emails por Resend vía Send Email Hook de Supabase; el hook YA está activo y los links pasan por /auth/confirm con token_hash
metadata:
  type: project
---

Los emails de auth salen por Resend usando el Send Email Hook de Supabase, con plantillas react-email en `emails/` y el cliente centralizado en `lib/email/`. Endpoint del hook: `app/api/auth/send-email/route.ts`.

**El hook YA está activo en el dashboard de Supabase** (confirmado el 2026-08-15 en los logs de auth: `"msg":"Hook ran successfully","hook":"https://www.wapy.com.ar/api/auth/send-email"`). Esto corrige la nota anterior que lo daba por pendiente.

**El link del mail apunta a `/auth/confirm`, NO al `/auth/v1/verify` de Supabase.** Esto revierte la decisión original de "no hace falta /auth/confirm". La ruta valida el `token_hash` con `verifyOtp` server-side y deja la sesión en cookies. El motivo está en [[wapy-supabase-pkce-gotcha]]: con el verify de Supabase el flujo queda atado al dispositivo donde se pidió el reset.

`next` se sanitiza en `/auth/confirm` (debe empezar con `/` y no con `//`) para evitar open redirect. Todos los query params del link van con `encodeURIComponent`.

Relacionado: [[wapy-supabase-pkce-gotcha]], [[wapy-infra-decisions]].
