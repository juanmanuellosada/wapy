// Pure helper — no server-only dependency; safe to import from client components.
// Shared by the WhatsApp message builder (lib/store/whatsapp/buildMessage.ts) and
// server-side notifications (e.g. the pending-orders digest cron) so the deep link
// format to an order's detail view is defined in exactly one place.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

/** Absolute URL that opens a specific order's detail in the owner's dashboard panel. */
export function buildOrderDashboardUrl(orderId: string): string {
  return `${APP_URL}/dashboard/orders?order=${orderId}`;
}
