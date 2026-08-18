---
name: wapy-supabase-pkce-gotcha
description: @supabase/ssr fuerza PKCE hardcodeado; los links de auth por email no pueden depender del hash ni del code verifier
metadata:
  type: reference
---

`@supabase/ssr` fija `flowType: "pkce"` **hardcodeado** en `createBrowserClient.js` y `createServerClient.js` (dentro de `node_modules`). No es configurable desde el proyecto ni desde el panel de Supabase.

Dos consecuencias que costaron un bug en producción (recupero de contraseña roto para todos los usuarios, arreglado el 2026-08-15 en el commit `9402082`):

1. **Nunca busques el token en `window.location.hash`.** Con PKCE, Supabase redirige con `?code=` como query param; `#access_token=` es del flujo implícito y no va a aparecer jamás. Una pantalla que valide por hash rechaza links perfectamente válidos.

2. **El code verifier de PKCE vive en una cookie del navegador donde se inició el flujo.** Para links enviados por email eso rompe el caso real más común: pedir el reset en la compu y abrir el mail en el celular. El síntoma es `"PKCE code verifier not found in storage"`.

**La solución correcta para links por email en apps con `@supabase/ssr`** es no usar el `/auth/v1/verify` de Supabase: armar el link hacia una ruta propia que reciba `token_hash` + `type` y llame a `verifyOtp` del lado del servidor. No necesita code verifier y funciona desde cualquier dispositivo. En Wapy eso vive en `app/auth/confirm/route.ts`.

Truco de diagnóstico: los logs de auth de Supabase (`source = 'auth_logs'`) distinguen con precisión si el token se verificó bien. Un `/verify` con `status 303` y evento `login` significa que el link funcionó y el problema está aguas abajo, en la pantalla de destino.

Relacionado: [[wapy-resend-email-system]], [[wapy-storage-jwt-gotcha]].
