## Context

Fase 2 dejó el middleware que protege `/admin/*` con guard de role + el placeholder de `/admin` mostrando "Pronto: gestión de whitelist". El helper `sendInviteEmail()` de Fase 1 está wireado pero nunca se llamó desde código real. Esta fase es el primer panel funcional del producto y la primera vez que mandamos un mail transaccional desde Wapy.

El usuario de este panel es siempre el superadmin (solo `juanmalosada01@gmail.com` por ahora). UX puede ser pragmática, no necesita ser tan pulida como las pages públicas — pero sí consistente visualmente con el resto y accesible.

## Goals / Non-Goals

**Goals**

- Permitir al superadmin agregar emails a la whitelist desde una UI, con invite mail automático.
- Mostrar el estado actual de cada invitación (invitado pendiente / registrado / expirado).
- Permitir re-invitar (regenerar token + resetear TTL + reenviar mail).
- Permitir quitar de la whitelist (sin tocar auth.users).
- Garantizar que solo superadmins puedan invocar las server actions, incluso si alguien intentara hacer un curl directo bypaseando el middleware.

**Non-Goals**

- Bulk add (CSV import, paste multi-line) — agregar uno por vez es suficiente para MVP.
- Búsqueda / filter / paginación — la lista crece despacio; <100 rows es trivial de renderear.
- Edición de role post-creación — si te equivocaste, quitás y volvés a agregar.
- Stats agregadas (#owners, #tiendas) — Fase 3 alternativa post-MVP.
- Logs de auditoría (quién agregó/removió a quién) — útil con múltiples superadmins; con uno solo es over-engineering.
- Notificaciones in-app cuando alguien se registra — defer.

## Decisions

### 1. Una sola page server-side + componentes mixtos

`/admin/page.tsx` es un Server Component que: hace `requireSuperadmin()`, lee la whitelist con admin client, y renderiza la UI completa. Los componentes interactivos (form, action buttons) son Client Components que invocan server actions.

Estructura:

```
app/admin/
├── page.tsx                  Server Component: auth check, fetch data, layout
├── WhitelistTable.tsx        Server Component: renderea filas (recibe data como prop)
├── AddEmailForm.tsx          Client Component: form con react-hook-form
└── RowActions.tsx            Client Component: botones Re-invite + Remove con confirmación
```

`revalidatePath('/admin')` al final de cada server action mutativa para refrescar la tabla.

### 2. Status derivado en cliente, no almacenado

El status de cada row (`invited` / `registered` / `expired`) se computa a partir de `registered_at` e `invited_at + 7 days`:

```ts
function getStatus(row: WhitelistRow): 'registered' | 'expired' | 'invited' {
  if (row.registered_at) return 'registered'
  const expiresAt = new Date(row.invited_at).getTime() + 7 * 24 * 60 * 60 * 1000
  if (Date.now() > expiresAt) return 'expired'
  return 'invited'
}
```

Sin schema change. Si después queremos índices o queries optimizados por status, lo añadimos.

### 3. Server actions con guard helper compartido

`lib/admin/actions.ts` exporta:

- `addWhitelistEntry({ email, grant_role })`
- `reinviteEntry({ id })`
- `removeWhitelistEntry({ id })`

Cada una empieza con:

```ts
async function requireSuperadmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('UNAUTHORIZED')
  const { data: row } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (row?.role !== 'superadmin') throw new Error('FORBIDDEN')
  return { user, supabase }
}
```

Sin guard → la action throwea → Next.js devuelve 500 al cliente. El middleware ya filtró la mayoría, esto es defense in depth.

### 4. Add + send invite es atómico

El server action `addWhitelistEntry`:

1. Verifica que el email no esté ya en whitelist (lower-cased).
2. INSERT en `whitelist` (el trigger `whitelist_lowercase_email_trigger` ya lowercasea, el `invite_token` se genera automático).
3. Lee el `invite_token` que se generó.
4. Llama a `sendInviteEmail({ to: email, token, inviteUrl: NEXT_PUBLIC_APP_URL + '/signup?token=' + token })`.
5. Si el step 4 falla, **no roll-backea el INSERT** — el row queda creado, el superadmin puede hacer Re-invite para reintentar el mail.
6. revalidatePath('/admin'), redirect a /admin para limpiar el form.

**Trade-off**: si el mail falla silenciosamente (Resend timeout, dominio no verificado, etc.), el superadmin ve el row creado pero el invitado no recibe nada. La UI debería surface ese error claramente. Para v1, capturamos el error de `sendInviteEmail` y lo retornamos en el resultado del action como `{ ok: true, mail_sent: false, mail_error: '...' }`.

### 5. Re-invite regenera token y resetea TTL

`reinviteEntry`:

1. Verifica que el row exista y `registered_at IS NULL` (no podés re-invitar a alguien ya registrado).
2. UPDATE: `invite_token = encode(gen_random_bytes(32), 'hex')`, `invited_at = NOW()`. Esto reinicia los 7 días.
3. Lee el nuevo token.
4. Llama a `sendInviteEmail()` con el token nuevo.
5. revalidatePath.

### 6. Remove pide confirmación cliente-side

`RowActions` muestra el botón "Quitar" con un confirm dialog (nativo `window.confirm()` para MVP — sin librería de modal). Solo si OK, llama a `removeWhitelistEntry({ id })`.

El action solo DELETEs la row de `whitelist`. NO toca `auth.users` (eso requiere otro tipo de operación). Si el usuario ya se había registrado, sigue logueado y puede seguir usando su cuenta — solo perdió la capacidad de re-registrarse con ese email si alguien borra su `auth.users` row.

### 7. Mensajes de error y validación

- Email duplicado al agregar → "Este mail ya está en la whitelist".
- Email inválido (regex) → validation client + server con zod.
- Re-invite a registered user → server action bloquea + UI muestra "Ya está registrado, no se puede re-invitar".
- Remove → confirm "¿Seguro que querés quitar X de la whitelist? Si todavía no se registró, perderá acceso al invite link."
- Si `sendInviteEmail` falla → toast/alert "Invite agregado pero el mail no se envió: <error>. Probá Re-invitar."

### 8. Diseño visual: tabla simple, dense, scannable

- Tabla full-width, filas con padding compacto.
- Status como badge color-coded: verde (registered), amarillo (invited), rojo (expired).
- Fechas en formato relativo ("hace 2 días") via `Intl.RelativeTimeFormat`.
- Actions a la derecha, alineadas. Re-invite icon + texto, Remove con tachito/X.
- Add form arriba en una card destacada con border accent.
- Layout: navbar simple con "Wapy Admin" + email del logged user + logout. Sin sidebar (MVP, una sola sección).

Usar `ui-ux-pro-max` para colores y micro-interactions.

## Risks / Trade-offs

- **Risk**: `sendInviteEmail` falla pero el row se crea. El superadmin no se da cuenta y el invitado nunca recibe el mail. → **Mitigación**: surface el error claramente en la response del action y en la UI; el botón Re-invite siempre disponible para reintentar.
- **Risk**: Race condition si dos superadmins (futuro) agregan el mismo mail al mismo tiempo. → **Mitigación**: el UNIQUE constraint en `whitelist.email` lo previene; el segundo INSERT falla con un error que la UI puede traducir a "ya existe".
- **Risk**: Re-invite genera nuevo token pero el viejo token sigue siendo "válido" en el sentido que `validateWhitelistSignup` verifica el token actual de la DB — entonces el viejo deja de funcionar automáticamente. ✓ Sin riesgo real (el sistema invalida el viejo al sobrescribirlo).
- **Risk**: Remove de un user ya registrado deja datos huérfanos (la persona sigue logueada). → **Aceptable**: la whitelist es solo para signup gating; tener una row en `users` sin row en `whitelist` es válido. Si querés revocar acceso real, hay que deshabilitar el user en Supabase Auth (manual).
- **Trade-off**: Sin paginación. Si la whitelist crece a 500+ rows, la página se vuelve lenta. → Para MVP es fine; la lista crece despacio (vos invitando manualmente).
- **Trade-off**: Sin búsqueda/filter. Mismo argumento que paginación — agregar cuando duela.
- **Trade-off**: Sin audit log. Si en el futuro hay varios superadmins, perderemos visibilidad de "quién agregó/removió qué". Migrar a una tabla de eventos cuando sea necesario.

## Migration Plan

- Sin migración SQL nueva. Schema existente es suficiente.
- Smoke test post-implementación (local):
  1. Login como superadmin (`juanmalosada01@gmail.com`).
  2. Ir a `/admin`. Ver tu propio row con status "registered".
  3. Agregar un email de prueba (alguno de tus alias, p.ej. `juanmalosada01+test1@gmail.com`).
  4. Confirmar que llega el invite mail al inbox.
  5. Click en el link del mail → debería abrir `/signup?token=...` con email prefilled.
  6. Completar signup → confirmar redirect a `/onboarding`.
  7. Logout, volver al `/admin` con el superadmin, confirmar que el row del nuevo user ahora dice "registered".
  8. Probar Re-invite en un row pending → confirmar que llega un mail nuevo.
  9. Probar Remove en un row pending → confirmar que desaparece de la tabla.

## Open Questions

- **¿La columna de "fecha" debe mostrar `invited_at` o `created_at`?** Actualmente el schema solo tiene `invited_at`. Si re-invitamos, `invited_at` se resetea — perdés el "agregado el". Podríamos agregar `created_at` separado en una migración pequeña. Recomendación: agregarlo en Fase 4 cuando ya tengamos más data y la necesidad sea concreta.
- **¿El superadmin se puede invitar a sí mismo accidentalmente?** El email ya está en la whitelist (seed), entonces el INSERT falla con UNIQUE constraint — UI muestra "ya existe". Caso resuelto sin lógica especial.
- **¿Deberíamos mostrar el invite token en la UI para "copy link" manual?** Útil si Resend está caído o si querés mandar el link por WhatsApp. Defer — agregar si pide concretamente.
