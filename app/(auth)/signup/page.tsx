import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/server';
import { SignupForm } from './SignupForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Crear cuenta — Wapy',
};

interface SignupPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const { token } = await searchParams;
  let prefillEmail: string | undefined;

  // If a token is present, look up the corresponding email in the whitelist
  if (token) {
    const admin = createAdminClient();
    const { data } = await admin
      .from('whitelist')
      .select('email')
      .eq('invite_token', token)
      .single();
    prefillEmail = data?.email ?? undefined;
  }

  return <SignupForm prefillEmail={prefillEmail} token={token} />;
}
