'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { basicsSchema, type BasicsData } from '@/lib/onboarding/schemas';
import { saveBasics, checkSlugAvailable } from '@/lib/onboarding/actions';
import type { Store } from '@/lib/onboarding/state';

type Props = {
  store: Store | null;
};

type SlugStatus = 'idle' | 'checking' | 'available' | 'taken' | 'reserved' | 'invalid';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 32);
}

export function StepBasics({ store }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>('idle');
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const slugCheckIdRef = useRef(0);

  function getDescription(s: Store | null): string {
    if (!s?.theme || typeof s.theme !== 'object' || Array.isArray(s.theme)) return '';
    const t = s.theme as Record<string, unknown>;
    return typeof t.description === 'string' ? t.description : '';
  }

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<BasicsData>({
    resolver: zodResolver(basicsSchema),
    defaultValues: {
      name: store?.name ?? '',
      slug: store?.slug ?? '',
      description: getDescription(store),
    },
  });

  const nameValue = watch('name');
  const slugValue = watch('slug');
  const nameAutoSluggedRef = useRef(false);

  // Auto-derive slug from name only if user hasn't typed a slug yet
  useEffect(() => {
    if (!store?.slug && !nameAutoSluggedRef.current && nameValue) {
      setValue('slug', slugify(nameValue), { shouldValidate: false });
    }
  }, [nameValue, store?.slug, setValue]);

  const checkSlug = useCallback(
    async (slug: string) => {
      if (!slug || slug.length < 2) {
        setSlugStatus('idle');
        return;
      }

      const id = ++slugCheckIdRef.current;
      setSlugStatus('checking');

      const result = await checkSlugAvailable(slug, store?.id);

      // Discard stale results
      if (id !== slugCheckIdRef.current) return;

      if (result.available) {
        setSlugStatus('available');
      } else {
        setSlugStatus(result.reason ?? 'invalid');
      }
    },
    [store?.id]
  );

  // Debounced slug check
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (slugValue) {
      debounceRef.current = setTimeout(() => checkSlug(slugValue), 300);
    } else {
      setSlugStatus('idle');
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [slugValue, checkSlug]);

  const onSubmit = async (data: BasicsData) => {
    if (slugStatus === 'checking' || slugStatus === 'taken' || slugStatus === 'reserved' || slugStatus === 'invalid') {
      return;
    }

    setSubmitting(true);
    setServerError(null);

    const result = await saveBasics(data);

    if ('error' in result) {
      setServerError(result.error);
      setSubmitting(false);
      return;
    }

    router.push('/onboarding/look');
  };

  const slugStatusInfo = {
    idle: null,
    checking: { icon: <Loader2 size={14} className="animate-spin text-white/40" />, text: 'Verificando...', color: 'text-white/40' },
    available: { icon: <CheckCircle size={14} className="text-green-400" />, text: 'Slug disponible', color: 'text-green-400' },
    taken: { icon: <XCircle size={14} className="text-red-400" />, text: 'Ya está en uso por otra tienda', color: 'text-red-400' },
    reserved: { icon: <XCircle size={14} className="text-red-400" />, text: 'Reservado por el sistema', color: 'text-red-400' },
    invalid: { icon: <XCircle size={14} className="text-red-400" />, text: 'Formato inválido', color: 'text-red-400' },
  };

  const slugInfo = slugStatusInfo[slugStatus];

  const canSubmit =
    !submitting &&
    (slugStatus === 'available' || (slugStatus === 'idle' && !!slugValue));

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      {serverError && (
        <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">
          {serverError}
        </div>
      )}

      {/* Name */}
      <div className="space-y-1.5">
        <label htmlFor="name" className="block text-sm font-semibold text-[#FBF7EC]">
          Nombre de tu tienda <span aria-hidden className="text-red-400">*</span>
        </label>
        <input
          id="name"
          type="text"
          autoComplete="off"
          placeholder="Ej: La Tiendita de Ana"
          maxLength={80}
          {...register('name')}
          onChange={(e) => {
            register('name').onChange(e);
            nameAutoSluggedRef.current = false;
          }}
          className="w-full rounded-xl bg-white/8 border border-white/15 text-[#FBF7EC] placeholder-white/30 px-4 py-3 text-sm focus:outline-none focus:border-[#F5C84B]/70 focus:bg-white/10 transition-colors"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'name-error' : undefined}
        />
        {errors.name && (
          <p id="name-error" role="alert" className="text-xs text-red-400 mt-1">
            {errors.name.message}
          </p>
        )}
      </div>

      {/* Slug */}
      <div className="space-y-1.5">
        <label htmlFor="slug" className="block text-sm font-semibold text-[#FBF7EC]">
          Dirección de tu tienda <span aria-hidden className="text-red-400">*</span>
        </label>
        <div className="flex items-center gap-0">
          <span className="flex-shrink-0 text-sm text-white/40 bg-white/5 border border-r-0 border-white/15 rounded-l-xl px-3 py-3">
            wapy.com.ar/
          </span>
          <div className="relative flex-1">
            <input
              id="slug"
              type="text"
              autoComplete="off"
              placeholder="mi-tienda"
              maxLength={32}
              {...register('slug')}
              onChange={(e) => {
                nameAutoSluggedRef.current = true;
                // Force lowercase + valid chars
                const val = e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9-]/g, '');
                e.target.value = val;
                register('slug').onChange(e);
              }}
              className="w-full rounded-l-none rounded-r-xl bg-white/8 border border-white/15 text-[#FBF7EC] placeholder-white/30 px-4 py-3 text-sm focus:outline-none focus:border-[#F5C84B]/70 focus:bg-white/10 transition-colors pr-8"
              aria-invalid={!!errors.slug || slugStatus === 'taken' || slugStatus === 'reserved' || slugStatus === 'invalid'}
              aria-describedby="slug-status"
            />
            {slugInfo && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                {slugInfo.icon}
              </span>
            )}
          </div>
        </div>
        {slugInfo && (
          <p id="slug-status" className={`text-xs flex items-center gap-1 ${slugInfo.color}`}>
            {slugInfo.text}
          </p>
        )}
        {errors.slug && !slugInfo && (
          <p role="alert" className="text-xs text-red-400 mt-1">
            {errors.slug.message}
          </p>
        )}
        <p className="text-xs text-white/30">
          Solo minúsculas, números y guiones. No se puede cambiar después de publicar.
        </p>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <label htmlFor="description" className="block text-sm font-semibold text-[#FBF7EC]">
          Descripción breve{' '}
          <span className="text-white/30 font-normal">(opcional)</span>
        </label>
        <textarea
          id="description"
          rows={3}
          maxLength={280}
          placeholder="Contanos qué vendés en dos líneas..."
          {...register('description')}
          className="w-full rounded-xl bg-white/8 border border-white/15 text-[#FBF7EC] placeholder-white/30 px-4 py-3 text-sm focus:outline-none focus:border-[#F5C84B]/70 focus:bg-white/10 transition-colors resize-none"
          aria-describedby="description-hint"
        />
        <p id="description-hint" className="text-xs text-white/30 text-right">
          {watch('description')?.length ?? 0}/280
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end pt-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="min-h-[44px] px-8 rounded-xl bg-[#F5C84B] text-[#16222E] font-bold text-sm hover:bg-[#FAE08A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2 cursor-pointer"
        >
          {submitting && <Loader2 size={14} className="animate-spin" />}
          Siguiente →
        </button>
      </div>
    </form>
  );
}
