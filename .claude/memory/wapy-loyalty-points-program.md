---
name: wapy-loyalty-points-program
description: Decisiones de diseño del programa de puntos/fidelización de Wapy, acordadas 2026-08-19 antes de escribir la propuesta.
metadata:
  type: project
---

Programa de recompensas tipo greenpoints.club para Wapy. Decidido en conversación el 2026-08-19, **antes** de existir el change de OpenSpec. Se decidió partirlo en dos: primero `fix-whatsapp-order-lifecycle` (prerequisito), después el programa de puntos.

**Decisiones cerradas:**
- Registro del comprador **opcional**, con formulario + email vía Supabase Auth + Resend. Se descartó OTP por teléfono: SMS y WhatsApp Business API cuestan plata por mensaje, y Supabase Auth + Resend ya están cableados.
- Cuenta **global de Wapy** (sirve en todas las tiendas), **saldo de puntos por tienda**. Resuelve el arranque en frío: una tienda que prende el programa ya tiene clientes con cuenta.
- Compra anónima **no acumula** puntos y **no hay reclamo retroactivo**.
- Canje = **descuento variable** (los puntos valen plata, tope % por pedido). Se descartó catálogo de premios para v1.
- Canje habilitado en **ambos canales**, con reserva al crear la orden y débito al confirmar.
- **Otorgamiento manual** de puntos por la dueña, con motivo y autor obligatorios (cubre reclamos, compensaciones y campañas).
- Disponible **solo en plan Pro**.
- Orden de descuentos: promo → tramos por cantidad → cupón → **puntos al final**. Lo pagado con puntos no genera puntos.
- Ledger **append-only**, saldo = suma de asientos, nunca campo mutable. Con `idempotency_key` como ya hace `orders`.
- Fuera de v1: niveles, referidos, catálogo de premios, puntos por acciones no-compra.

**Los dos problemas técnicos que el design tiene que resolver:**
1. `handle_new_user()` exige whitelist para toda alta en Supabase Auth, y `public.users.role` es CHECK `owner|superadmin`. Los compradores no entran ahí. Inclinación: identidad de comprador separada de `public.users`.
2. El canje **debe** recalcularse server-side en los dos canales. Hoy el cupón en WhatsApp acepta el `discount_amount` calculado por el cliente ("trust is acceptable" porque la dueña cumple a mano) — con puntos eso sería robo de saldo.

Ver [[wapy-whatsapp-order-lifecycle]] para el prerequisito. Relacionado: [[wapy-quantity-price-tiers]], [[wapy-promo-price]], [[wapy-supabase-pkce-gotcha]] (los mails de confirmación de compradores chocan con el mismo gotcha).
