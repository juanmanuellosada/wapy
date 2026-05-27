'use client';

import { useEffect, useState } from 'react';
import { getPaletteSync } from 'colorthief';

type Props = {
  logoUrl: string;
  onSelectColor: (hex: string) => void;
};

export function LogoColorPalette({ logoUrl, onSelectColor }: Props) {
  const [colors, setColors] = useState<string[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setColors(null);
    setError(false);

    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const palette = getPaletteSync(img, { colorCount: 5 });
        if (!palette) { setError(true); return; }
        setColors(palette.map((c) => c.hex()));
      } catch {
        setError(true);
      }
    };
    img.onerror = () => setError(true);
    img.src = logoUrl;
  }, [logoUrl]);

  if (error) return null;

  return (
    <div>
      <p className="text-xs text-white/40 mb-2">Colores del logo</p>
      <div className="flex items-center gap-2">
        {colors === null
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-7 w-7 rounded-full bg-white/10 animate-pulse" />
            ))
          : colors.map((hex) => (
              <button
                key={hex}
                type="button"
                aria-label={`Usar color ${hex}`}
                title={hex}
                onClick={() => onSelectColor(hex)}
                className="h-7 w-7 rounded-full border-2 border-transparent hover:border-white/40 transition-colors cursor-pointer flex-shrink-0"
                style={{ backgroundColor: hex }}
              />
            ))}
      </div>
    </div>
  );
}
