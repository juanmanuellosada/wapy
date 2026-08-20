import { describe, it, expect } from 'vitest';
import { buildOrderWhatsappMessage } from './buildMessage';

const BASE = {
  storeName: 'Mi Tienda',
  lines: ['• 1x Producto — $1.000'],
  total: 1000,
  orderId: '11111111-2222-3333-4444-555555555555',
  storeOrderNumber: 7,
};

describe('buildOrderWhatsappMessage — teléfono de la compradora', () => {
  it('incluye el teléfono cuando se provee', () => {
    const message = buildOrderWhatsappMessage({ ...BASE, customerPhone: '+5491112345678' });
    expect(message).toContain('+5491112345678');
  });

  it('no agrega línea de teléfono cuando no se provee', () => {
    const message = buildOrderWhatsappMessage(BASE);
    expect(message).not.toContain('📱');
  });
});
