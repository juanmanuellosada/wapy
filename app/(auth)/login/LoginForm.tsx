'use client';

import { useActionState } from 'react';
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
  const [state, formAction] = useActionState(loginAction, null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

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

      <form action={formAction} onSubmit={handleSubmit(() => {})} noValidate className="flex flex-col gap-4">
        {/* Pass redirect destination through to the server action */}
        {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}

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

        <SubmitButton label="Entrar" loadingLabel="Entrando..." />
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
