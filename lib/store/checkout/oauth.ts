// server-only — never import this module from client components or the browser.
// Handles Mercado Pago per-store OAuth: authorization URL, token exchange/refresh,
// and the getValidMpAccessToken / getStoreMpConnectionStatus server-side helpers.
import 'server-only';

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { encryptSecret, decryptSecret } from '@/lib/crypto/secrets';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

/** Redirect URI registered in the Mercado Pago app panel. */
export const MP_OAUTH_REDIRECT_URI = `${APP_URL}/api/mp/oauth/callback`;

function getMpClientId(): string {
  const v = process.env.MP_OAUTH_CLIENT_ID;
  if (!v) throw new Error('[oauth] MP_OAUTH_CLIENT_ID is not set.');
  return v;
}

function getMpClientSecret(): string {
  const v = process.env.MP_OAUTH_CLIENT_SECRET;
  if (!v) throw new Error('[oauth] MP_OAUTH_CLIENT_SECRET is not set.');
  return v;
}

// ---------------------------------------------------------------------------
// State signing (HMAC-SHA256)
//
// Reuses MP_TOKEN_ENC_KEY as the HMAC key.
// Rationale: MP_TOKEN_ENC_KEY is already a 256-bit critical secret present in
// all environments that need OAuth. Reusing it for HMAC-SHA256 (a different
// cryptographic operation from AES-256-GCM) does not weaken either scheme.
// The alternative would be a dedicated MP_OAUTH_STATE_SECRET env var, but that
// adds operational burden for no practical security gain in this context.
// ---------------------------------------------------------------------------

function getStateKey(): Buffer {
  const raw = process.env.MP_TOKEN_ENC_KEY;
  if (!raw) throw new Error('[oauth] MP_TOKEN_ENC_KEY is not set (required for state signing).');
  return Buffer.from(raw, 'base64');
}

const STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

interface OAuthStatePayload {
  storeId: string;
  exp: number;   // Unix timestamp in ms
  nonce: string; // Random hex — prevents replay within the expiry window
  origin?: 'dashboard' | 'onboarding';
}

/**
 * Builds a signed OAuth state token encoding `storeId` and optional `origin`.
 * Format: `<base64(JSON)>.<hex-HMAC-SHA256>`.
 * The callback must call `verifyOAuthState(state)` to authenticate and unpack it.
 */
export function buildOAuthState(
  storeId: string,
  origin: 'dashboard' | 'onboarding' = 'dashboard'
): string {
  const payload: OAuthStatePayload = {
    storeId,
    exp: Date.now() + STATE_EXPIRY_MS,
    nonce: randomBytes(16).toString('hex'),
    origin,
  };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  const sig = createHmac('sha256', getStateKey()).update(b64).digest('hex');
  return `${b64}.${sig}`;
}

/**
 * Verifies a state token produced by `buildOAuthState`.
 * Throws if the signature is invalid or the token has expired.
 * Returns the decoded payload (including `storeId`).
 */
export function verifyOAuthState(state: string): OAuthStatePayload {
  const dotIdx = state.lastIndexOf('.');
  if (dotIdx === -1) throw new Error('[oauth] Invalid state: missing signature separator.');

  const b64 = state.slice(0, dotIdx);
  const sig = state.slice(dotIdx + 1);

  // Constant-time comparison to prevent timing attacks
  const expectedSig = createHmac('sha256', getStateKey()).update(b64).digest('hex');
  const expectedBuf = Buffer.from(expectedSig, 'hex');
  const sigBuf = Buffer.from(sig, 'hex');

  if (
    sigBuf.length !== expectedBuf.length ||
    !timingSafeEqual(sigBuf, expectedBuf)
  ) {
    throw new Error('[oauth] State signature invalid.');
  }

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  } catch {
    throw new Error('[oauth] State payload is not valid JSON.');
  }

  if (Date.now() > payload.exp) {
    throw new Error('[oauth] State token has expired.');
  }

  return payload;
}

// ---------------------------------------------------------------------------
// Authorization URL builder (task 3.2)
// ---------------------------------------------------------------------------

/**
 * Builds the Mercado Pago OAuth authorization URL for a given store.
 * Redirects the owner's browser to this URL to begin the connect flow.
 */
export function buildAuthorizationUrl(
  storeId: string,
  origin: 'dashboard' | 'onboarding' = 'dashboard'
): string {
  const params = new URLSearchParams({
    client_id: getMpClientId(),
    response_type: 'code',
    platform_id: 'mp',
    redirect_uri: MP_OAUTH_REDIRECT_URI,
    state: buildOAuthState(storeId, origin),
  });
  return `https://auth.mercadopago.com/authorization?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Token exchange & refresh (task 3.2)
// ---------------------------------------------------------------------------

interface MpTokenResponse {
  access_token: string;
  refresh_token: string;
  /** Lifetime of the access_token in seconds. */
  expires_in: number;
  /** Mercado Pago numeric user ID of the authorizing owner. */
  user_id: number;
  /** Public key for the owner's MP account (optional, returned by some MP apps). */
  public_key?: string;
}

async function callOAuthToken(body: Record<string, string>): Promise<MpTokenResponse> {
  const response = await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: getMpClientId(),
      client_secret: getMpClientSecret(),
      ...body,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`[oauth] MP /oauth/token returned ${response.status}: ${text}`);
  }

  return response.json() as Promise<MpTokenResponse>;
}

/** Exchanges an authorization code for access + refresh tokens. */
export async function exchangeCodeForTokens(code: string): Promise<MpTokenResponse> {
  return callOAuthToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: MP_OAUTH_REDIRECT_URI,
  });
}

/** Refreshes an expired access token using the stored refresh token. */
export async function refreshMpToken(refreshToken: string): Promise<MpTokenResponse> {
  return callOAuthToken({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
}

// ---------------------------------------------------------------------------
// getValidMpAccessToken — server-side only (task 3.6)
// ---------------------------------------------------------------------------

/** Refresh the access token if it expires within this many ms. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Returns a valid (decrypted) Mercado Pago access token for the given store.
 *
 * - If the stored token is still valid, decrypts and returns it directly.
 * - If it is expired or within REFRESH_MARGIN_MS of expiry, refreshes it via MP,
 *   re-encrypts, and persists the new tokens before returning the new access token.
 * - If the connection does not exist or is revoked, throws with a clear message.
 * - If the refresh call fails (e.g. owner revoked access in MP), marks the
 *   connection as revoked and throws so the caller can fall back gracefully.
 *
 * NEVER returns this value to the client. It is server-side only and consumed
 * by the checkout preference and payment-reading helpers (Group 4).
 */
export async function getValidMpAccessToken(storeId: string): Promise<string> {
  const admin = createAdminClient();

  const { data: conn, error } = await admin
    .from('store_mp_connections')
    .select('access_token_enc, refresh_token_enc, token_expires_at, revoked_at')
    .eq('store_id', storeId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[oauth] DB error reading MP connection for store ${storeId}: ${error.message}`
    );
  }
  if (!conn) {
    throw new Error(`[oauth] No Mercado Pago connection found for store ${storeId}.`);
  }
  if (conn.revoked_at) {
    throw new Error(
      `[oauth] Mercado Pago connection for store ${storeId} is revoked. Owner must reconnect.`
    );
  }
  if (!conn.access_token_enc || !conn.refresh_token_enc) {
    throw new Error(`[oauth] MP connection for store ${storeId} is incomplete.`);
  }

  const expiresAt = conn.token_expires_at
    ? new Date(conn.token_expires_at).getTime()
    : 0;
  const needsRefresh = !expiresAt || Date.now() + REFRESH_MARGIN_MS >= expiresAt;

  if (!needsRefresh) {
    return decryptSecret(conn.access_token_enc);
  }

  // Attempt refresh
  let tokens: MpTokenResponse;
  try {
    const plainRefreshToken = decryptSecret(conn.refresh_token_enc);
    tokens = await refreshMpToken(plainRefreshToken);
  } catch (err) {
    // Refresh failed — owner likely revoked the authorization in MP
    console.error('[oauth/getValidMpAccessToken] Token refresh failed; revoking connection', {
      storeId,
      err,
    });
    await admin
      .from('store_mp_connections')
      .update({
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('store_id', storeId);
    throw new Error(
      `[oauth] MP token refresh failed for store ${storeId}; connection marked as revoked.`
    );
  }

  // Persist refreshed tokens
  const now = new Date();
  const tokenExpiresAt = new Date(now.getTime() + tokens.expires_in * 1000).toISOString();

  await admin
    .from('store_mp_connections')
    .update({
      access_token_enc: encryptSecret(tokens.access_token),
      refresh_token_enc: encryptSecret(tokens.refresh_token),
      token_expires_at: tokenExpiresAt,
      updated_at: now.toISOString(),
    })
    .eq('store_id', storeId);

  return tokens.access_token;
}

// ---------------------------------------------------------------------------
// getStoreMpConnectionStatus — dashboard metadata only (task 3.7)
// ---------------------------------------------------------------------------

export interface MpConnectionStatus {
  /** True when the connection exists and has not been revoked. */
  connected: boolean;
  /** True when the connection was revoked (locally or from MP). */
  revoked: boolean;
  /** MP numeric user ID of the connected account, if available. */
  mpUserId?: string;
}

/**
 * Returns only the connection metadata needed by the dashboard.
 * NEVER includes access_token_enc or refresh_token_enc.
 */
export async function getStoreMpConnectionStatus(
  storeId: string
): Promise<MpConnectionStatus> {
  const admin = createAdminClient();

  const { data: conn, error } = await admin
    .from('store_mp_connections')
    .select('mp_user_id, connected_at, revoked_at')
    .eq('store_id', storeId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[oauth] DB error reading MP connection status for store ${storeId}: ${error.message}`
    );
  }

  if (!conn || !conn.connected_at) {
    return { connected: false, revoked: false };
  }

  const revoked = Boolean(conn.revoked_at);
  return {
    connected: !revoked,
    revoked,
    mpUserId: conn.mp_user_id ?? undefined,
  };
}
