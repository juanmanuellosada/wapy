---
name: wapy-mp-checkout-strategy
description: "Decisión de producto — MP (checkout del comprador) y cupones son capabilities transversales a todos los planes, no un tier nuevo"
metadata: 
  node_type: memory
  type: project
  originSessionId: 3c7fb841-858d-40a5-9a97-640656238d0b
---

Decidido 2026-06-29: el **checkout con Mercado Pago** (que el comprador pague online) y los **cupones de descuento** son capabilities **transversales a los 3 planes** (inicial/medio/pro), NO un plan/tier nuevo ni gateadas a Medio/Pro.

**Why:** los planes ya se diferencian por *tamaño de catálogo* (productos/secciones/imágenes/variantes); cobrar online es una necesidad ortogonal. Gatear MP no genera revenue (en v1 no se cobra comisión propia), solo suprime adopción de la feature más pegajosa. Variantes SÍ sigue gateada (inicial sin variantes).

**How to apply:** copy de landing/pricing debe decir "MP y cupones en cualquier plan". El `checkout_mode` (whatsapp/mercadopago) es self-service vía `setCheckoutMode` (ya existía), no atado al plan.

Cambios hechos esta sesión (ver git): modo de cobro movido de la whitelist del admin → onboarding del dueño (`StepWhatsapp`); en checkout MP solo nombre+email obligatorios (teléfono y dirección opcionales); botón de aviso WhatsApp al dueño en `/checkout/success` tras pago aprobado; **fix de bug**: cupones no se aplicaban en checkout MP (se cobraba sin descuento) — ahora se validan server-side y reprecian los mp_items; tabla de comisiones MP + simulador en el panel de settings. Relacionado: [[wapy-mercadopago-billing]] (suscripción del dueño, distinto del checkout del comprador), [[wapy-project-state]].
