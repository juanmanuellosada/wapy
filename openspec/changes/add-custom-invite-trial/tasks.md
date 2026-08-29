## 1. Base de datos

- [x] 1.1 Crear `supabase/migrations/039_whitelist_trial_days.sql`: `ALTER TABLE public.whitelist ADD COLUMN trial_days integer`, con `CHECK (trial_days IS NULL OR (trial_days BETWEEN 0 AND 365))` y un `COMMENT ON COLUMN` que aclare que es la duración pactada al invitar y que el reloj arranca al crear la tienda
- [x] 1.2 Aplicar la migración al proyecto de Supabase — **aplicada a prod 2026-08-29** (proyecto `gtiujuarwoatjekmljhn`, vía MCP). Verificado: columna `integer` nullable, constraint `whitelist_trial_days_range` presente, 11 filas existentes todas en NULL (sin backfill, caen al default)
- [x] 1.3 Regenerar `lib/supabase/types.ts` y verificar que `whitelist.Row` incluya `trial_days: number | null` — se editó a mano y luego se **contrastó contra el generador real** post-migración: el bloque `whitelist` coincide exactamente (mismo orden alfabético, mismo tipado en `Row`/`Insert`/`Update`)

## 2. Validación y escritura

- [x] 2.1 En `lib/admin/schemas.ts`, extender `addEmailSchema` con `plan: z.enum(['inicial','medio','pro'])` (default `'inicial'`) y `trial_days: z.coerce.number().int().min(0).max(365)` (default `TRIAL_DAYS`), con mensajes de error en español — usar `z.coerce` porque `FormData` entrega strings
- [x] 2.2 En `lib/admin/actions.ts`, hacer que `addWhitelistEntry` incluya `plan` y `trial_days` en el INSERT a `whitelist` (línea 56), tomándolos de `parsed.data`
- [x] 2.3 Verificar que el error de validación de Zod siga llegando a la UI por la rama `{ error: 'validation' }` existente, sin cambios en el tipo `AddResult`

## 3. Resolución del trial en el onboarding

- [x] 3.1 En `lib/onboarding/actions.ts`, sumar `trial_days` al `select` de la whitelist (línea 138)
- [x] 3.2 Cambiar el cálculo de `trialEndsAt` a la precedencia de tres escalones: `whitelist.trial_ends_at` → `now + (whitelist.trial_days ?? TRIAL_DAYS)` → nunca falla. **Usar `??`, no `||`**: con `||` un `trial_days = 0` caería silenciosamente al default de 7 y el caso "alta sin prueba" quedaría roto
- [x] 3.3 Actualizar el comentario de las líneas 142-143 para que describa la precedencia real

## 4. Formulario de alta

- [x] 4.1 En `app/admin/AddEmailForm.tsx`, agregar un `<select>` de plan (Inicial / Medio / Pro) y un `<input type="number" min="0" max="365">` de días de prueba, siguiendo el patrón visual y de accesibilidad del select de rol existente (label, `min-h-[44px]`, estados de foco, `disabled={isPending}`)
- [x] 4.2 Sumar `plan: 'inicial'` y `trial_days: TRIAL_DAYS` a `defaultValues` del `useForm` (línea 25) — sin esto, el `reset()` de la línea 54 deja los controles vacíos después de cada alta exitosa
- [x] 4.3 Agregar ambos campos al `FormData` en `onSubmit` (líneas 30-32)
- [x] 4.4 Renderizar los errores de validación de los campos nuevos con el mismo patrón `role="alert"` + `aria-describedby` que usa el campo de email
- [x] 4.5 Revisar que el layout `flex-col sm:flex-row` siga siendo usable con cuatro controles en vez de dos; si queda apretado en desktop, pasar el form a grid — se pasó a grid (email en fila propia, rol/plan/días/botón en `grid-cols-2 sm:grid-cols-4`)

## 5. Tabla de whitelist

- [x] 5.1 En `app/admin/WhitelistTable.tsx`, extender `formatTrial` para recibir también `trial_days`: cuando hay `trial_ends_at` mantiene el comportamiento actual (vence en / venció hace), y cuando `trial_ends_at` es nulo pero hay `trial_days` muestra la duración pactada (ej. "30 días al registrarse", "sin prueba" para 0). Sin esto, toda alta manual nueva se ve con "—" en la columna Trial
- [x] 5.2 Verificar que las filas viejas (ambas columnas nulas) sigan mostrando "—"

## 6. Verificación

- [x] 6.1 Agregar tests de la resolución de trial cubriendo los cuatro escenarios del spec de `subscription-billing`: sin datos → 7 días; `trial_days = 30` → 30 días desde la creación; `trial_ends_at` seteado → gana sobre `trial_days`; `trial_days = 0` → trial vencido al instante
- [x] 6.2 Correr `openspec validate add-custom-invite-trial --strict`, el linter y el type-check del proyecto — `openspec validate` y `tsc --noEmit` pasan; no hay linter configurado en el repo (sin ESLint instalado ni script `lint`), ver nota en el reporte
- [ ] 6.3 Probar en el navegador el recorrido completo: alta con 30 días y plan Pro → recibir el invite → registrarse → crear tienda → confirmar en `/admin/stores` que la tienda quedó con plan `pro` y trial a 30 días de la creación — **pendiente, requiere navegador y base migrada**
- [x] 6.4 Probar el alta sin tocar nada y confirmar que produce plan `inicial` y 7 días, igual que antes del cambio — cubierto por test unitario del schema (`lib/admin/schemas.test.ts`) y de `resolveTrialEndsAt` (`lib/onboarding/trial.test.ts`)
- [x] 6.5 Probar el rechazo de valores fuera de rango invocando la acción con `trial_days = 400` sin pasar por el navegador — cubierto a nivel de la validación Zod que usa la acción (`lib/admin/schemas.test.ts`); no se invocó `addWhitelistEntry` en sí porque requiere sesión de superadmin autenticada

## 7. Cierre

- [ ] 7.1 Al archivar, corregir a mano el header del requirement en `openspec/specs/subscription-billing/spec.md`: pasa de "Trial de 14 días para tiendas nuevas" a "Trial de tiendas nuevas con duración configurable" (OpenSpec 1.3.1 no acepta el bloque `RENAMED`, rompe el parseo del change)
- [ ] 7.2 Actualizar `.claude/memory/wapy-mercadopago-billing.md`, que todavía dice 14 días de trial
