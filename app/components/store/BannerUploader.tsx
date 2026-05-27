'use client';

import { useRef, useState } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import { uploadStoreBannerAction } from '@/lib/onboarding/upload-actions';
import { saveBannerConfig } from '@/lib/store/actions';

const ACCEPT_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

type Props = {
  storeId: string;
  initialUrl: string | null;
  onUrlChange: (url: string | null) => void;
};

export function BannerUploader({ storeId, initialUrl, onUrlChange }: Props) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    if (!ACCEPT_TYPES.includes(file.type)) {
      setError('Formato no permitido. Usá PNG, JPG, WEBP, o SVG.');
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError('Imagen muy pesada. Máximo 5MB.');
      return;
    }

    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('storeId', storeId);
    const result = await uploadStoreBannerAction(fd);

    if (!result.ok) {
      setError(result.message ?? 'Error al subir el banner. Intentá de nuevo.');
      setUploading(false);
      return;
    }

    await saveBannerConfig({ type: 'image', value: result.url });
    setUrl(result.url);
    onUrlChange(result.url);
    setUploading(false);

    if (inputRef.current) inputRef.current.value = '';
  };

  const handleRemove = async () => {
    await saveBannerConfig({ type: 'image', value: '' });
    setUrl(null);
    onUrlChange(null);
  };

  return (
    <div className="space-y-3">
      {url ? (
        <div className="relative w-full aspect-[3/1] sm:aspect-[4/1] rounded-xl overflow-hidden border border-white/15 bg-white/5 group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 hover:bg-red-500"
            aria-label="Quitar imagen de banner"
          >
            <X size={12} strokeWidth={3} />
          </button>
        </div>
      ) : (
        <label
          className={`flex flex-col items-center justify-center w-full aspect-[3/1] sm:aspect-[4/1] rounded-xl border-2 border-dashed transition-colors cursor-pointer ${
            uploading
              ? 'border-white/10 opacity-50 cursor-not-allowed'
              : 'border-white/20 hover:border-[#F5C84B]/50 hover:bg-white/3'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_TYPES.join(',')}
            className="sr-only"
            onChange={handleFileChange}
            disabled={uploading}
          />
          {uploading ? (
            <Loader2 size={22} className="text-[#F5C84B] animate-spin" />
          ) : (
            <>
              <Upload size={22} className="text-white/30 mb-2" />
              <p className="text-sm text-white/50">Subí el banner de tu tienda (PNG, JPG, WEBP, SVG)</p>
              <p className="text-xs text-white/30 mt-1">Proporción recomendada 4:1 · Máx. 5MB</p>
            </>
          )}
        </label>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
