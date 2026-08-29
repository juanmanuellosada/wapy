## Context

El alta de personas en Wapy tiene dos caminos que convergen en la misma tabla `whitelist`:

- **Camino A (lead):** landing → `leads` → superadmin aprueba en `/admin/leads` → `approveLead` (`lib/leads/actions.ts:95-174`) inserta la fila **con** `plan` (el que eligió el lead) y `trial_ends_at` (calculado como `now + TRIAL_DAYS`).
- **Camino B (alta manual):** superadmin en `/admin/whitelist` → `addWhitelistEntry` (`lib/admin/actions.ts:37-85`) inserta la fila **solo** con `email` y `grant_role`.

Después, al crear la tienda, `lib/onboarding/actions.ts:137-159` lee la whitelist por email y resuelve `plan` y `trial_ends_at`. El camino B siempre cae al default (`inicial`, 7 días) porque no hay nada que leer.

La constante `TRIAL_DAYS = 7` vive en `lib/subscription/constants.ts:2` y es el único punto de configuración del sistema. Todo el acceso a `whitelist` va por admin client (service role); el trigger `prevent_billing_column_writes` de la migración 027 protege columnas de `stores`, no de `whitelist`, así que no hay obstáculo de permisos.

Restricción temporal relevante: `INVITE_TTL_DAYS = 7` (`lib/auth/validation.ts:4`). Entre que se invita a alguien y que se registra pueden pasar hasta 7 días.

## Goals / Non-Goals

**Goals:**
- Que el superadmin pueda pactar plan y duración de prueba en el momento del alta manual, sin tocar la base de datos.
- Que "N días de prueba" signifiquen N días de uso real, no N días desde la invitación.
- Retrocompatibilidad estricta: un alta que no toque los controles nuevos debe producir el mismo resultado observable que hoy, y las filas de whitelist ya existentes no deben cambiar de comportamiento.
- Corregir la deriva de la spec de billing (dice 14 días, el código usa 7 desde `2a7d3c4`).

**Non-Goals:**
- Ajustar la duración al aprobar un lead (`/admin/leads` sigue con `TRIAL_DAYS` fijo).
- Editar el trial de una tienda ya creada desde `/admin/stores`. La única palanca sobre tiendas existentes sigue siendo la exención, que es binaria.
- Cablear `whitelist.checkout_mode`. La columna existe desde la migración 032 y no la escribe nadie; sigue siendo deuda conocida.
- Cambiar el valor de `TRIAL_DAYS`. Sigue siendo 7 y sigue siendo el default global.

## Decisions

### Guardar días, no fecha

Se agrega `whitelist.trial_days` (integer, nullable) en vez de reusar `whitelist.trial_ends_at`.

`approveLead` calcula `trial_ends_at = now + TRIAL_DAYS` **en el momento de aprobar**. Copiar ese patrón en el alta manual sería una regresión: como el invite dura hasta 7 días, alguien invitado con la duración default que se registra el día 6 llegaría con 1 día de prueba. Hoy eso no pasa, justamente porque el alta manual deja el campo nulo y el reloj arranca al crear la tienda.

Guardar la cantidad de días preserva esa semántica y hace que el número que el superadmin escribe en el formulario sea el número de días que la persona efectivamente va a tener.

*Alternativa descartada — escribir `trial_ends_at` al invitar:* no requiere migración, pero introduce la regresión descrita y hace que el valor mostrado en la UI dependa de cuándo se registre la persona.

*Alternativa descartada — date picker con la fecha de vencimiento:* tampoco requiere migración y da control total, pero obliga al superadmin a hacer la aritmética en cada alta y sufre el mismo problema de anclaje si la persona demora en registrarse.

### Precedencia de tres escalones en el onboarding

`lib/onboarding/actions.ts` resuelve el trial así:

```
trial_ends_at  = whitelist.trial_ends_at
              ?? now + (whitelist.trial_days ?? TRIAL_DAYS) días
```

`trial_ends_at` va primero para no romper el camino de leads ni las ediciones manuales en base que ya se hayan hecho. `trial_days` es el escalón nuevo. `TRIAL_DAYS` queda como piso.

Como ambas columnas son nullable y no hay backfill, toda fila existente cae al tercer escalón — exactamente lo que hace hoy.

### `0` es un valor válido

Cero días significa "alta sin prueba": `trial_ends_at` queda igual al momento de creación de la tienda, el estado derivado no es `trial`, y el cron la bloquea en su próxima corrida si no hay suscripción. Es un caso de uso legítimo (alguien que ya acordó pagar desde el día uno) y sale gratis.

El uso de `??` en la precedencia es deliberado: con `||`, un `trial_days = 0` caería silenciosamente al default de 7. Es el error más fácil de cometer en este cambio.

### Rango 0–365, validado en dos capas

Zod valida en el server action y un CHECK constraint lo respalda en la base. La validación del navegador (`min`/`max` en el input) es conveniencia, no garantía: el server action es invocable directamente.

`FormData` entrega todo como string, así que el schema necesita `z.coerce.number().int()` — no basta con `z.number()`.

### El plan por defecto sigue siendo `inicial`

Es el mismo valor al que cae hoy `lib/onboarding/actions.ts:157` cuando la whitelist no dice nada. Preseleccionarlo mantiene el resultado idéntico para quien no toque el control.

## Risks / Trade-offs

- **Un `||` en lugar de `??` rompe el caso de 0 días** → la precedencia debe usar coalescencia nula explícita, y el escenario "alta sin prueba" del spec existe precisamente para cubrirlo con un test.

- **Divergencia entre el camino manual y el de leads** → tras este cambio, dos filas de whitelist pueden expresar el trial de dos formas distintas (`trial_ends_at` vs `trial_days`). La precedencia lo resuelve sin ambigüedad, pero `app/admin/WhitelistTable.tsx` tiene que saber mostrar ambas: una fecha de vencimiento cuando hay `trial_ends_at`, y una duración pactada ("30 días") cuando hay `trial_days`. Si solo lee `trial_ends_at`, las altas manuales nuevas se van a ver vacías en la columna Trial.

- **El header del requirement de billing sigue diciendo "14 días"** → el cuerpo queda corregido a 7, pero OpenSpec exige que el header de un `MODIFIED` coincida exactamente con el existente, y el bloque `RENAMED` rompe el parseo del change en la versión instalada (1.3.1). El nombre se corrige a mano en `openspec/specs/subscription-billing/spec.md` al archivar.

- **`whitelist.trial_days` no tiene efecto retroactivo** → cambiar el valor después de que la persona ya creó su tienda no hace nada, porque `stores.trial_ends_at` ya está escrito. Es coherente con el alcance acordado (no hay edición de trial de tiendas existentes), pero conviene que la UI no sugiera lo contrario.

- **Deriva de tipos** → `lib/supabase/types.ts` es generado. Si no se regenera tras la migración, el INSERT con `trial_days` no compila.

## Migration Plan

1. Migración `039_whitelist_trial_days.sql`: `ALTER TABLE public.whitelist ADD COLUMN trial_days integer` + `CHECK (trial_days IS NULL OR (trial_days >= 0 AND trial_days <= 365))`. Sin backfill.
2. Regenerar `lib/supabase/types.ts`.
3. Desplegar código. Es compatible hacia atrás en ambos sentidos: el código viejo ignora la columna nueva, y el código nuevo trata `NULL` como "usar el default".
4. Rollback: revertir el deploy. La columna puede quedar; es nullable y nadie más la lee.

## Open Questions

- Ninguna bloqueante. El anclaje del trial (días vs. fecha) y el alcance (solo alta manual, plan + trial, sin `checkout_mode`) quedaron acordados antes de escribir este diseño.
