'use server';

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import { validateWhitelistSignup } from './validation';
import { signupSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from './schemas';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

function getRoleDestination(role: string, redirectTo?: string): string {
  // Honor an explicit redirect param only for paths that make sense per role
  if (redirectTo && redirectTo.startsWith('/')) {
    // Owners must not be redirected to /admin
    if (role === 'superadmin') return redirectTo;
    if (!redirectTo.startsWith('/admin')) return redirectTo;
  }
  return role === 'superadmin' ? '/admin' : '/onboarding';
}

// ---------------------------------------------------------------------------
// Signup
// ---------------------------------------------------------------------------

type SignupState = { error?: string } | null;

export async function signupAction(
  _prev: SignupState,
  formData: FormData
): Promise<SignupState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = signupSchema.safeParse(raw);

  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return { error: firstError.message };
  }

  const { email, password, token } = parsed.data;

  const validation = await validateWhitelistSignup({ email, token });

  if ('error' in validation) {
    const messages: Record<string, string> = {
      not_whitelisted: 'Este mail no está invitado. Pedí un invite al admin de tu tienda.',
      expired: 'Tu invite venció. Pedile al admin que te re-envíe.',
      already_registered: 'Ya existe una cuenta con este mail. ¿Querés iniciar sesión?',
      invalid_token: 'El link de invite es inválido. Pedí uno nuevo al admin.',
    };
    return { error: messages[validation.error] ?? 'No podemos crear tu cuenta con este mail.' };
  }

  const supabase = await createServerClient();
  const { data, error: signUpError } = await supabase.auth.signUp({ email, password });

  if (signUpError || !data.user) {
    return { error: 'Hubo un error al crear tu cuenta. Intentá de nuevo.' };
  }

  // Mark as registered in whitelist using admin client
  const admin = createAdminClient();
  await admin
    .from('whitelist')
    .update({ registered_at: new Date().toISOString() })
    .eq('email', email.toLowerCase());

  redirect(getRoleDestination(validation.grant_role));
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

type LoginState = { error?: string } | null;

export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = loginSchema.safeParse(raw);

  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return { error: firstError.message };
  }

  const { email, password } = parsed.data;
  const redirectTo = (formData.get('redirectTo') as string | null) ?? '';

  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return { error: 'Mail o contraseña incorrectos.' };
  }

  // Fetch role from public.users
  const admin = createAdminClient();
  const { data: userRow } = await admin
    .from('users')
    .select('role')
    .eq('id', data.user.id)
    .single();

  const role = userRow?.role ?? 'owner';
  redirect(getRoleDestination(role, redirectTo));
}

// ---------------------------------------------------------------------------
// Forgot password
// ---------------------------------------------------------------------------

type ForgotPasswordState = { sent?: boolean; error?: string } | null;

export async function forgotPasswordAction(
  _prev: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = forgotPasswordSchema.safeParse(raw);

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { email } = parsed.data;
  const supabase = await createServerClient();

  // We intentionally ignore the error to avoid account enumeration
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${APP_URL}/reset-password`,
  });

  return { sent: true };
}

// ---------------------------------------------------------------------------
// Reset password
// ---------------------------------------------------------------------------

type ResetPasswordState = { error?: string } | null;

export async function resetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData
): Promise<ResetPasswordState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = resetPasswordSchema.safeParse(raw);

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { password } = parsed.data;
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.updateUser({ password });

  if (error || !data.user) {
    return { error: 'No pudimos actualizar tu contraseña. El link puede haber expirado.' };
  }

  // Fetch role to redirect correctly
  const admin = createAdminClient();
  const { data: userRow } = await admin
    .from('users')
    .select('role')
    .eq('id', data.user.id)
    .single();

  const role = userRow?.role ?? 'owner';
  redirect(getRoleDestination(role));
}
