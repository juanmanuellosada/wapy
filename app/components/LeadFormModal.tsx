'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle } from 'lucide-react';
import { leadFormSchema, type LeadFormInput } from '@/lib/leads/schemas';
import { createLead } from '@/lib/leads/actions';
import { useState, useTransition } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  plan: 'inicial' | 'medio' | 'pro';
}

export function LeadFormModal({ open, onClose, plan }: Props) {
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LeadFormInput>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: { plan },
  });

  // Reset state when modal reopens
  useEffect(() => {
    if (open) {
      setSubmitted(false);
      setServerError(null);
      reset({ plan });
    }
  }, [open, plan, reset]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function onSubmit(data: LeadFormInput) {
    setServerError(null);
    const formData = new FormData();
    formData.append('email', data.email);
    formData.append('name', data.name);
    formData.append('whatsapp', data.whatsapp);
    formData.append('plan', data.plan);

    startTransition(async () => {
      const result = await createLead(formData);
      if ('error' in result) {
        if (result.error === 'validation') {
          setServerError(result.message);
        } else {
          setServerError('Ocurrió un error. Intentá de nuevo en unos segundos.');
        }
      } else {
        setSubmitted(true);
      }
    });
  }

  const planLabel = plan === 'pro' ? 'Pro' : plan === 'medio' ? 'Medio' : 'Inicial';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Formulario para Plan ${planLabel}`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md bg-[#FBF7EC] rounded-[2rem] shadow-2xl overflow-hidden">
        {/* Top accent */}
        <div className="h-1.5 bg-gradient-to-r from-[#F5C84B] via-[#FFD86B] to-[#F5C84B]" />

        <div className="px-8 py-8">
          {submitted ? (
            /* Success state */
            <div className="flex flex-col items-center text-center gap-4 py-4">
              <div className="w-16 h-16 rounded-full bg-[#F5C84B]/20 flex items-center justify-center">
                <CheckCircle className="w-9 h-9 text-[#F5C84B]" strokeWidth={2} />
              </div>
              <div>
                <h3
                  className="text-xl font-bold text-[#16222E] mb-2"
                  style={{ fontFamily: 'var(--font-agbalumo)' }}
                >
                  ¡Recibido!
                </h3>
                <p className="text-[#16222E]/70 text-sm leading-relaxed">
                  Te contactamos en menos de 24hs por mail o WhatsApp para darte acceso al plan{' '}
                  <span className="font-bold">{planLabel}</span>.{' '}
                  Si te llega por mail, revisá la carpeta de spam por las dudas.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 px-8 py-3 rounded-full bg-[#16222E] text-white font-bold text-sm hover:bg-[#1e3040] transition-colors duration-150 cursor-pointer min-h-[44px]"
              >
                Cerrar
              </button>
            </div>
          ) : (
            /* Form state */
            <>
              <div className="mb-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#16222E]/8 text-[#16222E]/70 text-xs font-bold uppercase tracking-wide mb-3">
                  Plan {planLabel}
                </div>
                <h2
                  className="text-xl font-bold text-[#16222E]"
                  style={{ fontFamily: 'var(--font-agbalumo)' }}
                >
                  Quiero mi tienda
                </h2>
                <p className="text-[#16222E]/60 text-sm mt-1">
                  Completá tus datos y te damos acceso en menos de 24hs.
                </p>
              </div>

              {serverError && (
                <div
                  role="alert"
                  className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm"
                >
                  {serverError}
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
                {/* Name */}
                <div>
                  <label
                    htmlFor="lead-name"
                    className="block text-xs font-bold text-[#16222E]/70 mb-1"
                  >
                    Nombre <span aria-hidden="true" className="text-red-500">*</span>
                  </label>
                  <input
                    id="lead-name"
                    type="text"
                    autoComplete="name"
                    placeholder="Tu nombre"
                    disabled={isPending}
                    aria-invalid={!!errors.name}
                    aria-describedby={errors.name ? 'lead-name-error' : undefined}
                    {...register('name')}
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-[#16222E]/20 bg-white text-[#16222E] text-sm placeholder:text-[#16222E]/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5C84B] transition disabled:opacity-50"
                  />
                  {errors.name && (
                    <p id="lead-name-error" role="alert" className="mt-1 text-xs text-red-600">
                      {errors.name.message}
                    </p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label
                    htmlFor="lead-email"
                    className="block text-xs font-bold text-[#16222E]/70 mb-1"
                  >
                    Email <span aria-hidden="true" className="text-red-500">*</span>
                  </label>
                  <input
                    id="lead-email"
                    type="email"
                    autoComplete="email"
                    placeholder="tu@email.com"
                    disabled={isPending}
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? 'lead-email-error' : undefined}
                    {...register('email')}
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-[#16222E]/20 bg-white text-[#16222E] text-sm placeholder:text-[#16222E]/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5C84B] transition disabled:opacity-50"
                  />
                  {errors.email && (
                    <p id="lead-email-error" role="alert" className="mt-1 text-xs text-red-600">
                      {errors.email.message}
                    </p>
                  )}
                </div>

                {/* WhatsApp */}
                <div>
                  <label
                    htmlFor="lead-whatsapp"
                    className="block text-xs font-bold text-[#16222E]/70 mb-1"
                  >
                    WhatsApp <span aria-hidden="true" className="text-red-500">*</span>
                  </label>
                  <input
                    id="lead-whatsapp"
                    type="tel"
                    autoComplete="tel"
                    placeholder="+54 9 11 1234 5678"
                    disabled={isPending}
                    aria-invalid={!!errors.whatsapp}
                    aria-describedby="lead-whatsapp-hint lead-whatsapp-error"
                    {...register('whatsapp')}
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-[#16222E]/20 bg-white text-[#16222E] text-sm placeholder:text-[#16222E]/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5C84B] transition disabled:opacity-50"
                  />
                  <p id="lead-whatsapp-hint" className="mt-1 text-xs text-[#16222E]/40">
                    Ej: +54 9 11 1234 5678 o 11 1234 5678
                  </p>
                  {errors.whatsapp && (
                    <p id="lead-whatsapp-error" role="alert" className="mt-0.5 text-xs text-red-600">
                      {errors.whatsapp.message}
                    </p>
                  )}
                </div>

                {/* Hidden plan field */}
                <input type="hidden" {...register('plan')} value={plan} />

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isPending}
                  aria-busy={isPending}
                  className="w-full min-h-[52px] px-6 py-3 rounded-full bg-[#F5C84B] text-[#16222E] font-extrabold text-sm hover:bg-[#D9A92A] transition-all duration-200 shadow-lg shadow-[#F5C84B]/25 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isPending ? 'Enviando…' : `Quiero el Plan ${planLabel}`}
                </button>

                <p className="text-center text-xs text-[#16222E]/40">
                  Sin tarjeta · 7 días gratis · Te contactamos en 24hs
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
