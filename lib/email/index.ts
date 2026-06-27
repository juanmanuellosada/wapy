import * as React from 'react';
import { sendEmail } from './client';
import Invite from '@/emails/Invite';
import NewLeadNotification from '@/emails/NewLeadNotification';
import PasswordReset from '@/emails/PasswordReset';
import ConfirmSignup from '@/emails/ConfirmSignup';
import { PLAN_PRICES, formatPlanPrice } from '@/lib/subscription/plans';
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
