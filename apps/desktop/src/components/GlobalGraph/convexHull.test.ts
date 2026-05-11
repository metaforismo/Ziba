import { describe, expect, it } from 'vitest';
import { convexHull } from './convexHull';

describe('convexHull', () => {
  it('returns [] for 0 points', () => {
    expect(convexHull([])).toEqual([]);
  });

  it('returns the single point for 1 input', () => {
    expect(convexHull([{ x: 1, y: 1 }])).toEqual([{ x: 1, y: 1 }]);
  });

  it('returns both endpoints for 2 collinear inputs (no triangle yet)', () => {
    const got = convexHull([
      { x: 0, y: 0 },
      { x: 2, y: 2 },
    ]);
    expect(got).toHaveLength(2);
  });

  it('returns the three vertices of a triangle (3 inputs)', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 2 },
    ];
    const got = convexHull(pts);
    expect(got).toHaveLength(3);
    expect(new Set(got.map((p) => `${p.x},${p.y}`))).toEqual(new Set(['0,0', '2,0', '1,2']));
  });

  it('excludes interior points from the hull', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 }, // square corners
      { x: 2, y: 2 }, // interior
    ];
    const got = convexHull(pts);
    expect(got).toHaveLength(4);
    expect(got.some((p) => p.x === 2 && p.y === 2)).toBe(false);
  });

  it('handles duplicate inputs without producing degenerate output', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 1 },
    ];
    const got = convexHull(pts);
    expect(got.length).toBeGreaterThanOrEqual(1);
    // Should not contain a duplicate vertex.
    const unique = new Set(got.map((p) => `${p.x},${p.y}`));
    expect(unique.size).toBe(got.length);
  });
});
