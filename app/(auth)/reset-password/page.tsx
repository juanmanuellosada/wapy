'use client';

import { useEffect, useState, useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase/client';
import { resetPasswordAction } from '@/lib/auth/actions';
import { resetPasswordSchema, ResetPasswordInput } from '@/lib/auth/schemas';
import { FormField } from '../components/FormField';
import { SubmitButton } from '../components/SubmitButton';

type SessionStatus = 'loading' | 'ready' | 'invalid';

const SESSION_CHECK_TIMEOUT_MS = 5000;

export default function ResetPasswordPage() {
  const router = useRouter();
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('loading');
  const [invalidReason, setInvalidReason] = useState<string | null>(null);
  const [state, formAction, isPending] = useActionState(resetPasswordAction, null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (state?.redirect) {
      router.push(state.redirect);
    } else if (state?.error) {
      setSubmitting(false);
    }
  }, [state, router]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const onValidSubmit = (data: ResetPasswordInput) => {
    setSubmitting(true);
    const fd = new FormData();
    fd.set('password', data.password);
    fd.set('confirmPassword', data.confirmPassword);
    formAction(fd);
  };

  useEffect(() => {
    // Supabase Auth can send the recovery token two ways depending on the
    // configured flow: PKCE (`?code=...` query param) or implicit
    // (`#access_token=...` hash). We support both without assuming which is active.
    const supabase = createBrowserClient();
    let resolved = false;

    const markReady = () => {
      if (resolved) return;
      resolved = true;
      // Strip the code/hash so a page refresh doesn't retry an already-consumed token.
      window.history.replaceState(null, '', window.location.pathname);
      setSessionStatus('ready');
    };

    const markInvalid = (reason?: string) => {
      if (resolved) return;
      resolved = true;
      if (reason) setInvalidReason(reason);
      setSessionStatus('invalid');
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        markReady();
      }
    });

    const params = new URLSearchParams(window.location.search);
    const errorDescription = params.get('error_description') ?? params.get('error');
    const code = params.get('code');
    const hasHashToken = window.location.hash.includes('access_token');

    if (errorDescription) {
      markInvalid(errorDescription);
    } else if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) markInvalid(error.message);
        else markReady();
      });
    } else if (hasHashToken) {
      // Implicit flow: the onAuthStateChange listener above will fire PASSWORD_RECOVERY.
    } else {
      // Safety net: a session may already be active (e.g. re-render after it resolved).
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) markReady();
      });
    }

    const timeout = setTimeout(() => markInvalid(), SESSION_CHECK_TIMEOUT_MS);

    return () => {
      clearTimeout(timeout);
      authListener.subscription.unsubscribe();
    };
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
          {invalidReason && <span className="block mt-1 text-xs">({invalidReason})</span>}
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

      <form onSubmit={handleSubmit(onValidSubmit)} noValidate className="flex flex-col gap-4">
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

        <SubmitButton label="Guardar contraseña" loadingLabel="Guardando..." pending={submitting || isPending} />
      </form>
    </div>
  );
}
