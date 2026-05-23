'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, CheckCircle } from 'lucide-react';
import { saveStoreBasics } from '@/lib/store/actions';
import type { Store } from '@/lib/onboarding/state';

const infoSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(80, 'Máximo 80 caracteres'),
  description: z.string().max(280, 'Máximo 280 caracteres').optional(),
});

type InfoFormData = z.infer<typeof infoSchema>;

type Props = {
  store: Store;
};

export function InfoPanel({ store }: Props) {
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<InfoFormData>({
    resolver: zodResolver(infoSchema),
    defaultValues: {
      name: store.name ?? '',
      description: store.description ?? '',
    },
  });

  const onSubmit = async (data: InfoFormData) => {
    setSaving(true);
    setSuccess(false);
    setServerError(null);

    const result = await saveStoreBasics({
      name: data.name,
      description: data.description,
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
      <h1 className="text-xl font-bold text-[#FBF7EC] mb-6">Información</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {serverError && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">
            {serverError}
          </div>
        )}

        {/* Name */}
        <div>
          <label htmlFor="info-name" className="block text-sm font-semibold text-[#FBF7EC] mb-1.5">
            Nombre de la tienda <span aria-hidden className="text-red-400">*</span>
          </label>
          <input
            id="info-name"
            type="text"
            maxLength={80}
            {...register('name')}
            className="w-full rounded-xl bg-white/8 border border-white/15 text-[#FBF7EC] placeholder-white/30 px-4 py-3 text-sm focus:outline-none focus:border-[#F5C84B]/70 transition-colors"
            aria-invalid={!!errors.name}
          />
          {errors.name && <p role="alert" className="text-xs text-red-400 mt-1">{errors.name.message}</p>}
        </div>

        {/* Description */}
        <div>
          <label htmlFor="info-desc" className="block text-sm font-semibold text-[#FBF7EC] mb-1.5">
            Descripción <span className="text-white/30 font-normal">(opcional)</span>
          </label>
          <textarea
            id="info-desc"
            rows={3}
            maxLength={280}
            {...register('description')}
            className="w-full rounded-xl bg-white/8 border border-white/15 text-[#FBF7EC] placeholder-white/30 px-4 py-3 text-sm focus:outline-none focus:border-[#F5C84B]/70 transition-colors resize-none"
          />
          <p className="text-xs text-white/30 mt-1 text-right">
            {watch('description')?.length ?? 0}/280
          </p>
        </div>

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
