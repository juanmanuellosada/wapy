import { render } from '@react-email/render';
import { Resend } from 'resend';
import * as React from 'react';

// Lazy singleton — instantiated on first send, not at import time.
let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error(
        'Missing env var: RESEND_API_KEY. Set it in .env.local (dev) or Vercel env vars (prod).',
      );
    }
    _resend = new Resend(apiKey);
  }
  return _resend;
}

const FROM = 'Wapy <hola@wapy.com.ar>';

interface SendEmailOptions {
  to: string;
  subject: string;
  react: React.ReactElement;
  replyTo?: string;
  headers?: Record<string, string>;
}

export async function sendEmail({ to, subject, react, replyTo, headers }: SendEmailOptions) {
  const html = await render(react);
  const resend = getResend();

  const { data, error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    html,
    replyTo: replyTo ?? 'hola@wapy.com.ar',
    headers: {
      'List-Unsubscribe': '<mailto:hola@wapy.com.ar>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      ...headers,
    },
  });

  if (error) throw new Error(`Resend error: ${error.message}`);

  return data;
}
