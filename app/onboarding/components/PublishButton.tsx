'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

type Props = {
  disabled: boolean;
  publishAction: () => Promise<unknown>;
};

export function PublishButton({ disabled, publishAction }: Props) {
  const router = useRouter();
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePublish = async () => {
    if (disabled || publishing) return;
    setPublishing(true);
    setError(null);

    const result = await publishAction();

    if (result && typeof result === 'object' && 'ok' in result && (result as { ok: boolean }).ok) {
      setPublished(true);
      setTimeout(() => router.push('/dashboard'), 2200);
      return;
    }

    if (result && typeof result === 'object' && 'error' in result) {
      const r = result as { error: string; details?: string[] };
      setError(r.details ? r.details.join(' ') : r.error);
      setPublishing(false);
    }
  };

  if (published) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#16222E]/95 backdrop-blur-sm">
        <div
          role="status"
          aria-live="polite"
          className="bg-[#FBF7EC] rounded-2xl p-8 max-w-md w-full shadow-2xl text-center space-y-4"
        >
          <div className="flex justify-center">
            <CheckCircle2 size={64} className="text-green-600" />
          </div>
          <h2
            className="text-2xl font-bold text-[#16222E]"
            style={{ fontFamily: 'var(--font-agbalumo)' }}
          >
            ¡Tienda publicada!
          </h2>
          <p className="text-[#16222E]/70">Te llevamos al dashboard en un segundo…</p>
          <div className="flex justify-center">
            <Loader2 size={20} className="animate-spin text-[#F5C84B]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={handlePublish}
        disabled={disabled || publishing}
        className="w-full min-h-[52px] rounded-xl bg-[#F5C84B] text-[#16222E] font-bold text-base hover:bg-[#FAE08A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 cursor-pointer"
      >
        {publishing ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Publicando...
          </>
        ) : (
          '🚀 Publicar mi tienda'
        )}
      </button>
    </div>
  );
}
