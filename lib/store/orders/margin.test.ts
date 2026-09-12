// Ejecutar con: npx vitest run lib/store/orders/margin.test.ts

import { describe, it, expect } from 'vitest';
import { computeCostMargin, type CostableLine } from './margin';

describe('computeCostMargin', () => {
  it('ganancia con costo completo: costo, ganancia y margen correctos', () => {
    const lines: CostableLine[] = [
      { unit_price_cents: 1000, cost_at_purchase: 600, quantity: 2 },
    ];
    const result = computeCostMargin(lines);
    expect(result.cost_cents).toBe(1200);
    expect(result.costed_revenue_cents).toBe(2000);
    expect(result.profit_cents).toBe(800);
    expect(result.margin_pct).toBeCloseTo(0.4);
    expect(result.cost_coverage_pct).toBe(1);
  });

  it('ignora las líneas sin costo cargado (no las trata como costo 0)', () => {
    const lines: CostableLine[] = [
      { unit_price_cents: 1000, cost_at_purchase: 600, quantity: 1 },
      { unit_price_cents: 1000, cost_at_purchase: null, quantity: 1 },
    ];
    const result = computeCostMargin(lines);
    // Solo la primera línea participa: ganancia 400, no 1400.
    expect(result.costed_revenue_cents).toBe(1000);
    expect(result.cost_cents).toBe(600);
    expect(result.profit_cents).toBe(400);
  });

  it('cobertura parcial: refleja la proporción de facturación con costo', () => {
    const lines: CostableLine[] = [
      { unit_price_cents: 700, cost_at_purchase: 400, quantity: 1 },
      { unit_price_cents: 300, cost_at_purchase: null, quantity: 1 },
    ];
    const result = computeCostMargin(lines);
    expect(result.cost_coverage_pct).toBeCloseTo(0.7);
  });

  it('cobertura cero: ninguna línea con costo — margin_pct es null, no 0', () => {
    const lines: CostableLine[] = [{ unit_price_cents: 1000, cost_at_purchase: null, quantity: 1 }];
    const result = computeCostMargin(lines);
    expect(result.cost_coverage_pct).toBe(0);
    expect(result.margin_pct).toBeNull();
    expect(result.cost_cents).toBe(0);
    expect(result.profit_cents).toBe(0);
  });

  it('costo 0 es un costo cargado: participa y da margen 100%', () => {
    const lines: CostableLine[] = [{ unit_price_cents: 1000, cost_at_purchase: 0, quantity: 1 }];
    const result = computeCostMargin(lines);
    expect(result.cost_coverage_pct).toBe(1);
    expect(result.margin_pct).toBe(1);
    expect(result.profit_cents).toBe(1000);
  });

  it('sin líneas: todo en cero/null sin dividir por cero', () => {
    const result = computeCostMargin([]);
    expect(result).toEqual({
      costed_revenue_cents: 0,
      cost_cents: 0,
      profit_cents: 0,
      margin_pct: null,
      cost_coverage_pct: 0,
    });
  });
});
