## Why

Hoy la única forma de que un email llegue a la whitelist es vía SQL directo en Supabase Studio. Eso fue suficiente para seedear al superadmin pero no escala — cada vez que querés sumar un dueño nuevo a Wapy tenés que escribir SQL a mano y luego mandar un mail por separado o esperar que el sistema lo invite por algún canal. Esta fase entrega el panel mínimo viable en `/admin` para que vos (como superadmin) puedas: ver quién está invitado, agregar mails nuevos (con invite mail automático vía Resend), re-invitar a quienes no se registraron, y quitar de la whitelist a quien ya no debería estar. Es el cierre del loop de onboarding administrativo.

## What Changes

- **`/admin` deja de ser placeholder y se vuelve panel real**: tabla de whitelist con columnas email, role, status (`invited` / `registered` / `expired`), fecha de invitación, fecha de registro, y acciones por fila.
- **Add form** arriba de la tabla: input de email + select de role (`owner` | `superadmin`) + botón "Invitar". Al submit, el server action crea el row en `whitelist` y dispara `sendInviteEmail()` (helper de Fase 1) automáticamente.
- **Re-invite action**: regenera el `invite_token`, resetea `invited_at` a `NOW()` (lo que reinicia el TTL de 7 días), y re-envía el mail vía Resend.
- **Remove action**: con confirmación, elimina el row de `whitelist`. NO toca `auth.users` ni `public.users` — si el usuario ya se había registrado, su sesión sigue activa (la whitelist es solo para gateo de signup, no de login).
- **Server actions con guard de superadmin**: cada action verifica que el caller tenga `role='superadmin'` además del check de middleware (defense in depth). Owners no pueden llamar estas actions ni siquiera por curl.
- **UI con `ui-ux-pro-max` skill**: estilo consistente con la landing y las pages de auth.

## Capabilities

### New Capabilities
- `superadmin-whitelist`: panel `/admin` para CRUD de la whitelist, server actions con guard de role, y triggering automático/manual de invite mails.

### Modified Capabilities

None. Las capabilities existentes (`data-model`, `mail-transport`, `session-routing`) ya soportan todo lo que esta fase necesita sin cambios.

## Impact

- **Nuevo código**: `app/admin/page.tsx` (re-escrita, deja de ser placeholder), `app/admin/WhitelistTable.tsx`, `app/admin/AddEmailForm.tsx`, `app/admin/RowActions.tsx`, `lib/admin/actions.ts`, `lib/admin/schemas.ts`.
- **Deps**: ninguna nueva — `react-hook-form`, `zod`, y los helpers de Supabase + Resend ya están.
- **DB**: sin cambios de schema. Las columnas `invited_at`, `invite_token`, `registered_at` de `whitelist` son suficientes. Re-inviting actualiza `invited_at` y regenera `invite_token` directamente vía admin client UPDATE.
- **Auth/sesión**: sin cambios. El middleware de Fase 2 ya restringe `/admin` a superadmins. Los server actions agregan un guard redundante (server-side) por defensa en profundidad.
- **Resend**: el helper `sendInviteEmail({ to, token, inviteUrl })` se invoca por primera vez desde código real (en Fase 2 ya estaba wireado pero sin trigger UI). El dominio `wapy.com.ar` ya está verificado en Resend, así que los mails efectivamente llegan.
- **Out of scope**: bulk add (varios mails de una), búsqueda/filter, paginación (no necesario hasta tener cientos de invites), edición de role post-creación (workaround: remover + re-agregar).
