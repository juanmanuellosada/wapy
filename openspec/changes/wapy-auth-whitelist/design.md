## Context

Fase 1 dejó el cimiento: schema, RLS, trigger `handle_new_user` que crea `public.users` con el `role` correcto cuando Supabase Auth inserta un `auth.users`, y los helpers `lib/supabase/{client,server}.ts` + `lib/resend.ts`. Pero no hay una sola página de auth, ni middleware, ni forma real de loguearse. Sin eso, las próximas tres fases no arrancan. Esta fase es el "lift-off" del producto: el primer momento en que un humano (en producción, vos primero como superadmin seedeado) puede crear sesión y entrar al sistema.

La constraint clave: **la única vía de entrada es la whitelist**. No hay signup público — eso es invariante. La validación se hace server-side con el admin client (bypass RLS) en una server action, no expone la tabla, y devuelve mensajes de error específicos para cada caso de rechazo.

## Goals / Non-Goals

**Goals**

- Permitir signup, login, logout, y password reset con Supabase Auth.
- Bloquear signup de cualquier email que (a) no esté en `whitelist`, o (b) tenga un invite vencido (>7 días desde `invited_at`), o (c) ya esté registrado.
- Auto-login al completar signup — sin confirmar mail por separado. El invite ya prueba la propiedad del mail.
- Proteger rutas privadas (`/onboarding`, `/dashboard`, `/admin`) con middleware. Anónimo → redirect a `/login`.
- Enrutar post-login según rol: `owner` → `/onboarding`, `superadmin` → `/admin`. Pages destino son placeholders en esta fase.
- Refrescar cookies de Supabase en cada request para mantener la sesión viva sin tener que reloguear.
- Diseño consistente con la landing (Vibrant & Block-based, paleta navy/crema/amarillo, font pairing actual), construido con `ui-ux-pro-max`.

**Non-Goals**

- UI del superadmin para gestionar whitelist y disparar invites → Fase 3 (`wapy-superadmin-panel`). En Fase 2, los invites se prueban llamando a `sendInviteEmail()` manualmente desde un script o desde Supabase Studio.
- Onboarding wizard con autosave → Fase 4. En Fase 2, `/onboarding` muestra "Pronto" o "Estamos preparando tu tienda".
- Dashboard real → Fase 5. `/dashboard` no existe todavía en Fase 2.
- OAuth (Google, GitHub) → fuera de scope MVP.
- 2FA / MFA → post-MVP.
- Account settings page → post-MVP.
- Email templates personalizadas en Supabase (el mail de reset password sale con la template default de Supabase por ahora — funcional pero genérico).

## Decisions

### 1. Whitelist + TTL validation: server action con admin client, no RPC

La función `whitelist_check_email` de Fase 1 era accesible desde anon vía PostgREST RPC. En Fase 2 esa exposición se revoca: el chequeo corre dentro de una server action (`lib/auth/validation.ts`) que usa el admin client (service role) para leer `whitelist` directamente.

Razones:

- **Encapsula toda la lógica en un solo lugar**: la server action puede chequear no-whitelisted, expirado, ya-registrado, token-inválido, todo de una. La función SQL era más limitada.
- **Reduce superficie de ataque**: no se necesita que anon pueda llamar a ninguna RPC para validar el flow.
- **Cierra el último advisor warning** de Fase 1.

**Alternativa considerada**: extender la función SQL con más campos (`is_expired`, `is_registered`). Rechazada — la lógica de negocio queda mejor en TS, donde es testeable, debuggeable, y los mensajes de error pueden ser i18n-friendly.

### 2. Auto-login post-signup: confirm email desactivado en Supabase Auth

Por default Supabase manda un mail "click para confirmar tu cuenta" después de signup. En Wapy ese paso es redundante: el usuario llegó porque le mandamos un invite por Resend con un token único; eso ya valida que controla el mailbox. Pedirle un segundo mail genera fricción y duplica notificaciones.

**Acción manual**: en Supabase Auth settings, desactivar "Confirm email". Esto no se puede hacer vía migración SQL — es config del proyecto.

**Documentación del setting**: `tasks.md` lo lista como step manual del usuario antes del PR merge.

**Trade-off**: si en el futuro abrimos signup sin whitelist (p.ej. acceso por dominio, demo público), tendremos que volver a prender la confirmación. Aceptable.

### 3. Email + password (sin magic link)

El SaaS lo van a usar dueños de tienda que probablemente loguean desde múltiples dispositivos (PC en la oficina, celular en el local). Password les da control directo sin depender de acceder al mail cada vez.

**Alternativa considerada**: magic link como default. Rechazada — UX peor para casos de uso recurrente (login varias veces por día), y la mayoría de la gente espera password en una app de comercio.

**Reset password**: Supabase tiene flow nativo. Pedís reset → manda mail con link a `/reset-password?token=...` → desde ahí setea nueva password.

### 4. Server actions sobre API routes

Next.js 15+ permite hacer el signup/login con server actions (`'use server'`). Esto es más simple que API routes: el cliente llama a la función como si fuera local, server la ejecuta, devuelve un resultado. Hay form support nativo con progressive enhancement.

**Alternativa considerada**: API routes (`/api/auth/signup` etc). Más explícito pero más verbose y sin form-action support out-of-the-box.

Para `logout`, que necesita borrar cookies, va como route handler POST (`app/api/auth/logout/route.ts`) — más simple porque no necesita devolver datos.

### 5. Middleware en `middleware.ts` con `@supabase/ssr`

Next.js middleware (file `middleware.ts` en la raíz del repo) corre en cada request matching un `matcher`. Lo usamos para:

1. **Refresh de cookies de Supabase**: `@supabase/ssr` provee un helper que lee las cookies actuales, las refresca si están por expirar, y las re-escribe en la response.
2. **Protección de rutas**: si la URL matchea `/onboarding`, `/dashboard`, `/admin` y no hay sesión, redirect a `/login?redirect=<url-original>`.
3. **Routing por rol**: si la URL matchea `/admin` y el usuario tiene `role != 'superadmin'`, redirect a `/onboarding`.

**Matcher**: lista explícita de paths protegidos para no correr middleware en assets estáticos:

```ts
export const config = {
  matcher: ['/onboarding/:path*', '/dashboard/:path*', '/admin/:path*']
}
```

**Trade-off**: el middleware hace una llamada a Supabase Auth en cada request matched para validar la sesión. Latencia agregada ~50-100ms. Aceptable para rutas privadas (no afecta la landing ni storefronts públicos).

### 6. Validación de forms: zod + react-hook-form, server-side también

Cliente: `react-hook-form` + `zod` schemas para validación inmediata (formato de email, password mínimo 8 chars, etc.).

Servidor: las server actions repiten la validación con los mismos zod schemas. Cliente nunca es confiable — esta es la defensa real.

**Schema compartido**: `lib/auth/schemas.ts` exporta `signupSchema`, `loginSchema`, `forgotPasswordSchema`, `resetPasswordSchema`. Importable desde cliente (sin secretos) y desde server.

### 7. Mensajes de error: específicos pero seguros

Per signup, distinguimos:

- `not_whitelisted` → "Este mail no está invitado. Pedí un invite al admin de tu tienda."
- `expired` → "Tu invite venció. Pedile al admin que te re-envíe."
- `already_registered` → "Ya existe una cuenta con este mail. ¿Querés [iniciar sesión]?"
- `invalid_token` → "El link de invite es inválido. Pedí uno nuevo al admin."

**Por qué específicos para signup**: el set de emails invitados es chico y privado-ish (no es un sistema público); revelar "no estás invitado" tiene valor UX > riesgo de enumeración. La tabla `whitelist` no es leakeable directo.

Para login y password reset, **mensajes genéricos**: "Mail o contraseña incorrectos", "Si existe una cuenta con ese mail, te mandamos un link para resetear". Aquí sí es importante no permitir enumeración de cuentas registradas.

### 8. `/onboarding` y `/admin` placeholders

Páginas mínimas que muestran:

- Hero card con texto "Estamos preparando tu panel" / "Pronto vas a poder gestionar tu tienda".
- Mail del usuario logueado (read desde session).
- Botón "Cerrar sesión".
- Estilo consistente con la landing.

**Para el superadmin** (`/admin`): también mínimo. "Pronto: gestionar whitelist". El superadmin no necesita un panel funcional en Fase 2 — solo confirmar que el routing por rol funciona.

### 9. Logout via POST + redirect

`app/api/auth/logout/route.ts` exporta un `POST` handler que llama a `supabase.auth.signOut()` (que borra cookies) y devuelve un redirect a `/`. El botón "Cerrar sesión" en `/onboarding` y `/admin` es un `<form action="/api/auth/logout" method="POST">` con un `<button>`. Sin JavaScript necesario — progressive enhancement gratis.

## Risks / Trade-offs

- **Risk**: Si me olvido de desactivar "Confirm email" en Supabase Auth settings, el flow rompe — el usuario crea cuenta pero queda en estado "no confirmado" y no puede loguear. → **Mitigación**: poner el step manual al inicio de `tasks.md` con un check explícito post-cambio: "registrar una cuenta de prueba y confirmar que entra directo a `/onboarding`".
- **Risk**: La validación TTL es client-time-sensitive — `Date.now() > invited_at + 7d`. Si el clock skew del server difiere mucho de la DB, casos borderline fallarían. → **Mitigación**: la comparación se hace en TS sobre el `invited_at` que devuelve la DB; ambos comparten el clock del runtime. Para más rigor podríamos hacer la comparación SQL-side (`SELECT invited_at + interval '7 days' > now()`), pero TS es suficiente para 7 días.
- **Risk**: Server actions corren en Node runtime (no Edge). Fluid Compute las cubre, pero las cold starts pueden añadir latencia en la primera invocación. → **Mitigación**: Vercel keep-warm + el form de signup no es path crítico (se usa una vez por usuario).
- **Risk**: La política de password (min 8 chars, sin requirements de complejidad) es relajada. → **Mitigación**: Supabase Auth tiene built-in protections (rate-limit, bcrypt). 8 chars + bcrypt es suficiente para MVP; podemos elevar requirements post-MVP si vemos casos de abuso.
- **Risk**: El middleware corre en cada request a rutas protegidas y consulta Supabase Auth. Si Supabase Auth tiene downtime, todo el área privada cae. → **Mitigación**: aceptable para SLA de Supabase (99.9%); en Fase 5+ podemos cachear claims del JWT para reducir dependencia.
- **Trade-off**: Mensajes específicos en signup pueden revelar quiénes están invitados. Aceptable por el contexto (sistema chico, invites controladas, no hay incentivo de enumeration attack).
- **Trade-off**: Auto-login skip de email confirm acepta que el invite token es prueba suficiente de propiedad del mail. Si un token leakea (mail interceptado), el atacante puede registrarse y robar la cuenta. **Mitigación parcial**: TTL de 7 días reduce ventana; en Fase 3 el superadmin podrá ver/regenerar tokens.

## Migration Plan

Solo una migración nueva.

**Apply order**:

1. Aplicar migración `013_revoke_whitelist_check.sql` vía Supabase MCP (REVOKE EXECUTE en `whitelist_check_email` para anon y authenticated). Verificar con `get_advisors --type security`: el warning de `whitelist_check_email` desaparece.
2. Implementar TS: schemas, server actions, middleware, pages.
3. Manual: en Supabase dashboard, desactivar "Confirm email" en Auth → Sign In / Sign Up. Y agregar `https://wapy.com.ar/reset-password` + `http://localhost:3000/reset-password` a Auth → URL Configuration → Redirect URLs.
4. Smoke test local:
   - Levantar `npm run dev`.
   - Ir a `/signup`, ingresar `juanmalosada01@gmail.com` + password nuevo.
   - Confirmar redirect a `/admin` (porque mi mail tiene `grant_role='superadmin'`).
   - Logout, volver a `/login`, mismo mail + password, confirmar entrada de nuevo.
   - Probar `/forgot-password` → llega mail de Supabase con link → setea nueva password.
5. Smoke test prod (post-merge): mismo flow contra `https://wapy.com.ar`.

**Rollback strategy**:

- DB: revertir el REVOKE con un GRANT — trivial.
- Código: PR-level revert.
- Supabase Auth setting: re-prender "Confirm email" en el dashboard si surge necesidad.

## Open Questions

- **¿Necesitamos rate-limit explícito en server actions de signup/login?** Supabase Auth ya rate-limita (~30 req/min por IP en signup). Probablemente suficiente para MVP. Si vemos abuso, agregamos rate-limit en middleware con Upstash Redis.
- **¿La página `/admin` para superadmin debería mostrar al menos los stats básicos del DB (cuántos owners registrados, cuántas tiendas published, etc.)?** Sería útil pero suma scope. Recomendación: dejar puramente placeholder con "Pronto", agregar stats en Fase 3 cuando armemos la UI de whitelist.
- **¿`/onboarding` para owner debería mostrar el mail de la persona que lo invitó?** Curiosidad UX pero requiere FK adicional o JSON en whitelist. Defer.
