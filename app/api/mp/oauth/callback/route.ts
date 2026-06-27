export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// GET /api/mp/oauth/callback
//
// Receives the Mercado Pago OAuth redirect after the owner authorizes the app.
// Validates the `state` token (HMAC signature + expiry), exchanges the
// authorization `code` for access + refresh tokens, encrypts them with
// encryptSecret (AES-256-GCM), and upserts the connection in store_mp_connections.
//
// On success → redirects to dashboard settings/payments page with ?mp_connect=success
// On any failure → redirects with ?mp_connect=error&mp_error=<reason>
//
// Tokens are NEVER returned to the client. They live exclusively server-side.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server';
import { verifyOAuthState, exchangeCodeForTokens } from '@/lib/store/checkout/oauth';
import { encryptSecret } from '@/lib/crypto/secrets';
import { createAdminClient } from '@/lib/supabase/server';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
// Destination after connecting — Group 7 settings section.
const DASHBOARD_PAYMENTS_URL = `${APP_URL}/dashboard/settings`;

function errorRedirect(reason: string): NextResponse {
  return NextResponse.redirect(
    `${DASHBOARD_PAYMENTS_URL}?mp_connect=error&mp_error=${encodeURIComponent(reason)}`
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  // MP sent an explicit error (e.g. user denied the authorization)
  if (errorParam) {
    console.warn('[mp/oauth/callback] MP returned explicit error', { errorParam });
    return errorRedirect(errorParam);
  }

  if (!code || !state) {
    console.warn('[mp/oauth/callback] Missing code or state');
    return errorRedirect('missing_params');
  }

  // --- 1. Verify state (signature + expiry → extracts storeId) ---
  let storeId: string;
  try {
    const payload = verifyOAuthState(state);
    storeId = payload.storeId;
  } catch (err) {
    console.warn('[mp/oauth/callback] Invalid state', { err });
    return errorRedirect('invalid_state');
  }

  // --- 2. Exchange authorization code for tokens ---
  let tokens: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user_id: number;
    public_key?: string;
  };
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch (err) {
    console.error('[mp/oauth/callback] Token exchange failed', { storeId, err });
    return errorRedirect('token_exchange');
  }

  // --- 3. Encrypt tokens and persist the connection ---
  const now = new Date();
  const tokenExpiresAt = new Date(now.getTime() + tokens.expires_in * 1000).toISOString();

  const admin = createAdminClient();

  const { error: upsertError } = await admin
    .from('store_mp_connections')
    .upsert(
      {
        store_id: storeId,
        mp_user_id: String(tokens.user_id),
        access_token_enc: encryptSecret(tokens.access_token),
        refresh_token_enc: encryptSecret(tokens.refresh_token),
        token_expires_at: tokenExpiresAt,
        public_key: tokens.public_key ?? null,
        connected_at: now.toISOString(),
        revoked_at: null,
        updated_at: now.toISOString(),
      },
      { onConflict: 'store_id' }
    );

  if (upsertError) {
    console.error('[mp/oauth/callback] DB upsert failed', { storeId, error: upsertError });
    return errorRedirect('db_error');
  }

  console.info('[mp/oauth/callback] MP connection established', {
    storeId,
    mpUserId: tokens.user_id,
  });

  return NextResponse.redirect(`${DASHBOARD_PAYMENTS_URL}?mp_connect=success`);
}
