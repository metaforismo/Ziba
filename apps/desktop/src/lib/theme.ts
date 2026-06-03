export const THEME_IDS = [
  'ziba-light',
  'obsidian-dark',
  'warm-paper',
  'graphite',
  'high-contrast',
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME_ID: ThemeId = 'ziba-light';

export type ThemeDefinition = {
  id: ThemeId;
  label: string;
};

export const THEMES: readonly ThemeDefinition[] = [
  { id: 'ziba-light', label: 'Ziba Light' },
  { id: 'obsidian-dark', label: 'Obsidian Dark' },
  { id: 'warm-paper', label: 'Warm Paper' },
  { id: 'graphite', label: 'Graphite' },
  { id: 'high-contrast', label: 'High Contrast' },
];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);
}

export function applyTheme(themeId: ThemeId): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = themeId;
  document.documentElement.classList.remove('dark');
}
