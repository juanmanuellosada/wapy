import * as Sentry from '@sentry/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';
import { sendPasswordResetEmail, sendConfirmSignupEmail } from '@/lib/email';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// Types — Supabase Send Email Hook payload
// ---------------------------------------------------------------------------

interface HookPayload {
  user: {
    email: string;
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
    token_new: string;
    token_hash_new: string;
  };
}

// ---------------------------------------------------------------------------
// POST /api/auth/send-email
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // 1. Read body raw (must happen before any parsing for signature verification)
  const payload = await req.text();

  // 2. Verify Standard Webhooks signature
  const hookSecret = process.env.SEND_EMAIL_HOOK_SECRET;
  if (!hookSecret) {
    console.error('[send-email hook] Missing SEND_EMAIL_HOOK_SECRET');
    return NextResponse.json(
      { error: { http_code: 500, message: 'Hook secret not configured' } },
      { status: 401 },
    );
  }

  // Strip the "v1,whsec_" prefix that Supabase prepends to the secret
  const secret = hookSecret.replace(/^v1,whsec_/, '');
  const wh = new Webhook(secret);

  const headers = {
    'webhook-id': req.headers.get('webhook-id') ?? '',
    'webhook-timestamp': req.headers.get('webhook-timestamp') ?? '',
    'webhook-signature': req.headers.get('webhook-signature') ?? '',
  };

  let data: HookPayload;
  try {
    data = wh.verify(payload, headers) as HookPayload;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid signature';
    return NextResponse.json(
      { error: { http_code: 401, message } },
      { status: 401 },
    );
  }

  // 3. Build the verification link pointing to Supabase's native verifier
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const { token_hash, email_action_type, redirect_to } = data.email_data;
  const verifyUrl =
    `${supabaseUrl}/auth/v1/verify` +
    `?token=${token_hash}` +
    `&type=${email_action_type}` +
    `&redirect_to=${redirect_to}`;

  const to = data.user.email;

  // 4. Dispatch by email_action_type
  try {
    if (email_action_type === 'recovery') {
      await sendPasswordResetEmail({ to, url: verifyUrl });
    } else if (email_action_type === 'signup' || email_action_type === 'email') {
      await sendConfirmSignupEmail({ to, url: verifyUrl });
    } else {
      // Unsupported type — send a generic confirmation and log to Sentry
      Sentry.captureMessage(
        `[send-email hook] Unhandled email_action_type: ${email_action_type}`,
        { level: 'warning', extra: { email_action_type, to } },
      );
      await sendConfirmSignupEmail({ to, url: verifyUrl });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Email send failed';
    Sentry.captureException(err, {
      tags: { feature: 'send-email-hook' },
      extra: { email_action_type, to },
    });
    return NextResponse.json(
      { error: { http_code: 500, message } },
      { status: 401 },
    );
  }

  return NextResponse.json({});
}
