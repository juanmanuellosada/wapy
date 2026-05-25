'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, CheckCircle } from 'lucide-react';
import { saveStoreBasics } from '@/lib/store/actions';
import type { Store } from '@/lib/onboarding/state';
import { socialLinksSchema } from '@/lib/onboarding/schemas';

const infoSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(80, 'Máximo 80 caracteres'),
  description: z.string().max(280, 'Máximo 280 caracteres').optional(),
  social_links: socialLinksSchema,
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
      social_links: (store.social_links ?? {}) as unknown as {
        instagram?: string; facebook?: string; tiktok?: string; twitter?: string; youtube?: string;
      },
    },
  });

  const onSubmit = async (data: InfoFormData) => {
    setSaving(true);
    setSuccess(false);
    setServerError(null);

    const result = await saveStoreBasics({
      name: data.name,
      description: data.description,
      social_links: data.social_links,
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

        {/* Social links */}
        <details className="group">
          <summary className="cursor-pointer text-sm font-semibold text-[#FBF7EC] select-none list-none flex items-center gap-2 py-1">
            <span className="inline-block transition-transform group-open:rotate-90">▶</span>
            Redes sociales <span className="text-white/30 font-normal">(opcional)</span>
          </summary>
          <div className="mt-4 space-y-3">
            {(
              [
                { field: 'social_links.instagram', label: 'Instagram', placeholder: 'https://instagram.com/tutienda' },
                { field: 'social_links.facebook',  label: 'Facebook',  placeholder: 'https://facebook.com/tutienda' },
                { field: 'social_links.tiktok',    label: 'TikTok',    placeholder: 'https://tiktok.com/@tutienda'  },
                { field: 'social_links.twitter',   label: 'Twitter / X', placeholder: 'https://twitter.com/tutienda' },
                { field: 'social_links.youtube',   label: 'YouTube',   placeholder: 'https://youtube.com/@tutienda' },
              ] as const
            ).map(({ field, label, placeholder }) => (
              <div key={field}>
                <label htmlFor={`info-${field}`} className="block text-xs font-semibold text-white/60 mb-1">
                  {label}
                </label>
                <input
                  id={`info-${field}`}
                  type="url"
                  placeholder={placeholder}
                  {...register(field)}
                  className="w-full rounded-xl bg-white/8 border border-white/15 text-[#FBF7EC] placeholder-white/30 px-4 py-2.5 text-sm focus:outline-none focus:border-[#F5C84B]/70 transition-colors"
                />
                {(() => {
                  const key = field.split('.')[1] as keyof typeof errors.social_links;
                  const err = errors.social_links?.[key];
                  const msg = err && typeof err === 'object' && 'message' in err ? (err as { message?: string }).message : undefined;
                  return msg ? <p role="alert" className="text-xs text-red-400 mt-1">{msg}</p> : null;
                })()}
              </div>
            ))}
          </div>
        </details>

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
