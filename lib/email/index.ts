import * as React from 'react';
import { sendEmail } from './client';
import Invite from '@/emails/Invite';
import NewLeadNotification from '@/emails/NewLeadNotification';
import PasswordReset from '@/emails/PasswordReset';
import ConfirmSignup from '@/emails/ConfirmSignup';
import OrderApprovedOwner from '@/emails/OrderApprovedOwner';
import OrderConfirmedBuyer from '@/emails/OrderConfirmedBuyer';
import PendingOrdersDigest from '@/emails/PendingOrdersDigest';
import WhatsAppLifecycleAnnouncement from '@/emails/WhatsAppLifecycleAnnouncement';
import { PLAN_PRICES, formatPlanPrice } from '@/lib/subscription/plans';
import { formatARS } from '@/lib/store/whatsapp/buildMessage';
import type { PlanId } from '@/lib/plans/limits';
import type { Database } from '@/lib/supabase/types';

type LeadRow = Database['public']['Tables']['leads']['Row'];

// ---------------------------------------------------------------------------
// Invite de whitelist
// ---------------------------------------------------------------------------

export async function sendInviteEmail({ to, inviteUrl }: { to: string; inviteUrl: string }) {
  return sendEmail({
    to,
    subject: 'Tu invitación para crear tu tienda en Wapy',
    react: React.createElement(Invite, { inviteUrl }),
  });
}

// ---------------------------------------------------------------------------
// Notificación interna de nuevo lead
// ---------------------------------------------------------------------------

const PLAN_NAMES: Record<PlanId, string> = { inicial: 'Inicial', medio: 'Medio', pro: 'Pro' };
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const ADMIN_EMAIL = 'juanmalosada01@gmail.com';

export async function sendNewLeadEmail({ lead }: { lead: LeadRow }) {
  const planId = (lead.plan && lead.plan in PLAN_PRICES ? lead.plan : 'inicial') as PlanId;
  const planLabel = `${PLAN_NAMES[planId]} (${formatPlanPrice(planId)})`;

  return sendEmail({
    to: ADMIN_EMAIL,
    subject: `Nuevo lead en Wapy: ${lead.name}`,
    react: React.createElement(NewLeadNotification, {
      name: lead.name,
      email: lead.email,
      whatsapp: lead.whatsapp,
      planLabel,
      adminUrl: `${APP_URL}/admin/leads`,
    }),
  });
}

// ---------------------------------------------------------------------------
// Emails de auth (disparados por el Send Email Hook)
// ---------------------------------------------------------------------------

export async function sendPasswordResetEmail({ to, url }: { to: string; url: string }) {
  return sendEmail({
    to,
    subject: 'Restablecé tu contraseña de Wapy',
    react: React.createElement(PasswordReset, { url }),
  });
}

export async function sendConfirmSignupEmail({ to, url }: { to: string; url: string }) {
  return sendEmail({
    to,
    subject: 'Confirmá tu cuenta de Wapy',
    react: React.createElement(ConfirmSignup, { url }),
  });
}

// ---------------------------------------------------------------------------
// Notificación de pago de pedido aprobado (webhook de Mercado Pago)
// ---------------------------------------------------------------------------

interface OrderEmailItemInput {
  productName: string;
  quantity: number;
  variantLabel: string | null;
  unitPriceCents: number;
}

function formatOrderItems(items: OrderEmailItemInput[]) {
  return items.map((item) => ({
    productName: item.productName,
    quantity: item.quantity,
    variantLabel: item.variantLabel,
    lineTotalFormatted: formatARS((item.unitPriceCents * item.quantity) / 100),
  }));
}

export async function sendOrderApprovedOwnerEmail({
  to,
  storeName,
  orderRef,
  items,
  totalCents,
}: {
  to: string;
  storeName: string;
  orderRef: string;
  items: OrderEmailItemInput[];
  totalCents: number;
}) {
  return sendEmail({
    to,
    subject: `Nuevo pago recibido en ${storeName}`,
    react: React.createElement(OrderApprovedOwner, {
      storeName,
      orderRef,
      items: formatOrderItems(items),
      totalFormatted: formatARS(totalCents / 100),
      dashboardUrl: `${APP_URL}/dashboard/orders`,
    }),
  });
}

// ---------------------------------------------------------------------------
// Resumen diario de pedidos pendientes (cron de pending-orders-digest)
// ---------------------------------------------------------------------------

interface PendingOrderDigestItemInput {
  orderRef: string;
  customerName: string | null;
  totalCents: number;
  url: string;
}

export async function sendPendingOrdersDigestEmail({
  to,
  storeName,
  orders,
}: {
  to: string;
  storeName: string;
  orders: PendingOrderDigestItemInput[];
}) {
  return sendEmail({
    to,
    subject: `${orders.length} pedido${orders.length === 1 ? '' : 's'} pendiente${orders.length === 1 ? '' : 's'} en ${storeName}`,
    react: React.createElement(PendingOrdersDigest, {
      storeName,
      orders: orders.map((order) => ({
        orderRef: order.orderRef,
        customerName: order.customerName,
        totalFormatted: formatARS(order.totalCents / 100),
        url: order.url,
      })),
      dashboardUrl: `${APP_URL}/dashboard/orders`,
    }),
  });
}

// ---------------------------------------------------------------------------
// Anuncio del cambio de ciclo de vida de pedidos de WhatsApp (envío puntual;
// la migración 036 y el deploy ya están en producción y el anuncio ya se
// envió a las tiendas activas)
// ---------------------------------------------------------------------------

export async function sendWhatsAppLifecycleAnnouncementEmail({
  to,
  storeName,
}: {
  to: string;
  storeName: string;
}) {
  return sendEmail({
    to,
    subject: 'Cambios en cómo Wapy maneja tus pedidos de WhatsApp',
    react: React.createElement(WhatsAppLifecycleAnnouncement, {
      storeName,
      ordersUrl: `${APP_URL}/dashboard/orders`,
      settingsUrl: `${APP_URL}/dashboard/settings`,
    }),
  });
}

export async function sendOrderConfirmedBuyerEmail({
  to,
  storeName,
  orderRef,
  items,
  totalCents,
}: {
  to: string;
  storeName: string;
  orderRef: string;
  items: OrderEmailItemInput[];
  totalCents: number;
}) {
  return sendEmail({
    to,
    subject: `Tu pago fue confirmado — ${storeName}`,
    react: React.createElement(OrderConfirmedBuyer, {
      storeName,
      orderRef,
      items: formatOrderItems(items),
      totalFormatted: formatARS(totalCents / 100),
    }),
  });
}
