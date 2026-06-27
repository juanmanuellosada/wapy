## ADDED Requirements

### Requirement: CTA de pago con Mercado Pago en el carrito drawer
Cuando la tienda opera en modo `mercadopago` (con conexión MP válida), el carrito/drawer del storefront SHALL ofrecer un CTA para pagar online con Mercado Pago en lugar del handoff a WhatsApp. Cuando la tienda opera en modo `whatsapp`, el comportamiento actual del carrito SHALL permanecer sin cambios.

#### Scenario: Modo Mercado Pago muestra el CTA de pago
- **WHEN** el comprador abre el carrito en una tienda en modo `mercadopago` con conexión válida
- **THEN** el drawer ofrece pagar con Mercado Pago y procede al formulario de datos del comprador

#### Scenario: Modo WhatsApp mantiene el comportamiento actual
- **WHEN** el comprador abre el carrito en una tienda en modo `whatsapp`
- **THEN** el drawer mantiene el handoff a WhatsApp / "Compartí tu pedido" sin cambios

#### Scenario: CTA oculto con carrito vacío
- **WHEN** el carrito está vacío
- **THEN** no se muestra el CTA de pago
