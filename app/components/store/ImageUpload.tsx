'use client';

import { useCallback, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { Upload, X, Loader2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { compressImage, MAX_ORIGINAL_BYTES, MAX_FINAL_BYTES } from '@/lib/images/compress';

type UploadedImage = {
  url: string;
  localPreview?: string; // object URL for immediate preview
};

type Props = {
  images: UploadedImage[];
  maxCount: number;
  accept: Record<string, string[]>;
  maxSizeMB?: number;
  onUpload: (file: File) => Promise<string>; // returns public URL
  onDelete: (url: string) => Promise<void>;
  disabled?: boolean;
  label?: string;
};

export function ImageUpload({
  images,
  maxCount,
  accept,
  maxSizeMB = 5,
  onUpload,
  onDelete,
  disabled = false,
  label = 'Arrastrá o clickeá para subir',
}: Props) {
  const [uploading, setUploading] = useState<string[]>([]); // file names in progress
  const [fileError, setFileError] = useState<string | null>(null);

  const canAddMore = images.length < maxCount;

  const onDrop = useCallback(
    async (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      setFileError(null);

      if (rejectedFiles.length > 0) {
        const err = rejectedFiles[0].errors[0];
        if (err.code === 'file-invalid-type') {
          setFileError('Formato no permitido.');
        } else {
          setFileError(err.message);
        }
        return;
      }

      if (images.length + acceptedFiles.length > maxCount) {
        setFileError(`Máximo ${maxCount} imágenes por producto.`);
        return;
      }

      for (const file of acceptedFiles) {
        // Validar tamaño original antes de comprimir
        if (file.size > MAX_ORIGINAL_BYTES) {
          setFileError('La imagen supera los 25 MB. Probá con una más liviana.');
          continue;
        }

        setUploading((prev) => [...prev, file.name]);
        try {
          const compressed = await compressImage(file);

          // Validar tamaño final después de comprimir
          if (compressed.size > MAX_FINAL_BYTES) {
            setFileError('La imagen sigue siendo demasiado pesada (máx 5 MB). Probá con otra.');
            continue;
          }

          await onUpload(compressed);
        } catch (e) {
          const msg = e instanceof Error ? e.message : '';
          if (!msg || /body|size|413|failed to fetch/i.test(msg)) {
            setFileError('La imagen es demasiado pesada para subir. Probá con una más liviana.');
          } else {
            setFileError(msg);
          }
        } finally {
          setUploading((prev) => prev.filter((n) => n !== file.name));
        }
      }
    },
    [images.length, maxCount, onUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    // maxSize se gestiona manualmente después de comprimir; no limitamos aquí para aceptar
    // archivos de hasta 25 MB que se reducirán en el cliente antes de subir.
    disabled: disabled || !canAddMore,
    multiple: maxCount > 1,
  });

  const handleDelete = async (url: string) => {
    try {
      await onDelete(url);
    } catch {
      toast.error('No pudimos eliminar la imagen. Intentá de nuevo.');
    }
  };

  return (
    <div className="space-y-3">
      {/* Existing images */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {images.map((img) => (
            <div
              key={img.url}
              className="relative group w-20 h-20 rounded-xl overflow-hidden border border-white/15 bg-white/5"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.localPreview ?? img.url}
                alt=""
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => handleDelete(img.url)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 hover:bg-red-500"
                aria-label="Eliminar imagen"
              >
                <X size={10} strokeWidth={3} />
              </button>
            </div>
          ))}
          {/* Uploading spinners */}
          {uploading.map((name) => (
            <div
              key={name}
              className="w-20 h-20 rounded-xl border border-white/15 bg-white/5 flex items-center justify-center"
            >
              <Loader2 size={20} className="text-[#F5C84B] animate-spin" />
            </div>
          ))}
        </div>
      )}

      {/* Dropzone */}
      {canAddMore && (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl px-6 py-8 text-center cursor-pointer transition-colors ${
            isDragActive
              ? 'border-[#F5C84B] bg-[#F5C84B]/5'
              : disabled
              ? 'border-white/10 opacity-50 cursor-not-allowed'
              : 'border-white/20 hover:border-[#F5C84B]/50 hover:bg-white/3'
          }`}
        >
          <input {...getInputProps()} />
          <Upload size={24} className="text-white/30 mx-auto mb-2" />
          <p className="text-sm text-white/50">{label}</p>
          <p className="text-xs text-white/30 mt-1">
            Máx. 25MB (se comprime automáticamente) · {images.length}/{maxCount}
          </p>
        </div>
      )}

      {fileError && (
        <p role="alert" className="text-xs text-red-400">
          {fileError}
        </p>
      )}
    </div>
  );
}
