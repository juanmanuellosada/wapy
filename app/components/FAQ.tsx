'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const faqs = [
  {
    question: '¿Cómo cobran la suscripción?',
    answer:
      'Te facturamos la suscripción a Wapy por transferencia bancaria o MercadoPago al terminar el trial de 7 días. Sin cargo automático a tarjeta, sin sorpresas. Si no querés continuar, no hacés nada. (Esto es aparte del checkout que usan tus clientes para pagar sus compras en tu tienda.)',
  },
  {
    question: '¿Mis clientes pueden pagar online con Mercado Pago?',
    answer:
      'Sí. Wapy integra el checkout de Mercado Pago para que tus clientes paguen con tarjeta de crédito, débito o efectivo directo en tu tienda — sin salir de ella. Está disponible en todos los planes. Para activarlo, conectás tu cuenta de Mercado Pago desde el panel de configuración de tu tienda.',
  },
  {
    question: '¿Puedo crear cupones de descuento?',
    answer:
      'Sí. Desde el panel podés crear códigos de descuento con porcentaje (ej. 15% OFF) o monto fijo (ej. $500 de descuento). A cada cupón le podés poner fecha de expiración, límite de usos y monto mínimo de compra. Están disponibles en todos los planes.',
  },
  {
    question: '¿Puedo cancelar en cualquier momento?',
    answer:
      'Sí, sin permanencia ni penalidades. Si cancelás dentro del trial gratuito, no se te cobra nada. Si ya pagaste el mes, el acceso continúa hasta que se venza.',
  },
  {
    question: '¿Necesito saber programar?',
    answer:
      'Para nada. Te invitamos por mail, completás 6 pasos simples en tu panel (nombre, logo, productos, secciones, WhatsApp y publicar), y tu tienda queda online. Sin código, sin hosting, sin nada técnico.',
  },
  {
    question: '¿Cómo entran los pedidos?',
    answer:
      'Tus clientes navegan tu tienda, arman el carrito, y al hacer clic en "Comprar" se abre WhatsApp en su celular con el pedido pre-escrito hacia tu número. Vos lo recibís como cualquier mensaje. Así de simple.',
  },
  {
    question: '¿Qué pasa al terminar el trial de 7 días?',
    answer:
      'Te avisamos por mail unos días antes. Si querés seguir, nos mandás el pago y listo, tu tienda continúa sin interrupciones. Si no, tu tienda se pausa automáticamente y podés retomar cuando quieras.',
  },
  {
    question: '¿Cuántas tiendas puedo tener?',
    answer:
      'Una tienda por usuario. Si tenés varios negocios o marcas, contactanos a hola@wapy.com.ar y vemos cómo ayudarte con acceso multi-tienda.',
  },
  {
    question: '¿Puedo usar mi propio dominio?',
    answer:
      'Por ahora todas las tiendas viven en wapy.com.ar/tu-nombre. El custom domain propio está en la roadmap. Si es una prioridad para vos, escribinos y lo anotamos.',
  },
  {
    question: '¿Cobran comisión por cada venta?',
    answer:
      'No. Pagás el plan mensual y listo. Los pedidos los procesás vos por WhatsApp sin intermediarios. Wapy no ve ni toca el dinero de tus ventas.',
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  function toggle(index: number) {
    setOpenIndex((prev) => (prev === index ? null : index));
  }

  return (
    <section
      id="faq"
      className="py-20 md:py-28 px-4 sm:px-6 bg-[#FBF7EC]"
    >
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <span className="inline-block px-4 py-1.5 rounded-full bg-[#16222E]/8 text-[#16222E]/70 text-sm font-bold mb-5">
            Preguntas frecuentes
          </span>
          <h2
            className="text-3xl md:text-4xl font-bold text-[#16222E]"
            style={{ fontFamily: 'var(--font-agbalumo)' }}
          >
            Lo que todos preguntan
          </h2>
        </div>

        {/* Accordion */}
        <div className="space-y-3">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={faq.question}
                className="bg-white rounded-2xl border border-[#16222E]/8 overflow-hidden shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => toggle(index)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${index}`}
                  id={`faq-trigger-${index}`}
                  className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left cursor-pointer hover:bg-[#FBF7EC]/60 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#F5C84B]"
                >
                  <span className="font-bold text-[#16222E] text-sm sm:text-base">
                    {faq.question}
                  </span>
                  <ChevronDown
                    className={`w-5 h-5 text-[#16222E]/50 flex-shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                </button>

                {isOpen && (
                  <div
                    id={`faq-answer-${index}`}
                    role="region"
                    aria-labelledby={`faq-trigger-${index}`}
                    className="px-6 pb-5"
                  >
                    <p className="text-[#16222E]/65 text-sm leading-relaxed">{faq.answer}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
