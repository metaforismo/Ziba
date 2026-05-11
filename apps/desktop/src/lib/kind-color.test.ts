import { describe, expect, it } from 'vitest';
import { kindToHsl } from './kind-color';

describe('kindToHsl', () => {
  it('returns the same color for the same kind', () => {
    expect(kindToHsl('author')).toBe(kindToHsl('author'));
  });

  it('returns different colors for different kinds (high probability)', () => {
    expect(kindToHsl('author')).not.toBe(kindToHsl('cites'));
    expect(kindToHsl('author')).not.toBe(kindToHsl('in_series'));
  });

  it('returns a valid hsl() string with consistent S/L', () => {
    const re = /^hsl\(\d+(\.\d+)?, \d+%, \d+%\)$/;
    expect(kindToHsl('author')).toMatch(re);
    expect(kindToHsl('cites')).toMatch(re);
  });

  it('returns a neutral grey for the empty-string sentinel (generic body wikilinks)', () => {
    expect(kindToHsl('')).toBe('hsl(0, 0%, 60%)');
  });
});
