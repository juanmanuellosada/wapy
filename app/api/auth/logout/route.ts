import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  // signOut clears the auth cookies from the cookie store
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/', request.url));
}
