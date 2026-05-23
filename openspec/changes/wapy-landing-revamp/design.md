## Context

El MVP de 6 fases cerró el loop técnico end-to-end. La landing actual quedó como "MVP placeholder" — funcional pero no construida para conversión real. Esta fase es la primera con foco explícito en producto-mercado: cómo se ve, qué dice, y cómo convierte la página principal. El éxito de esta fase no es código que funciona — es cuántos leads entran y cuántos convertimos.

La constraint crítica: **no hay billing automático**. El trial de 14 días es promesa de marketing + tracking interno; el cobro lo hace el dueño (vos) manualmente. Esto significa que el approve flow en `/admin/leads` no genera invoice ni descuento de tarjeta — solo crea acceso. Es OK para MVP pero hay que ser explícito sobre la limitación.

## Goals / Non-Goals

**Goals**

- Reemplazar la landing por una página de conversión real con dos planes claros + lead form + trial.
- Permitir que un visitante anon haga lead capture en <1 minuto (form 4 campos).
- Notificar al superadmin (mail + panel `/admin`) en tiempo real cada lead nuevo.
- Permitir al superadmin aprobar (crea whitelist + dispara invite) o borrar en un click.
- Conectar todos los CTAs de la landing al flow real (signup, login, pricing).
- Mantener consistencia visual con el resto del producto (navy/cream/yellow + Agbalumo).

**Non-Goals**

- Billing automático / cobro recurrente → post-MVP.
- Detección automática de trial vencido → post-MVP.
- Testimonios reales / case studies → cuando haya clientes.
- A/B testing → post-MVP.
- SEO ranking → genérico por ahora.
- Tienda demo real seedeada en prod → mockup visual en hero alcanza.
- /pricing standalone page → sección anchored basta.

## Decisions

### 1. Lead capture: form de 4 campos en modal

Trade-off conversión vs. data quality. 4 campos (email, nombre, WhatsApp, plan) es el balance del usuario: suficiente para contactarlo por mail O WhatsApp + saber qué plan le interesa. Modal en lugar de inline form: mantiene la landing scannable; el modal aparece on-demand cuando el visitor está listo.

**Alternativa considerada**: 2 campos (email + plan). Rechazada — pierde el canal WhatsApp que es nativo del producto. Si el lead te da su WhatsApp ya entendió que ese es el medio de contacto.

**Implementación**: `<LeadFormModal>` es Client Component con `react-hook-form` + `zod`. Abierto desde Pricing cards via prop callback. Plan se pre-selecciona según qué card disparó la apertura. Submit calls `createLead` server action.

### 2. Trial: solo mensaje + tracking, NO automation

`trial_ends_at` se guarda en `whitelist` row cuando el superadmin aprueba un lead. Esto sirve para:
- Que el superadmin sepa la fecha exacta en que debe cobrar (o en que el trial venció).
- Futuro: agregar countdown visible en `/dashboard` ("Te quedan 5 días de trial").
- Futuro: cron job que detecta trial vencido + downgrade automático.

Para esta fase **NO** se hace nada de eso. El owner usa el sistema sin restricción durante el trial. Si pasa el día 14 y no pagó, vos manualmente cambiás el status de su tienda a `paused` desde `/admin/whitelist` (o desde la dashboard de la tienda con un toggle nuevo — defer).

**Trade-off**: alguien puede aprovechar el trial sin pagar nunca. Mitigation: bajo volumen MVP, vos podés trackear manualmente. Cuando el producto escale, se agrega billing real.

### 3. Trial start date: al aprobar el lead, NO al primer login

Cuando el superadmin aprueba un lead → `whitelist.trial_ends_at = NOW() + 14 days`. El reloj arranca acá, no cuando el owner se logueea.

**Razones**:
- Más simple (un solo evento dispara el reloj).
- Empuja al owner a actuar rápido (si tarda 5 días en registrarse, ya queman 5 del trial).
- Si fuera al primer login, owners que reciban el invite pueden esperar semanas y romper el flujo de cobro mensual.

**Alternativa considerada**: arrancar al primer login. Más generoso pero peor para tu flujo de cobranza.

### 4. Schema: nueva tabla `leads` + extensión de `whitelist`

```sql
-- Migración 015
CREATE TABLE public.leads (
  id            uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  email         text NOT NULL,
  name          text NOT NULL,
  whatsapp      text NOT NULL,  -- E.164 or normalized
  plan          text NOT NULL CHECK (plan IN ('inicial', 'pro')),
  status        text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'approved', 'declined')),
  approved_at   timestamptz,
  approved_by   uuid REFERENCES public.users(id),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT NOW()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leads_superadmin_all" ON public.leads FOR ALL ... ;
CREATE INDEX leads_status_idx ON public.leads(status);
CREATE INDEX leads_created_at_idx ON public.leads(created_at DESC);

-- Migración 016
ALTER TABLE public.whitelist
  ADD COLUMN plan text CHECK (plan IN ('inicial', 'pro')),
  ADD COLUMN trial_ends_at timestamptz;
```

**Decisión**: NO UNIQUE en `leads.email`. El mismo mail puede llegar varias veces (cambió de opinión, perdió el mail anterior, etc.). El status de la última lead manda. Si están aprobados ya, approveLead detecta duplicado al INSERT en whitelist y muestra error.

**`approved_by`**: opcional pero útil para auditoría cuando haya >1 superadmin. Por ahora siempre seás vos.

**`notes`**: text libre para el superadmin (ej. "este mail rebotó, contactar por WhatsApp").

### 5. Mail al superadmin: simple HTML inline

`createLead` después de INSERT llama a un helper `sendNewLeadEmail({ lead })` (en `lib/leads/actions.ts`, no en `lib/resend.ts` porque es específico de esta feature).

Template inline:

```
Asunto: 🆕 Nuevo lead en Wapy: {name}

Hola Juanma,

Te llegó un lead nuevo:

Nombre: {name}
Email: {email}
WhatsApp: {whatsapp}
Plan: {plan === 'inicial' ? 'Inicial ($12.000)' : 'Pro ($20.000)'}

Para aprobar o borrar: https://wapy.com.ar/admin/leads
```

From: `Wapy <hola@wapy.com.ar>`. To: `juanmalosada01@gmail.com` (hardcoded — el único superadmin por ahora).

**Si en el futuro hay múltiples superadmins**: query `users WHERE role='superadmin'` y mandar a todos. Defer.

### 6. /admin sub-routes split

Hoy `/admin/page.tsx` es la tabla de whitelist directamente. Esta fase:

- `/admin/page.tsx` → server component, redirect a `/admin/leads` (default).
- `/admin/leads/page.tsx` → nueva, panel de leads.
- `/admin/whitelist/page.tsx` → componentes actuales movidos acá.
- `/admin/_components/AdminNav.tsx` → tabs/pills con 2 items (Leads | Whitelist) reusados en ambas sub-pages.

**Por qué split sub-routes y no state-based tabs**: URLs refresheables + shareables ("dame el link de la lead X" = `wapy.com.ar/admin/leads`). Patrón usado ya en `/onboarding/[step]` y `/dashboard/[section]`.

**Layout**: ambas sub-pages comparten el mismo header (Wapy Admin + email + logout). Extraemos a `app/admin/_components/AdminShell.tsx`.

### 7. Approve flow detail

`approveLead({ id })` server action:

1. `requireSuperadmin()` (helper de Fase 3).
2. SELECT lead WHERE id=$1 AND status='new'. Si no existe o status != 'new', return `{ error: 'invalid_state' }`.
3. Check si lead.email ya está en whitelist (lowercased). Si sí, return `{ error: 'already_whitelisted', message: 'Este mail ya estaba invitado' }`.
4. INSERT en whitelist:
   - email (lowercased)
   - grant_role = 'owner'
   - plan = lead.plan
   - trial_ends_at = NOW() + interval '14 days'
   - (invite_token se genera automático por default, invited_at = NOW())
5. UPDATE leads SET status='approved', approved_at=NOW(), approved_by=auth.uid() WHERE id=$1.
6. Disparar `sendInviteEmail({ to: lead.email, token: <generated>, inviteUrl: ${NEXT_PUBLIC_APP_URL}/signup?token=... })`.
7. revalidatePath('/admin', 'layout').
8. Return `{ ok: true, mail_sent: boolean, mail_error?: string }`.

Si el step 6 falla, el row de whitelist queda creado y la UI muestra el warning (consistente con `addWhitelistEntry` de Fase 3 que tiene el mismo patrón).

### 8. Delete vs Decline

Decisión: solo "Borrar" botón. Borrar = DELETE row de leads. Tampoco hay "Declined" status visible en UI por ahora.

**Por qué no Decline**: en MVP, los leads "que no me convencieron" son ruido visual en la tabla — borrarlos es más limpio. Si en el futuro querés trackear "rechazados" para análisis, agregamos el status visible y un botón Decline. Por ahora simplifica.

### 9. Pricing card design: 2 cards lado a lado, Pro destacado

```
┌─────────────────────┐  ┌─────────────────────┐
│ INICIAL             │  │ PRO  ⭐ MÁS POPULAR │
│ $12.000 /mes        │  │ $20.000 /mes        │
│ 14 días gratis      │  │ 14 días gratis      │
│                     │  │                     │
│ ✓ 15 productos      │  │ ✓ Productos sin lím │
│ ✓ 3 secciones       │  │ ✓ Secciones sin lím │
│ ✓ Tu dominio       │  │ ✓ Tu dominio       │
│ ✓ Pedidos WhatsApp  │  │ ✓ Pedidos WhatsApp  │
│ ✓ Panel de control  │  │ ✓ Panel de control  │
│                     │  │ ✓ Soporte prioritario│
│ [Quiero el Inicial] │  │ [Quiero el Pro]     │
└─────────────────────┘  └─────────────────────┘
```

Mobile: stack vertical, Pro on top con badge. Desktop: 2 columnas centradas, Pro con border destacado y badge "Más popular" arriba.

Trial badge dentro de cada card: pequeño "14 días gratis · sin tarjeta" debajo del precio.

### 10. Hero: mockup visual en lugar de demo

El hero actual probablemente tiene un mockup o ilustración. Para esta fase:

- **Copy refinado**: Headline "Tu tienda online + WhatsApp en 5 minutos" (o variación), sub "Sin programar. Sin pagos integrados. Tus pedidos llegan a tu WhatsApp como si fueran de un amigo." (refinar).
- **CTA primario**: "Quiero mi tienda" → scroll a `#precios`.
- **CTA secundario** (opcional): "Ver cómo funciona" → scroll a `#como-funciona`.
- **Mockup**: lado derecho/abajo un mockup composite — un mobile phone mostrando una storefront + una bubble de WhatsApp arriba con el pedido pre-armado. Asset estático (PNG o SVG) en `/public/landing/`. Si no hay diseño existente, hacer una versión simple con `<div>` + `<img>` placeholders.
- **NO "Ver demo" link** porque no hay demo (la tienda demo de prod no existe; seedearla está out of scope).

### 11. FAQ section: 6-8 preguntas comunes

Bajo Pricing, antes de Footer. Componente colapsable (accordion) accesible.

Preguntas propuestas (refinar copy):

1. "¿Cómo cobran?" → "Te facturamos por transferencia o MercadoPago al final del trial. Sin tarjeta automática por ahora."
2. "¿Puedo cancelar?" → "Cuando quieras. Sin permanencia. Si cancelás dentro del trial, no se te cobra nada."
3. "¿Necesito saber programar?" → "No. Te invitamos por mail, completás 6 pasos en tu panel, y tu tienda queda online."
4. "¿Cómo entran los pedidos?" → "Tus clientes arman el carrito y al hacer clic en 'Comprar' se abre WhatsApp en su celular con el pedido pre-escrito hacia tu número."
5. "¿Qué pasa al terminar el trial?" → "Te avisamos por mail unos días antes. Si no querés seguir, no hacés nada y tu tienda se pausa. Si seguís, pagás y todo continúa."
6. "¿Cuántas tiendas puedo tener?" → "Una por usuario. Si tenés varios negocios, contactanos para multi-tienda."
7. "¿Puedo usar mi propio dominio?" → "Por ahora todas las tiendas viven en `wapy.com.ar/tu-nombre`. Custom domain está en la roadmap."
8. "¿Cobran comisión por venta?" → "No. Pagás el plan mensual y listo. Los pedidos los procesas vos por WhatsApp, sin intermediarios."

Accordion behavior: solo uno abierto a la vez (estándar UX). Click en pregunta abre/cierra.

### 12. Footer cleanup

Actual: links a anchors muertos + legal en `#`. Esta fase:

- Navlinks: "Cómo funciona", "Funcionalidades", "Precios", "FAQ" → anchors reales.
- Legal: dejamos `#` por ahora (Términos y Privacidad reales son post-MVP, pero los anchors no rompen nada).
- Agregar: "Ingresar" → /login.
- Agregar: "Contacto" → mailto:hola@wapy.com.ar.

### 13. Header: Login link + sticky behavior

- Desktop: ítem "Ingresar" después del último nav link, antes del CTA "Quiero mi tienda".
- Mobile drawer: "Ingresar" como ítem regular.
- Login link → /login.
- Sticky behavior actual se mantiene.

### 14. Consistencia con `/dashboard` y `/admin`

La landing pública usa paleta navy/cream/yellow + Agbalumo. El dashboard y admin del owner usan la misma paleta. Al refactorizar componentes, mantener:
- Fonts: Agbalumo para headlines, body font actual.
- Colores: `#16222E` (navy), `#FBF7EC` (cream), `#F5C84B` (yellow).
- Rounded corners: `rounded-[2rem]` para cards principales, `rounded-full` para botones.
- Shadows: drop-shadows con tinte yellow.

## Risks / Trade-offs

- **Risk**: Lead form duplicado por gente que se equivoca de plan o pierde el mail. → **Mitigación**: superadmin ve todos los leads en cronológico. Si hay duplicados, borra los viejos y aprueba el último.
- **Risk**: Spam bots flooded leads. → **Mitigación leve**: el form pide WhatsApp (los bots no llenan WhatsApp válido por lo general). Si crece el spam, agregamos honeypot o CAPTCHA post-MVP. Vercel BotID también es opción.
- **Risk**: Olvidás cobrar al día 14 del trial. → **Mitigación**: `/admin/whitelist` muestra columna "trial vence en X días" + tu propio recordatorio. Futuro: mail automático a vos cuando faltan 3 días.
- **Risk**: El owner aprovecha trial repetido (cancela, crea otra cuenta con otro mail). → **Aceptable** en MVP. Si crece, validamos por WhatsApp o documento.
- **Risk**: El mail de "nuevo lead" se mezcla en tu inbox y perdés respuestas rápidas. → **Mitigación**: configurar filtro en Gmail con label "Wapy Leads" + el panel `/admin/leads` siempre disponible.
- **Trade-off**: Trial sin enforcement automático puede pisar tu margen. → Aceptable hasta tener ~50 owners; entonces vale la pena automatizar (billing + downgrade).
- **Trade-off**: Pricing alto vs Empretienda. → Posicionamos como "más simple y específico, sin features que no vas a usar". El copy del hero y FAQ tienen que reforzar este pitch.
- **Trade-off**: No /pricing standalone. → Si en futuro queremos compartir directamente la página de precios (ej. en un ad de Instagram), agregamos.

## Migration Plan

**Apply order** (DB):

1. Aplicar migración 015 (`leads` table) — verificar con `list_tables` y `get_advisors`.
2. Aplicar migración 016 (`whitelist.plan` + `trial_ends_at`) — verificar.
3. Regenerar TS types en `lib/supabase/types.ts`.

**Apply order** (código):

1. Commit 1: Migrations + types + `lib/leads/{schemas,actions}.ts`.
2. Commit 2: `<LeadFormModal>` + Pricing rewrite con CTAs reales.
3. Commit 3: Header con login link + Hero refinado + FAQ + Footer cleanup.
4. Commit 4: `/admin` sub-routes split + LeadsTable + acciones approveLead/deleteLead.
5. Commit 5: Cosméticos (HowItWorks copy, Features copy, mockup en hero).
6. Tasks.md update.

**Smoke test post-merge**:

1. Anon visit landing → ver 2 pricing cards con $12k/$20k + trial badge.
2. Click "Quiero el Inicial" → modal abre con plan preseleccionado.
3. Llenar form (mail real + WhatsApp real) → submit → mensaje success.
4. Verificar tu inbox → te llega mail "🆕 Nuevo lead en Wapy".
5. Como superadmin, login → `/admin` redirige a `/admin/leads`.
6. Ver el lead en la tabla con badge "new".
7. Click "Aprobar" → row pasa a "approved" → te llega invite al mail del lead.
8. Como ese mail (en navegador distinto/incógnito), click invite → `/signup?token=...` con email prefilled.
9. Completar signup → llegar a `/onboarding` (porque grant_role='owner').
10. Click "Borrar" en otro lead → desaparece de la tabla.
11. Verificar Header: link "Ingresar" abre `/login`.

## Open Questions

- **¿WhatsApp en form como E.164 obligatorio (con prefijo +54) o texto libre?** Recomendación: input con mask sugerida `+54 9 11 ...` pero validación tolerante (regex que acepte `11 1234 5678` y normalice a E.164 server-side). Esto reduce fricción.
- **¿El mail al superadmin incluye un botón "Aprobar" o "Ver lead" directo en el HTML?** Recomendación: solo link a `/admin/leads`. Botones de acción en mail (one-click approve) son power-user; con bajo volumen MVP no vale la pena.
- **¿`/admin/whitelist` mantiene el formulario actual de "Add manual" además de la sección de leads?** Recomendación: SÍ. Si en algún momento querés agregar un mail sin pasar por el lead form (ej. un amigo que conocés en persona), tenés que poder. Mantenemos `AddEmailForm` tal cual en `/admin/whitelist`.
