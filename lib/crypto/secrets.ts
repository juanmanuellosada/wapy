// server-only — never import this module from client components or the browser.
// It uses Node's `crypto` module and accesses sensitive env vars.

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// ---------------------------------------------------------------------------
// Key management
// ---------------------------------------------------------------------------
//
// MP_TOKEN_ENC_KEY must be a base64-encoded 32-byte secret (AES-256 key).
// Generate one with:  openssl rand -base64 32
//
// Key versioning: the ciphertext is prefixed with "v1:" which identifies this
// key version. If you ever rotate the key, add support for "v2:" pointing to a
// new env var (e.g. MP_TOKEN_ENC_KEY_V2) while keeping "v1:" decryption alive
// so existing ciphertexts can still be read. Re-encrypt old rows as they are
// accessed, then retire "v1:".
//
// ⚠ Loss of MP_TOKEN_ENC_KEY makes all stored tokens irrecoverable.
//   Owners would need to reconnect their Mercado Pago accounts via OAuth.
//   Treat this key as a critical secret: back it up securely.

const CURRENT_VERSION = 'v1';

let _key: Buffer | null = null;

function getKey(): Buffer {
  if (_key !== null) return _key;

  const raw = process.env.MP_TOKEN_ENC_KEY;
  if (!raw) {
    throw new Error(
      '[secrets] MP_TOKEN_ENC_KEY is not set. ' +
        'Set it to a base64-encoded 32-byte key (generate with: openssl rand -base64 32).'
    );
  }

  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length !== 32) {
    throw new Error(
      `[secrets] MP_TOKEN_ENC_KEY must decode to exactly 32 bytes (got ${decoded.length}). ` +
        'Generate a valid key with: openssl rand -base64 32'
    );
  }

  _key = decoded;
  return _key;
}

// ---------------------------------------------------------------------------
// AES-256-GCM helpers
// ---------------------------------------------------------------------------

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_BYTES = 16; // 128-bit authentication tag (GCM default)

/**
 * Encrypts `plaintext` using AES-256-GCM with a random IV.
 *
 * Returns a versioned, base64-encoded string in the format:
 *   `v1:<iv_b64>:<authtag_b64>:<ciphertext_b64>`
 *
 * Two calls with the same plaintext produce different ciphertexts (random IV).
 */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const parts = [
    CURRENT_VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ];

  return parts.join(':');
}

/**
 * Decrypts a value produced by `encryptSecret`.
 *
 * Throws if the ciphertext is malformed, the version is unknown, or the
 * authentication tag verification fails (tampered ciphertext or wrong key).
 */
export function decryptSecret(ciphertext: string): string {
  const key = getKey();

  const parts = ciphertext.split(':');
  if (parts.length !== 4) {
    throw new Error('[secrets] Malformed ciphertext: expected 4 colon-separated parts.');
  }

  const [version, ivB64, authTagB64, encryptedB64] = parts;

  if (version !== 'v1') {
    throw new Error(`[secrets] Unknown ciphertext version "${version}".`);
  }

  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const encrypted = Buffer.from(encryptedB64, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
