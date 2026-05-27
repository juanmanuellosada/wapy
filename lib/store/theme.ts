export type StoreBanner = { type: 'color' | 'image'; value: string };

export type StoreTheme = {
  accent_color?: string;
  banner?: StoreBanner | null;
};

export function parseBanner(theme: unknown): StoreBanner | null {
  if (!theme || typeof theme !== 'object' || Array.isArray(theme)) return null;
  const t = theme as Record<string, unknown>;
  const b = t.banner;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
  const bObj = b as Record<string, unknown>;
  if ((bObj.type === 'color' || bObj.type === 'image') && typeof bObj.value === 'string') {
    return { type: bObj.type, value: bObj.value };
  }
  return null;
}
