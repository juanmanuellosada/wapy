---
name: wapy-mp-known-gaps
description: "Gaps del checkout Mercado Pago — auditados 2026-06-29, IMPLEMENTADOS en working tree 2026-07-01 (pendiente: aplicar migración 033 a prod + commit/push)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 3c7fb841-858d-40a5-9a97-640656238d0b
---

Auditoría del flujo de checkout Mercado Pago hecha el 2026-06-29 (3 agentes read-only). El happy path (conexión OAuth, refresh de token, llegada del pago por webhook) estaba OK. Los 16 gaps de borde fueron **implementados el 2026-07-01** (build verde, en working tree; falta commit/push).

**Qué se arregló:** stock ahora se repone en rechazo/cancelación/expiración/reembolso (modelo reserva+reposición); nuevos estados `refunded`/`charged_back`/`in_mediation`/`in_process` en `orders.payment_status` (migración 033) + mapeo y reversión en webhook; `status`→confirmed al aprobar (`confirmOrderOnApproval`); guard cross-store en webhook; guard de suscripción en `startCheckout` (`isPubliclyAvailable`); idempotencia por `idempotency_key`; cupón en MP se cuenta al aprobar (no al crear); desconexión atómica; reconciliación de monto; redondeo exacto de cupón; validación MP al publicar; email al aprobar (Resend); cron `/api/cron/expire-orders`; $0 bloqueado en MP; carrito preservado en failure.

**PENDIENTE OPERATIVO:** aplicar `supabase/migrations/033_mp_order_lifecycle.sql` a prod (manual, Studio/MCP) ANTES/junto al deploy — si no, el webhook viola el CHECK y los inserts con idempotency_key fallan. El cron nuevo necesita `CRON_SECRET` (ya usado por check-subscriptions). Cambios de comportamiento: cupón contado al aprobar en MP, stock repuesto en cancelaciones. Relacionado: [[wapy-mp-checkout-strategy]].
