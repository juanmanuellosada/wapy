// Ejecutar con: npx vitest run proxy.test.ts
//
// Tests de acceso del deep link de WhatsApp (spec: order-confirmation-workflow,
// requisito "Deep link al pedido desde el mensaje de WhatsApp", tarea 5.5,
// escenario "La dueña abre el link sin sesión").
//
// proxy() en sí necesita un NextRequest real (cookies, headers) para ejercer
// todo el flujo; lo que este test aísla es la única pieza nueva: que el
// destino de login preserva el query string (`?order=<uuid>`) y no solo el
// pathname, que es lo que rompía el retorno al pedido tras loguearse.

import { describe, it, expect } from 'vitest';
import { buildLoginRedirectTarget } from './proxy';

describe('buildLoginRedirectTarget', () => {
  it('preserva ?order=<uuid> para volver al pedido después de loguearse', () => {
    expect(buildLoginRedirectTarget('/dashboard/orders', '?order=123e4567-e89b-12d3-a456-426614174000')).toBe(
      '/dashboard/orders?order=123e4567-e89b-12d3-a456-426614174000'
    );
  });

  it('sin query string devuelve solo el pathname, como antes', () => {
    expect(buildLoginRedirectTarget('/dashboard', '')).toBe('/dashboard');
  });
});
