'use server';

import * as Sentry from '@sentry/nextjs';
import { revalidatePath } from 'next/cache';
import { Resend } from 'resend';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { sendInviteEmail } from '@/lib/resend';
import { leadFormSchema, normalizeWhatsapp } from './schemas';
import type { Database } from '@/lib/supabase/types';
import { PLAN_PRICES, formatPlanPrice } from '@/lib/subscription/plans';
import type { PlanId } from '@/lib/plans/limits';

type LeadRow = Database['public']['Tables']['leads']['Row'];

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

// ---------------------------------------------------------------------------
// requireSuperadmin (local copy so we don't import from admin/actions)
// ---------------------------------------------------------------------------

async function requireSuperadmin() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('UNAUTHORIZED');
  // Use admin client for role lookup to bypass RLS. The user.id comes from
  // the validated session above; this is safe.
  const admin = createAdminClient();
  const { data: row } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (row?.role !== 'superadmin') throw new Error('FORBIDDEN');
  return { user };
}

// ---------------------------------------------------------------------------
// sendNewLeadEmail — internal helper, NOT exported (MVP: hardcoded recipient)
// ---------------------------------------------------------------------------

async function sendNewLeadEmail({ lead }: { lead: LeadRow }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('Missing env var: RESEND_API_KEY');

  const resend = new Resend(apiKey);

  const planId = (lead.plan && lead.plan in PLAN_PRICES ? lead.plan : 'inicial') as PlanId;
  const PLAN_NAMES: Record<PlanId, string> = { inicial: 'Inicial', medio: 'Medio', pro: 'Pro' };
  const planLabel = `${PLAN_NAMES[planId]} (${formatPlanPrice(planId)})`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;">
        <tr>
          <td style="background:#16222E;padding:24px 40px;">
            <span style="font-size:24px;font-weight:bold;color:#ffffff;">wapy</span>
            <span style="margin-left:12px;font-size:12px;color:#F5C84B;font-weight:bold;text-transform:uppercase;letter-spacing:2px;">Admin</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px;">
            <h1 style="margin:0 0 8px;font-size:20px;color:#16222E;">🆕 Nuevo lead en Wapy</h1>
            <p style="margin:0 0 24px;font-size:14px;color:#666;">Alguien se interesó por ${planLabel}.</p>
            <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
              <tr style="background:#f9fafb;">
                <td style="padding:10px 16px;font-size:12px;font-weight:bold;color:#6b7280;text-transform:uppercase;width:120px;">Nombre</td>
                <td style="padding:10px 16px;font-size:14px;color:#16222E;">${lead.name}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;font-size:12px;font-weight:bold;color:#6b7280;text-transform:uppercase;border-top:1px solid #e5e7eb;">Email</td>
                <td style="padding:10px 16px;font-size:14px;color:#16222E;border-top:1px solid #e5e7eb;">${lead.email}</td>
              </tr>
              <tr style="background:#f9fafb;">
                <td style="padding:10px 16px;font-size:12px;font-weight:bold;color:#6b7280;text-transform:uppercase;border-top:1px solid #e5e7eb;">WhatsApp</td>
                <td style="padding:10px 16px;font-size:14px;color:#16222E;border-top:1px solid #e5e7eb;">${lead.whatsapp}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;font-size:12px;font-weight:bold;color:#6b7280;text-transform:uppercase;border-top:1px solid #e5e7eb;">Plan</td>
                <td style="padding:10px 16px;font-size:14px;color:#16222E;border-top:1px solid #e5e7eb;">${planLabel}</td>
              </tr>
            </table>
            <table cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
              <tr>
                <td align="center" style="border-radius:50px;background:#F5C84B;">
                  <a href="${APP_URL}/admin/leads" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:800;color:#16222E;text-decoration:none;border-radius:50px;">
                    Ver en /admin/leads
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await resend.emails.send({
    from: 'Wapy <hola@wapy.com.ar>',
    to: 'juanmalosada01@gmail.com',
    subject: `🆕 Nuevo lead en Wapy: ${lead.name}`,
    html,
  });
}

// ---------------------------------------------------------------------------
// createLead — callable by anonymous (public landing)
// ---------------------------------------------------------------------------

type CreateLeadResult = { ok: true } | { error: 'validation'; message: string } | { error: 'server_error' };

export async function createLead(formData: FormData): Promise<CreateLeadResult> {
  const raw = {
    email: formData.get('email'),
    name: formData.get('name'),
    whatsapp: formData.get('whatsapp'),
    plan: formData.get('plan'),
  };

  const parsed = leadFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: 'validation', message: parsed.error.issues[0].message };
  }

  const { email, name, plan } = parsed.data;
  const whatsapp = normalizeWhatsapp(parsed.data.whatsapp) ?? parsed.data.whatsapp;

  const admin = createAdminClient();

  const { data: inserted, error: insertError } = await admin
    .from('leads')
    .insert({ email: email.toLowerCase(), name, whatsapp, plan })
    .select()
    .single();

  if (insertError || !inserted) {
    console.error('[createLead] INSERT error:', insertError?.message);
    Sentry.captureException(insertError ?? new Error('lead insert returned no data'), {
      tags: { feature: 'lead-capture' },
      extra: { plan },
    });
    return { error: 'server_error' };
  }

  // Mail failure must NOT block the success response
  try {
    await sendNewLeadEmail({ lead: inserted });
  } catch (e) {
    console.error('[createLead] sendNewLeadEmail failed:', e);
    Sentry.captureException(e, {
      tags: { feature: 'lead-capture' },
      extra: { leadId: inserted.id, plan },
    });
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// approveLead — superadmin only
// ---------------------------------------------------------------------------

type ApproveLeadResult =
  | { ok: true; mail_sent: boolean; mail_error?: string }
  | { error: 'invalid_state' | 'already_whitelisted' | 'forbidden'; message?: string };

export async function approveLead({ id }: { id: string }): Promise<ApproveLeadResult> {
  let superadminUser: { id: string };
  try {
    const { user } = await requireSuperadmin();
    superadminUser = user;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'FORBIDDEN';
    return { error: 'forbidden', message: msg };
  }

  const admin = createAdminClient();

  // 1. Fetch lead — must exist and be status='new'
  const { data: lead } = await admin
    .from('leads')
    .select('*')
    .eq('id', id)
    .eq('status', 'new')
    .single();

  if (!lead) {
    return { error: 'invalid_state', message: 'Lead no encontrado o ya procesado.' };
  }

  // 2. Check duplicate in whitelist
  const { data: existing } = await admin
    .from('whitelist')
    .select('id')
    .eq('email', lead.email.toLowerCase())
    .maybeSingle();

  if (existing) {
    return { error: 'already_whitelisted', message: 'Este mail ya estaba invitado.' };
  }

  // 3. INSERT whitelist row (invite_token generated by DB default)
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: whitelistRow, error: insertError } = await admin
    .from('whitelist')
    .insert({
      email: lead.email.toLowerCase(),
      grant_role: 'owner',
      plan: lead.plan,
      trial_ends_at: trialEndsAt,
    })
    .select('id, email, invite_token')
    .single();

  if (insertError || !whitelistRow) {
    return { error: 'invalid_state', message: insertError?.message ?? 'No se pudo crear whitelist row.' };
  }

  // 4. UPDATE lead status
  await admin
    .from('leads')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: superadminUser.id,
    })
    .eq('id', id);

  revalidatePath('/admin', 'layout');

  // 5. Send invite email
  if (!whitelistRow.invite_token) {
    return { ok: true, mail_sent: false, mail_error: 'No se generó invite_token.' };
  }

  const inviteUrl = `${APP_URL}/signup?token=${whitelistRow.invite_token}`;

  try {
    await sendInviteEmail({
      to: whitelistRow.email,
      token: whitelistRow.invite_token,
      inviteUrl,
    });
    return { ok: true, mail_sent: true };
  } catch (e) {
    const mailError = e instanceof Error ? e.message : 'Error desconocido';
    return { ok: true, mail_sent: false, mail_error: mailError };
  }
}

// ---------------------------------------------------------------------------
// deleteLead — superadmin only
// ---------------------------------------------------------------------------

type DeleteLeadResult = { ok: true } | { error: 'forbidden' | 'unknown'; message?: string };

export async function deleteLead({ id }: { id: string }): Promise<DeleteLeadResult> {
  try {
    await requireSuperadmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'FORBIDDEN';
    return { error: 'forbidden', message: msg };
  }

  const admin = createAdminClient();
  const { error } = await admin.from('leads').delete().eq('id', id);

  if (error) {
    return { error: 'unknown', message: error.message };
  }

  revalidatePath('/admin', 'layout');
  return { ok: true };
}
