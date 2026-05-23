'use client';

import { useEffect, useState, useActionState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { resetPasswordAction } from '@/lib/auth/actions';
import { resetPasswordSchema, ResetPasswordInput } from '@/lib/auth/schemas';
import { FormField } from '../components/FormField';
import { SubmitButton } from '../components/SubmitButton';

type SessionStatus = 'loading' | 'ready' | 'invalid';

export default function ResetPasswordPage() {
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('loading');
  const [state, formAction] = useActionState(resetPasswordAction, null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
  });

  useEffect(() => {
    // Supabase Auth sends the recovery token in the URL hash.
    // createBrowserClient automatically detects it and establishes a session.
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionStatus('ready');
      } else if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        // Only transition to invalid if we never got PASSWORD_RECOVERY
        setSessionStatus((prev) => (prev === 'loading' ? 'invalid' : prev));
      }
    });

    // If no hash token is present at all, mark invalid immediately
    if (!window.location.hash.includes('access_token')) {
      setSessionStatus('invalid');
    }
  }, []);

  if (sessionStatus === 'loading') {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-[#16222E]/60 text-sm">
        <div className="w-8 h-8 border-2 border-[#F5C84B] border-t-transparent rounded-full animate-spin" aria-hidden />
        Verificando link...
      </div>
    );
  }

  if (sessionStatus === 'invalid') {
    return (
      <div className="text-center py-4">
        <h1 className="text-xl font-bold text-[#16222E] mb-2">Link inválido o expirado</h1>
        <p className="text-sm text-[#16222E]/60 mb-6">
          Este link de recuperación ya no es válido. Podés solicitar uno nuevo.
        </p>
        <Link
          href="/forgot-password"
          className="inline-block bg-[#F5C84B] hover:bg-[#D9A92A] text-[#16222E] font-bold text-sm px-6 py-3 rounded-xl transition-colors cursor-pointer"
        >
          Solicitar nuevo link
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-[#16222E] mb-1">Nueva contraseña</h1>
      <p className="text-sm text-[#16222E]/60 mb-6">
        Elegí una contraseña nueva para tu cuenta.
      </p>

      {state?.error && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
        >
          {state.error}
          {state.error.includes('expirado') && (
            <Link
              href="/forgot-password"
              className="block mt-2 font-semibold underline underline-offset-2"
            >
              Solicitar nuevo link
            </Link>
          )}
        </div>
      )}

      <form action={formAction} onSubmit={handleSubmit(() => {})} noValidate className="flex flex-col gap-4">
        <FormField
          id="password"
          label="Nueva contraseña"
          type="password"
          autoComplete="new-password"
          placeholder="Mínimo 8 caracteres"
          required
          error={errors.password?.message}
          {...register('password')}
        />

        <FormField
          id="confirmPassword"
          label="Repetir contraseña"
          type="password"
          autoComplete="new-password"
          placeholder="Repetí tu nueva contraseña"
          required
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <SubmitButton label="Guardar contraseña" loadingLabel="Guardando..." />
      </form>
    </div>
  );
}
