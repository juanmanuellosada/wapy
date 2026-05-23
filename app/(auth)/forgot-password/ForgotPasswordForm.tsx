'use client';

import { useActionState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { forgotPasswordAction } from '@/lib/auth/actions';
import { forgotPasswordSchema, ForgotPasswordInput } from '@/lib/auth/schemas';
import { FormField } from '../components/FormField';
import { SubmitButton } from '../components/SubmitButton';

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(forgotPasswordAction, null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  if (state?.sent) {
    return (
      <div className="text-center py-4">
        <div className="text-4xl mb-4" aria-hidden>
          ✉️
        </div>
        <h1 className="text-xl font-bold text-[#16222E] mb-2">Revisá tu mail</h1>
        <p className="text-sm text-[#16222E]/60">
          Si existe una cuenta con ese mail, te mandamos un link para resetear la contraseña.
          Revisá también la carpeta de spam.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block text-sm font-semibold text-[#16222E] hover:underline underline-offset-2"
        >
          Volver a entrar
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-[#16222E] mb-1">Recuperar contraseña</h1>
      <p className="text-sm text-[#16222E]/60 mb-6">
        Ingresá tu mail y te mandamos un link para crear una nueva contraseña.
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

        <SubmitButton label="Enviar link" loadingLabel="Enviando..." />
      </form>

      <p className="mt-6 text-center text-sm text-[#16222E]/60">
        <Link href="/login" className="font-semibold text-[#16222E] hover:underline underline-offset-2">
          Volver a entrar
        </Link>
      </p>
    </div>
  );
}
