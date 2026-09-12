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
      has_estimated_cost: false,
    });
  });

  // add-cost-backfill-on-save: una línea estimada suma igual que una real, y
  // el indicador solo aparece cuando corresponde.
  it('una línea estimada aporta al cálculo igual que una real', () => {
    const linesReal: CostableLine[] = [{ unit_price_cents: 1000, cost_at_purchase: 600, quantity: 1 }];
    const linesEstimated: CostableLine[] = [
      { unit_price_cents: 1000, cost_at_purchase: 600, quantity: 1, cost_is_estimated: true },
    ];
    const real = computeCostMargin(linesReal);
    const estimated = computeCostMargin(linesEstimated);
    expect(estimated.cost_cents).toBe(real.cost_cents);
    expect(estimated.profit_cents).toBe(real.profit_cents);
    expect(estimated.margin_pct).toBe(real.margin_pct);
    expect(estimated.cost_coverage_pct).toBe(real.cost_coverage_pct);
  });

  it('has_estimated_cost es true solo si alguna línea con costo está marcada como estimada', () => {
    const lines: CostableLine[] = [
      { unit_price_cents: 1000, cost_at_purchase: 600, quantity: 1 },
      { unit_price_cents: 1000, cost_at_purchase: 700, quantity: 1, cost_is_estimated: true },
    ];
    expect(computeCostMargin(lines).has_estimated_cost).toBe(true);
  });

  it('has_estimated_cost es false cuando ninguna línea con costo es estimada', () => {
    const lines: CostableLine[] = [{ unit_price_cents: 1000, cost_at_purchase: 600, quantity: 1 }];
    expect(computeCostMargin(lines).has_estimated_cost).toBe(false);
  });

  it('una línea estimada sin costo (nunca ocurre, pero no debe contar) no marca has_estimated_cost', () => {
    const lines: CostableLine[] = [
      { unit_price_cents: 1000, cost_at_purchase: null, quantity: 1, cost_is_estimated: true },
    ];
    expect(computeCostMargin(lines).has_estimated_cost).toBe(false);
  });
});
