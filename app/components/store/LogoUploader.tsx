'use client';

import { useState } from 'react';
import { ImageUpload } from './ImageUpload';
import { deleteImage } from '@/lib/onboarding/storage';
import { uploadStoreLogoAction } from '@/lib/onboarding/upload-actions';
import { saveLogoUrl } from '@/lib/store/actions';

type Props = {
  storeId: string;
  initialUrl: string | null;
  onUrlChange: (url: string | null) => void;
};

export function LogoUploader({ storeId, initialUrl, onUrlChange }: Props) {
  const [logoUrl, setLogoUrl] = useState<string | null>(initialUrl);

  const images = logoUrl ? [{ url: logoUrl }] : [];

  const handleUpload = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('storeId', storeId);
    const result = await uploadStoreLogoAction(fd);
    if (!result.ok) {
      throw new Error(result.message ?? 'Error al subir el logo. Intentá de nuevo.');
    }
    setLogoUrl(result.url);
    onUrlChange(result.url);
    // Persist to DB immediately
    await saveLogoUrl(result.url);
    return result.url;
  };

  const handleDelete = async () => {
    if (logoUrl) {
      await deleteImage(logoUrl, 'store-logos');
      await saveLogoUrl(null);
    }
    setLogoUrl(null);
    onUrlChange(null);
  };

  return (
    <ImageUpload
      images={images}
      maxCount={1}
      accept={{
        'image/png': ['.png'],
        'image/jpeg': ['.jpg', '.jpeg'],
        'image/webp': ['.webp'],
        'image/svg+xml': ['.svg'],
      }}
      maxSizeMB={5}
      onUpload={handleUpload}
      onDelete={handleDelete}
      label="Subí el logo de tu tienda (PNG, JPG, WEBP, SVG)"
    />
  );
}
