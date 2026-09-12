// Cálculo de costo/ganancia/margen a partir de líneas de pedido con costo
// congelado (order_items.cost_at_purchase). Helper puro y reutilizable por:
// getOrderStats (agregado del período), exportOrdersCsv (por pedido) y el
// detalle de un pedido (próxima entrega). Ver
// openspec/changes/add-product-cost-tracking/design.md, Decisiones D3-D5.
//
// La ganancia NO se calcula como "ingresos totales - costo": ambos números
// salen de bases distintas (ingresos de `orders.total_cents`, costo de sumar
// `order_items`). Acá se computan tres cosas SOLO sobre las líneas que tienen
// `cost_at_purchase` (NULL = sin dato, 0 = costo cero — Decisión D3):
//   - costed_revenue_cents: ingreso de esas líneas (precio efectivo cobrado)
//   - cost_cents: costo congelado de esas líneas
//   - profit_cents / margin_pct: ganancia y margen sobre esa base medible
// cost_coverage_pct se mide sobre el total de facturación de TODAS las líneas
// (con costo o sin él), no sobre la cantidad de productos (Decisión D5).

export interface CostableLine {
  unit_price_cents: number;
  cost_at_purchase: number | null;
  quantity: number;
  // Completado después de la venta vía backfillProductCost, en vez de
  // congelado al crear el pedido (add-cost-backfill-on-save, D3/D5). No
  // afecta ningún cálculo de este helper, solo si se avisa el origen del
  // número. Opcional para no romper líneas anteriores a esta columna.
  cost_is_estimated?: boolean;
}

export interface CostMarginResult {
  costed_revenue_cents: number;
  cost_cents: number;
  profit_cents: number;
  /** null cuando no hay ninguna línea con costo (costed_revenue_cents === 0). */
  margin_pct: number | null;
  /** 0 a 1. 0 cuando ninguna línea del conjunto tiene costo congelado. */
  cost_coverage_pct: number;
  /** true si al menos una línea con costo proviene de un completado posterior, no de la venta. */
  has_estimated_cost: boolean;
}

export function computeCostMargin(lines: readonly CostableLine[]): CostMarginResult {
  let totalRevenueCents = 0;
  let costedRevenueCents = 0;
  let costCents = 0;
  let hasEstimatedCost = false;

  for (const line of lines) {
    const lineRevenue = line.unit_price_cents * line.quantity;
    totalRevenueCents += lineRevenue;
    if (line.cost_at_purchase == null) continue;
    costedRevenueCents += lineRevenue;
    costCents += line.cost_at_purchase * line.quantity;
    if (line.cost_is_estimated) hasEstimatedCost = true;
  }

  const profitCents = costedRevenueCents - costCents;

  return {
    costed_revenue_cents: costedRevenueCents,
    cost_cents: costCents,
    profit_cents: profitCents,
    margin_pct: costedRevenueCents > 0 ? profitCents / costedRevenueCents : null,
    cost_coverage_pct: totalRevenueCents > 0 ? costedRevenueCents / totalRevenueCents : 0,
    has_estimated_cost: hasEstimatedCost,
  };
}
