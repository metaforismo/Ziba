import { describe, expect, it } from 'vitest';
import { applyTheme, DEFAULT_THEME_ID, isDarkTheme, isThemeId, THEME_IDS } from './theme';

describe('theme registry', () => {
  it('exposes the supported theme ids with ziba-light as the default', () => {
    expect(DEFAULT_THEME_ID).toBe('ziba-light');
    expect(THEME_IDS).toEqual([
      'ziba-light',
      'ziba-dark',
      'warm-paper',
      'graphite',
      'high-contrast',
    ]);
  });

  it('strictly validates theme ids', () => {
    expect(isThemeId('ziba-dark')).toBe(true);
    expect(isThemeId('dark')).toBe(false);
    expect(isThemeId('')).toBe(false);
    expect(isThemeId(null)).toBe(false);
  });

  it('classifies themes that need Tailwind dark variants', () => {
    expect(isDarkTheme('ziba-light')).toBe(false);
    expect(isDarkTheme('warm-paper')).toBe(false);
    expect(isDarkTheme('ziba-dark')).toBe(true);
    expect(isDarkTheme('graphite')).toBe(true);
    expect(isDarkTheme('high-contrast')).toBe(true);
  });

  it('applies themes through documentElement.dataset.theme and .dark', () => {
    applyTheme('graphite');

    expect(document.documentElement.dataset.theme).toBe('graphite');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    applyTheme('ziba-light');

    expect(document.documentElement.dataset.theme).toBe('ziba-light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
