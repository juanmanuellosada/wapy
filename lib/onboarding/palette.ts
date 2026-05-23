export type AccentColor = {
  value: string;
  label: string;
};

/**
 * 6 curated accent colors for the store wizard.
 * These are the only allowed values for `stores.theme.accent_color`.
 */
export const ACCENT_COLORS: AccentColor[] = [
  { value: '#22c55e', label: 'Verde' },
  { value: '#eab308', label: 'Amarillo' },
  { value: '#ef4444', label: 'Rojo' },
  { value: '#3b82f6', label: 'Azul' },
  { value: '#a855f7', label: 'Violeta' },
  { value: '#ec4899', label: 'Rosa' },
];

export const ACCENT_COLOR_VALUES = ACCENT_COLORS.map((c) => c.value);

export const DEFAULT_ACCENT_COLOR = ACCENT_COLORS[0].value;
