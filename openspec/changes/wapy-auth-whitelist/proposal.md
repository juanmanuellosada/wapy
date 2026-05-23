## Why

La Fase 1 dejó el schema, las RLS policies y los helpers de Supabase/Resend listos, pero no hay forma de que un dueño de tienda se registre, inicie sesión, o sea identificado por el servidor. Sin auth, las próximas tres fases (superadmin, onboarding, dashboard) no tienen punto de partida. Esta fase entrega el camino completo desde "te llegó un invite" hasta "estás logueado dentro del panel correspondiente a tu rol", con la whitelist como única vía de entrada y sin pedir confirmación de mail extra (el invite ya prueba la propiedad del mail).

## What Changes

- **Páginas nuevas**: `/signup` (con `?token=` opcional para prefill), `/login`, `/forgot-password`, `/reset-password` (callback de Supabase Auth), `/onboarding` (placeholder "Pronto" hasta Fase 4), `/admin` (placeholder hasta Fase 3), `/logout` (route handler POST).
- **Auth flows** end-to-end con Supabase Auth (email + password, sin OAuth, sin magic link).
- **Whitelist gate en server action**: antes de crear el usuario en Supabase Auth, validamos que el email esté en `whitelist`, que el invite no haya vencido (TTL = 7 días desde `invited_at`), y que no esté ya registrado.
- **Auto-login post-signup**: deshabilitamos la confirmación de mail de Supabase (el invite ya cumple esa función). El usuario queda logueado apenas setea password.
- **Middleware de protección de rutas**: `/onboarding/*`, `/dashboard/*`, `/admin/*` exigen sesión activa; sin sesión → redirect a `/login`. `/admin/*` exige `role='superadmin'`; si no, redirect a `/onboarding`.
- **Post-login routing por rol**: `owner` → `/onboarding`, `superadmin` → `/admin`. Si el usuario ya tiene tienda creada (Fase 4+), futuras fases redirigen a `/dashboard` en su lugar; en Fase 2 todavía no aplica.
- **Refresh de sesión via middleware**: el middleware refresca cookies de Supabase en cada request para mantener la sesión viva.
- **Invite emails**: el helper `sendInviteEmail()` (creado en Fase 1) se vuelve invocable desde un endpoint server-only — todavía sin UI para gatillarlo (eso es Fase 3); por ahora se prueba con un script o disparado a mano desde Supabase Studio para validar el flow end-to-end.
- **Migración 013**: `REVOKE EXECUTE` de `whitelist_check_email` (ya no se llama desde el cliente — la validación corre server-side con el admin client). Esto cierra el último advisor warning de Fase 1.
- **Manual user actions** (documentadas, no ejecutadas): apagar "Confirm email" en Supabase Auth settings; agregar `https://wapy.com.ar/reset-password` y `http://localhost:3000/reset-password` a Redirect URLs.

## Capabilities

### New Capabilities
- `auth-flows`: signup, login, logout, password reset, y la validación whitelist+TTL que gatea el signup. Cubre todas las interacciones user-facing de autenticación.
- `session-routing`: middleware que protege rutas privadas, refresca cookies de sesión, y enruta post-login según el rol del usuario.

### Modified Capabilities
- `data-model`: la función `whitelist_check_email` deja de ser pública (REVOKE EXECUTE). La validación de signup ahora corre en server actions vía admin client, no por RPC.

## Impact

- **Nuevas deps**: ninguna — `@supabase/supabase-js`, `@supabase/ssr`, `resend` y `zod` ya están en Fase 1.
- **Nuevo código**: `app/(auth)/{signup,login,forgot-password,reset-password}/page.tsx` + components; `app/onboarding/page.tsx` (placeholder); `app/admin/page.tsx` (placeholder); `app/api/auth/logout/route.ts`; `middleware.ts` (root); `lib/auth/actions.ts` (server actions); `lib/auth/validation.ts` (whitelist+TTL check) — usa el admin client de Fase 1.
- **DB**: migración 013 (1 REVOKE statement).
- **Supabase Auth settings**: documentar dos cambios manuales (desactivar confirm-email, agregar redirect URLs). Sin esto, el flow no funciona pero el build sí pasa.
- **Estilo**: pages con `ui-ux-pro-max`, paleta y tipografía consistentes con la landing actual (Vibrant & Block-based del commit `b5083ee`). Forms con validación cliente (zod via `react-hook-form` o nativo) + mensajes de error específicos por causa (no whitelisted / expirado / ya registrado).
- **Datos**: no se modifica ningún seed. La whitelist sigue teniendo solo el row del superadmin.
- **Seguridad**: server actions corren con admin client (bypass RLS) para validar y crear sesión; service role nunca llega al cliente. Errores genéricos al usuario (no "this email is not in whitelist" — eso revela información; en su lugar, "no podemos crear tu cuenta con este mail").
