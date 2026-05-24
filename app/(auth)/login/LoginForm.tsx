'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { loginAction } from '@/lib/auth/actions';
import { loginSchema, LoginInput } from '@/lib/auth/schemas';
import { FormField } from '../components/FormField';
import { SubmitButton } from '../components/SubmitButton';

interface LoginFormProps {
  redirectTo?: string;
}

export function LoginForm({ redirectTo }: LoginFormProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(loginAction, null);
  // Custom pending state — useActionState's isPending sometimes batches with
  // the state update, hiding the spinner. This keeps it visible from click
  // through navigation (only resets on error so the user can retry).
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (state?.redirect) {
      router.push(state.redirect);
      // submitting stays true — navigation will unmount this component
    } else if (state?.error) {
      setSubmitting(false);
    }
  }, [state, router]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onValidSubmit = (data: LoginInput) => {
    setSubmitting(true);
    const fd = new FormData();
    fd.set('email', data.email);
    fd.set('password', data.password);
    if (redirectTo) fd.set('redirectTo', redirectTo);
    formAction(fd);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-[#16222E] mb-1">Entrar</h1>
      <p className="text-sm text-[#16222E]/60 mb-6">
        Iniciá sesión con tu mail y contraseña.
      </p>

      {state?.error && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
        >
          {state.error}
        </div>
      )}

      <form onSubmit={handleSubmit(onValidSubmit)} noValidate className="flex flex-col gap-4">

        <FormField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="vos@tutienda.com"
          required
          error={errors.email?.message}
          {...register('email')}
        />

        <FormField
          id="password"
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          placeholder="Tu contraseña"
          required
          error={errors.password?.message}
          {...register('password')}
        />

        <div className="text-right -mt-1">
          <Link
            href="/forgot-password"
            className="text-xs text-[#16222E]/60 hover:text-[#16222E] hover:underline underline-offset-2 transition-colors"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        <SubmitButton label="Entrar" loadingLabel="Entrando..." pending={submitting || isPending} />
      </form>

      <p className="mt-6 text-center text-sm text-[#16222E]/60">
        ¿Te invitaron?{' '}
        <Link href="/signup" className="font-semibold text-[#16222E] hover:underline underline-offset-2">
          Registrate
        </Link>
      </p>
    </div>
  );
}
