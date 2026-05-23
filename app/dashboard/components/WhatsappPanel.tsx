'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, CheckCircle } from 'lucide-react';
import { whatsappSchema, type WhatsappData } from '@/lib/onboarding/schemas';
import { saveStoreWhatsapp } from '@/lib/store/actions';
import type { Store } from '@/lib/onboarding/state';

type Props = {
  store: Store;
};

function normalizePhone(value: string): string {
  return value.replace(/\s/g, '');
}

function formatWaLink(phone: string): string {
  const normalized = normalizePhone(phone).replace(/^\+/, '');
  return `wa.me/${normalized}`;
}

export function WhatsappPanel({ store }: Props) {
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<WhatsappData>({
    resolver: zodResolver(whatsappSchema),
    defaultValues: {
      whatsapp_number: store.whatsapp_number ?? '+54 9 ',
    },
  });

  const phoneValue = watch('whatsapp_number');
  const normalizedPhone = normalizePhone(phoneValue ?? '');
  const showPreview = /^\+[1-9]\d{6,14}$/.test(normalizedPhone);

  const onSubmit = async (data: WhatsappData) => {
    setSaving(true);
    setSuccess(false);
    setServerError(null);

    const result = await saveStoreWhatsapp({
      whatsapp_number: normalizePhone(data.whatsapp_number),
    });

    setSaving(false);

    if ('error' in result) {
      setServerError(result.error);
      return;
    }

    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  return (
    <div>
      <h1 className="text-xl font-bold text-[#FBF7EC] mb-6">WhatsApp</h1>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
        {serverError && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">
            {serverError}
          </div>
        )}

        <div>
          <p className="text-sm text-white/50 mb-5">
            Los pedidos de tus clientes llegarán a este número.
          </p>

          <label htmlFor="wa-number" className="block text-sm font-semibold text-[#FBF7EC] mb-1.5">
            Número de WhatsApp <span aria-hidden className="text-red-400">*</span>
          </label>
          <input
            id="wa-number"
            type="tel"
            autoComplete="tel"
            {...register('whatsapp_number')}
            placeholder="+54 9 11 1234 5678"
            className="w-full rounded-xl bg-white/8 border border-white/15 text-[#FBF7EC] placeholder-white/30 px-4 py-3 text-sm focus:outline-none focus:border-[#F5C84B]/70 focus:bg-white/10 transition-colors font-mono"
            aria-invalid={!!errors.whatsapp_number}
            aria-describedby={errors.whatsapp_number ? 'wa-error' : 'wa-hint'}
          />
          {errors.whatsapp_number ? (
            <p id="wa-error" role="alert" className="text-xs text-red-400 mt-1.5">
              {errors.whatsapp_number.message}
            </p>
          ) : (
            <p id="wa-hint" className="text-xs text-white/30 mt-1.5">
              Incluí el código de país. Ej: +54 9 11 1234 5678
            </p>
          )}
        </div>

        {showPreview && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
            <p className="text-xs text-white/50 mb-1">Los pedidos llegarán a:</p>
            <p className="text-sm font-mono text-green-400">{formatWaLink(normalizedPhone)}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          {success && (
            <span className="flex items-center gap-1.5 text-sm text-green-400">
              <CheckCircle size={14} />
              Guardado
            </span>
          )}
          <button
            type="submit"
            disabled={saving}
            className="min-h-[44px] px-6 rounded-xl bg-[#F5C84B] text-[#16222E] font-bold text-sm hover:bg-[#FAE08A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2 cursor-pointer"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
}
