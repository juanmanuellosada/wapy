---
name: wapy-resend-email-system
description: Sistema de email Resend con Send Email Hook de Supabase; activación del hook es un paso manual PENDIENTE en el dashboard
metadata: 
  node_type: memory
  type: project
  originSessionId: a693644c-0f95-44a8-9ce3-4c4276cb13bc
---

Change OpenSpec `add-resend-email-system` implementada (2026-06-27): todos los emails de auth (recovery, confirmación de signup) salen por Resend con plantillas react-email de marca, vía el **Send Email Hook** de Supabase. Código: endpoint `app/api/auth/send-email/route.ts` (verifica firma Standard Webhooks con `SEND_EMAIL_HOOK_SECRET`, dispatch por `email_action_type`, link a `/auth/v1/verify` preservando `redirect_to=/reset-password`), módulo `lib/email/` (cliente Resend único lazy + helpers), plantillas en `emails/`. Se eliminó `lib/resend.ts` y el cliente Resend duplicado de `lib/leads/actions.ts`. Reemplaza la capability `mail-transport` de [[wapy-infra-decisions]]. Cobro/billing relacionado en [[wapy-mercadopago-billing]].

**PENDIENTE (manual, sin esto siguen los mails genéricos de Supabase):**
1. Verificar dominio `wapy.com.ar` en Resend (si no estaba) + `RESEND_API_KEY` en Vercel.
2. Dashboard Supabase → Auth Hooks → crear "Send Email Hook" HTTPS apuntando a `https://<prod>/api/auth/send-email`, generar secret.
3. Setear `SEND_EMAIL_HOOK_SECRET` (formato `v1,whsec_...`) en Vercel.
4. Activar el hook y probar "olvidé contraseña" + signup en prod.
Rollback: desactivar el hook en el dashboard → Supabase vuelve a sus mails default sin redeploy.

**Out of scope (fase futura):** welcome email, confirmación/recibo de orden, notificación de nueva orden al dueño, recibos MercadoPago, lifecycle suscripción/trial. `lib/email` quedó diseñado para absorberlos sin re-arquitectura.

Estado: código verificado (typecheck limpio, 4 plantillas renderizan), NO archivada en OpenSpec todavía (task 6.3 = pasos manuales). Archivar con `/opsx:archive add-resend-email-system` cuando el hook esté activo y validado en prod.
