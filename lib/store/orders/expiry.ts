// Lógica de decisión pura del ciclo de vida de pedidos de WhatsApp (ver
// openspec/changes/fix-whatsapp-order-lifecycle/design.md, decisiones 4, 5 y 9).
// Sin imports de Supabase/Next a propósito: queda testeable sin mockear la DB.
// El cron (app/api/cron/expire-orders/route.ts) y updateOrderStatus hacen el
// I/O real; estas funciones solo deciden.

export type OrderCancelledBy = 'owner' | 'system';

export type WaStoreLifecycleSettings = {
  wa_pending_ttl_days: number;
  wa_auto_confirm: boolean;
  wa_lifecycle_effective_from: string;
};

export type WaExpiryDecision = 'skip' | 'cancel' | 'confirm';

/**
 * Decide qué hacer con un pedido de WhatsApp pendiente, según la política de
 * su tienda (Decisiones 4 y 5).
 */
export function decideWaOrderExpiry(
  orderCreatedAt: string,
  store: WaStoreLifecycleSettings,
  now: Date
): WaExpiryDecision {
  const createdAt = new Date(orderCreatedAt);

  // Decisión 5: la política no rige retroactivamente.
  if (createdAt < new Date(store.wa_lifecycle_effective_from)) return 'skip';

  const ttlMs = store.wa_pending_ttl_days * 24 * 60 * 60 * 1000;
  if (now.getTime() - createdAt.getTime() < ttlMs) return 'skip';

  return store.wa_auto_confirm ? 'confirm' : 'cancel';
}

/**
 * Decisión 9: solo una cancelación de origen 'system' admite volver a
 * 'confirmed'. Una cancelación de la dueña ('owner') es terminal.
 */
export function canReactivateOrder(cancelledBy: OrderCancelledBy | null): boolean {
  return cancelledBy === 'system';
}
