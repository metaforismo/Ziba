export const THEME_IDS = [
  'ziba-light',
  'ziba-dark',
  'warm-paper',
  'graphite',
  'high-contrast',
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME_ID: ThemeId = 'ziba-light';

export const DARK_THEME_IDS = ['ziba-dark', 'graphite', 'high-contrast'] as const;

export type ThemeDefinition = {
  id: ThemeId;
  label: string;
};

export const THEMES: readonly ThemeDefinition[] = [
  { id: 'ziba-light', label: 'Ziba Light' },
  { id: 'ziba-dark', label: 'Ziba Dark' },
  { id: 'warm-paper', label: 'Warm Paper' },
  { id: 'graphite', label: 'Graphite' },
  { id: 'high-contrast', label: 'High Contrast' },
];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);
}

export function isDarkTheme(themeId: ThemeId): boolean {
  return (DARK_THEME_IDS as readonly ThemeId[]).includes(themeId);
}

export function applyTheme(themeId: ThemeId): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = themeId;
  document.documentElement.classList.toggle('dark', isDarkTheme(themeId));
}
