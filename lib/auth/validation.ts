import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';

const INVITE_TTL_DAYS = 7;

type WhitelistValidationResult =
  | { ok: true; grant_role: string }
  | { error: 'not_whitelisted' }
  | { error: 'expired' }
  | { error: 'already_registered' }
  | { error: 'invalid_token' };

/**
 * Validates whether an email is allowed to sign up.
 * Uses the admin client (service role) to bypass RLS and read `whitelist` directly.
 * Never exposes raw DB errors to callers.
 */
export async function validateWhitelistSignup({
  email,
  token,
}: {
  email: string;
  token?: string;
}): Promise<WhitelistValidationResult> {
  const admin = createAdminClient();

  const { data: row, error } = await admin
    .from('whitelist')
    .select('email, grant_role, invite_token, invited_at, registered_at')
    .eq('email', email.toLowerCase())
    .single();

  if (error || !row) {
    return { error: 'not_whitelisted' };
  }

  // If a token was provided in the URL, it must match the stored invite_token
  if (token !== undefined) {
    if (!row.invite_token || row.invite_token !== token) {
      return { error: 'invalid_token' };
    }
  }

  // Already registered
  if (row.registered_at !== null) {
    return { error: 'already_registered' };
  }

  // TTL check: invited_at + 7 days must be in the future
  const invitedAt = new Date(row.invited_at).getTime();
  const expiresAt = invitedAt + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;
  if (Date.now() > expiresAt) {
    return { error: 'expired' };
  }

  return { ok: true, grant_role: row.grant_role };
}
