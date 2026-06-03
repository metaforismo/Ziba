import { describe, expect, it } from 'vitest';
import { nextGraphKeyboardView } from './keyboard';

describe('nextGraphKeyboardView', () => {
  it('pans the graph with arrow keys and accelerates with Shift', () => {
    const view = { tx: 10, ty: 20, scale: 1 };

    expect(nextGraphKeyboardView(view, { key: 'ArrowRight' })).toEqual({
      tx: 74,
      ty: 20,
      scale: 1,
    });
    expect(nextGraphKeyboardView(view, { key: 'ArrowUp', shiftKey: true })).toEqual({
      tx: 10,
      ty: -172,
      scale: 1,
    });
  });

  it('zooms around the canvas center and clamps the allowed range', () => {
    const opts = { width: 1000, height: 500, minScale: 0.5, maxScale: 2, zoomStep: 1.25 };

    expect(nextGraphKeyboardView({ tx: 0, ty: 0, scale: 1 }, { key: '=' }, opts)).toEqual({
      tx: -125,
      ty: -62.5,
      scale: 1.25,
    });

    expect(nextGraphKeyboardView({ tx: 0, ty: 0, scale: 2 }, { key: '+' }, opts)).toEqual({
      tx: 0,
      ty: 0,
      scale: 2,
    });
    expect(nextGraphKeyboardView({ tx: 0, ty: 0, scale: 0.5 }, { key: '-' }, opts)).toEqual({
      tx: 0,
      ty: 0,
      scale: 0.5,
    });
  });

  it('ignores unrelated keys', () => {
    expect(nextGraphKeyboardView({ tx: 0, ty: 0, scale: 1 }, { key: 'a' })).toBeNull();
  });
});
