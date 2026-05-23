## Why

Con el MVP cerrado, el cuello de botella se mueve a la **conversión**: la landing actual tiene un solo plan "Empezá gratis $0 para siempre" que no refleja el modelo real (suscripción pagada con whitelist gate), todos los CTAs van a anchors muertos (`#precios`, `#`), no hay forma de loguearse desde la landing, y faltan elementos clave para credibilidad (FAQ, mockup visual, social proof placeholder). Esta fase reemplaza la landing con un funnel de conversión real: dos planes con precio claro, lead capture form, panel de leads para que el superadmin apruebe/borre, y todos los CTAs conectados al flow productivo.

## What Changes

### Landing (visual + content)

- **Header**: agregar link "Ingresar" → `/login` (visible en desktop + mobile drawer).
- **Hero**: refinar copy de propuesta de valor, agregar mockup visual de mobile + WhatsApp recibiendo pedido (mockup estático, no demo real), CTA primario "Quiero mi tienda" → scroll a `#precios`.
- **HowItWorks**: revisar copy (3 pasos siguen vigentes), micro-pulido visual.
- **Features**: revisar y simplificar (sacar algún feature que no aplique al modelo whitelist + trial).
- **Pricing**: **reescribir completo**. Dos cards (Inicial + Pro), badges "14 días gratis · sin tarjeta", precios `$12.000 / mes` y `$20.000 / mes`, lista de features por plan, CTA "Quiero el Inicial" / "Quiero el Pro" que abre `<LeadFormModal>`.
- **FAQ (nueva)**: 6-8 preguntas tipo: "¿Cómo cobran?", "¿Puedo cancelar?", "¿Necesito saber programar?", "¿Cómo entran los pedidos?", "¿Qué pasa después del trial?".
- **Footer**: actualizar links (sacar dead anchors, agregar Login + WhatsApp de contacto).

### Lead capture

- **Tabla `leads`** nueva (migración 015): campos email, name, whatsapp, plan, status (`new` | `approved` | `declined`), approved_at, approved_by, notes, created_at.
- **`LeadFormModal` component**: form con email + nombre + whatsapp + plan (pre-seleccionado desde el botón clickeado). Submit → server action `createLead`.
- **Server action `createLead`**: zod validation → INSERT en leads → trigger mail a `juanmalosada01@gmail.com` via Resend con detalles del lead. Devuelve success genérico ("Te contactamos en menos de 24hs").

### Panel de leads en /admin

- **Refactor `/admin` a sub-routes**: `/admin` redirige a `/admin/leads`. Se agregan `/admin/leads/page.tsx` y `/admin/whitelist/page.tsx`. La gestión de whitelist actual se mueve al nuevo sub-route.
- **`/admin/leads`**: tabla con email, nombre, whatsapp, plan, hace cuánto, status badge, acciones (Aprobar / Borrar).
- **Server action `approveLead({ id })`**: 
  - Crea row en `whitelist` con (email, grant_role='owner', plan, trial_ends_at = NOW() + 14 days).
  - UPDATE leads SET status='approved', approved_at, approved_by.
  - Dispara `sendInviteEmail` (reuso del helper de Fase 1).
- **Server action `deleteLead({ id })`**: DELETE row.

### Whitelist extension

- **Migración 016**: ALTER TABLE whitelist ADD COLUMN `plan text CHECK (plan IN ('inicial', 'pro'))` + `trial_ends_at timestamptz`. Ambas nullable (el row del superadmin seedeado no necesita backfill).
- El `/admin/whitelist` también muestra estas nuevas columnas en la tabla (plan badge + "trial vence en X días").

## Capabilities

### New Capabilities

- `lead-capture`: el flow completo de captura de leads desde la landing (form, validación, persistencia, mail al superadmin), y la gestión desde `/admin/leads` (aprobar que dispara whitelist + invite mail, o borrar).
- `landing-content`: la estructura y comportamiento de la landing pública — header con login, hero con value prop y mockup, pricing con 2 planes y trial, FAQ section, footer actualizado, todos los CTAs conectados al flow real.

### Modified Capabilities

- `superadmin-whitelist` (de Fase 3): el panel `/admin` se reorganiza en sub-routes (`/admin/leads`, `/admin/whitelist`). Las acciones de whitelist (add, re-invite, remove) se mantienen idénticas pero ahora viven en `/admin/whitelist`. Nuevas columnas `plan` y `trial_ends_at` visibles en la tabla.
- `data-model` (de Fase 1): nueva tabla `leads`. `whitelist` gana dos columnas (`plan`, `trial_ends_at`).

## Impact

- **DB**: 2 migraciones nuevas (015, 016). Sin breaking changes (tablas/columnas agregadas).
- **Deps**: ninguna nueva. Resend ya está, react-hook-form ya está, zod ya está.
- **Nuevo código**:
  - `lib/leads/{schemas,actions}.ts` — schemas zod + server actions (createLead, approveLead, deleteLead).
  - `app/components/LeadFormModal.tsx` — modal client con form, abierto desde Pricing.
  - `app/components/FAQ.tsx` — section nueva.
  - `app/admin/leads/page.tsx` + `app/admin/leads/LeadsTable.tsx` + `app/admin/leads/LeadRowActions.tsx` — panel de leads.
  - `app/admin/whitelist/page.tsx` + componentes movidos del `/admin/page.tsx` actual.
- **Código modificado**:
  - `app/components/{Header,Hero,HowItWorks,Features,Pricing,Footer}.tsx` — refactor para hooks reales.
  - `app/admin/page.tsx` — pasa a ser redirect a `/admin/leads`.
- **Mail**: nuevo template "Nuevo lead en Wapy" (inline en `lib/leads/actions.ts`).
- **Trial enforcement**: documentado como out-of-scope MVP — los `trial_ends_at` se guardan pero no hay billing automático. El usuario cobra manualmente al vencer.

## Out of scope (post-MVP)

- Billing real (MercadoPago, Stripe). El trial es solo mensaje + tracking.
- Trial countdown visible en `/dashboard` ("Te quedan X días").
- Detección automática de trial vencido + downgrade a paused.
- Testimonios reales (placeholder hasta tener clientes).
- A/B testing del copy del hero.
- Analytics de lead conversion rate.
- Newsletter signup.
- Live chat / widget de soporte en landing.
- /pricing standalone page.
- SEO meta tags optimizados para landing (genéricos por ahora).
- Tienda demo real seedeada en prod (decidimos NO seedear; mockup visual en hero alcanza).
