'use server';

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';

/**
 * Server Action invoked via <form action={logoutAction}>.
 *
 * Replaces the prior /api/auth/logout route handler, which received GET
 * requests from some browser paths and returned HTTP 405. Server actions
 * are POST-only by design (React handles dispatch) and integrate
 * naturally with redirect().
 */
export async function logoutAction() {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect('/');
}
