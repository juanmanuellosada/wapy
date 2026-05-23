'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

type Props = {
  disabled: boolean;
  publishAction: () => Promise<unknown>;
};

export function PublishButton({ disabled, publishAction }: Props) {
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePublish = async () => {
    if (disabled || publishing) return;
    setPublishing(true);
    setError(null);

    const result = await publishAction();

    // If we get here (no redirect happened), there was an error
    if (result && typeof result === 'object' && 'error' in result) {
      const r = result as { error: string; details?: string[] };
      setError(r.details ? r.details.join(' ') : r.error);
      setPublishing(false);
    }
    // If redirect happened, Next.js handles it and we never reach here
  };

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
