import { describe, expect, it } from 'vitest';
import { applyTheme, DEFAULT_THEME_ID, isThemeId, THEME_IDS } from './theme';

describe('theme registry', () => {
  it('exposes the supported theme ids with ziba-light as the default', () => {
    expect(DEFAULT_THEME_ID).toBe('ziba-light');
    expect(THEME_IDS).toEqual([
      'ziba-light',
      'obsidian-dark',
      'warm-paper',
      'graphite',
      'high-contrast',
    ]);
  });

  it('strictly validates theme ids', () => {
    expect(isThemeId('obsidian-dark')).toBe(true);
    expect(isThemeId('dark')).toBe(false);
    expect(isThemeId('')).toBe(false);
    expect(isThemeId(null)).toBe(false);
  });

  it('applies themes through documentElement.dataset.theme', () => {
    applyTheme('graphite');

    expect(document.documentElement.dataset.theme).toBe('graphite');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
