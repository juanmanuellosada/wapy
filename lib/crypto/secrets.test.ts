// Test suite for lib/crypto/secrets.ts
// Run with: npx vitest run lib/crypto/secrets.test.ts

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { encryptSecret, decryptSecret } from './secrets';

// Set a valid test key before any function call triggers lazy key loading.
// 32 bytes of 0x42, base64-encoded.
const TEST_KEY = Buffer.alloc(32, 0x42).toString('base64');

beforeAll(() => {
  process.env.MP_TOKEN_ENC_KEY = TEST_KEY;
});

// ─── Round-trip ───────────────────────────────────────────────────────────────

describe('round-trip', () => {
  it('decrypt(encrypt(x)) === x for a simple string', () => {
    const plaintext = 'hello-world';
    expect(decryptSecret(encryptSecret(plaintext))).toBe(plaintext);
  });

  it('round-trips a realistic MP access token', () => {
    const token = 'APP_USR-1234567890abcdef-123456-abcdef1234567890abcdef1234567890-123456789';
    expect(decryptSecret(encryptSecret(token))).toBe(token);
  });

  it('round-trips an empty string', () => {
    expect(decryptSecret(encryptSecret(''))).toBe('');
  });

  it('round-trips a string with special characters and unicode', () => {
    const plaintext = 'tëst: {key: "value"} & <more>';
    expect(decryptSecret(encryptSecret(plaintext))).toBe(plaintext);
  });
});

// ─── IV randomness ───────────────────────────────────────────────────────────

describe('IV randomness', () => {
  it('two encryptions of the same plaintext produce different ciphertexts', () => {
    const plaintext = 'same-input';
    const c1 = encryptSecret(plaintext);
    const c2 = encryptSecret(plaintext);
    expect(c1).not.toBe(c2);
  });

  it('ciphertexts from same plaintext still both decrypt correctly', () => {
    const plaintext = 'same-input';
    const c1 = encryptSecret(plaintext);
    const c2 = encryptSecret(plaintext);
    expect(decryptSecret(c1)).toBe(plaintext);
    expect(decryptSecret(c2)).toBe(plaintext);
  });
});

// ─── Tamper detection ────────────────────────────────────────────────────────

describe('tamper detection', () => {
  it('throws when the ciphertext portion is altered', () => {
    const ct = encryptSecret('secret-value');
    const parts = ct.split(':');
    // Flip the first byte of the encrypted payload (last segment)
    const enc = Buffer.from(parts[3], 'base64');
    enc[0] ^= 0xff;
    parts[3] = enc.toString('base64');
    expect(() => decryptSecret(parts.join(':'))).toThrow();
  });

  it('throws when the authTag is altered', () => {
    const ct = encryptSecret('secret-value');
    const parts = ct.split(':');
    const tag = Buffer.from(parts[2], 'base64');
    tag[0] ^= 0xff;
    parts[2] = tag.toString('base64');
    expect(() => decryptSecret(parts.join(':'))).toThrow();
  });

  it('throws on a completely bogus ciphertext string', () => {
    expect(() => decryptSecret('not-valid-at-all')).toThrow();
  });

  it('throws when the version prefix is unknown', () => {
    const ct = encryptSecret('x');
    const tampered = ct.replace(/^v1:/, 'v99:');
    expect(() => decryptSecret(tampered)).toThrow(/Unknown ciphertext version/);
  });
});

// ─── Key validation ──────────────────────────────────────────────────────────
//
// These tests obtain fresh module instances via vi.resetModules() + dynamic
// import so that each test gets a clean _key cache and can exercise getKey().

describe('key validation', () => {
  it('throws when MP_TOKEN_ENC_KEY is not set', async () => {
    vi.resetModules();
    const saved = process.env.MP_TOKEN_ENC_KEY;
    delete process.env.MP_TOKEN_ENC_KEY;
    try {
      const mod = await import('./secrets');
      expect(() => mod.decryptSecret('v1:a:b:c')).toThrow(/MP_TOKEN_ENC_KEY is not set/);
    } finally {
      process.env.MP_TOKEN_ENC_KEY = saved;
    }
  });

  it('throws when key decodes to fewer than 32 bytes', async () => {
    vi.resetModules();
    const saved = process.env.MP_TOKEN_ENC_KEY;
    process.env.MP_TOKEN_ENC_KEY = Buffer.alloc(16, 0x01).toString('base64'); // 16 bytes
    try {
      const mod = await import('./secrets');
      expect(() => mod.decryptSecret('v1:a:b:c')).toThrow(/must decode to exactly 32 bytes/);
    } finally {
      process.env.MP_TOKEN_ENC_KEY = saved;
    }
  });
});
