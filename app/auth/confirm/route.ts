import { NextRequest, NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Only allow relative, same-site redirects (prevents open redirect via `next`).
function safeNext(next: string | null): string {
  if (next && next.startsWith('/') && !next.startsWith('//')) {
    return next;
  }
  return '/';
}

// Verifica el token_hash del email (recovery/signup/email) del lado del servidor.
// A diferencia del /auth/v1/verify de Supabase, no depende de un PKCE code
// verifier guardado en el navegador, así que funciona aunque el link se abra
// en un dispositivo distinto al que pidió el mail.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = safeNext(searchParams.get('next'));

  if (!token_hash || !type) {
    const url = new URL('/login', origin);
    url.searchParams.set('error', 'El link es inválido o está incompleto. Pedí uno nuevo.');
    return NextResponse.redirect(url);
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });

  const redirectUrl = new URL(next, origin);

  if (error) {
    redirectUrl.searchParams.set(
      'error',
      'Este link ya no es válido. Puede haber expirado o haber sido usado. Pedí uno nuevo.'
    );
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.redirect(redirectUrl);
}
