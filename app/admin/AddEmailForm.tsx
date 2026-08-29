'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { addEmailSchema, type AddEmailInput, type AddEmailFormInput } from '@/lib/admin/schemas';
import { addWhitelistEntry } from '@/lib/admin/actions';
import { TRIAL_DAYS } from '@/lib/subscription/constants';

type Feedback =
  | { type: 'success'; email: string; mail_sent: boolean; mail_error?: string }
  | { type: 'error'; message: string }
  | null;

export function AddEmailForm() {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddEmailFormInput, unknown, AddEmailInput>({
    resolver: zodResolver(addEmailSchema),
    defaultValues: { grant_role: 'owner', plan: 'inicial', trial_days: TRIAL_DAYS },
  });

  function onSubmit(data: AddEmailInput) {
    setFeedback(null);
    const formData = new FormData();
    formData.append('email', data.email);
    formData.append('grant_role', data.grant_role);
    formData.append('plan', data.plan);
    formData.append('trial_days', String(data.trial_days));

    startTransition(async () => {
      const result = await addWhitelistEntry(formData);

      if ('error' in result) {
        const messages: Record<string, string> = {
          duplicate: 'Este mail ya está en la whitelist.',
          validation: result.message ?? 'Datos inválidos.',
          forbidden: 'Sin permiso para realizar esta acción.',
          unknown: result.message ?? 'Error inesperado.',
        };
        setFeedback({ type: 'error', message: messages[result.error] ?? 'Error.' });
        return;
      }

      setFeedback({
        type: 'success',
        email: data.email,
        mail_sent: result.mail_sent,
        mail_error: result.mail_sent ? undefined : (result as { ok: true; mail_sent: false; mail_error: string }).mail_error,
      });
      reset();
    });
  }

  return (
    <section
      aria-labelledby="add-email-heading"
      className="bg-white rounded-xl border-2 border-[#F5C84B] p-6 shadow-sm"
    >
      <h2
        id="add-email-heading"
        className="text-base font-bold text-[#16222E] mb-4"
      >
        Agregar email a la whitelist
      </h2>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3">
        <div>
          <label htmlFor="new-email" className="block text-xs font-semibold text-[#16222E]/70 mb-1">
            Email <span aria-hidden="true" className="text-red-500">*</span>
          </label>
          <input
            id="new-email"
            type="email"
            autoComplete="off"
            placeholder="nuevo@ejemplo.com"
            aria-required="true"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
            disabled={isPending}
            {...register('email')}
            className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-[#16222E]/20 bg-[#FBF7EC] text-[#16222E] text-sm placeholder:text-[#16222E]/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5C84B] focus-visible:border-[#F5C84B] transition disabled:opacity-50"
          />
          {errors.email && (
            <p id="email-error" role="alert" className="mt-1 text-xs text-red-600">
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-start">
          <div>
            <label htmlFor="new-role" className="block text-xs font-semibold text-[#16222E]/70 mb-1">
              Rol
            </label>
            <select
              id="new-role"
              disabled={isPending}
              {...register('grant_role')}
              className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-[#16222E]/20 bg-[#FBF7EC] text-[#16222E] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5C84B] focus-visible:border-[#F5C84B] transition disabled:opacity-50 cursor-pointer"
            >
              <option value="owner">Owner</option>
              <option value="superadmin">Superadmin</option>
            </select>
          </div>

          <div>
            <label htmlFor="new-plan" className="block text-xs font-semibold text-[#16222E]/70 mb-1">
              Plan
            </label>
            <select
              id="new-plan"
              aria-invalid={!!errors.plan}
              aria-describedby={errors.plan ? 'plan-error' : undefined}
              disabled={isPending}
              {...register('plan')}
              className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-[#16222E]/20 bg-[#FBF7EC] text-[#16222E] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5C84B] focus-visible:border-[#F5C84B] transition disabled:opacity-50 cursor-pointer"
            >
              <option value="inicial">Inicial</option>
              <option value="medio">Medio</option>
              <option value="pro">Pro</option>
            </select>
            {errors.plan && (
              <p id="plan-error" role="alert" className="mt-1 text-xs text-red-600">
                {errors.plan.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="new-trial-days" className="block text-xs font-semibold text-[#16222E]/70 mb-1">
              Días de prueba
            </label>
            <input
              id="new-trial-days"
              type="number"
              min={0}
              max={365}
              step={1}
              aria-invalid={!!errors.trial_days}
              aria-describedby={errors.trial_days ? 'trial-days-error' : undefined}
              disabled={isPending}
              {...register('trial_days')}
              className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-[#16222E]/20 bg-[#FBF7EC] text-[#16222E] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5C84B] focus-visible:border-[#F5C84B] transition disabled:opacity-50"
            />
            {errors.trial_days && (
              <p id="trial-days-error" role="alert" className="mt-1 text-xs text-red-600">
                {errors.trial_days.message}
              </p>
            )}
          </div>

          <div className="sm:mt-[1.375rem]">
            <button
              type="submit"
              disabled={isPending}
              aria-busy={isPending}
              className="w-full min-h-[44px] px-5 py-2 rounded-lg bg-[#F5C84B] text-[#16222E] font-bold text-sm hover:bg-[#e8b93f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5C84B] transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            >
              {isPending ? 'Invitando…' : 'Invitar'}
            </button>
          </div>
        </div>
      </form>

      {/* Feedback */}
      {feedback?.type === 'success' && feedback.mail_sent && (
        <p role="status" aria-live="polite" className="mt-3 text-sm text-green-700 font-medium">
          Mail enviado a <span className="font-bold">{feedback.email}</span>. Ya puede registrarse — avisale que revise spam si no lo ve.
        </p>
      )}
      {feedback?.type === 'success' && !feedback.mail_sent && (
        <p role="status" aria-live="polite" className="mt-3 text-sm text-yellow-700 font-medium">
          Invite agregado para <span className="font-bold">{feedback.email}</span>, pero el mail no se envió:{' '}
          {feedback.mail_error}. Probá Re-invitar desde la tabla.
        </p>
      )}
      {feedback?.type === 'error' && (
        <p role="alert" aria-live="assertive" className="mt-3 text-sm text-red-600 font-medium">
          {feedback.message}
        </p>
      )}
    </section>
  );
}
