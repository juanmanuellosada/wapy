'use server';

import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { sendInviteEmail } from '@/lib/email';
import { preApproval } from '@/lib/mercadopago';
import { addEmailSchema } from './schemas';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

async function requireSuperadmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
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

  const { email, grant_role, checkout_mode } = parsed.data;
  const admin = createAdminClient();

  const { data: inserted, error: insertError } = await admin
    .from('whitelist')
    .insert({ email: email.toLowerCase(), grant_role, checkout_mode })
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
    await sendInviteEmail({ to: inserted.email, inviteUrl });
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
    await sendInviteEmail({ to: updated.email, inviteUrl });
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

// ---------------------------------------------------------------------------
// adminDeleteStore
// ---------------------------------------------------------------------------

type AdminDeleteStoreResult = { ok: true } | { error: string };

export async function adminDeleteStore({
  storeId,
  confirmSlug,
}: {
  storeId: string;
  confirmSlug: string;
}): Promise<AdminDeleteStoreResult> {
  try {
    await requireSuperadmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'FORBIDDEN';
    return { error: msg };
  }

  const admin = createAdminClient();

  const { data: store } = await admin
    .from('stores')
    .select('id, slug, mp_preapproval_id')
    .eq('id', storeId)
    .single();

  if (!store) return { error: 'No se encontró la tienda.' };

  if (confirmSlug !== store.slug) {
    return { error: 'El slug no coincide. Verificá que lo escribiste exactamente.' };
  }

  // Cancel MP preapproval — best effort, don't abort if MP is down
  if (store.mp_preapproval_id) {
    try {
      await preApproval.update({
        id: store.mp_preapproval_id,
        body: { status: 'cancelled' },
      });
    } catch (err) {
      console.error('[admin/adminDeleteStore] MP cancel failed (continuing):', err);
    }
  }

  // Storage cleanup — best effort, don't block on failure
  try {
    const [productFilesResult, logoFilesResult, bannerFilesResult] = await Promise.all([
      admin.storage.from('product-images').list(store.id),
      admin.storage.from('store-logos').list(store.id),
      admin.storage.from('store-banners').list(store.id),
    ]);

    const productPaths = (productFilesResult.data ?? []).map((f) => `${store.id}/${f.name}`);
    const logoPaths = (logoFilesResult.data ?? []).map((f) => `${store.id}/${f.name}`);
    const bannerPaths = (bannerFilesResult.data ?? []).map((f) => `${store.id}/${f.name}`);

    await Promise.all([
      productPaths.length > 0
        ? admin.storage.from('product-images').remove(productPaths)
        : Promise.resolve(),
      logoPaths.length > 0
        ? admin.storage.from('store-logos').remove(logoPaths)
        : Promise.resolve(),
      bannerPaths.length > 0
        ? admin.storage.from('store-banners').remove(bannerPaths)
        : Promise.resolve(),
    ]);
  } catch (e) {
    console.warn('[admin/adminDeleteStore] storage cleanup failed (continuing):', e);
  }

  // Delete the store row — FK cascades to sections, products, slug_history
  const { error: deleteError } = await admin.from('stores').delete().eq('id', storeId);

  if (deleteError) {
    return { error: 'No se pudo eliminar la tienda. Intentá de nuevo.' };
  }

  revalidatePath('/admin/stores');
  return { ok: true };
}
