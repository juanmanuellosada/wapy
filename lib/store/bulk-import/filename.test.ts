// Ejecutar con: npx vitest run lib/store/bulk-import/filename.test.ts

import { describe, it, expect } from 'vitest';
import { deriveProductName, dedupeNames } from './filename';

describe('deriveProductName', () => {
  it('reemplaza guiones por espacios', () => {
    expect(deriveProductName('remera-negra.jpg')).toBe('Remera negra');
  });

  it('reemplaza guiones bajos por espacios', () => {
    expect(deriveProductName('campera_jean.png')).toBe('Campera jean');
  });

  it('respeta un nombre que ya viene legible, sin alterar mayúsculas existentes', () => {
    expect(deriveProductName('Buzo Oversize 01.jpg')).toBe('Buzo Oversize 01');
  });

  it('ignora la carpeta contenedora', () => {
    expect(deriveProductName('Remeras/remera-blanca.jpg')).toBe('Remera blanca');
  });

  it('usa "Producto" como fallback si el nombre derivado queda vacío', () => {
    expect(deriveProductName('.jpg')).toBe('Producto');
  });
});

describe('dedupeNames', () => {
  it('no modifica nombres sin colisión', () => {
    expect(dedupeNames(['Remera negra', 'Campera jean'])).toEqual(['Remera negra', 'Campera jean']);
  });

  it('sufija los duplicados detectados sin distinguir mayúsculas de minúsculas', () => {
    expect(dedupeNames(['Remera negra', 'Remera Negra'])).toEqual(['Remera negra', 'Remera negra 2']);
  });

  it('incrementa el sufijo con cada colisión adicional', () => {
    expect(dedupeNames(['Remera negra', 'remera negra', 'REMERA NEGRA'])).toEqual([
      'Remera negra',
      'Remera negra 2',
      'Remera negra 3',
    ]);
  });
});
