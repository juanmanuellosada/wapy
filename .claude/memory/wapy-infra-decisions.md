---
name: wapy-infra-decisions
description: "Decisiones arquitectónicas fundacionales de Wapy (auth, storage, routing, infra) confirmadas con el usuario el 2026-05-23 al arrancar el producto real."
metadata: 
  node_type: memory
  type: project
  originSessionId: 9367fb09-3813-4586-ab7c-c818d86748d6
---

Decisiones tomadas al transicionar Wapy de demo a producto real (2026-05-23).

**Stack**
- Next.js App Router (ya existente), Vercel deploy.
- Supabase Pro ($25/mes, org "Juanma's Pro") para DB + Auth + Storage.
- Resend para mails transaccionales (org del usuario ya existente).
- Dominio prod: `wapy.com.ar` (recién comprado en NIC.ar, falta DNS a Vercel).

**Auth**
- Supabase Auth nativo (email/password con confirmación).
- Roles: columna `role` en tabla `users` con valores `owner` | `superadmin`.
- Mail del superadmin inicial: `juanmalosada01@gmail.com` (semillado en bootstrap).

**Storage**
- Supabase Storage. Buckets: `product-images`, `store-logos`.

**Routing público**
- Tiendas en raíz: `wapy.com.ar/[slug]`.
- Slugs reservados: `admin`, `dashboard`, `signup`, `login`, `api`, `onboarding`, `forgot-password`, `_next`, etc.
- Slug editable desde panel con historial → 301 redirects desde slugs viejos.

**Data model (alto nivel)**
- 1 dueño ↔ 1 tienda (MVP).
- Tablas: `users`, `stores`, `sections`, `products`, `whitelist`, `slug_history`.

**Whitelist**
- Superadmin agrega mails desde `/admin`.
- Al agregar, Resend dispara invite con link a `/signup?token=...` (from: `Wapy <hola@wapy.com.ar>`).

**Tienda demo actual**
- `lib/stores.ts` y `/store/[slug]` se borran en la Fase 6 (migración a DB).
- El JSON se preserva como seed/template para preview durante onboarding.
- El CTA "ver tienda demo" sale de la landing en la Fase 1.

**Estados de tienda**
- `draft` durante onboarding → `published` al completar → `paused` si se despublica desde el panel.
- Producto sin stock se muestra como "Agotado" (no se oculta).

**Infra workflow**
- Migraciones SQL versionadas en `/supabase/migrations/`, aplicadas vía MCP de Supabase con confirmación previa del usuario.
- Una branch git por fase (`feat/wapy-infra-bootstrap`, etc.) → PR → merge a main. Vercel arma preview por branch.
- Región Supabase: `sa-east-1` (São Paulo).

**Out of scope MVP**
- Billing / planes pagos para dueños de tienda.
- Multi-tienda por dueño.
- OAuth social (solo email/password).
- Analytics / dashboard de orders.

Relacionado: [[wapy-project-state]], [[wapy-phased-roadmap]].
