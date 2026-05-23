'use server';

import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { sendInviteEmail } from '@/lib/resend';
import { addEmailSchema } from './schemas';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

async function requireSuperadmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('UNAUTHORIZED');
  const { data: row } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (row?.role !== 'superadmin') throw new Error('FORBIDDEN');
  return { user };
}

// ---------------------------------------------------------------------------
// addWhitelistEntry
// ---------------------------------------------------------------------------

type AddResult =
  | { ok: true; mail_sent: true }
  | { ok: true; mail_sent: false; mail_error: string }
  | { error: 'duplicate' | 'validation' | 'forbidden' | 'unknown'; message?: string };

export async function addWhitelistEntry(formData: FormData): Promise<AddResult> {
  try {
    await requireSuperadmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'FORBIDDEN';
    return { error: msg === 'UNAUTHORIZED' ? 'forbidden' : 'forbidden', message: msg };
  }

  const raw = Object.fromEntries(formData.entries());
  const parsed = addEmailSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: 'validation', message: parsed.error.issues[0].message };
  }

  const { email, grant_role } = parsed.data;
  const admin = createAdminClient();

  const { data: inserted, error: insertError } = await admin
    .from('whitelist')
    .insert({ email: email.toLowerCase(), grant_role })
    .select('id, email, invite_token')
    .single();

  if (insertError) {
    // Postgres unique_violation code
    if (insertError.code === '23505') {
      return { error: 'duplicate' };
    }
    return { error: 'unknown', message: insertError.message };
  }

  if (!inserted?.invite_token) {
    // Row created but no token (DB trigger may not have run) — surface the row, no mail
    revalidatePath('/admin');
    return { ok: true, mail_sent: false, mail_error: 'No se generó invite_token' };
  }

  const inviteUrl = `${APP_URL}/signup?token=${inserted.invite_token}`;

  try {
    await sendInviteEmail({ to: inserted.email, token: inserted.invite_token, inviteUrl });
    revalidatePath('/admin');
    return { ok: true, mail_sent: true };
  } catch (e) {
    revalidatePath('/admin');
    const mailError = e instanceof Error ? e.message : 'Error desconocido';
    return { ok: true, mail_sent: false, mail_error: mailError };
  }
}

// ---------------------------------------------------------------------------
// reinviteEntry
// ---------------------------------------------------------------------------

type ReinviteResult =
  | { ok: true; mail_sent: boolean; mail_error?: string }
  | { error: 'already_registered' | 'not_found' | 'forbidden' | 'unknown'; message?: string };

export async function reinviteEntry({ id }: { id: string }): Promise<ReinviteResult> {
  try {
    await requireSuperadmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'FORBIDDEN';
    return { error: 'forbidden', message: msg };
  }

  const admin = createAdminClient();

  // Check current state
  const { data: existing } = await admin
    .from('whitelist')
    .select('id, email, registered_at')
    .eq('id', id)
    .single();

  if (!existing) return { error: 'not_found' };
  if (existing.registered_at) return { error: 'already_registered' };

  const newToken = randomBytes(32).toString('hex');

  const { data: updated, error: updateError } = await admin
    .from('whitelist')
    .update({ invite_token: newToken, invited_at: new Date().toISOString() })
    .eq('id', id)
    .select('email, invite_token')
    .single();

  if (updateError || !updated) {
    return { error: 'unknown', message: updateError?.message };
  }

  const inviteUrl = `${APP_URL}/signup?token=${updated.invite_token}`;

  try {
    await sendInviteEmail({ to: updated.email, token: updated.invite_token!, inviteUrl });
    revalidatePath('/admin');
    return { ok: true, mail_sent: true };
  } catch (e) {
    revalidatePath('/admin');
    const mailError = e instanceof Error ? e.message : 'Error desconocido';
    return { ok: true, mail_sent: false, mail_error: mailError };
  }
}

// ---------------------------------------------------------------------------
// removeWhitelistEntry
// ---------------------------------------------------------------------------

type RemoveResult =
  | { ok: true }
  | { error: 'not_found' | 'forbidden' | 'unknown'; message?: string };

export async function removeWhitelistEntry({ id }: { id: string }): Promise<RemoveResult> {
  try {
    await requireSuperadmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'FORBIDDEN';
    return { error: 'forbidden', message: msg };
  }

  const admin = createAdminClient();

  const { error: deleteError } = await admin
    .from('whitelist')
    .delete()
    .eq('id', id);

  if (deleteError) {
    return { error: 'unknown', message: deleteError.message };
  }

  revalidatePath('/admin');
  return { ok: true };
}
