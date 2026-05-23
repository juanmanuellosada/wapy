'use client';

import { useActionState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { signupAction } from '@/lib/auth/actions';
import { signupSchema, SignupInput } from '@/lib/auth/schemas';
import { FormField } from '../components/FormField';
import { SubmitButton } from '../components/SubmitButton';

interface SignupFormProps {
  prefillEmail?: string;
  token?: string;
}

export function SignupForm({ prefillEmail, token }: SignupFormProps) {
  const [state, formAction] = useActionState(signupAction, null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: prefillEmail ?? '' },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-[#16222E] mb-1">Crear cuenta</h1>
      <p className="text-sm text-[#16222E]/60 mb-6">
        Ingresá tus datos para activar tu acceso a Wapy.
      </p>

      {/* Server-side error banner */}
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
        {/* Hidden token field if provided */}
        {token && <input type="hidden" name="token" value={token} />}

        <FormField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="vos@tutienda.com"
          readOnly={!!prefillEmail}
          required
          error={errors.email?.message}
          {...register('email')}
        />

        <FormField
          id="password"
          label="Contraseña"
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
          placeholder="Repetí tu contraseña"
          required
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <SubmitButton label="Crear cuenta" loadingLabel="Creando cuenta..." />
      </form>

      <p className="mt-6 text-center text-sm text-[#16222E]/60">
        ¿Ya tenés cuenta?{' '}
        <Link href="/login" className="font-semibold text-[#16222E] hover:underline underline-offset-2">
          Entrar
        </Link>
      </p>
    </div>
  );
}
