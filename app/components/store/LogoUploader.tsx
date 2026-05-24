'use client';

import { useState } from 'react';
import { ImageUpload } from './ImageUpload';
import { uploadLogo, deleteImage } from '@/lib/onboarding/storage';
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
    const url = await uploadLogo(file, storeId);
    setLogoUrl(url);
    onUrlChange(url);
    // Persist to DB immediately
    await saveLogoUrl(url);
    return url;
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
