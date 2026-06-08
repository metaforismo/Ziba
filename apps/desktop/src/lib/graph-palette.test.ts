import { afterEach, describe, expect, it } from 'vitest';
import { resolveGraphPalette } from './graph-palette';

afterEach(() => {
  // Reset inline overrides between tests.
  document.documentElement.removeAttribute('style');
});

describe('resolveGraphPalette', () => {
  it('reads `R G B` triplet CSS variables and wraps them as rgb()', () => {
    const root = document.documentElement.style;
    root.setProperty('--graph-bg', '10 20 30');
    root.setProperty('--graph-node', '200 201 202');
    root.setProperty('--graph-edge', '70 71 72');
    root.setProperty('--graph-edge-mention', '110 111 112');
    root.setProperty('--graph-text', '230 231 232');
    root.setProperty('--graph-selection', '1 2 3');

    const palette = resolveGraphPalette();
    expect(palette.bg).toBe('rgb(10, 20, 30)');
    expect(palette.node).toBe('rgb(200, 201, 202)');
    expect(palette.edge).toBe('rgb(70, 71, 72)');
    expect(palette.edgeMention).toBe('rgb(110, 111, 112)');
    expect(palette.text).toBe('rgb(230, 231, 232)');
    expect(palette.selection).toBe('rgb(1, 2, 3)');
  });

  it('falls back to the dark default when a variable is missing', () => {
    // No variables set on the element → fall back. (jsdom returns '' for
    // unset custom properties.)
    const palette = resolveGraphPalette();
    expect(palette.bg).toBe('rgb(29, 29, 31)');
    expect(palette.selection).toBe('rgb(148, 169, 123)');
  });
});
